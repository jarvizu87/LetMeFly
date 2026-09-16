(() => {
  'use strict'

  // LetMeFly Exercise Art Authority v1
  // The desktop Exercises inspector clones a library thumbnail. Private exercise
  // art resolves asynchronously, so refresh the clone when the source thumb's
  // exact art key/source/style changes. Presentation only; no storage/network.
  let queued = false

  const clean = value => String(value ?? '').trim()
  const routeIsExercises = () => location.hash.replace(/^#\//, '').split(/[?#]/)[0] === 'exercises'

  function selectedCard(detail) {
    const name = clean(detail?.dataset?.exerciseName)
    if (!name) return null
    return [...document.querySelectorAll('.exercise-library [data-library-card]')]
      .find(card => clean(card.querySelector('h3')?.textContent) === name) || null
  }

  function refreshDetail() {
    queued = false
    if (!routeIsExercises()) return
    const detail = document.querySelector('.lmf-reference-exercise-detail')
    if (!(detail instanceof HTMLElement)) return
    const card = selectedCard(detail)
    const source = card?.querySelector('.library-thumb[data-exercise-art]')
    if (!(source instanceof HTMLElement)) return

    const computedBackground = getComputedStyle(source).backgroundImage
    const signature = JSON.stringify([
      source.dataset.exerciseArt || '',
      source.dataset.exerciseArtSource || '',
      source.dataset.exerciseArtParts || '',
      source.style.getPropertyValue('--exercise-art'),
      computedBackground,
    ])
    if (detail.dataset.lmfExactArtSignature === signature) return

    const media = source.cloneNode(true)
    media.querySelectorAll('button').forEach(node => node.remove())
    media.removeAttribute('id')
    media.classList.add('lmf-reference-detail-image')
    media.style.setProperty('background-image', computedBackground, 'important')

    const existing = detail.querySelector('.lmf-reference-detail-image')
    if (existing) existing.replaceWith(media)
    else detail.prepend(media)
    detail.dataset.lmfExactArtSignature = signature
  }

  function schedule() {
    if (queued) return
    queued = true
    queueMicrotask(refreshDetail)
  }

  new MutationObserver(records => {
    for (const record of records) {
      const target = record.target
      if (target instanceof Element && target.matches('.exercise-library .library-thumb[data-exercise-art]')) {
        schedule()
        return
      }
    }
  }).observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'data-exercise-art', 'data-exercise-art-source', 'data-exercise-art-parts'],
  })

  window.addEventListener('hashchange', schedule)
  window.addEventListener('pageshow', schedule)
  window.addEventListener('letmefly:exercise-intelligence-ready', schedule)
  window.addEventListener('lmf:exercise-art-context-changed', schedule)
  document.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-reference-select-exercise]')) {
      queueMicrotask(schedule)
    }
  })
  schedule()
})()
