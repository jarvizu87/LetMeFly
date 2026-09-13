(async () => {
  'use strict'
  // Filename remains stable for installed app shells; private bytes have no public URL.
  const { SLUG, approvedPrivateRows } = await import('./exercise-art-contract.mjs')
  const MIN_RENDER_DIMENSION = 640
  const ready = new Map(), pending = new Map()
  const failures = new Map(), retryTimers = new Map()
  let queueState = { active: 0, items: [], slugs: new Set() }
  let availability = ''
  let epoch = 0, overrides = {}, athleteId = null, scheduled = 0
  const nodes = () => document.querySelectorAll('[data-exercise-art]')
  function renderStatus() {
    const anchor = document.querySelector('.train-shell .train-header, .lmf-approved-exercises-hero-v1')
    document.querySelectorAll('.lmf-exercise-art-status').forEach(el => { if (el.previousElementSibling !== anchor) el.remove() })
    if (!anchor) return
    let status = anchor.nextElementSibling?.matches('.lmf-exercise-art-status') ? anchor.nextElementSibling : null
    const message = {
      signin: 'Sign in to load your private exercise pictures.',
      offline: 'Connect to the internet to load your exercise pictures.',
      unconfigured: 'Exercise pictures are unavailable in this preview because cloud access is not configured.',
      empty: 'No approved pictures are available for this athlete. Check your account on Profile.',
      error: 'Exercise pictures could not load. Retry the connection.',
    }[availability] || (failures.size ? 'Some exercise pictures could not load. You can retry them.' : '')
    if (!message) { status?.remove(); return }
    if (!status) {
      status = document.createElement('div'); status.className = 'lmf-exercise-art-status'
      status.setAttribute('role', 'status')
      status.innerHTML = '<span></span><a href="#/profile">Open Profile</a><button type="button">Retry pictures</button>'
      status.querySelector('button').addEventListener('click', schedule)
      anchor.after(status)
    }
    if (status.querySelector('span').textContent !== message) status.querySelector('span').textContent = message
    status.querySelector('a').hidden = !['signin', 'empty'].includes(availability)
    status.querySelector('button').hidden = ['signin', 'offline', 'unconfigured'].includes(availability)
  }
  function setAvailability(value) { availability = value; renderStatus() }
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
    observer?.disconnect()
    pending.forEach(release); ready.forEach(release)
    pending.clear(); ready.clear(); overrides = {}; athleteId = null
    queueState = { active: 0, items: [], slugs: new Set() }
    retryTimers.forEach(clearTimeout); retryTimers.clear(); failures.clear()
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
      pending.delete(slug); failures.delete(slug); ready.set(slug, entry); activate(slug, entry, token); renderStatus()
    } catch {
      if (pending.get(slug) === entry) pending.delete(slug)
      release(entry)
      if (token !== epoch) return
      const attempts = (failures.get(slug) || 0) + 1
      failures.set(slug, attempts); renderStatus()
      // A transient failure used to leave a static library tile blank forever.
      // Retry twice, then leave the explicit Retry action available.
      if (attempts <= 2) retryTimers.set(slug, setTimeout(() => {
        retryTimers.delete(slug)
        if (token === epoch) enqueue(slug, token, id, asset)
      }, 1000 * attempts))
    }
  }
  function pump(queue) {
    while (queue === queueState && queue.active < 4 && queue.items.length) {
      const args = queue.items.shift(); queue.slugs.delete(args[0]); queue.active += 1
      void fetchArt(...args).finally(() => { queue.active -= 1; pump(queue) })
    }
  }
  function enqueue(slug, token, id, asset) {
    if (pending.has(slug) || queueState.slugs.has(slug)) return
    queueState.slugs.add(slug); queueState.items.push([slug, token, id, asset]); pump(queueState)
  }
  function check(element) {
    const slug = element.dataset.exerciseArt
    if (!SLUG.test(slug || '') || !overrides[slug]) { clearElement(element); return }
    const known = ready.get(slug)
    if (known) { activate(slug, known, epoch); return }
    if (pending.has(slug) || failures.has(slug) || navigator.onLine === false) return
    enqueue(slug, epoch, athleteId, overrides[slug])
  }
  function watch(element) {
    if (ready.has(element.dataset.exerciseArt)) check(element)
    else if (observer) observer.observe(element)
    else check(element)
  }
  function scan() { nodes().forEach(watch) }
  async function refresh() {
    reset()
    const token = epoch, bridge = window.LetMeFlyExerciseArt
    if (!bridge || bridge.version !== 2 || typeof bridge.readAsset !== 'function') return
    try {
      const context = await bridge.context()
      if (token !== epoch) return
      if (!context?.athleteId) { setAvailability(''); return }
      if (context.configured === false) { setAvailability('unconfigured'); return }
      if (navigator.onLine === false) { setAvailability('offline'); return }
      if (context.hasSession === false) { setAvailability('signin'); return }
      const id = context.athleteId, rows = await bridge.readCloud(id)
      if (token !== epoch || (await bridge.context())?.athleteId !== id || token !== epoch) return
      athleteId = id; overrides = approvedPrivateRows(rows, id)
      setAvailability(Object.keys(overrides).length ? '' : 'empty'); scan()
    } catch { if (token === epoch) { reset(); setAvailability('error') } }
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
      if (record.type === 'attributes') { clearElement(record.target); watch(record.target) }
      else record.addedNodes.forEach(node => { if (node instanceof Element) { if (node.matches('[data-exercise-art]')) watch(node); node.querySelectorAll('[data-exercise-art]').forEach(watch) } })
    }
    renderStatus()
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
