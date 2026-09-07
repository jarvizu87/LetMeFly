(() => {
  'use strict'

  const CLOUD_NAME = 'extor5az'
  const MINE_PREFIX = 'letmefly/app/exercises/mine/'
  const OTHERS_PREFIX = 'letmefly/app/exercises/others/'
  // c_lfill preserves aspect ratio and never upscales smaller source images.
  const TRANSFORM = 'c_lfill,g_auto,h_720,w_720/f_auto/q_auto:best'
  const BASE_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${TRANSFORM}/`
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const statusBySlug = new Map()
  const waitingBySlug = new Map()

  function candidates(slug) {
    return document.querySelectorAll(`[data-exercise-art="${slug}"]`)
  }

  function activate(slug, url, source) {
    candidates(slug).forEach((element) => {
      element.style.setProperty('--exercise-art', `url("${url}")`)
      element.dataset.exerciseArtSource = source
    })
  }

  function probe(slug, prefix, source, onMissing) {
    const url = `${BASE_URL}${prefix}${slug}`
    const probeImage = new Image()
    probeImage.decoding = 'async'
    probeImage.onload = () => {
      statusBySlug.set(slug, { state: 'ready', url, source })
      waitingBySlug.delete(slug)
      activate(slug, url, source)
    }
    probeImage.onerror = () => {
      waitingBySlug.delete(slug)
      onMissing()
    }
    waitingBySlug.set(slug, probeImage)
    probeImage.src = url
  }

  function checkSlug(slug) {
    if (!SLUG_PATTERN.test(slug) || navigator.onLine === false) return

    const known = statusBySlug.get(slug)
    if (known?.state === 'ready') {
      activate(slug, known.url, known.source)
      return
    }
    if (known?.state === 'missing' || known?.state === 'pending') return

    statusBySlug.set(slug, { state: 'pending' })
    probe(slug, MINE_PREFIX, 'mine', () => {
      probe(slug, OTHERS_PREFIX, 'others', () => {
        statusBySlug.set(slug, { state: 'missing' })
      })
    })
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
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node)
        })
      })
    })
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
