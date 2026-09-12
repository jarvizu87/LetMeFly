(() => {
  'use strict'

  // LetMeFly Exercise Image Treatment v1
  // Presentation only. Reuses existing data-exercise-art slugs and the private-art
  // resolver already present in the app. No program, workout, or athlete writes.

  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')

  function titleFor(root) {
    return normalize(root?.querySelector('#lmf-intel-title')?.textContent)
  }

  function artSlugForTitle(title) {
    if (!title) return ''

    const candidates = [
      ...document.querySelectorAll('.library-card'),
      ...document.querySelectorAll('.exercise-card')
    ]

    for (const card of candidates) {
      const heading = normalize(card.querySelector('h3')?.textContent)
      if (heading !== title) continue
      const artNode = card.matches('[data-exercise-art]')
        ? card
        : card.querySelector('[data-exercise-art]')
      const slug = artNode?.getAttribute('data-exercise-art') || ''
      if (slug) return slug
    }

    return ''
  }

  function enhanceModal(modal) {
    if (!(modal instanceof Element) || modal.dataset.lmfImageTheme === '1') return
    const title = titleFor(modal)
    const slug = artSlugForTitle(title)
    if (!slug) return

    const kicker = modal.querySelector('.lmf-intel-kicker')
    const heading = modal.querySelector('#lmf-intel-title')
    if (!heading || modal.querySelector(':scope > .lmf-intel-art')) return

    const art = document.createElement('div')
    art.className = 'lmf-intel-art'
    art.setAttribute('data-exercise-art', slug)
    art.setAttribute('role', 'img')
    art.setAttribute('aria-label', `${heading.textContent?.trim() || 'Exercise'} demonstration artwork`)

    if (kicker?.nextSibling) modal.insertBefore(art, kicker.nextSibling)
    else modal.insertBefore(art, heading)

    modal.dataset.lmfImageTheme = '1'
  }

  function scan(root = document) {
    root.querySelectorAll?.('.lmf-intel-modal').forEach(enhanceModal)
    if (root instanceof Element && root.matches('.lmf-intel-modal')) enhanceModal(root)
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        scan(node)
      }
    }
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })
  scan()
})()
