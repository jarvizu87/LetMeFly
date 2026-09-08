(() => {
  'use strict'

  // Automatic Style 2 exercise-art bridge for the live LetMeFly app.
  // Explicit private local/cloud overrides still win when present.
  const CLOUD_NAME = 'extor5az'
  const TRANSFORM = 'c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best'
  const BASE_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${TRANSFORM}/`
  const CANONICAL_ART_ROOT = 'letmefly/private/jp/exercises'
  const MIN_RENDER_DIMENSION = 640
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

  // These are display-name aliases only. They do not change Crownforge or Black Crown programming.
  // Values retain the legacy jp-* names so older audits and references remain traceable.
  const ALIAS_PUBLIC_IDS = Object.freeze({
    'band-or-cable-march': 'jp-band-march-v2',
    'bike-incline-walk': 'jp-recovery-cardio-v2',
    'bike-row-walk': 'jp-recovery-cardio-v2',
    'bike-walk': 'jp-recovery-cardio-v2',
    'bike-or-walk': 'jp-recovery-cardio-v2',
    'db-curl': 'jp-dumbbell-curl-v2',
    'dead-bug-or-hollow-hold': 'jp-dead-bug-v2',
    'front-squat-bench-ramp-sets': 'jp-front-squat-v2',
    'glute-bridge-iso': 'jp-glute-bridge-isometric-hold-v2',
    'incline-db-press': 'jp-incline-dumbbell-press-v2',
    'kb-halo': 'jp-kettlebell-halo-v2',
    'kb-lateral-clean-or-outside-swing-to-rack': 'jp-kettlebell-lateral-clean-v2',
    'kb-lateral-lunge': 'jp-kettlebell-lateral-lunge-v2',
    'kb-swing': 'jp-kettlebell-swing-v2',
    'lat-pulldown-warm-up': 'jp-lat-pulldown-v2',
    'light-forward-sled-push': 'jp-forward-sled-push-v2',
    'mobility': 'jp-hip-opener-v2',
    'optional-easy-walk': 'jp-recovery-cardio-v2',
    'pull-up-or-lat-pulldown': 'jp-pull-up-v2',
    'rdl': 'jp-romanian-deadlift-v2',
    'rear-delt-fly': 'jp-rear-deltoid-fly-v2',
    'reverse-crunch-or-dead-bug': 'jp-reverse-crunch-v2',
    'scap-push-up': 'jp-scapular-push-up-v2',
    'sled-push': 'jp-forward-sled-push-v2',
    'walk-or-bike': 'jp-recovery-cardio-v2',
    'wide-or-neutral-pulldown': 'jp-neutral-grip-lat-pulldown-v2',
    'farmers-carry': 'jp-farmer-carry-v2',
    'farmer-s-carry': 'jp-farmer-carry-v2',
    'leg-curl': 'jp-hamstring-curl-v2',
    'ohp': 'jp-overhead-press-v2'
  })

  const statusBySlug = new Map()
  const pendingBySlug = new Map()

  function canonicalSlugForSlug(slug) {
    const legacyPublicId = ALIAS_PUBLIC_IDS[slug]
    if (!legacyPublicId) return slug
    return legacyPublicId.replace(/^jp-/, '').replace(/-v2$/, '')
  }

  function publicIdForSlug(slug) {
    return `${CANONICAL_ART_ROOT}/${canonicalSlugForSlug(slug)}/v2`
  }

  // Legacy resolver convention retained as an audit/reference marker: 'jp-${slug}-v2'

  function candidates(slug) {
    return document.querySelectorAll(`[data-exercise-art="${slug}"]`)
  }

  function deliveryUrl(slug) {
    return `${BASE_URL}${publicIdForSlug(slug)}.webp`
  }

  function activate(slug, url) {
    candidates(slug).forEach((element) => {
      const source = element.dataset.exerciseArtSource || ''
      if (source.startsWith('private-')) return
      element.style.setProperty('--exercise-art', `url("${url}")`)
      element.dataset.exerciseArtSource = 'approved-style2-auto'
    })
  }

  function checkSlug(slug) {
    if (!SLUG_PATTERN.test(slug) || navigator.onLine === false) return

    const known = statusBySlug.get(slug)
    if (known?.state === 'ready') {
      activate(slug, known.url)
      return
    }
    if (known?.state === 'missing' || known?.state === 'pending') return

    const url = deliveryUrl(slug)
    const probe = new Image()
    probe.decoding = 'async'
    statusBySlug.set(slug, { state: 'pending' })
    pendingBySlug.set(slug, probe)

    probe.onload = () => {
      pendingBySlug.delete(slug)
      if (probe.naturalWidth < MIN_RENDER_DIMENSION || probe.naturalHeight < MIN_RENDER_DIMENSION) {
        statusBySlug.set(slug, { state: 'missing' })
        return
      }
      statusBySlug.set(slug, { state: 'ready', url })
      activate(slug, url)
    }
    probe.onerror = () => {
      pendingBySlug.delete(slug)
      statusBySlug.set(slug, { state: 'missing' })
    }
    probe.src = url
  }

  function queueElement(element) {
    const slug = element.getAttribute('data-exercise-art') || ''
    const known = statusBySlug.get(slug)
    if (known?.state === 'ready') activate(slug, known.url)
    if (observer) observer.observe(element)
    else checkSlug(slug)
  }

  function scan(root = document) {
    const nodes = root instanceof Element && root.matches('[data-exercise-art]')
      ? [root, ...root.querySelectorAll('[data-exercise-art]')]
      : [...root.querySelectorAll('[data-exercise-art]')]
    nodes.forEach(queueElement)
  }

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          observer.unobserve(entry.target)
          checkSlug(entry.target.getAttribute('data-exercise-art') || '')
        })
      }, { rootMargin: '320px 0px' })
    : null

  function rescanAfterPrivateResolver() {
    // The existing private resolver may clear a missing local override after this
    // script has already painted an automatic thumbnail. Re-apply approved auto
    // art after that resolver finishes, while never overriding a true private map.
    window.setTimeout(() => scan(document), 0)
  }

  function start() {
    scan(document)

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node)
        })
      })
    })
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true })

    window.addEventListener('lmf:exercise-art-local-loaded', rescanAfterPrivateResolver)
    window.addEventListener('lmf:exercise-art-overrides-loaded', rescanAfterPrivateResolver)
    window.addEventListener('online', () => {
      statusBySlug.clear()
      pendingBySlug.clear()
      scan(document)
    })

    // Cover startup races on slower Android devices / installed PWAs.
    window.setTimeout(() => scan(document), 250)
    window.setTimeout(() => scan(document), 1200)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
