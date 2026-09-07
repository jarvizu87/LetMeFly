(() => {
  'use strict'

  const CLOUD_NAME = 'extor5az'
  const TRANSFORM = 'c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best'
  const BASE_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${TRANSFORM}/`
  const MIN_RENDER_DIMENSION = 640
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const SUPABASE_URL = '__LMF_SUPABASE_URL__'
  const SUPABASE_PUBLISHABLE_KEY = '__LMF_SUPABASE_PUBLISHABLE_KEY__'
  const LOCAL_DB_NAME = 'letmefly-private'
  const LOCAL_META_STORE = 'meta'
  const LOCAL_MAP_KEY = 'privateExerciseArtMap'
  const LOCAL_STORAGE_MAP_KEY = 'lmf_private_exercise_art_map_v1'

  const statusBySlug = new Map()
  const waitingBySlug = new Map()
  let localOverrideMap = {}
  let cloudOverrideMap = {}
  let overrideMap = {}
  let cloudRefreshStarted = false
  let localRefreshStarted = false

  function candidates(slug) {
    return document.querySelectorAll(`[data-exercise-art="${slug}"]`)
  }

  function normalizeOverride(value) {
    if (!value || typeof value !== 'object') return null
    const publicId = typeof value.publicId === 'string' ? value.publicId.trim() : ''
    const format = typeof value.format === 'string' && value.format.trim() ? value.format.trim() : 'webp'
    const status = typeof value.status === 'string' ? value.status : 'approved'
    if (!publicId || status !== 'approved') return null
    return { publicId, format }
  }

  function normalizeMap(value) {
    const clean = {}
    if (!value || typeof value !== 'object' || Array.isArray(value)) return clean
    Object.entries(value).forEach(([slug, asset]) => {
      if (!SLUG_PATTERN.test(slug)) return
      const normalized = normalizeOverride(asset)
      if (normalized) clean[slug] = normalized
    })
    return clean
  }

  function mergeOverrideMaps() {
    overrideMap = { ...localOverrideMap, ...cloudOverrideMap }
  }

  function activate(slug, url, source) {
    candidates(slug).forEach((element) => {
      element.style.setProperty('--exercise-art', `url("${url}")`)
      element.dataset.exerciseArtSource = source
    })
  }

  function clearActivation(slug) {
    candidates(slug).forEach((element) => {
      element.style.removeProperty('--exercise-art')
      delete element.dataset.exerciseArtSource
    })
  }

  function deliveryUrl(asset) {
    return `${BASE_URL}${asset.publicId}.${asset.format}`
  }

  function probeOverride(slug, asset, source) {
    const url = deliveryUrl(asset)
    const probeImage = new Image()
    probeImage.decoding = 'async'
    probeImage.onload = () => {
      waitingBySlug.delete(slug)
      if (probeImage.naturalWidth < MIN_RENDER_DIMENSION || probeImage.naturalHeight < MIN_RENDER_DIMENSION) {
        statusBySlug.set(slug, { state: 'missing' })
        clearActivation(slug)
        return
      }
      statusBySlug.set(slug, { state: 'ready', url, source })
      activate(slug, url, source)
    }
    probeImage.onerror = () => {
      waitingBySlug.delete(slug)
      statusBySlug.set(slug, { state: 'missing' })
      clearActivation(slug)
    }
    waitingBySlug.set(slug, probeImage)
    probeImage.src = url
  }

  function checkSlug(slug) {
    if (!SLUG_PATTERN.test(slug)) return

    const asset = normalizeOverride(overrideMap[slug])
    if (!asset) {
      statusBySlug.set(slug, { state: 'missing' })
      clearActivation(slug)
      return
    }

    const known = statusBySlug.get(slug)
    if (known?.state === 'ready') {
      activate(slug, known.url, known.source)
      return
    }
    if (known?.state === 'pending') return
    if (navigator.onLine === false) return

    statusBySlug.set(slug, { state: 'pending' })
    const source = cloudOverrideMap[slug] ? 'private-cloud-override' : 'private-local-override'
    probeOverride(slug, asset, source)
  }

  function queueElement(element) {
    const slug = element.getAttribute('data-exercise-art') || ''
    const known = statusBySlug.get(slug)
    if (known?.state === 'ready') activate(slug, known.url, known.source)
    if (observer) observer.observe(element)
    else checkSlug(slug)
  }

  function scan(root = document) {
    const nodes = root instanceof Element && root.matches('[data-exercise-art]')
      ? [root, ...root.querySelectorAll('[data-exercise-art]')]
      : [...root.querySelectorAll('[data-exercise-art]')]
    nodes.forEach(queueElement)
  }

  function readLocalStorageMap() {
    try {
      return normalizeMap(JSON.parse(localStorage.getItem(LOCAL_STORAGE_MAP_KEY) || '{}'))
    } catch {
      return {}
    }
  }

  function readLocalMap() {
    const storageFallback = readLocalStorageMap()
    return new Promise((resolve) => {
      let request
      let created = false
      try {
        request = indexedDB.open(LOCAL_DB_NAME)
      } catch {
        resolve(storageFallback)
        return
      }

      request.onupgradeneeded = () => {
        created = true
        try { request.transaction?.abort() } catch {}
      }
      request.onerror = () => resolve(storageFallback)
      request.onsuccess = () => {
        const db = request.result
        try {
          if (created || !db.objectStoreNames.contains(LOCAL_META_STORE)) {
            db.close()
            resolve(storageFallback)
            return
          }
          const tx = db.transaction([LOCAL_META_STORE], 'readonly')
          const getRequest = tx.objectStore(LOCAL_META_STORE).get(LOCAL_MAP_KEY)
          getRequest.onsuccess = () => {
            const indexedDbMap = normalizeMap(getRequest.result?.value)
            db.close()
            resolve({ ...storageFallback, ...indexedDbMap })
          }
          getRequest.onerror = () => {
            db.close()
            resolve(storageFallback)
          }
        } catch {
          db.close()
          resolve(storageFallback)
        }
      }
    })
  }

  async function refreshFromLocal() {
    if (localRefreshStarted) return
    localRefreshStarted = true
    try {
      localOverrideMap = await readLocalMap()
      mergeOverrideMaps()
      statusBySlug.clear()
      waitingBySlug.clear()
      scan(document)
      window.dispatchEvent(new CustomEvent('lmf:exercise-art-local-loaded', {
        detail: { count: Object.keys(localOverrideMap).length }
      }))
    } finally {
      localRefreshStarted = false
    }
  }

  function findAccessToken() {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || ''
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '{}')
        const token = parsed?.access_token || parsed?.currentSession?.access_token
        if (typeof token === 'string' && token.length > 20) return token
      } catch {
        // Keep scanning other Supabase auth keys.
      }
    }
    return null
  }

  async function supabaseGet(path, accessToken) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      },
      cache: 'no-store'
    })
    if (!response.ok) throw new Error(`Supabase REST ${response.status}`)
    return response.json()
  }

  async function refreshFromCloud() {
    if (cloudRefreshStarted || navigator.onLine === false) return
    if (!SUPABASE_URL.startsWith('https://') || SUPABASE_PUBLISHABLE_KEY.startsWith('__LMF_')) return

    const accessToken = findAccessToken()
    if (!accessToken) return
    cloudRefreshStarted = true

    try {
      const athletes = await supabaseGet('athletes?select=id&deleted_at=is.null&order=created_at.asc&limit=1', accessToken)
      const athleteId = athletes?.[0]?.id
      if (!athleteId) return

      const rows = await supabaseGet(
        `exercise_thumbnail_overrides?select=exercise_key,cloudinary_public_id,asset_format,status,is_active&athlete_id=eq.${encodeURIComponent(athleteId)}&deleted_at=is.null&status=eq.approved&is_active=eq.true`,
        accessToken
      )

      const nextMap = {}
      rows.forEach((row) => {
        if (!SLUG_PATTERN.test(row.exercise_key || '')) return
        nextMap[row.exercise_key] = {
          publicId: row.cloudinary_public_id,
          format: row.asset_format || 'webp',
          status: row.status || 'approved'
        }
      })

      cloudOverrideMap = nextMap
      mergeOverrideMaps()
      statusBySlug.clear()
      waitingBySlug.clear()
      scan(document)
      window.dispatchEvent(new CustomEvent('lmf:exercise-art-overrides-loaded', { detail: { count: rows.length } }))
    } catch {
      // Private art is opportunistic. Existing local workout UI remains authoritative.
    } finally {
      cloudRefreshStarted = false
    }
  }

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          observer.unobserve(entry.target)
          checkSlug(entry.target.getAttribute('data-exercise-art') || '')
        })
      }, { rootMargin: '240px 0px' })
    : null

  function start() {
    scan(document)
    refreshFromLocal()
    refreshFromCloud()

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node)
        })
      })
    })
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true })

    window.addEventListener('online', () => {
      statusBySlug.clear()
      refreshFromLocal()
      refreshFromCloud()
      scan(document)
    })

    window.addEventListener('lmf:exercise-art-overrides-updated', () => {
      statusBySlug.clear()
      refreshFromLocal()
      refreshFromCloud()
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
