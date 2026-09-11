import { MAP_KEY, parseArtImport } from './exercise-art-contract.mjs'
// letmefly-private-exercise-art-map is saved under privateExerciseArtMap:<athleteId>.
const $ = id => document.getElementById(id)
let reviewed = null, expected = null, target = null, generation = 0
function message(text, error = false) { $('status').textContent = text; $('status').className = `status ${error ? 'error' : ''}` }
function invalidate() { generation++; reviewed = null; expected = null; $('preview').hidden = true; $('confirm').checked = false; $('save').disabled = true }
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('letmefly-private')
    req.onupgradeneeded = () => req.transaction.abort()
    req.onerror = req.onblocked = () => reject(new Error('Open LetMeFly in this browser first, then return here.'))
    req.onsuccess = () => resolve(req.result)
  })
}
async function snapshot() {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['athletes', 'meta'], 'readonly')
      let athlete = null, config = null
      tx.objectStore('athletes').getAll().onsuccess = event => {
        athlete = event.target.result.find(row => !row.deleted_at)
        if (athlete) tx.objectStore('meta').get(`${MAP_KEY}:${athlete.id}`).onsuccess = event => { config = event.target.result?.value ?? null }
      }
      tx.oncomplete = () => resolve({ athlete, config })
      tx.onabort = tx.onerror = () => reject(new Error('Private storage is unavailable.'))
    })
  } finally { db.close() }
}
async function loadAthlete() {
  const state = await snapshot()
  if (!state.athlete) throw new Error('Open LetMeFly and select your athlete first.')
  target = state.athlete
  $('athlete').textContent = `For ${target.display_name || 'your athlete'}`
  return state
}
$('review').addEventListener('click', async () => {
  invalidate(); const token = generation
  try {
    const text = $('paste').value.trim() || await $('file').files?.[0]?.text()
    if (!text) throw new Error('Choose a file or paste a reviewed map first.')
    const state = await loadAthlete()
    if (token !== generation) return
    reviewed = parseArtImport(JSON.parse(text), state.athlete.id); expected = JSON.stringify(state.config)
    $('review-summary').textContent = `${Object.keys(reviewed.overrides).length} reviewed mappings for ${state.athlete.display_name || 'this athlete'}. Saving replaces this athlete’s current local map.`
    $('preview').hidden = false; message('Review the athlete and map, then confirm below.')
  } catch (error) { if (token === generation) { invalidate(); message(error.message, true) } }
})
for (const event of ['input', 'change']) for (const id of ['file', 'paste']) $(id).addEventListener(event, invalidate)
$('confirm').addEventListener('change', () => { $('save').disabled = !reviewed || !$('confirm').checked })
$('save').addEventListener('click', async () => {
  if (!reviewed || !$('confirm').checked) return
  const value = reviewed, before = expected
  $('save').disabled = true
  try {
    const db = await openDb()
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['athletes', 'meta'], 'readwrite')
        let problem = 'Could not save the map.'
        tx.objectStore('athletes').getAll().onsuccess = event => {
          if (event.target.result.find(row => !row.deleted_at)?.id !== value.athleteId) { problem = 'The active athlete changed. Review the map again.'; tx.abort(); return }
          const store = tx.objectStore('meta'), key = `${MAP_KEY}:${value.athleteId}`
          store.get(key).onsuccess = event => {
            if (JSON.stringify(event.target.result?.value ?? null) !== before) { problem = 'The saved map changed. Review it again before replacing it.'; tx.abort(); return }
            store.put({ key, value, updatedAt: new Date().toISOString() })
          }
        }
        tx.oncomplete = resolve
        tx.onabort = tx.onerror = () => reject(new Error(problem))
      })
    } finally { db.close() }
    if ('BroadcastChannel' in window) { const channel = new BroadcastChannel('letmefly-exercise-art'); channel.postMessage('updated'); channel.close() }
    invalidate(); message('Legacy map saved for this athlete. Private images require an approved cloud library.')
  } catch (error) { invalidate(); message(error.message, true) }
})
loadAthlete().catch(error => { $('athlete').textContent = 'Athlete unavailable'; message(error.message, true) })
