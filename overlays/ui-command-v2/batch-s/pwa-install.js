(() => {
  'use strict'

  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true

  if (isStandalone()) return

  let deferredPrompt = null
  let banner = null

  const removeBanner = () => {
    banner?.remove()
    banner = null
  }

  const showBanner = () => {
    if (!deferredPrompt || isStandalone() || banner || !document.body) return

    banner = document.createElement('aside')
    banner.id = 'lmf-install-banner'
    banner.setAttribute('role', 'dialog')
    banner.setAttribute('aria-label', 'Install LetMeFly')
    banner.innerHTML = `
      <div class="lmf-install-brand">
        <img src="/app-icon-v2.svg?v=2" alt="" aria-hidden="true" />
        <div>
          <strong>Install LetMeFly</strong>
          <span>Use the full app from your home screen.</span>
        </div>
      </div>
      <div class="lmf-install-actions">
        <button type="button" class="lmf-install-dismiss" aria-label="Dismiss install prompt">Not now</button>
        <button type="button" class="lmf-install-confirm">Install</button>
      </div>
    `

    const style = document.createElement('style')
    style.id = 'lmf-install-banner-style'
    style.textContent = `
      #lmf-install-banner{position:fixed;z-index:2147483000;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:calc(82px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(9,11,16,.97);box-shadow:0 14px 42px rgba(0,0,0,.45);color:#fff;font-family:inherit;backdrop-filter:blur(14px)}
      #lmf-install-banner .lmf-install-brand{display:flex;align-items:center;gap:10px;min-width:0}
      #lmf-install-banner img{width:48px;height:48px;border-radius:11px;flex:0 0 auto;background:#090b10}
      #lmf-install-banner strong{display:block;font-size:15px;line-height:1.2}
      #lmf-install-banner span{display:block;margin-top:3px;color:#aeb6c5;font-size:12px;line-height:1.3}
      #lmf-install-banner .lmf-install-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      #lmf-install-banner button{min-height:42px;border-radius:10px;padding:0 13px;border:1px solid rgba(255,255,255,.14);font:700 13px/1 inherit;cursor:pointer}
      #lmf-install-banner .lmf-install-dismiss{background:transparent;color:#c8ced8}
      #lmf-install-banner .lmf-install-confirm{background:#e32f3f;border-color:#e32f3f;color:#fff}
      @media(max-width:520px){#lmf-install-banner{align-items:stretch;flex-direction:column;bottom:calc(76px + env(safe-area-inset-bottom))}#lmf-install-banner .lmf-install-actions{width:100%}#lmf-install-banner button{flex:1}}
    `
    if (!document.getElementById(style.id)) document.head.appendChild(style)

    banner.querySelector('.lmf-install-dismiss')?.addEventListener('click', removeBanner)
    banner.querySelector('.lmf-install-confirm')?.addEventListener('click', async () => {
      if (!deferredPrompt) return
      const promptEvent = deferredPrompt
      deferredPrompt = null
      promptEvent.prompt()
      try {
        const choice = await promptEvent.userChoice
        if (choice?.outcome !== 'accepted') {
          // Chrome only exposes each beforeinstallprompt event once. A future
          // navigation can provide another event if the user changes their mind.
        }
      } finally {
        removeBanner()
      }
    })

    document.body.appendChild(banner)
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    showBanner()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    removeBanner()
  })

  window.addEventListener('DOMContentLoaded', showBanner, { once: true })

  // Small public hook for a future Settings/Profile "Install app" action.
  window.__LMF_PWA_INSTALL__ = {
    canInstall: () => Boolean(deferredPrompt) && !isStandalone(),
    prompt: async () => {
      if (!deferredPrompt || isStandalone()) return false
      const promptEvent = deferredPrompt
      deferredPrompt = null
      promptEvent.prompt()
      const choice = await promptEvent.userChoice
      removeBanner()
      return choice?.outcome === 'accepted'
    },
  }
})()
