(() => {
  'use strict'

  // DOM-only future-day presentation. No program/workout/private-data writes.
  // Reads the authoritative prescription row structure and mirrors it into
  // Day-1-style controls that are intentionally disabled in preview mode.
  const PREVIEW = /^(Preview position\.|Preview only\.)/i
  const LABEL = /^(?:R|S|SET)\s*(\d+)\s*$/i
  const EFFORT = /\b(RPE|RIR)\s*[:@]?\s*([0-9]+(?:\.[0-9]+)?)/ig
  let queued = false

  const txt = (n) => (n?.innerText || n?.textContent || '').replace(/\u00a0/g, ' ').trim()
  const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
  const preview = () => Boolean(document.querySelector('.train-shell') && [...document.querySelectorAll('.callout.warning strong')].some((n) => PREVIEW.test(txt(n))))

  function rowNodes(block) {
    const directRows = [...block.querySelectorAll(':scope > .prescription-row')]
    if (directRows.length) return directRows
    return [...block.children].filter((n) => !n.classList.contains('lmf-preview-readonly-logger') && txt(n))
  }

  function splitDetail(value) {
    return clean(value)
      .replace(/\s*[|·]\s*/g, ' • ')
      .split(/\s*•\s*/)
      .map(clean)
      .filter(Boolean)
  }

  function classifyLoadText(value) {
    const loadText = clean(value)
    if (!loadText) return { load: '—', rpe: '—' }

    const efforts = []
    const explicitLoad = clean(loadText
      .replace(EFFORT, (_, kind, target) => {
        efforts.push({ kind: String(kind).toUpperCase(), target })
        return ''
      })
      .replace(/\s*•\s*•\s*/g, ' • ')
      .replace(/^\s*•\s*|\s*•\s*$/g, ''))

    const effort = efforts[0]
    const effortText = effort ? (effort.kind === 'RIR' ? `RIR ${effort.target}` : effort.target) : '—'

    // A governed row may contain BOTH a resolved load and an RPE/RIR target
    // (for example "95 lb • RPE 7"). Preview must preserve the actual load.
    // Only use BY RPE when effort is truly the sole loading prescription.
    return {
      load: explicitLoad || (effort ? 'BY RPE' : loadText),
      rpe: effortText,
    }
  }

  function parse(node, index) {
    // programExerciseCard renders each governed prescription row as:
    // <strong>{set.label}</strong><span>{set.reps}[ • {set.loadText}]</span>
    // Read those fields separately so labels like R1 + 3 reps never collapse into R13.
    const labelText = clean(node.querySelector(':scope > strong')?.textContent)
    const detailText = clean(node.querySelector(':scope > span')?.textContent)

    const labelHit = labelText.match(LABEL)
    const numericLabel = labelText.match(/\d+/)
    const setNumber = Number(labelHit?.[1] || numericLabel?.[0]) || index + 1

    const pieces = splitDetail(detailText)
    const reps = pieces[0] || '—'
    const loadText = pieces.slice(1).join(' • ')
    const classified = classifyLoadText(loadText)

    return {
      setNumber,
      reps,
      load: classified.load,
      rpe: classified.rpe,
      prescription: detailText || 'Programmed work',
      raw: `${labelText}\u241f${detailText}`,
    }
  }

  function sets(card) {
    const block = card.querySelector(':scope > .prescription-block')
    return block ? rowNodes(block).map(parse) : []
  }

  function metric(label, value) {
    const el = document.createElement('div')
    el.className = 'lmf-preview-metric'
    el.innerHTML = `<span>${label}</span><div class="lmf-preview-stepper"><button type="button" disabled aria-disabled="true" tabindex="-1" aria-hidden="true">−</button><strong></strong><button type="button" disabled aria-disabled="true" tabindex="-1" aria-hidden="true">+</button></div>`
    el.querySelector('strong').textContent = value || '—'
    return el
  }

  function render(shell, rows, selected = 0) {
    if (!rows.length) return
    selected = Math.max(0, Math.min(rows.length - 1, Number(selected) || 0))
    const row = rows[selected]
    shell.dataset.selected = String(selected)
    shell.dataset.lmfPreviewReadonly = 'true'
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
