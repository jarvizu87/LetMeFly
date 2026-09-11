(() => {
  'use strict'

  // LetMeFly Smart Exercise Names + Bar Loader
  // Presentation/utility only. Canonical exercise names and programmed loads are never rewritten.

  const STORAGE_KEY = 'letmefly-bar-loader-v1'
  const UNIT_PLATES = {
    lb: [55, 45, 35, 25, 10, 5, 2.5, 1.25],
    kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  }
  const PLATE_PRESETS = {
    lb: {
      iron: {
        label: 'Iron Plates',
        pairs: { '55': 0, '45': 6, '35': 2, '25': 4, '10': 4, '5': 4, '2.5': 4, '1.25': 2 },
      },
      bumper: {
        label: 'Bumper Plates',
        pairs: { '55': 2, '45': 4, '35': 2, '25': 4, '10': 2, '5': 2, '2.5': 2, '1.25': 0 },
      },
    },
    kg: {
      iron: {
        label: 'Iron Plates',
        pairs: { '25': 0, '20': 6, '15': 2, '10': 4, '5': 4, '2.5': 4, '1.25': 4, '0.5': 2 },
      },
      bumper: {
        label: 'Bumper Plates',
        pairs: { '25': 2, '20': 4, '15': 2, '10': 4, '5': 2, '2.5': 2, '1.25': 2, '0.5': 0 },
      },
    },
  }
  const DEFAULTS = {
    unit: 'lb',
    barLb: 45,
    barKg: 20,
    collarsLb: 0,
    collarsKg: 0,
    platePresetLb: 'custom',
    platePresetKg: 'custom',
    pairsLb: { '55': 2, '45': 6, '35': 2, '25': 4, '10': 4, '5': 4, '2.5': 4, '1.25': 2 },
    pairsKg: { '25': 2, '20': 6, '15': 2, '10': 4, '5': 4, '2.5': 4, '1.25': 4, '0.5': 2 },
  }

  let refreshTimer = null
  let modal = null
  let currentContext = null
  let copyResetTimer = null

  function cleanName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  function smartShortName(name) {
    const original = cleanName(name)
    if (!original) return original

    const exact = new Map([
      ['Incline DB Press', 'Inc DB Press'],
      ['Incline Dumbbell Press', 'Inc DB Press'],
      ['Incline Dumbbell Bench Press', 'Inc DB Press'],
      ['1/2 Kneeling Chop', 'Half-Kneeling Chop'],
      ['Half Kneeling Chop', 'Half-Kneeling Chop'],
      ['Half-Kneeling Cable Chop', 'Half-Kneeling Chop'],
      ['Glute Bridge Isometric Hold', 'Glute Bridge ISO'],
      ['Rear Deltoid Fly', 'Rear Delt Fly'],
    ])
    if (exact.has(original)) return exact.get(original)

    let short = original
      .replace(/\bDumbbell\b/gi, 'DB')
      .replace(/\bKettlebell\b/gi, 'KB')
      .replace(/\bRomanian Deadlift\b/gi, 'RDL')
      .replace(/\bOverhead Press\b/gi, 'OHP')
      .replace(/\bIsometric Hold\b/gi, 'ISO')
      .replace(/\bIsometric\b/gi, 'ISO')
      .replace(/\bSingle[- ]Arm\b/gi, '1-Arm')
      .replace(/\bSingle[- ]Leg\b/gi, '1-Leg')
      .replace(/\bRear Deltoid\b/gi, 'Rear Delt')
      .replace(/\bOne[- ]Arm\b/gi, '1-Arm')
      .replace(/\bOne[- ]Leg\b/gi, '1-Leg')
      .replace(/\bHalf[- ]Kneeling Cable Chop\b/gi, 'Half-Kneeling Chop')
      .replace(/^1\/2\s+Kneeling\b/i, 'Half-Kneeling')

    if (short.length > 22) short = short.replace(/^Incline\b/i, 'Inc')
    if (short.length > 25) short = short.replace(/\bBarbell\b/gi, 'BB')
    return cleanName(short)
  }

  function markSmartNames(root = document) {
    const scope = root instanceof Element ? root : document

    scope.querySelectorAll('.lmf-compact-copy b').forEach((node) => {
      const full = cleanName(node.textContent)
      const short = smartShortName(full)
      if (!full || !short || full === short) {
        node.removeAttribute('data-lmf-short-name')
        return
      }
      node.setAttribute('data-lmf-short-name', short)
      node.setAttribute('title', full)
      node.setAttribute('aria-label', full)
    })

    scope.querySelectorAll('.exercise-title h3').forEach((node) => {
      const full = cleanName(node.textContent)
      const short = smartShortName(full)
      if (!full || !short || full === short) {
        node.removeAttribute('data-lmf-short-name')
        return
      }
      node.setAttribute('data-lmf-short-name', short)
      node.setAttribute('title', full)
      node.setAttribute('aria-label', full)
    })
  }

  function cloneDefaults() {
    return {
      ...DEFAULTS,
      pairsLb: { ...DEFAULTS.pairsLb },
      pairsKg: { ...DEFAULTS.pairsKg },
    }
  }

  function storageRead() {
    if (window.LetMeFlyBarbellSettings) return window.LetMeFlyBarbellSettings.read(DEFAULTS)
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      return {
        ...DEFAULTS,
        ...parsed,
        pairsLb: { ...DEFAULTS.pairsLb, ...(parsed.pairsLb || {}) },
        pairsKg: { ...DEFAULTS.pairsKg, ...(parsed.pairsKg || {}) },
      }
    } catch (_) {
      return cloneDefaults()
    }
  }

  function storageWrite(settings) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch (_) {
      // Preference persistence is optional; the loader still works for this session.
    }
  }

  function formatWeight(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return '—'
    return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100)
  }

  function isBarbellExercise(name) {
    const value = cleanName(name).toLowerCase()
    if (!value) return false
    if (/\b(db|dumbbell|kb|kettlebell|cable|machine|sled|bodyweight|band|plate)\b/.test(value)) return false
    if (/\bbarbell\b/.test(value)) return true
    return /\b(front squat|back squat|squat|bench press|deadlift|rdl|romanian deadlift|overhead press|ohp|push press|strict press|good morning|hip thrust|rack pull|clean|snatch|high pull|jerk|bar row|bent[- ]over row)\b/.test(value)
  }

  function activeLoadForCard(card) {
    const row = card.querySelector('.set-row.lmf-set-active')
      || card.querySelector('.set-row:not([aria-hidden="true"])')
      || card.querySelector('.set-row')
    const active = row?.querySelector('.load-input')
    const value = Number.parseFloat(active?.value || '')
    const helper = cleanName(row?.querySelector('.load-field small')?.textContent).toLowerCase()
    const unit = helper.includes('kg') ? 'kg' : helper.includes('lb') ? 'lb' : null
    return { target: Number.isFinite(value) && value > 0 ? value : null, unit }
  }

  function ensureExerciseButtons(root = document) {
    const scope = root instanceof Element ? root : document
    scope.querySelectorAll('.active-exercise').forEach((card) => {
      const actions = card.querySelector(':scope > .exercise-actions')
      const name = cleanName(card.querySelector('.exercise-title h3')?.textContent)
      if (!actions || !isBarbellExercise(name)) return
      if (actions.querySelector('[data-lmf-bar-loader-open]')) return

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn small ghost lmf-bar-load-btn'
      button.setAttribute('data-lmf-bar-loader-open', 'exercise')
      button.textContent = 'BAR LOAD'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const load = activeLoadForCard(card)
        openBarLoader({ source: 'exercise', exerciseName: name, target: load.target, unit: load.unit })
      })
      actions.appendChild(button)
    })
  }

  function ensureMoreCard(root = document) {
    const scope = root instanceof Element ? root : document
    const grid = scope.querySelector('.more-grid.command-menu-grid')
    if (!grid || grid.querySelector('[data-lmf-bar-loader-open="more"]')) return

    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'more-card lmf-bar-loader-more-card'
    card.setAttribute('data-lmf-bar-loader-open', 'more')
    card.innerHTML = '<span aria-hidden="true">▥</span><div><strong>Bar Loader</strong><small>Plate math for any bar.</small></div><i>›</i>'
    card.addEventListener('click', () => openBarLoader({ source: 'more', exerciseName: '', target: null }))

    const settings = [...grid.querySelectorAll('.more-card')].find((item) => /settings/i.test(item.textContent || ''))
    if (settings) grid.insertBefore(card, settings)
    else grid.appendChild(card)
  }

  function plateProfile(settings, unit) {
    return unit === 'kg' ? settings.pairsKg : settings.pairsLb
  }

  function getPlatePresetKey(settings, unit) {
    const key = unit === 'kg' ? settings.platePresetKg : settings.platePresetLb
    return PLATE_PRESETS[unit]?.[key] ? key : 'custom'
  }

  function setPlatePresetKey(settings, unit, value) {
    if (unit === 'kg') settings.platePresetKg = value
    else settings.platePresetLb = value
  }

  function getBarWeight(settings, unit) {
    return unit === 'kg' ? Number(settings.barKg) || 20 : Number(settings.barLb) || 45
  }

  function getCollarWeight(settings, unit) {
    return unit === 'kg' ? Number(settings.collarsKg) || 0 : Number(settings.collarsLb) || 0
  }

  function solvePlates(targetTotal, barWeight, collarTotal, unit, pairs) {
    const denominations = UNIT_PLATES[unit]
    const scale = 100
    const targetPerSide = Math.max(0, (targetTotal - barWeight - collarTotal) / 2)
    const targetInt = Math.round(targetPerSide * scale)
    const maxDenom = Math.max(...denominations)
    const limit = Math.max(targetInt + Math.round(maxDenom * scale), Math.round(maxDenom * scale))

    let states = new Map([[0, { combo: {}, count: 0 }]])
    denominations.forEach((denom) => {
      const denomInt = Math.round(denom * scale)
      const maxPairs = Math.max(0, Math.min(12, Number.parseInt(pairs[String(denom)] ?? 0, 10) || 0))
      const next = new Map(states)
      states.forEach((state, weight) => {
        for (let count = 1; count <= maxPairs; count += 1) {
          const newWeight = weight + denomInt * count
          if (newWeight > limit) break
          const newCount = state.count + count
          const previous = next.get(newWeight)
          if (!previous || newCount < previous.count) {
            next.set(newWeight, {
              combo: { ...state.combo, [String(denom)]: count },
              count: newCount,
            })
          }
        }
      })
      states = next
    })

    let bestWeight = 0
    let bestState = states.get(0)
    states.forEach((state, weight) => {
      const bestDelta = Math.abs(bestWeight - targetInt)
      const delta = Math.abs(weight - targetInt)
      if (delta < bestDelta || (delta === bestDelta && state.count < bestState.count)) {
        bestWeight = weight
        bestState = state
      }
    })

    const platePerSide = bestWeight / scale
    const achievedTotal = barWeight + collarTotal + platePerSide * 2
    const deltaTotal = achievedTotal - targetTotal
    return {
      exact: Math.abs(deltaTotal) < 0.001,
      targetPerSide,
      platePerSide,
      achievedTotal,
      deltaTotal,
      combo: bestState?.combo || {},
    }
  }

  function plateList(combo, unit) {
    return UNIT_PLATES[unit].flatMap((denom) => Array.from({ length: Number(combo[String(denom)] || 0) }, () => denom))
  }

  function plateSizeClass(plate, unit) {
    const index = UNIT_PLATES[unit].indexOf(Number(plate))
    if (index <= 1) return 'xl'
    if (index <= 3) return 'lg'
    if (index <= 5) return 'md'
    return 'sm'
  }

  function plateChip(plate, unit) {
    return `<span class="lmf-plate-chip ${plateSizeClass(plate, unit)}" data-lmf-plate-value="${plate}" aria-label="${formatWeight(plate)} ${unit} plate">${formatWeight(plate)}</span>`
  }

  function visualPlateChips(combo, unit, side) {
    const all = plateList(combo, unit)
    if (!all.length) return '<span class="lmf-bar-empty">No plates</span>'

    const clipped = all.slice(0, 12)
    const ordered = side === 'left' ? clipped.slice().reverse() : clipped
    const chips = ordered.map((plate) => plateChip(plate, unit)).join('')
    if (all.length <= 12) return chips

    const extra = `<span class="lmf-plate-chip more">+${all.length - 12}</span>`
    return side === 'left' ? extra + chips : chips + extra
  }

  function renderInventory(settings, unit) {
    const pairs = plateProfile(settings, unit)
    return UNIT_PLATES[unit].map((plate) => `
      <label class="lmf-inventory-row">
        <span>${formatWeight(plate)} ${unit}</span>
        <span>pairs</span>
        <input class="lmf-bar-input lmf-pairs-input" type="number" min="0" max="12" step="1" inputmode="numeric" data-lmf-plate="${plate}" value="${Number.parseInt(pairs[String(plate)] ?? 0, 10) || 0}">
      </label>
    `).join('')
  }

  function barPresetMarkup(unit, currentBar) {
    const options = unit === 'kg'
      ? [{ weight: 20, label: '20 kg Men’s Bar' }, { weight: 15, label: '15 kg Women’s Bar' }]
      : [{ weight: 45, label: '45 lb Power Bar' }, { weight: 35, label: '35 lb Technique Bar' }]
    return `
      <span class="lmf-preset-label">QUICK BAR</span>
      ${options.map(({ weight, label }) => `<button type="button" class="${Number(currentBar) === weight ? 'active' : ''}" data-lmf-bar-preset="${weight}">${label}</button>`).join('')}
      <button type="button" data-lmf-bar-custom>Custom Bar</button>
    `
  }

  function platePresetMarkup(settings, unit) {
    const active = getPlatePresetKey(settings, unit)
    return `
      <span class="lmf-preset-label">PLATE SET</span>
      <button type="button" class="${active === 'iron' ? 'active' : ''}" data-lmf-plate-preset="iron">Iron Plates</button>
      <button type="button" class="${active === 'bumper' ? 'active' : ''}" data-lmf-plate-preset="bumper">Bumper Plates</button>
      <button type="button" class="${active === 'custom' ? 'active' : ''}" data-lmf-plate-preset="custom">Custom</button>
    `
  }

  function inventoryLabel(settings, unit) {
    if (settings[unit === 'kg' ? 'inventoryConfirmedKg' : 'inventoryConfirmedLb'] === false) return 'Pair counts needed'
    const key = getPlatePresetKey(settings, unit)
    return PLATE_PRESETS[unit]?.[key]?.label || 'Custom inventory'
  }

  function modalMarkup(settings, context) {
    const unit = context?.unit === 'kg' || context?.unit === 'lb'
      ? context.unit
      : settings.unit === 'kg' ? 'kg' : 'lb'
    const bar = getBarWeight(settings, unit)
    const collars = getCollarWeight(settings, unit)
    const target = Number(context?.target)
    const targetValue = Number.isFinite(target) && target > 0 ? formatWeight(target) : ''
    const contextLine = context?.exerciseName
      ? `<div class="lmf-bar-context"><span>FROM EXERCISE</span><strong>${escapeHtml(context.exerciseName)}</strong></div>`
      : '<div class="lmf-bar-context"><span>STANDALONE TOOL</span><strong>Build any target load</strong></div>'

    return `
      <div class="lmf-bar-modal-backdrop" data-lmf-bar-close="backdrop">
        <section class="lmf-bar-modal" role="dialog" aria-modal="true" aria-labelledby="lmf-bar-title">
          <header class="lmf-bar-modal-head">
            <div><span class="page-kicker">LETMEFLY UTILITY</span><h2 id="lmf-bar-title">BAR LOADER</h2></div>
            <button type="button" class="lmf-bar-close" data-lmf-bar-close="button" aria-label="Close Bar Loader">×</button>
          </header>
          ${contextLine}
          <div class="lmf-bar-controls">
            <label><span>Target total</span><div class="lmf-input-unit"><input class="lmf-bar-input" id="lmf-bar-target" type="number" min="0" step="0.5" inputmode="decimal" value="${targetValue}"><b>${unit}</b></div></label>
            <label><span>Unit</span><select class="lmf-bar-input" id="lmf-bar-unit"><option value="lb" ${unit === 'lb' ? 'selected' : ''}>lb</option><option value="kg" ${unit === 'kg' ? 'selected' : ''}>kg</option></select></label>
            <label><span>Bar weight</span><div class="lmf-input-unit"><input class="lmf-bar-input" id="lmf-bar-weight" type="number" min="0" step="0.5" inputmode="decimal" value="${formatWeight(bar)}"><b>${unit}</b></div></label>
            <label><span>Collars total</span><div class="lmf-input-unit"><input class="lmf-bar-input" id="lmf-bar-collars" type="number" min="0" step="0.5" inputmode="decimal" value="${formatWeight(collars)}"><b>${unit}</b></div></label>
          </div>
          <div class="lmf-bar-preset-stack">
            <div class="lmf-bar-presets" id="lmf-bar-presets">${barPresetMarkup(unit, bar)}</div>
            <div class="lmf-bar-presets lmf-plate-presets" id="lmf-plate-presets">${platePresetMarkup(settings, unit)}</div>
          </div>
          <div class="lmf-bar-result" id="lmf-bar-result"></div>
          <details class="lmf-bar-inventory">
            <summary>
              <div><span>AVAILABLE PLATES</span><small>Customize how many plate pairs you have</small></div>
              <strong id="lmf-inventory-label">${escapeHtml(inventoryLabel(settings, unit))}</strong>
            </summary>
            <div id="lmf-bar-inventory-grid">${renderInventory(settings, unit)}</div>
            <button type="button" class="btn" data-lmf-confirm-inventory>USE THESE PLATE COUNTS</button>
          </details>
          <div class="lmf-bar-foot"><span>Saved on this device</span><span>Programmed workout loads are never changed</span></div>
        </section>
      </div>
    `
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  function collectSettings(unitOverride = null) {
    const settings = storageRead()
    if (!modal) return settings
    const unit = unitOverride === 'kg' || unitOverride === 'lb'
      ? unitOverride
      : modal.querySelector('#lmf-bar-unit')?.value === 'kg' ? 'kg' : 'lb'
    const bar = Number.parseFloat(modal.querySelector('#lmf-bar-weight')?.value || '')
    const collars = Number.parseFloat(modal.querySelector('#lmf-bar-collars')?.value || '')
    const pairs = {}
    modal.querySelectorAll('.lmf-pairs-input[data-lmf-plate]').forEach((input) => {
      pairs[input.dataset.lmfPlate] = Math.max(0, Math.min(12, Number.parseInt(input.value || '0', 10) || 0))
    })
    settings.unit = unit
    if (unit === 'kg') {
      settings.barKg = Number.isFinite(bar) ? bar : 20
      settings.collarsKg = Number.isFinite(collars) ? collars : 0
      settings.pairsKg = { ...settings.pairsKg, ...pairs }
    } else {
      settings.barLb = Number.isFinite(bar) ? bar : 45
      settings.collarsLb = Number.isFinite(collars) ? collars : 0
      settings.pairsLb = { ...settings.pairsLb, ...pairs }
    }
    return settings
  }

  function setInventoryFromSettings(settings, unit) {
    if (!modal) return
    const inventory = modal.querySelector('#lmf-bar-inventory-grid')
    if (inventory) inventory.innerHTML = renderInventory(settings, unit)
    const label = modal.querySelector('#lmf-inventory-label')
    if (label) label.textContent = inventoryLabel(settings, unit)
    const presets = modal.querySelector('#lmf-plate-presets')
    if (presets) presets.innerHTML = platePresetMarkup(settings, unit)
  }

  function applyPlatePreset(key) {
    if (!modal) return
    const unit = modal.querySelector('#lmf-bar-unit')?.value === 'kg' ? 'kg' : 'lb'
    const settings = collectSettings()

    if (key === 'custom') {
      setPlatePresetKey(settings, unit, 'custom')
    } else {
      const preset = PLATE_PRESETS[unit]?.[key]
      if (!preset) return
      if (unit === 'kg') settings.pairsKg = { ...preset.pairs }
      else settings.pairsLb = { ...preset.pairs }
      setPlatePresetKey(settings, unit, key)
      settings[unit === 'kg' ? 'inventoryConfirmedKg' : 'inventoryConfirmedLb'] = true
    }

    storageWrite(settings)
    setInventoryFromSettings(settings, unit)
    renderResult()
  }

  function renderResult() {
    if (!modal) return
    const unit = modal.querySelector('#lmf-bar-unit')?.value === 'kg' ? 'kg' : 'lb'
    const target = Number.parseFloat(modal.querySelector('#lmf-bar-target')?.value || '')
    const bar = Number.parseFloat(modal.querySelector('#lmf-bar-weight')?.value || '')
    const collars = Number.parseFloat(modal.querySelector('#lmf-bar-collars')?.value || '')
    const pairs = {}
    modal.querySelectorAll('.lmf-pairs-input[data-lmf-plate]').forEach((input) => {
      pairs[input.dataset.lmfPlate] = Math.max(0, Math.min(12, Number.parseInt(input.value || '0', 10) || 0))
    })

    const result = modal.querySelector('#lmf-bar-result')
    if (!result) return
    if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(bar) || bar <= 0) {
      result.innerHTML = '<div class="lmf-bar-result-empty">Enter a target load to calculate the bar.</div>'
      return
    }
    const collarTotal = Number.isFinite(collars) ? collars : 0
    const currentSettings = storageRead()
    if (currentSettings[unit === 'kg' ? 'inventoryConfirmedKg' : 'inventoryConfirmedLb'] === false) {
      const known = currentSettings[unit === 'kg' ? 'knownPlatesKg' : 'knownPlatesLb'] || []
      result.innerHTML = `<div class="lmf-bar-result-empty warning"><strong>${formatWeight(target)} ${unit} target · ${formatWeight(bar)} ${unit} bar</strong><p>Saved plate sizes: ${known.map(formatWeight).join(', ')} ${unit}. Confirm how many pairs you have under Available Plates before calculating.</p></div>`
      delete result.dataset.lmfCopyText
      return
    }
    if (target < bar + collarTotal) {
      result.innerHTML = '<div class="lmf-bar-result-empty warning">Target is lighter than the selected bar + collars.</div>'
      return
    }

    const solution = solvePlates(target, bar, collarTotal, unit, pairs)
    const plates = plateList(solution.combo, unit)
    const perSide = plates.length ? plates.map(formatWeight).join(' + ') : 'No plates'
    const status = solution.exact
      ? '<span class="lmf-load-status exact">EXACT</span>'
      : '<span class="lmf-load-status near">CLOSEST POSSIBLE</span>'
    const achieved = solution.exact
      ? ''
      : `<div class="lmf-achieved-load"><span>ACHIEVED</span><strong>${formatWeight(solution.achievedTotal)} ${unit}</strong><small>${solution.deltaTotal > 0 ? '+' : ''}${formatWeight(solution.deltaTotal)} ${unit} from target</small></div>`
    const leftChips = visualPlateChips(solution.combo, unit, 'left')
    const rightChips = visualPlateChips(solution.combo, unit, 'right')
    const collarPerSide = collarTotal > 0 ? collarTotal / 2 : 0
    const collarLeft = collarPerSide > 0 ? `<span class="lmf-outer-collar" title="${formatWeight(collarPerSide)} ${unit} collar per side" aria-label="Collar"></span>` : ''
    const collarRight = collarLeft
    const settings = collectSettings()
    const inventory = inventoryLabel(settings, unit)
    const copyText = solution.exact
      ? `${formatWeight(target)} ${unit} = ${formatWeight(bar)} ${unit} bar, each side: ${perSide}`
      : `${formatWeight(target)} ${unit} target → ${formatWeight(solution.achievedTotal)} ${unit} closest load = ${formatWeight(bar)} ${unit} bar, each side: ${perSide}`

    result.dataset.lmfCopyText = copyText
    result.innerHTML = `
      <div class="lmf-bar-result-top">
        <div class="lmf-target-load"><span>TARGET</span><strong>${formatWeight(target)} <small>${unit}</small></strong></div>
        ${status}
      </div>
      ${achieved}
      <div class="lmf-bar-per-side">
        <div><span>EACH SIDE</span><strong>${perSide}</strong></div>
        <button type="button" class="lmf-copy-load" data-lmf-copy-load aria-label="Copy bar loading result">COPY LOAD</button>
      </div>
      <div class="lmf-bar-visual" aria-label="Bar loading diagram. Largest plates are closest to the bar on both sides.">
        <div class="lmf-bar-side left">
          ${collarLeft}
          <div class="lmf-plate-stack left">${leftChips}</div>
          <span class="lmf-bar-sleeve" aria-hidden="true"></span>
        </div>
        <div class="lmf-bar-shaft"><span>${formatWeight(bar)} ${unit} BAR</span></div>
        <div class="lmf-bar-side right">
          <span class="lmf-bar-sleeve" aria-hidden="true"></span>
          <div class="lmf-plate-stack right">${rightChips}</div>
          ${collarRight}
        </div>
      </div>
      <div class="lmf-bar-result-meta">
        <span>${formatWeight(bar)} ${unit} bar</span>
        <span>${collarTotal > 0 ? `${formatWeight(collarTotal)} ${unit} collars total` : 'No collar weight'}</span>
        <span>${escapeHtml(inventory)}</span>
      </div>
    `
  }

  async function copyLoadResult(button) {
    const result = modal?.querySelector('#lmf-bar-result')
    const value = result?.dataset.lmfCopyText || ''
    if (!value || !button) return

    let copied = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        copied = true
      }
    } catch (_) {
      copied = false
    }

    if (!copied) {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try { copied = document.execCommand('copy') } catch (_) { copied = false }
      textarea.remove()
    }

    if (!copied) return
    window.clearTimeout(copyResetTimer)
    button.classList.add('copied')
    button.textContent = 'COPIED ✓'
    copyResetTimer = window.setTimeout(() => {
      if (!button.isConnected) return
      button.classList.remove('copied')
      button.textContent = 'COPY LOAD'
    }, 1400)
  }

  function rebuildForUnit(unit) {
    if (!modal) return
    const previousUnit = modal.dataset.lmfUnit === 'kg' ? 'kg' : 'lb'
    const settings = collectSettings(previousUnit)
    settings.unit = unit
    storageWrite(settings)
    modal.dataset.lmfUnit = unit
    setInventoryFromSettings(settings, unit)
    const presets = modal.querySelector('#lmf-bar-presets')
    if (presets) presets.innerHTML = barPresetMarkup(unit, getBarWeight(settings, unit))
    const barInput = modal.querySelector('#lmf-bar-weight')
    const collarInput = modal.querySelector('#lmf-bar-collars')
    if (barInput) barInput.value = formatWeight(getBarWeight(settings, unit))
    if (collarInput) collarInput.value = formatWeight(getCollarWeight(settings, unit))
    modal.querySelectorAll('.lmf-input-unit b').forEach((node) => { node.textContent = unit })
    renderResult()
  }

  function refreshBarPresetButtons() {
    if (!modal) return
    const unit = modal.querySelector('#lmf-bar-unit')?.value === 'kg' ? 'kg' : 'lb'
    const bar = Number.parseFloat(modal.querySelector('#lmf-bar-weight')?.value || '')
    const presets = modal.querySelector('#lmf-bar-presets')
    if (presets) presets.innerHTML = barPresetMarkup(unit, bar)
  }

  function bindModal() {
    if (!modal) return
    modal.querySelector('[data-lmf-bar-close="button"]')?.focus()

    modal.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.matches('[data-lmf-bar-close="backdrop"]') || target.closest('[data-lmf-bar-close="button"]')) {
        closeBarLoader()
        return
      }
      const preset = target.closest('[data-lmf-bar-preset]')
      if (preset) {
        const input = modal.querySelector('#lmf-bar-weight')
        if (input) {
          input.value = preset.dataset.lmfBarPreset
          input.dispatchEvent(new Event('input', { bubbles: true }))
          refreshBarPresetButtons()
        }
        return
      }
      const platePreset = target.closest('[data-lmf-plate-preset]')
      if (platePreset) {
        applyPlatePreset(platePreset.dataset.lmfPlatePreset || 'custom')
        return
      }
      if (target.closest('[data-lmf-bar-custom]')) {
        modal.querySelector('#lmf-bar-weight')?.focus()
        return
      }
      const copy = target.closest('[data-lmf-copy-load]')
      if (copy) copyLoadResult(copy)
    })

    modal.addEventListener('input', (event) => {
      if (!(event.target instanceof Element)) return
      if (event.target.matches('#lmf-bar-unit')) return
      const settings = collectSettings()
      const unit = modal.querySelector('#lmf-bar-unit')?.value === 'kg' ? 'kg' : 'lb'
      if (event.target.matches('.lmf-pairs-input')) {
        setPlatePresetKey(settings, unit, 'custom')
        const label = modal.querySelector('#lmf-inventory-label')
        if (label) label.textContent = inventoryLabel(settings, unit)
        const platePresets = modal.querySelector('#lmf-plate-presets')
        if (platePresets) platePresets.innerHTML = platePresetMarkup(settings, unit)
      }
      storageWrite(settings)
      if (event.target.matches('#lmf-bar-weight')) refreshBarPresetButtons()
      renderResult()
    })

    modal.querySelector('[data-lmf-confirm-inventory]')?.addEventListener('click', () => {
      const settings = collectSettings()
      const unit = modal.querySelector('#lmf-bar-unit')?.value === 'kg' ? 'kg' : 'lb'
      settings[unit === 'kg' ? 'inventoryConfirmedKg' : 'inventoryConfirmedLb'] = true
      storageWrite(settings)
      setInventoryFromSettings(settings, unit)
      renderResult()
      window.dispatchEvent(new Event('lmf:barbell-inventory-saved'))
    })

    modal.querySelector('#lmf-bar-unit')?.addEventListener('change', (event) => {
      rebuildForUnit(event.target.value === 'kg' ? 'kg' : 'lb')
    })
  }

  function openBarLoader(context = {}) {
    closeBarLoader()
    currentContext = context
    const settings = storageRead()
    modal = document.createElement('div')
    modal.className = 'lmf-bar-loader-root'
    const openingUnit = context?.unit === 'kg' || context?.unit === 'lb' ? context.unit : settings.unit
    modal.dataset.lmfUnit = openingUnit === 'kg' ? 'kg' : 'lb'
    modal.innerHTML = modalMarkup(settings, context)
    document.body.appendChild(modal)
    document.documentElement.classList.add('lmf-bar-loader-open')
    bindModal()
    renderResult()
  }

  function closeBarLoader(persist = true) {
    if (!modal) return
    if (persist) storageWrite(collectSettings())
    modal.remove()
    modal = null
    currentContext = null
    document.documentElement.classList.remove('lmf-bar-loader-open')
  }

  function enhanceAll(root = document) {
    markSmartNames(root)
    ensureExerciseButtons(root)
    ensureMoreCard(root)
  }

  function scheduleRefresh(delay = 0) {
    window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => enhanceAll(document), delay)
  }

  function start() {
    enhanceAll(document)
    window.addEventListener('lmf:barbell-settings-changed', () => {
      // Closing stale athlete context cannot save its draft over the new one.
      closeBarLoader(false)
      scheduleRefresh(0)
    })
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) scheduleRefresh(0)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    window.addEventListener('hashchange', () => scheduleRefresh(0))
    window.addEventListener('resize', () => scheduleRefresh(120))
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal) closeBarLoader()
    })
    window.setTimeout(() => enhanceAll(document), 350)
    window.setTimeout(() => enhanceAll(document), 1200)
  }

  window.LetMeFlyBarLoader = {
    open: (options) => openBarLoader(options || {}),
    shortName: smartShortName,
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
