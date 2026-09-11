import { approvedPrivateRows, PRIVATE_BUCKET } from './exercise-art-contract.mjs'

// Uses only the application's native Auth and Storage clients. No tokens or URLs
// cross this read-only bridge. Storage RLS remains the access-control authority.
export function createPrivateArtBridge({ activeAthlete, auth, client, configured }) {
  let epoch = 0, revision = 0, issued = new Map()
  const invalidate = () => { epoch += 1; revision += 1; issued.clear() }
  const current = async (id, token) => token === epoch && (await activeAthlete())?.id === id && token === epoch
  async function authorize(id, token) {
    if (!configured() || !await current(id, token)) return false
    const session = await auth.getLocalSession()
    if (!session) return false
    const user = await auth.getTrustedCurrentUser()
    if (!user || user.id !== session.user.id || !await current(id, token)) return false
    const owned = await client.from('athletes').select('id').eq('id', id).eq('owner_user_id', user.id).is('deleted_at', null)
    return !owned.error && owned.data?.length === 1 && await current(id, token)
  }
  function query(id) {
    return client.from('exercise_thumbnail_overrides').select('id,athlete_id,exercise_key,metadata,status,is_active,deleted_at').eq('athlete_id', id).eq('status', 'approved').eq('is_active', true).is('deleted_at', null)
  }
  const bridge = Object.freeze({
    version: 2,
    async context() { return { athleteId: (await activeAthlete())?.id ?? null } },
    async readCloud(id) {
      const token = epoch, readRevision = ++revision
      issued.clear()
      if (!await authorize(id, token)) return []
      const result = await query(id)
      if (result.error || readRevision !== revision || !await current(id, token)) return []
      const valid = approvedPrivateRows(result.data, id)
      issued = new Map(Object.entries(valid).map(([key, value]) => [key, { ...value, athleteId: id }]))
      return (result.data ?? []).filter(row => valid[row.exercise_key]?.id === row.id)
    },
    async readAsset(id, key, rowId, path) {
      const token = epoch, reference = issued.get(key)
      if (!reference || reference.athleteId !== id || reference.id !== rowId || !reference.delivery.parts.some(part => part.path === path)) return null
      if (!await authorize(id, token)) return null
      // Recheck the exact approved key before bytes: revoked/replaced/duplicated
      // records cannot reuse a previously issued path or substitute another asset.
      const result = await query(id).eq('exercise_key', key)
      const fresh = !result.error && approvedPrivateRows(result.data, id)[key]
      if (!fresh || fresh.id !== rowId || !fresh.delivery.parts.some(part => part.path === path) || !await current(id, token)) return null
      const asset = await client.storage.from(PRIVATE_BUCKET).download(path)
      if (asset.error || !await current(id, token) || !(asset.data instanceof Blob) || asset.data.type !== (path.endsWith('.png') ? 'image/png' : 'image/webp') || asset.data.size === 0 || asset.data.size > 12 * 1024 * 1024) return null
      return asset.data
    },
  })
  return { bridge, invalidate }
}
