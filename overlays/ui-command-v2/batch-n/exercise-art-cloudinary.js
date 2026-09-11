(async () => {
  'use strict'
  // Filename remains stable for installed app shells; private bytes have no public URL.
  const { SLUG, approvedPrivateRows } = await import('./exercise-art-contract.mjs')
  const MIN_RENDER_DIMENSION = 640
  const ready = new Map(), pending = new Map()
  let epoch = 0, overrides = {}, athleteId = null, scheduled = 0
  const nodes = () => document.querySelectorAll('[data-exercise-art]')
  function clearElement(element) {
    element.style.removeProperty('--exercise-art')
    delete element.dataset.exerciseArtSource
    delete element.dataset.exerciseArtParts
    element.querySelectorAll(':scope > .lmf-art-pair').forEach(pair => pair.remove())
  }
  function release(entry) {
    entry.cancels.forEach(cancel => cancel())
    entry.cancels.length = 0
    entry.probes.forEach(image => { image.onload = image.onerror = null; image.src = '' })
    entry.urls.forEach(url => URL.revokeObjectURL(url))
    entry.urls.length = 0
  }
  function reset() {
    epoch += 1
    pending.forEach(release); ready.forEach(release)
    pending.clear(); ready.clear(); overrides = {}; athleteId = null
    nodes().forEach(clearElement)
  }
  function activate(slug, entry, token) {
    if (token !== epoch || !athleteId) return
    nodes().forEach(element => {
      if (element.dataset.exerciseArt !== slug) return
      // Workout Flow can insert its media after the initial thumbnail scan.
      if (entry.urls.length > 1 && element.querySelector(':scope > .lmf-exercise-media[data-exercise-art]')) { clearElement(element); return }
      if (element.dataset.exerciseArtSource === entry.id) return
      clearElement(element)
      if (entry.urls.length === 1) {
        element.style.setProperty('--exercise-art', `url("${entry.urls[0]}")`)
      } else {
        element.style.setProperty('--exercise-art', 'none')
        element.dataset.exerciseArtParts = String(entry.urls.length)
        const pair = document.createElement('div'); pair.className = 'lmf-art-pair'
        pair.setAttribute('role', 'group'); pair.setAttribute('aria-label', entry.urls.length === 3 ? 'Exercise alternatives' : 'Separate component images')
        entry.urls.forEach((url, index) => {
          const part = document.createElement('div'); part.className = 'lmf-art-part'
          const picture = document.createElement('div'); picture.className = 'lmf-art-part-image'
          picture.style.backgroundImage = `url("${url}")`; picture.setAttribute('role', 'img'); picture.setAttribute('aria-label', entry.labels[index])
          const label = document.createElement('span'); label.textContent = entry.urls.length === 3 ? entry.labels[index] : `${index + 1}. ${entry.labels[index]}`
          part.append(picture, label); pair.append(part)
        })
        element.prepend(pair)
      }
      element.dataset.exerciseArtSource = entry.id
    })
  }
  function probeImage(url, entry) {
    return new Promise(resolve => {
      entry.cancels.push(() => resolve(false))
      const probe = new Image(); entry.probes.push(probe); probe.decoding = 'async'
      probe.onload = () => resolve(probe.naturalWidth >= MIN_RENDER_DIMENSION && probe.naturalHeight >= MIN_RENDER_DIMENSION)
      probe.onerror = () => resolve(false)
      probe.src = url
    })
  }
  async function fetchArt(slug, token, id, asset) {
    const entry = { id: asset.id, urls: [], labels: asset.delivery.parts.map(part => part.label), probes: [], cancels: [] }
    pending.set(slug, entry)
    try {
      const blobs = await Promise.all(asset.delivery.parts.map(part => window.LetMeFlyExerciseArt.readAsset(id, slug, asset.id, part.path)))
      if (token !== epoch || pending.get(slug) !== entry) return
      if (blobs.some(blob => !(blob instanceof Blob) || !['image/webp', 'image/png'].includes(blob.type) || !blob.size || blob.size > 12 * 1024 * 1024)) throw new Error('Image unavailable')
      entry.urls = blobs.map(blob => URL.createObjectURL(blob))
      const quality = await Promise.all(entry.urls.map(url => probeImage(url, entry)))
      if (token !== epoch || pending.get(slug) !== entry) return
      if (quality.some(ok => !ok)) throw new Error('Image quality unavailable')
      pending.delete(slug); ready.set(slug, entry); activate(slug, entry, token)
    } catch {
      if (pending.get(slug) === entry) pending.delete(slug)
      release(entry)
    }
  }
  function check(element) {
    const slug = element.dataset.exerciseArt
    if (!SLUG.test(slug || '') || !overrides[slug]) { clearElement(element); return }
    const known = ready.get(slug)
    if (known) { activate(slug, known, epoch); return }
    if (pending.has(slug) || navigator.onLine === false) return
    void fetchArt(slug, epoch, athleteId, overrides[slug])
  }
  function scan() { nodes().forEach(element => observer ? observer.observe(element) : check(element)) }
  async function refresh() {
    reset()
    const token = epoch, bridge = window.LetMeFlyExerciseArt
    if (!bridge || bridge.version !== 2 || typeof bridge.readAsset !== 'function') return
    try {
      const context = await bridge.context()
      if (token !== epoch || !context?.athleteId || navigator.onLine === false) return
      const id = context.athleteId, rows = await bridge.readCloud(id)
      if (token !== epoch || (await bridge.context())?.athleteId !== id || token !== epoch) return
      athleteId = id; overrides = approvedPrivateRows(rows, id); scan()
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
  window.addEventListener('offline', schedule)
  window.addEventListener('focus', schedule)
  window.addEventListener('pageshow', schedule)
  window.addEventListener('pagehide', reset)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule() })
  if ('BroadcastChannel' in window) new BroadcastChannel('letmefly-exercise-art').onmessage = schedule
  schedule()
})().catch(() => { /* The themed fallback remains available without approved private bytes. */ })
