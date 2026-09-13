(() => {
  'use strict'

  const userAdjusted = new Set()
  let queued = false

  const text = element => (element?.textContent || '').replace(/\s+/g, ' ').trim()
  const setText = (element, value) => { if (element && element.textContent !== String(value)) element.textContent = String(value) }

  function exactRepDefault(prescription) {
    const tokens = String(prescription || '').split('•').map(value => value.trim()).filter(Boolean)
    const numeric = tokens.map(value => value.match(/^(\d+)(?:\s*(?:\/|per\s+)(?:side|leg|arm|hand)|\s+each\s+(?:side|leg|arm|hand))?$/i)).filter(Boolean)
    if (numeric.length !== 1) return null
    const value = Number(numeric[0][1])
    return Number.isInteger(value) && value > 0 ? value : null
  }

  function resolveProgrammedLoad(signature, defaultValue, targetUnit) {
    const unit = targetUnit === 'kg' ? 'kg' : targetUnit === 'lb' ? 'lb' : null
    if (!unit) return null
    const rawSignature = String(signature || '').trim()
    let value = Number(defaultValue)
    let sourceUnit = null
    let match = rawSignature.match(/^(-?\d+(?:\.\d+)?):(lb|kg)$/i)
    if (match) {
      value = Number(match[1])
      sourceUnit = match[2].toLowerCase()
    } else {
      match = rawSignature.match(/^(-?\d+(?:\.\d+)?)\s*(lb|kg)$/i)
      if (match) {
        value = Number(match[1])
        sourceUnit = match[2].toLowerCase()
      }
    }
    if (!Number.isFinite(value) || value < 0 || !sourceUnit) return null
    if (sourceUnit !== unit) value = sourceUnit === 'lb' ? value * 0.45359237 : value / 0.45359237
    const rounded = Math.round(value * 10) / 10
    return Number.isFinite(rounded) ? rounded : null
  }

  // Expose only pure parsing helpers for the regression audit. The runtime still
  // owns no workout persistence; native LetMeFly controls remain authoritative.
  window.__LMF_CIRCUIT_TRAIN_V1__ = Object.freeze({ exactRepDefault, resolveProgrammedLoad })

  function isTrain() { return location.hash.split('?')[0] === '#/train' }
  function isSubstitutionCard(card) {
    if (!card) return false
    if (card.matches('[data-lmf-substitution], .lmf-substitution-active') || card.querySelector('[data-lmf-substitution], .lmf-substitution-active')) return true
    const copy = text(card)
    return /PERFORMING TODAY:/i.test(copy) && /PROGRAM SLOT:/i.test(copy)
  }

  function presetKey(row, field) { return `${row?.dataset?.setId || ''}:${field}` }
  function fieldWasAdjusted(row, field) { return userAdjusted.has(presetKey(row, field)) }

  function hydrateRow(row) {
    if (!(row instanceof Element) || row.dataset.lmfProgrammedHydrated === 'v1') return
    row.dataset.lmfProgrammedHydrated = 'v1'
    if (row.querySelector('.set-check.done')) return
    const card = row.closest('.active-exercise')
    if (isSubstitutionCard(card)) return

    let preset = false
    if (row.dataset.prescriptionKind === 'reps') {
      const input = row.querySelector('.reps-input')
      if (input && input.value === '' && !fieldWasAdjusted(row, 'reps')) {
        const reps = exactRepDefault(text(row.querySelector('.set-target-cell strong')))
        if (reps != null) {
          input.value = String(reps)
          input.dataset.lmfProgrammedPreset = 'true'
          preset = true
        }
      }
    }

    const loadInput = row.querySelector('.load-input')
    if (loadInput && loadInput.value === '' && row.dataset.hasLoad === 'true' && !fieldWasAdjusted(row, 'load')) {
      const load = resolveProgrammedLoad(row.dataset.programmedLoad, row.dataset.programmedLoadDefault, row.dataset.loadUnit)
      if (load != null) {
        loadInput.value = String(load)
        loadInput.dataset.lmfProgrammedPreset = 'true'
        preset = true
      }
    }

    if (preset) {
      row.classList.add('lmf-as-programmed-ready')
      card?.classList.add('lmf-has-programmed-presets')
    }
  }

  function circuitMeta(panel) {
    if (panel?.dataset.groupType !== 'round') return null
    const cards = [...panel.querySelectorAll('.exercise-stack > .active-exercise, .exercise-stack > .preview-card')]
    if (cards.length < 2) return null
    const counts = cards.map(card => card.querySelectorAll('.set-row, .prescription-row').length).filter(Boolean)
    const rounds = counts.length === cards.length && counts.every(value => value === counts[0]) ? counts[0] : null
    const kicker = text(panel.querySelector('.workout-panel-head .page-kicker'))
    const block = kicker.match(/^([A-Z])\b/)?.[1] || 'A'
    return { cards, rounds, block }
  }

  function renderCircuit(panel) {
    const meta = circuitMeta(panel)
    panel?.classList.toggle('lmf-circuit-panel', Boolean(meta))
    const existing = panel?.querySelector(':scope > .lmf-circuit-strip')
    if (!meta) { existing?.remove(); return }

    let strip = existing
    if (!strip) {
      strip = document.createElement('div')
      strip.className = 'lmf-circuit-strip'
      strip.innerHTML = '<strong>CIRCUIT</strong><span></span>'
      const head = panel.querySelector('.workout-panel-head')
      head?.after(strip)
    }
    const detail = meta.rounds && meta.rounds > 1
      ? `${meta.cards.length} movements · ${meta.rounds} rounds · move through each exercise before repeating the round`
      : `${meta.cards.length} movements · move through each exercise before repeating the round`
    setText(strip.querySelector('span'), detail)

    meta.cards.forEach((card, index) => {
      card.dataset.lmfCircuitPosition = String(index + 1)
      let badge = card.querySelector('.lmf-circuit-movement-code')
      if (!badge) {
        badge = document.createElement('span')
        badge.className = 'lmf-circuit-movement-code'
        const title = card.querySelector('.exercise-title') || card
        title.prepend(badge)
      }
      setText(badge, `${meta.block}${index + 1}`)
    })
  }

  function renderConfirmHint(card) {
    const hasPreset = Boolean(card.querySelector('.lmf-as-programmed-ready'))
    let hint = card.querySelector('.lmf-confirm-programmed-hint')
    if (!hasPreset) { hint?.remove(); return }
    if (!hint) {
      hint = document.createElement('div')
      hint.className = 'lmf-confirm-programmed-hint'
      hint.innerHTML = '<strong>AS PROGRAMMED</strong><span>Values are ready to log. Adjust only if the set changes.</span>'
      const table = card.querySelector('.set-table')
      table?.before(hint)
    }
  }

  function render() {
    if (!isTrain()) return
    const shell = document.querySelector('.train-shell')
    if (!shell) return
    shell.classList.add('lmf-circuit-train-v1')
    shell.querySelectorAll('.workout-panel').forEach(renderCircuit)
    shell.querySelectorAll('.set-row').forEach(hydrateRow)
    shell.querySelectorAll('.active-exercise').forEach(renderConfirmHint)
  }

  function queue() {
    if (queued) return
    queued = true
    requestAnimationFrame(() => { queued = false; render() })
  }

  function boot() {
    queue()
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-group-type'] })
    document.addEventListener('input', event => {
      const input = event.target
      if (!(input instanceof HTMLInputElement)) return
      const row = input.closest('.set-row')
      if (!row) return
      if (input.matches('.reps-input')) userAdjusted.add(presetKey(row, 'reps'))
      if (input.matches('.load-input')) userAdjusted.add(presetKey(row, 'load'))
      input.dataset.lmfProgrammedPreset = 'false'
      row.classList.remove('lmf-as-programmed-ready')
      row.dataset.lmfProgrammedHydrated = 'v1'
      queue()
    }, true)
    window.addEventListener('hashchange', queue)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
