(() => {
  if (window.__LMF_PWA_UPDATE_V1__) return
  window.__LMF_PWA_UPDATE_V1__ = true

  if (!('serviceWorker' in navigator)) return

  const CONTROL_ID = 'lmf-pwa-update-control-v1'
  const BANNER_ID = 'lmf-pwa-update-banner-v1'
  const STYLE_ID = 'lmf-pwa-update-style-v1'
  const UPDATE_MESSAGE = 'LMF_SKIP_WAITING'
  const CHECK_INTERVAL_MS = 30 * 60 * 1000

  let registration = null
  let mode = 'idle'
  let applyRequested = false
  let reloadStarted = false
  let checkPromise = null

  const copy = {
    idle: {
      status: 'Checks automatically. Your athlete data and workout history stay untouched.',
      action: 'CHECK NOW',
    },
    checking: {
      status: 'Checking for the newest LetMeFly build…',
      action: 'CHECKING…',
    },
    ready: {
      status: 'A new LetMeFly update is ready.',
      action: 'UPDATE NOW',
    },
    applying: {
      status: 'Activating the new LetMeFly build…',
      action: 'UPDATING…',
    },
    reload: {
      status: 'Update installed. Reload when you are ready to use it.',
      action: 'RELOAD NOW',
    },
    current: {
      status: 'You are on the latest available LetMeFly build.',
      action: 'CHECK AGAIN',
    },
    offline: {
      status: 'You are offline. LetMeFly will check again when the connection returns.',
      action: 'CHECK AGAIN',
    },
    error: {
      status: 'LetMeFly could not check for an update right now.',
      action: 'TRY AGAIN',
    },
  }

  const addStyles = () => {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .lmf-update-setting{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0;border-top:1px solid rgba(255,255,255,.08)}
      .lmf-update-setting-copy{min-width:0;display:grid;gap:4px}
      .lmf-update-setting-copy strong{font-size:14px;letter-spacing:.04em;color:#f4f6f8}
      .lmf-update-setting-copy span{font-size:12px;line-height:1.4;color:#9ba3ad}
      .lmf-update-action{flex:0 0 auto;min-height:44px;padding:0 14px;border:1px solid rgba(255,53,72,.55);border-radius:10px;background:rgba(255,53,72,.10);color:#fff;font:800 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.08em;cursor:pointer}
      .lmf-update-action[data-state="ready"],.lmf-update-action[data-state="reload"]{background:#d61f35;border-color:#ff5365;box-shadow:0 0 0 1px rgba(255,83,101,.12),0 12px 30px rgba(214,31,53,.22)}
      .lmf-update-action:disabled{opacity:.55;cursor:default}
      #${BANNER_ID}{position:fixed;left:12px;right:12px;bottom:calc(82px + env(safe-area-inset-bottom));z-index:2147483000;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:620px;margin:0 auto;padding:12px 12px 12px 14px;border:1px solid rgba(255,83,101,.5);border-radius:14px;background:rgba(13,15,18,.97);box-shadow:0 18px 45px rgba(0,0,0,.45);backdrop-filter:blur(14px)}
      #${BANNER_ID}[hidden]{display:none!important}
      #${BANNER_ID} span{font:700 13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f6f7f9}
      #${BANNER_ID} button{min-height:42px;padding:0 13px;border:1px solid #ff5365;border-radius:10px;background:#d61f35;color:#fff;font:900 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.08em;white-space:nowrap}
      @media (min-width:900px){#${BANNER_ID}{bottom:24px;left:auto;right:24px;width:min(520px,calc(100vw - 48px));margin:0}}
    `
    document.head.appendChild(style)
  }

  const ensureBanner = () => {
    let banner = document.getElementById(BANNER_ID)
    if (banner) return banner
    banner = document.createElement('div')
    banner.id = BANNER_ID
    banner.hidden = true
    banner.setAttribute('role', 'status')
    banner.setAttribute('aria-live', 'polite')
    banner.innerHTML = '<span data-lmf-update-banner-copy>New LetMeFly update ready.</span><button type="button" data-lmf-update-banner-action>UPDATE NOW</button>'
    document.body.appendChild(banner)
    banner.querySelector('[data-lmf-update-banner-action]')?.addEventListener('click', () => void handleAction())
    return banner
  }

  const ensureSettingsControl = () => {
    const list = document.querySelector('.settings-list')
    if (!list || list.querySelector(`#${CONTROL_ID}`)) return

    const row = document.createElement('div')
    row.id = CONTROL_ID
    row.className = 'lmf-update-setting'
    row.setAttribute('data-lmf-update-control', 'v1')
    row.innerHTML = `
      <div class="lmf-update-setting-copy">
        <strong>App updates</strong>
        <span data-lmf-update-status></span>
      </div>
      <button class="lmf-update-action" type="button" data-lmf-update-action></button>
    `
    list.appendChild(row)
    row.querySelector('[data-lmf-update-action]')?.addEventListener('click', () => void handleAction())
    render()
  }

  const render = () => {
    const state = copy[mode] || copy.idle
    document.querySelectorAll('[data-lmf-update-status]').forEach((node) => {
      node.textContent = state.status
    })
    document.querySelectorAll('[data-lmf-update-action]').forEach((button) => {
      button.textContent = state.action
      button.dataset.state = mode
      button.disabled = mode === 'checking' || mode === 'applying'
    })

    const banner = ensureBanner()
    const showBanner = mode === 'ready' || mode === 'reload'
    banner.hidden = !showBanner
    const bannerCopy = banner.querySelector('[data-lmf-update-banner-copy]')
    const bannerAction = banner.querySelector('[data-lmf-update-banner-action]')
    if (bannerCopy) bannerCopy.textContent = mode === 'reload' ? 'LetMeFly updated. Reload to use the new build.' : 'New LetMeFly update ready.'
    if (bannerAction) bannerAction.textContent = mode === 'reload' ? 'RELOAD NOW' : 'UPDATE NOW'
  }

  const setMode = (next) => {
    mode = next
    render()
  }

  const watchInstallingWorker = (worker) => {
    if (!worker) return
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return
      if (navigator.serviceWorker.controller) {
        if (registration?.waiting) setMode('ready')
      } else {
        setMode('current')
      }
    })
  }

  const bindRegistration = (nextRegistration) => {
    registration = nextRegistration
    if (registration.waiting) setMode('ready')
    if (registration.installing) watchInstallingWorker(registration.installing)
    registration.addEventListener('updatefound', () => watchInstallingWorker(registration.installing))
  }

  const ensureRegistration = async () => {
    if (registration) return registration
    let nextRegistration = await navigator.serviceWorker.getRegistration()
    if (!nextRegistration) {
      nextRegistration = await navigator.serviceWorker.register('/service-worker.js')
    }
    bindRegistration(nextRegistration)
    return nextRegistration
  }

  const checkForUpdates = async ({ quiet = false } = {}) => {
    if (checkPromise) return checkPromise
    if (!navigator.onLine) {
      if (!quiet) setMode('offline')
      return null
    }

    checkPromise = (async () => {
      try {
        const reg = await ensureRegistration()
        if (reg.waiting) {
          setMode('ready')
          return reg
        }
        if (!quiet) setMode('checking')
        await reg.update()
        if (reg.waiting) {
          setMode('ready')
        } else if (!reg.installing && !quiet) {
          setMode('current')
        }
        return reg
      } catch (error) {
        console.warn('LetMeFly update check failed', error)
        if (!quiet) setMode('error')
        return null
      } finally {
        checkPromise = null
      }
    })()

    return checkPromise
  }

  const activateUpdate = async () => {
    const reg = await ensureRegistration()
    if (!reg.waiting) {
      await checkForUpdates({ quiet: false })
    }
    if (!reg.waiting) {
      if (mode !== 'reload') setMode('current')
      return
    }

    applyRequested = true
    setMode('applying')
    reg.waiting.postMessage({ type: UPDATE_MESSAGE })
  }

  const handleAction = async () => {
    if (mode === 'ready') {
      await activateUpdate()
      return
    }
    if (mode === 'reload') {
      window.location.reload()
      return
    }
    await checkForUpdates({ quiet: false })
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadStarted) return
    if (applyRequested) {
      reloadStarted = true
      window.location.reload()
      return
    }
    setMode('reload')
  })

  window.addEventListener('online', () => void checkForUpdates({ quiet: true }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdates({ quiet: true })
  })

  const start = async () => {
    addStyles()
    ensureBanner()
    ensureSettingsControl()

    const observer = new MutationObserver(() => ensureSettingsControl())
    observer.observe(document.documentElement, { childList: true, subtree: true })

    try {
      const reg = await ensureRegistration()
      if (reg.waiting) setMode('ready')
      else setMode('idle')
    } catch (error) {
      console.warn('LetMeFly update registration unavailable', error)
      setMode('error')
    }

    window.setTimeout(() => void checkForUpdates({ quiet: true }), 1500)
    window.setInterval(() => void checkForUpdates({ quiet: true }), CHECK_INTERVAL_MS)
  }

  window.LetMeFlyAppUpdates = {
    check: () => checkForUpdates({ quiet: false }),
    apply: () => activateUpdate(),
    getState: () => mode,
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void start(), { once: true })
  } else {
    void start()
  }
})()
