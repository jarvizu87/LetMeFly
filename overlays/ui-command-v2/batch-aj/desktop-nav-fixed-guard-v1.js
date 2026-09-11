(() => {
  'use strict'

  // LetMeFly desktop navigation position guard.
  // Presentation only: protects the approved fixed desktop rail from late
  // runtime/style overrides and restores the prior inline state off desktop.
  const DESKTOP_QUERY = '(min-width: 1100px)'
  const media = window.matchMedia(DESKTOP_QUERY)
  const previous = new WeakMap()

  function restore(nav) {
    const saved = previous.get(nav)
    if (!saved) return
    if (saved.value) nav.style.setProperty('position', saved.value, saved.priority)
    else nav.style.removeProperty('position')
    previous.delete(nav)
    delete nav.dataset.lmfDesktopRailGuard
  }

  function enforce() {
    const enabled = media.matches && document.documentElement.dataset.lmfDesktopUi === 'true'
    document.querySelectorAll('.navbar').forEach((nav) => {
      if (!(nav instanceof HTMLElement)) return
      if (!enabled) {
        if (nav.dataset.lmfDesktopRailGuard === 'fixed') restore(nav)
        return
      }

      if (!previous.has(nav)) {
        previous.set(nav, {
          value: nav.style.getPropertyValue('position'),
          priority: nav.style.getPropertyPriority('position'),
        })
      }

      if (nav.style.getPropertyValue('position') !== 'fixed' || nav.style.getPropertyPriority('position') !== 'important') {
        nav.style.setProperty('position', 'fixed', 'important')
      }
      nav.dataset.lmfDesktopRailGuard = 'fixed'
    })
  }

  const observer = new MutationObserver(() => enforce())
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'data-lmf-desktop-ui'],
  })

  if (typeof media.addEventListener === 'function') media.addEventListener('change', enforce)
  else media.addListener(enforce)

  window.addEventListener('resize', enforce, { passive: true })
  document.addEventListener('visibilitychange', enforce)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enforce()
      window.setTimeout(enforce, 0)
    }, { once: true })
  } else {
    enforce()
    window.setTimeout(enforce, 0)
  }
})()
