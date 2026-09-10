(() => {
  'use strict'

  // Route-mount guard for the optional Progress dashboard overlay.
  // Presentation only: it never changes program prescriptions or athlete records.
  // Installer compatibility marker: window.__LMF_PROGRESS_DASHBOARD__ || document.getElementById(DASHBOARD_ID)
  const DASHBOARD_ID = 'lmf-progress-dashboard-v1'
  const ANCHOR_ATTR = 'data-lmf-progress-anchor'
  const RETRY_ATTR = 'data-lmf-progress-script-retry'
  const BOOTSTRAP_ATTR = 'data-lmf-progress-bootstrap'
  const TAB_KEY = 'letmefly_progress_dashboard_tab_v1'
  const TABS = ['overview', 'strength', 'body', 'conditioning', 'prs']
  let queued = false
  let retrying = false
  let progressIntentUntil = 0

  function visible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
  }

  function selectedNavItem() {
    return [...document.querySelectorAll('nav a[href],nav button,nav [role="button"]')].find(element => {
      if (!visible(element)) return false
      return element.classList.contains('active') || Boolean(element.closest('.active')) || element.getAttribute('aria-current') === 'page' || element.getAttribute('aria-selected') === 'true'
    }) || null
  }

  function navItemIsProgress(element) {
    if (!(element instanceof Element)) return false
    const href = element.getAttribute('href') || ''
    const label = (element.textContent || '').trim()
    return /^#\/progress(?:[/?#]|$)/i.test(href) || /^progress$/i.test(label)
  }

  function progressRouteActive() {
    const hash = location.hash || ''
    if (/^#\/progress(?:[/?#]|$)/i.test(hash)) return true

    // Any explicit non-Progress hash wins over stale click intent. This is the
    // critical Home/Train/Program isolation boundary.
    if (hash && !/^#\/?$/i.test(hash)) return false

    const selected = selectedNavItem()
    if (selected) return navItemIsProgress(selected)

    // Intent is only a short pre-route bridge when the SPA has not committed a
    // hash or selected nav item yet. It can never override an explicit route.
    return Date.now() < progressIntentUntil
  }

  function progressTitle() {
    const roots = [document.querySelector('main'), document.querySelector('[role="main"]'), document.querySelector('#app'), document.body].filter(Boolean)
    for (const root of roots) {
      const candidates = root.querySelectorAll(`h1,h2,h3,[${ANCHOR_ATTR}],.page-title,.screen-title,.section-title,[class*="heading"],[class*="title"],strong,span,div`)
      for (const element of candidates) {
        if (!visible(element)) continue
        if ((element.textContent || '').trim().toUpperCase() !== 'PROGRESS') continue
        if (element.closest('nav,button,a,[role="button"],[role="tab"]')) continue
        if (!element.hasAttribute(ANCHOR_ATTR) && element.getBoundingClientRect().width < 24) continue
        return element
      }
    }
    return null
  }

  function routeRoot() {
    if (!progressRouteActive()) return null
    return [document.querySelector('main'), document.querySelector('[role="main"]'), document.querySelector('#app'), document.body].filter(Boolean).find(visible) || null
  }

  function progressSurface() {
    // Route intent is authoritative. Generic history/progress-looking content on
    // Home must never be enough to mount the Progress dashboard.
    if (!progressRouteActive()) return null

    const title = progressTitle()
    const native = document.querySelector('#progress-content')
    if (title) return { title, native, root: title.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || title.parentElement }

    if (native) {
      const nativeVisible = visible(native) || [...native.querySelectorAll(':scope > *')].some(visible)
      if (nativeVisible) return { title: null, native, root: native.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || native.parentElement || native }
    }

    const marker = [...document.querySelectorAll('.progress-score-grid,.strength-progress-card,.tm-board,.history-list')].find(visible)
    if (marker) return { title: null, native, root: marker.closest('main,[role="main"],.page,.view,.screen,.tab-panel,section') || marker.parentElement }

    const root = routeRoot()
    return root ? { title: null, native, root } : null
  }

  function ensureAnchor(surface) {
    if (!surface?.root) return null
    const existing = [...surface.root.querySelectorAll(`[${ANCHOR_ATTR}]`)].find(element => element.isConnected)
    if (existing) return existing
    const anchor = document.createElement('h2')
    anchor.setAttribute(ANCHOR_ATTR, 'true')
    anchor.textContent = 'PROGRESS'
    anchor.setAttribute('aria-hidden', 'true')
    Object.assign(anchor.style, {
      position: 'absolute', width: '1px', height: '1px', padding: '0', margin: '0', overflow: 'hidden',
      clipPath: 'inset(50%)', whiteSpace: 'nowrap', pointerEvents: 'none'
    })
    if (surface.title) surface.title.insertAdjacentElement('afterend', anchor)
    else surface.root.insertAdjacentElement('afterbegin', anchor)
    return anchor
  }

  function unmountProgressSurface() {
    document.getElementById(DASHBOARD_ID)?.remove()
    document.querySelectorAll(`[${ANCHOR_ATTR}]`).forEach(element => element.remove())
    retrying = false
  }

  function storedTab() {
    try {
      const value = localStorage.getItem(TAB_KEY)
      return TABS.includes(value) ? value : 'overview'
    } catch (_) { return 'overview' }
  }

  function syncTab(next) {
    if (!TABS.includes(next)) return
    try { localStorage.setItem(TAB_KEY, next) } catch (_) {}
    const root = document.getElementById(DASHBOARD_ID)
    root?.querySelectorAll('[data-pg-tab]').forEach(button => button.setAttribute('aria-selected', button.dataset.pgTab === next ? 'true' : 'false'))
    const sync = () => {
      const api = window.__LMF_PROGRESS_DASHBOARD__
      if (api?.setTab) api.setTab(next)
    }
    sync()
    window.setTimeout(sync, 80)
    window.setTimeout(sync, 180)
    window.setTimeout(sync, 320)
  }

  function bootstrapTabs(active) {
    const labels = { overview:'OVERVIEW', strength:'STRENGTH', body:'BODY', conditioning:'CONDITIONING', prs:'PRs' }
    return TABS.map(id => `<button type="button" role="tab" data-pg-tab="${id}" aria-selected="${active === id ? 'true' : 'false'}">${labels[id]}</button>`).join('')
  }

  function ensureBootstrapShell(surface) {
    let dashboard = document.getElementById(DASHBOARD_ID)
    if (dashboard) return dashboard
    dashboard = document.createElement('section')
    dashboard.id = DASHBOARD_ID
    dashboard.className = 'lmf-progress-dashboard'
    dashboard.dataset.loaded = 'bootstrap'
    dashboard.setAttribute(BOOTSTRAP_ATTR, 'true')
    const active = storedTab()
    dashboard.innerHTML = `<header class="lmf-pg-header"><div><span>ATHLETE PERFORMANCE</span><h2>PROGRESS DASHBOARD</h2><p>Loading your private training history…</p></div></header><nav class="lmf-pg-tabs" role="tablist" aria-label="Progress sections">${bootstrapTabs(active)}</nav><div class="lmf-pg-tabbody" role="tabpanel"><div class="lmf-pg-loading">Reading your private training history…</div></div>`
    dashboard.querySelectorAll('[data-pg-tab]').forEach(button => button.addEventListener('click', () => syncTab(button.dataset.pgTab)))

    if (surface.native?.parentElement) surface.native.insertAdjacentElement('beforebegin', dashboard)
    else if (surface.title) surface.title.insertAdjacentElement('afterend', dashboard)
    else surface.root.insertAdjacentElement('afterbegin', dashboard)
    return dashboard
  }

  function baseDashboardReady() {
    return Boolean(window.__LMF_PROGRESS_DASHBOARD__?.refresh)
  }

  function requestBaseRender() {
    const boot = window.__LMF_PROGRESS_BOOT__
    if (typeof boot?.scan === 'function') {
      boot.scan()
      return true
    }
    if (typeof boot?.refresh === 'function') {
      boot.refresh()
      return true
    }
    if (baseDashboardReady()) {
      window.__LMF_PROGRESS_DASHBOARD__.refresh()
      return true
    }
    return false
  }

  function retryBaseDashboard() {
    if (retrying || baseDashboardReady() || !progressSurface()) return
    if (requestBaseRender()) return
    if (document.querySelector(`script[${RETRY_ATTR}]`)) return
    retrying = true
    const script = document.createElement('script')
    script.src = '/ui/progress-dashboard-v1.js?mount-retry=11'
    script.setAttribute(RETRY_ATTR, 'true')
    script.addEventListener('load', () => {
      window.setTimeout(() => {
        if (progressRouteActive()) requestBaseRender()
        retrying = false
      }, 120)
    }, { once: true })
    script.addEventListener('error', () => { retrying = false }, { once: true })
    document.body.appendChild(script)
  }

  function ensureMount() {
    queued = false
    const surface = progressSurface()
    if (!surface) {
      unmountProgressSurface()
      return
    }
    ensureAnchor(surface)
    const dashboard = ensureBootstrapShell(surface)

    // Once the real dashboard is healthy, delayed mount pulses are verification
    // only. Do not request another base render: that would replace the tab rail,
    // steal focus, and let the browser recalculate vertical scroll during a tab
    // switch. Rendering is requested only while the bootstrap shell is incomplete.
    if (baseDashboardReady() && dashboard.dataset.loaded === '1') {
      dashboard.removeAttribute(BOOTSTRAP_ATTR)
      return
    }

    requestBaseRender()

    window.setTimeout(() => {
      const current = document.getElementById(DASHBOARD_ID)
      if (!current || !progressSurface()) {
        if (!progressRouteActive()) unmountProgressSurface()
        return
      }
      if (current.dataset.loaded === '1' && baseDashboardReady()) {
        current.removeAttribute(BOOTSTRAP_ATTR)
        return
      }
      requestBaseRender()
      retryBaseDashboard()
    }, 500)
  }

  function queue() {
    if (queued) return
    queued = true
    requestAnimationFrame(ensureMount)
  }

  function pulseRouteMount() {
    queue()
    window.setTimeout(queue, 80)
    window.setTimeout(queue, 220)
    window.setTimeout(queue, 520)
    window.setTimeout(queue, 1100)
    window.setTimeout(queue, 2000)
  }

  function progressNavTrigger(target) {
    if (!(target instanceof Element)) return null
    const link = target.closest('a[href],button,[role="button"]')
    if (!link) return null
    const href = link.getAttribute('href') || ''
    const label = (link.textContent || '').trim()
    if (/^#\/progress(?:[/?#]|$)/i.test(href)) return link
    if (link.closest('nav') && /^progress$/i.test(label)) return link
    return null
  }

  function routeChanged() {
    if (!/^#\/progress(?:[/?#]|$)/i.test(location.hash || '')) progressIntentUntil = 0
    pulseRouteMount()
  }

  function start() {
    queue()
    new MutationObserver(records => {
      const outside = records.some(record => !(record.target instanceof Element) || !record.target.closest(`#${DASHBOARD_ID}`))
      if (outside) queue()
    }).observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', routeChanged)
    window.addEventListener('hashchange', routeChanged)
    document.addEventListener('click', event => {
      if (!progressNavTrigger(event.target)) return
      progressIntentUntil = Date.now() + 5000
      pulseRouteMount()
    }, true)
    window.setTimeout(queue, 250)
    window.setTimeout(queue, 700)
    window.setTimeout(queue, 1400)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
