(() => {
  'use strict'

  const CLOUD_NAME = 'extor5az'
  const CANONICAL_PREFIX = 'letmefly/app/exercises/canonical/'
  const TRANSFORM = 'c_fill,g_auto,h_720,w_720/f_auto/q_auto'
  const BASE_URL = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${TRANSFORM}/${CANONICAL_PREFIX}`
  const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  const statusBySlug = new Map()
  const waitingBySlug = new Map()

  function candidates(slug) {
    return document.querySelectorAll(`[data-exercise-art="${slug}"]`)
  }

  function activate(slug, url) {
    candidates(slug).forEach((element) => {
      element.style.setProperty('--exercise-art', `url("${url}")`)
      element.dataset.exerciseArtSource = 'cloudinary'
    })
  }

  function checkSlug(slug) {
    if (!SLUG_PATTERN.test(slug)) return

    const known = statusBySlug.get(slug)
    if (known?.state === 'ready') {
      activate(slug, known.url)
      return
    }
    if (known?.state === 'missing' || known?.state === 'pending') return

    const url = `${BASE_URL}${slug}`
    statusBySlug.set(slug, { state: 'pending', url })

    const probe = new Image()
    probe.decoding = 'async'
    probe.onload = () => {
      statusBySlug.set(slug, { state: 'ready', url })
      activate(slug, url)
      waitingBySlug.delete(slug)
    }
    probe.onerror = () => {
      statusBySlug.set(slug, { state: 'missing', url })
      waitingBySlug.delete(slug)
    }
    waitingBySlug.set(slug, probe)
    probe.src = url
  }

  function scan(root = document) {
    const nodes = root instanceof Element && root.matches('[data-exercise-art]')
      ? [root, ...root.querySelectorAll('[data-exercise-art]')]
      : [...root.querySelectorAll('[data-exercise-art]')]

    nodes.forEach((element) => {
      const slug = element.getAttribute('data-exercise-art') || ''
      checkSlug(slug)
      const known = statusBySlug.get(slug)
      if (known?.state === 'ready') activate(slug, known.url)
    })
  }

  function start() {
    scan(document)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scan(node)
        })
      })
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
