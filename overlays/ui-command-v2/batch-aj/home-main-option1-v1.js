(() => {
  'use strict'

  const HOME_CLASS = 'lmf-home-ref3-active'
  const SHELL = '.lmf-home-command-v4'
  let queued = false

  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()

  function onHome() {
    return document.body.classList.contains(HOME_CLASS)
  }

  function ensureHeaderTools() {
    const top = document.querySelector('.lmf-home-topbar-shell')
    if (!top) return
    let tools = top.querySelector('.lmf-home-option1-tools')
    const identity = document.querySelector(`${SHELL} .lmf-home-v4-identity`)
    if (!tools) {
      tools = document.createElement('div')
      tools.className = 'lmf-home-option1-tools'
      tools.innerHTML = '<button type="button" class="lmf-home-option1-alert" aria-label="Home notifications" title="Notifications">●</button>'
      top.appendChild(tools)
      if (identity) {
        const clone = identity.cloneNode(true)
        clone.hidden = false
        tools.appendChild(clone)
      }
    }
    if (identity) identity.hidden = true
  }

  function parseProgress(shell) {
    const text = clean(shell.querySelector('[data-lmf-sets]')?.textContent)
    const match = text.match(/(\d+)\s*\/\s*(\d+)/)
    if (!match) return { current:0, total:0, pct:0, label:text || 'Session ready' }
    const current = Number(match[1])
    const total = Number(match[2])
    const pct = total > 0 ? Math.max(0, Math.min(100, current / total * 100)) : 0
    return { current, total, pct, label:`${current} of ${total} sets` }
  }

  function ensureProgress(shell) {
    const meta = shell.querySelector('.lmf-home-v4-meta')
    const start = shell.querySelector('[data-lmf-start]')
    if (!meta || !start) return
    let block = shell.querySelector('.lmf-home-option1-progress')
    if (!block) {
      block = document.createElement('div')
      block.className = 'lmf-home-option1-progress'
      block.setAttribute('aria-label', 'Workout progress')
      block.setAttribute('role', 'progressbar')
      block.innerHTML = `
        <div class="lmf-home-option1-progress-head"><span>Workout progress</span><strong data-lmf-option1-progress-label>Session ready</strong></div>
        <div class="lmf-home-option1-track" aria-hidden="true"><span class="lmf-home-option1-fill"></span></div>`
      start.parentElement?.insertBefore(block, start)
    }
    const progress = parseProgress(shell)
    const label = block.querySelector('[data-lmf-option1-progress-label]')
    const fill = block.querySelector('.lmf-home-option1-fill')
    if (label) label.textContent = progress.label
    if (fill instanceof HTMLElement) fill.style.width = `${progress.pct}%`
    block.setAttribute('aria-valuemin', '0')
    block.setAttribute('aria-valuemax', String(progress.total || 100))
    block.setAttribute('aria-valuenow', String(progress.current || 0))
  }

  function syncProgramTheme(shell) {
    const program = clean(shell.querySelector('[data-lmf-program]')?.textContent).toLowerCase()
    const command = shell.querySelector('.lmf-home-v4-command')
    if (!(command instanceof HTMLElement)) return
    const theme = program.includes('black crown') ? 'black-crown' : program.includes('crownforge') ? 'crownforge' : 'default'
    command.dataset.lmfHomeTheme = theme
  }

  function apply() {
    queued = false
    if (!onHome()) return
    const shell = document.querySelector(SHELL)
    if (!shell) return
    ensureHeaderTools()
    ensureProgress(shell)
    syncProgramTheme(shell)
  }

  function queue() {
    if (queued) return
    queued = true
    requestAnimationFrame(apply)
  }

  function boot() {
    queue()
    new MutationObserver(queue).observe(document.body, { childList:true, subtree:true, characterData:true })
    window.addEventListener('hashchange', queue)
    window.addEventListener('popstate', queue)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true })
  else boot()
})()
