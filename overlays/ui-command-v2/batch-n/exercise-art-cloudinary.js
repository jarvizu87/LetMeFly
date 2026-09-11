(async () => {
  'use strict'
  const { MAP_KEY, SLUG, cleanMap, scopedMap } = await import('./exercise-art-contract.mjs')
  const TRANSFORM = 'c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best'
  const BASE_URL = `https://res.cloudinary.com/extor5az/image/upload/${TRANSFORM}/`
  const MIN_RENDER_DIMENSION = 640
  const ready = new Map(), pending = new Map()
  let epoch = 0, overrides = {}, athleteId = null, scheduled = 0
  const nodes = () => document.querySelectorAll('[data-exercise-art]')
  function clearElement(element) {
    element.style.removeProperty('--exercise-art')
    delete element.dataset.exerciseArtSource
  }
  function reset() {
    epoch += 1
    pending.forEach(image => { image.onload = image.onerror = null; image.src = '' })
    pending.clear(); ready.clear(); overrides = {}; athleteId = null
    nodes().forEach(clearElement)
  }
  function activate(slug, url, token) {
    if (token !== epoch || !athleteId) return
    nodes().forEach(element => {
      if (element.dataset.exerciseArt !== slug) return
      element.style.setProperty('--exercise-art', `url("${url}")`)
      element.dataset.exerciseArtSource = 'private-athlete-map'
    })
  }
  function check(element) {
    const slug = element.dataset.exerciseArt
    if (!SLUG.test(slug || '') || !overrides[slug]) { clearElement(element); return }
    const known = ready.get(slug)
    if (known) { activate(slug, known, epoch); return }
    if (pending.has(slug) || navigator.onLine === false) return
    const token = epoch, asset = overrides[slug]
    const url = `${BASE_URL}${asset.publicId}.${asset.format}`
    const probe = new Image(); pending.set(slug, probe); probe.decoding = 'async'
    probe.onload = () => {
      if (token !== epoch || pending.get(slug) !== probe) return
      pending.delete(slug)
      if (probe.naturalWidth < MIN_RENDER_DIMENSION || probe.naturalHeight < MIN_RENDER_DIMENSION) return
      ready.set(slug, url); activate(slug, url, token)
    }
    probe.onerror = () => { if (token === epoch && pending.get(slug) === probe) pending.delete(slug) }
    probe.src = url
  }
  function scan() { nodes().forEach(element => observer ? observer.observe(element) : check(element)) }
  async function readLocal(id) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('letmefly-private')
      request.onupgradeneeded = () => request.transaction.abort()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Private art storage unavailable'))
      request.onsuccess = () => resolve(request.result)
    })
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['athletes', 'meta'], 'readonly')
        let rows = [], config
        tx.objectStore('athletes').getAll().onsuccess = event => { rows = event.target.result }
        tx.objectStore('meta').get(`${MAP_KEY}:${id}`).onsuccess = event => { config = event.target.result?.value }
        tx.oncomplete = () => resolve(rows.find(row => !row.deleted_at)?.id === id ? scopedMap(config, id) : {})
        tx.onabort = tx.onerror = () => reject(tx.error)
      })
    } finally { db.close() }
  }
  async function refresh() {
    reset()
    const token = epoch, bridge = window.LetMeFlyExerciseArt
    if (!bridge || bridge.version !== 1) return
    try {
      const context = await bridge.context()
      if (token !== epoch || !context?.athleteId) return
      const id = context.athleteId
      const local = await readLocal(id).catch(() => ({}))
      if (token !== epoch) return
      athleteId = id; overrides = local; scan()
      const rows = navigator.onLine === false ? [] : await bridge.readCloud(id).catch(() => [])
      if (token !== epoch || (await bridge.context())?.athleteId !== id || token !== epoch) return
      const grouped = new Map()
      for (const row of rows) {
        if (row.athlete_id !== id || row.deleted_at || row.status !== 'approved' || row.is_active !== true) continue
        const key = row.exercise_key
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key).push({ publicId: row.cloudinary_public_id, format: row.asset_format, status: row.status })
      }
      const cloud = cleanMap(Object.fromEntries([...grouped].filter(([, assets]) => assets.length === 1).map(([key, assets]) => [key, assets[0]])))
      // A cloud replacement must invalidate pending local image callbacks too.
      pending.forEach(image => { image.onload = image.onerror = null; image.src = '' })
      pending.clear(); ready.clear(); epoch += 1
      overrides = { ...local, ...cloud }; nodes().forEach(clearElement); scan()
    } catch { if (token === epoch) reset() }
  }
  function schedule() {
    reset()
    clearTimeout(scheduled)
    scheduled = setTimeout(() => { scheduled = 0; void refresh() }, 0)
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) { observer.unobserve(entry.target); check(entry.target) } })
  }, { rootMargin: '240px 0px' }) : null
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') { clearElement(record.target); check(record.target) }
      else record.addedNodes.forEach(node => { if (node instanceof Element) { if (node.matches('[data-exercise-art]')) check(node); node.querySelectorAll('[data-exercise-art]').forEach(check) } })
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-exercise-art'] })
  window.addEventListener('lmf:exercise-art-context-changed', schedule)
  window.addEventListener('lmf:exercise-art-overrides-updated', schedule)
  window.addEventListener('online', schedule)
  window.addEventListener('focus', schedule)
  window.addEventListener('pageshow', schedule)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule() })
  if ('BroadcastChannel' in window) new BroadcastChannel('letmefly-exercise-art').onmessage = schedule
  schedule()
})().catch(() => { /* The themed fallback remains available without private mappings. */ })
