(() => {
  'use strict'

  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true

  const params = new URLSearchParams(window.location.search)
  const launchedFromCurrentPwa = () =>
    isStandalone() && params.get('source') === 'pwa' && params.get('app') === 'letmefly-v2'

  if (launchedFromCurrentPwa()) return

  const ua = navigator.userAgent || ''
  const isAndroid = /Android/i.test(ua)
  const isChrome = /Chrome\//i.test(ua) && !/(EdgA|OPR|SamsungBrowser)\//i.test(ua)
  let deferredPrompt = null
  let banner = null

  const chromeIntent = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('install', '1')
    const path = `${url.host}${url.pathname}${url.search}${url.hash}`
    return `intent://${path}#Intent;scheme=https;package=com.android.chrome;end`
  }

  const removeBanner = () => {
    banner?.remove()
    banner = null
  }

  const renderState = () => {
    if (!banner) return
    const copy = banner.querySelector('.lmf-install-copy')
    const confirm = banner.querySelector('.lmf-install-confirm')
    if (!copy || !confirm) return

    if (deferredPrompt) {
      copy.textContent = 'LetMeFly is ready to install as a full app.'
      confirm.textContent = 'Install'
      confirm.dataset.mode = 'install'
      return
    }

    if (isAndroid && !isChrome) {
      copy.textContent = 'Open LetMeFly directly in Chrome so Android can install the full app.'
      confirm.textContent = 'Open in Chrome'
      confirm.dataset.mode = 'chrome'
      return
    }

    if (isAndroid && isChrome) {
      copy.textContent = 'You are in Chrome. If Install is not ready yet, use Chrome’s menu and choose Install app.'
      confirm.textContent = 'Install help'
      confirm.dataset.mode = 'help'
      return
    }

    copy.textContent = 'Open this page in your browser to install LetMeFly.'
    confirm.textContent = 'Install help'
    confirm.dataset.mode = 'help'
  }

  const showBanner = () => {
    if (launchedFromCurrentPwa() || banner || !document.body) return

    banner = document.createElement('aside')
    banner.id = 'lmf-install-banner'
    banner.setAttribute('role', 'dialog')
    banner.setAttribute('aria-label', 'Install LetMeFly')
    banner.innerHTML = `
      <div class="lmf-install-brand">
        <img src="/app-icon-v4.svg?v=4" alt="" aria-hidden="true" />
        <div>
          <strong>Install LetMeFly</strong>
          <span class="lmf-install-copy"></span>
        </div>
      </div>
      <div class="lmf-install-actions">
        <button type="button" class="lmf-install-dismiss" aria-label="Dismiss install prompt">Not now</button>
        <button type="button" class="lmf-install-confirm"></button>
      </div>
    `

    const style = document.createElement('style')
    style.id = 'lmf-install-banner-style'
    style.textContent = `
      #lmf-install-banner{position:fixed;z-index:2147483000;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:calc(82px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(9,11,16,.98);box-shadow:0 14px 42px rgba(0,0,0,.5);color:#fff;font-family:inherit;backdrop-filter:blur(14px)}
      #lmf-install-banner .lmf-install-brand{display:flex;align-items:center;gap:10px;min-width:0}
      #lmf-install-banner img{width:54px;height:54px;border-radius:11px;flex:0 0 auto;background:#090b10;object-fit:contain}
      #lmf-install-banner strong{display:block;font-size:15px;line-height:1.2}
      #lmf-install-banner span{display:block;margin-top:3px;color:#aeb6c5;font-size:12px;line-height:1.35}
      #lmf-install-banner .lmf-install-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      #lmf-install-banner button{min-height:42px;border-radius:10px;padding:0 13px;border:1px solid rgba(255,255,255,.14);font:700 13px/1 inherit;cursor:pointer}
      #lmf-install-banner .lmf-install-dismiss{background:transparent;color:#c8ced8}
      #lmf-install-banner .lmf-install-confirm{background:#e32f3f;border-color:#e32f3f;color:#fff}
      @media(max-width:520px){#lmf-install-banner{align-items:stretch;flex-direction:column;bottom:calc(76px + env(safe-area-inset-bottom))}#lmf-install-banner .lmf-install-actions{width:100%}#lmf-install-banner button{flex:1}}
    `
    if (!document.getElementById(style.id)) document.head.appendChild(style)

    banner.querySelector('.lmf-install-dismiss')?.addEventListener('click', removeBanner)
    banner.querySelector('.lmf-install-confirm')?.addEventListener('click', async (event) => {
      const button = event.currentTarget
      const mode = button?.dataset?.mode

      if (mode === 'install' && deferredPrompt) {
        const promptEvent = deferredPrompt
        deferredPrompt = null
        promptEvent.prompt()
        try {
          await promptEvent.userChoice
        } finally {
          removeBanner()
        }
        return
      }

      if (mode === 'chrome' && isAndroid) {
        window.location.href = chromeIntent()
        return
      }

      alert('In Chrome, tap the three-dot menu and choose Install app. If Chrome only shows Add to Home screen, choose that option.')
    })

    document.body.appendChild(banner)
    renderState()
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    showBanner()
    renderState()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    removeBanner()
  })

  const start = () => setTimeout(showBanner, params.get('install') === '1' ? 900 : 1400)
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }

  window.__LMF_PWA_INSTALL__ = {
    canInstall: () => !launchedFromCurrentPwa(),
    prompt: async () => {
      if (launchedFromCurrentPwa()) return false
      if (deferredPrompt) {
        const promptEvent = deferredPrompt
        deferredPrompt = null
        promptEvent.prompt()
        const choice = await promptEvent.userChoice
        removeBanner()
        return choice?.outcome === 'accepted'
      }
      if (isAndroid && !isChrome) {
        window.location.href = chromeIntent()
      } else {
        showBanner()
      }
      return false
    },
  }
})()
