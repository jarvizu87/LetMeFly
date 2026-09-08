(() => {
  'use strict'

  // DOM-only future-day presentation. No program/workout/private-data writes.
  const PREVIEW = /^(Preview position\.|Preview only\.)/i
  const PREFIX = /^(?:R|S|SET)\s*(\d+)\b[\s:.-]*/i
  let queued = false

  const txt = (n) => (n?.innerText || n?.textContent || '').replace(/\u00a0/g, ' ').trim()
  const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim()
  const short = (v) => { const s = clean(v); return !s ? '—' : s.length > 18 ? `${s.slice(0, 17).trim()}…` : s }
  const preview = () => Boolean(document.querySelector('.train-shell') && [...document.querySelectorAll('.callout.warning strong')].some((n) => PREVIEW.test(txt(n))))

  function rowNodes(block) {
    const direct = [...block.children].filter((n) => !n.classList.contains('lmf-preview-readonly-logger') && txt(n))
    const rows = direct.filter((n) => PREFIX.test(txt(n)))
    if (rows.length) return rows
    const nested = [...block.querySelectorAll('*')].filter((n) => {
      if (n.closest('.lmf-preview-readonly-logger')) return false
      const value = txt(n)
      return value && PREFIX.test(value) && ![...n.children].some((c) => PREFIX.test(txt(c)))
    })
    return nested.length ? nested : direct.length ? direct : txt(block) ? [block] : []
  }

  function parse(node, index) {
    const raw = txt(node)
    const hit = raw.match(PREFIX)
    const setNumber = Number(hit?.[1]) || index + 1
    let body = clean(hit ? raw.replace(PREFIX, '') : raw)
    body = body.replace(/\s*[|·]\s*/g, ' • ')
    const segments = body.split(/\s*•\s*/).map(clean).filter(Boolean)
    const rpeHit = body.match(/\bRPE\s*[:@]?\s*([0-9]+(?:\.[0-9]+)?)/i)
    const rirHit = body.match(/\bRIR\s*[:@]?\s*([0-9]+(?:\.[0-9]+)?)/i)
    const rpe = rpeHit ? rpeHit[1] : rirHit ? `RIR ${rirHit[1]}` : '—'
    const loadRx = /(?:\b\d+(?:\.\d+)?\s*(?:lb|lbs|kg|kgs)\b(?:\s*\([^)]*\))?(?:\s*[A-Za-z-]+)?|\b\d+(?:\.\d+)?\s*%\s*(?:TM|1RM)?\b|\bbody\s*weight\b|\bbodyweight\b|\bBW\b|\bas prescribed\b)/i
    const loadHit = body.match(loadRx)
    const load = loadHit ? short(loadHit[0]) : '—'
    const work = segments.map((s) => clean(s
      .replace(/\bRPE\s*[:@]?\s*[0-9]+(?:\.[0-9]+)?/ig, '')
      .replace(/\bRIR\s*[:@]?\s*[0-9]+(?:\.[0-9]+)?/ig, '')
      .replace(loadRx, '')
      .replace(/^[-–—,:;@\s]+|[-–—,:;@\s]+$/g, '')))
      .find((s) => s && !/^(?:rest|tempo)\b/i.test(s))
    return { setNumber, reps: short(work || body.replace(loadRx, '')), load, rpe, prescription: body || raw || 'Programmed work', raw }
  }

  function sets(card) {
    const block = card.querySelector(':scope > .prescription-block')
    return block ? rowNodes(block).map(parse) : []
  }

  function metric(label, value) {
    const el = document.createElement('div')
    el.className = 'lmf-preview-metric'
    el.innerHTML = `<span>${label}</span><div class="lmf-preview-stepper"><button type="button" disabled tabindex="-1" aria-hidden="true">−</button><strong></strong><button type="button" disabled tabindex="-1" aria-hidden="true">+</button></div>`
    el.querySelector('strong').textContent = value || '—'
    return el
  }

  function render(shell, rows, selected = 0) {
    if (!rows.length) return
    selected = Math.max(0, Math.min(rows.length - 1, Number(selected) || 0))
    const row = rows[selected]
    shell.dataset.selected = String(selected)
    shell.replaceChildren()

    const panel = document.createElement('div')
    panel.className = 'lmf-preview-set-card'
    panel.innerHTML = `<div class="lmf-preview-set-head"><div class="lmf-preview-set-count"><span>SET</span><strong></strong><em>/ ${rows.length}</em></div><div class="lmf-preview-set-check" role="img" aria-label="Preview only — set completion is locked"><i></i></div></div><div class="lmf-preview-metrics"></div><div class="lmf-preview-prescription-line"><span aria-hidden="true">▰</span><strong></strong></div>`
    panel.querySelector('.lmf-preview-set-count strong').textContent = row.setNumber
    panel.querySelector('.lmf-preview-metrics').append(metric('REPS', row.reps), metric('LOAD', row.load), metric('RPE / RIR', row.rpe))
    panel.querySelector('.lmf-preview-prescription-line strong').textContent = row.prescription
    shell.appendChild(panel)

    if (rows.length > 1) {
      const tabs = document.createElement('div')
      tabs.className = 'lmf-preview-set-tabs'
      tabs.setAttribute('role', 'tablist')
      tabs.setAttribute('aria-label', 'Preview sets')
      rows.forEach((set, index) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = `lmf-preview-set-tab${index === selected ? ' active' : ''}`
        b.dataset.lmfPreviewSetIndex = String(index)
        b.setAttribute('role', 'tab')
        b.setAttribute('aria-selected', index === selected ? 'true' : 'false')
        b.textContent = set.setNumber
        tabs.appendChild(b)
      })
      shell.appendChild(tabs)
    }
  }

  function ensure(card) {
    const block = card.querySelector(':scope > .prescription-block')
    const rows = sets(card)
    if (!block || !rows.length) return
    const fingerprint = rows.map((r) => r.raw).join('\u241e')
    let shell = block.querySelector(':scope > .lmf-preview-readonly-logger')
    const selected = Number(shell?.dataset.selected || 0)
    block.classList.add('lmf-preview-rich-source')
    block.dataset.lmfPreviewRichSource = 'true'
    if (!shell) {
      shell = document.createElement('div')
      shell.className = 'lmf-preview-readonly-logger'
      shell.setAttribute('role', 'group')
      shell.setAttribute('aria-label', 'Read-only programmed set preview')
      block.appendChild(shell)
    }
    if (shell.dataset.fingerprint !== fingerprint) {
      shell.dataset.fingerprint = fingerprint
      render(shell, rows, selected)
    }
  }

  function cleanup() {
    document.querySelectorAll('.prescription-block[data-lmf-preview-rich-source="true"]').forEach((block) => {
      block.querySelector(':scope > .lmf-preview-readonly-logger')?.remove()
      block.classList.remove('lmf-preview-rich-source')
      delete block.dataset.lmfPreviewRichSource
    })
  }

  function reconcile() {
    queued = false
    if (!preview()) return cleanup()
    document.querySelectorAll('.train-shell .workout-panel .exercise-stack .preview-card').forEach(ensure)
  }

  function schedule() {
    if (queued) return
    queued = true
    requestAnimationFrame(reconcile)
  }

  function click(event) {
    const button = event.target instanceof Element ? event.target.closest('[data-lmf-preview-set-index]') : null
    const shell = button?.closest('.lmf-preview-readonly-logger')
    const card = button?.closest('.preview-card')
    if (!button || !shell || !card || !preview()) return
    event.preventDefault()
    event.stopPropagation()
    const rows = sets(card)
    render(shell, rows, Number(button.dataset.lmfPreviewSetIndex || 0))
    shell.dataset.fingerprint = rows.map((r) => r.raw).join('\u241e')
  }

  function start() {
    reconcile()
    document.addEventListener('click', click, true)
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('popstate', schedule)
    setTimeout(schedule, 250)
    setTimeout(schedule, 1000)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
