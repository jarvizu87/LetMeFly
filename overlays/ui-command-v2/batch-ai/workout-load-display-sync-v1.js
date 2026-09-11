(() => {
  'use strict'

  // LetMeFly Workout Load Display Sync v1
  // Presentation only. Reads the live set load and Bar Loader preferences to keep
  // the inline plate helper accurate. Never writes workout/program prescription data.

  const STORAGE_KEY = 'letmefly-bar-loader-v1'
  const UNIT_PLATES = {
    lb: [55, 45, 35, 25, 10, 5, 2.5, 1.25],
    kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  }
  const DEFAULTS = {
    unit: 'lb',
    barLb: 45,
    barKg: 20,
    collarsLb: 0,
    collarsKg: 0,
    pairsLb: { '55': 2, '45': 6, '35': 2, '25': 4, '10': 4, '5': 4, '2.5': 4, '1.25': 2 },
    pairsKg: { '25': 2, '20': 6, '15': 2, '10': 4, '5': 4, '2.5': 4, '1.25': 4, '0.5': 2 },
  }

  let refreshTimer = null

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
  }

  function formatWeight(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return '—'
    return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100)
  }

  function writeText(node, value) {
    if (!node) return
    const next = String(value)
    if (node.textContent !== next) node.textContent = next
  }

  function settingsRead() {
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
      return {
        ...DEFAULTS,
        pairsLb: { ...DEFAULTS.pairsLb },
        pairsKg: { ...DEFAULTS.pairsKg },
      }
    }
  }

  function isBarbellExercise(name) {
    const value = clean(name).toLowerCase()
    if (!value) return false
    if (/\b(db|dumbbell|kb|kettlebell|cable|machine|sled|bodyweight|band|plate)\b/.test(value)) return false
    if (/\bbarbell\b/.test(value)) return true
    return /\b(front squat|back squat|squat|bench press|deadlift|rdl|romanian deadlift|overhead press|ohp|push press|strict press|good morning|hip thrust|rack pull|clean|snatch|high pull|jerk|bar row|bent[- ]over row)\b/.test(value)
  }

  function unitForRow(row, settings) {
    const helper = clean(row.querySelector('.load-field small')?.textContent).toLowerCase()
    if (/\bkg\b/.test(helper)) return 'kg'
    if (/\blb\b/.test(helper)) return 'lb'
    return settings.unit === 'kg' ? 'kg' : 'lb'
  }

  function barWeight(settings, unit) {
    return unit === 'kg' ? Number(settings.barKg) || 20 : Number(settings.barLb) || 45
  }

  function collarWeight(settings, unit) {
    return unit === 'kg' ? Number(settings.collarsKg) || 0 : Number(settings.collarsLb) || 0
  }

  function platePairs(settings, unit) {
    return unit === 'kg' ? settings.pairsKg : settings.pairsLb
  }

  function solvePlates(targetTotal, selectedBar, collarTotal, unit, pairs) {
    const denominations = UNIT_PLATES[unit]
    const scale = 100
    const targetPerSide = Math.max(0, (targetTotal - selectedBar - collarTotal) / 2)
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
    const achievedTotal = selectedBar + collarTotal + platePerSide * 2
    return {
      exact: Math.abs(achievedTotal - targetTotal) < 0.001,
      achievedTotal,
      combo: bestState?.combo || {},
    }
  }

  function plateList(combo, unit) {
    return UNIT_PLATES[unit].flatMap((denom) =>
      Array.from({ length: Number(combo[String(denom)] || 0) }, () => denom)
    )
  }

  function storeOriginal(line, strong) {
    if (line.dataset.lmfOriginalPlateHelper != null) return
    line.dataset.lmfOriginalPlateHelper = clean(strong.textContent)
  }

  function restoreOriginal(line, strong) {
    const original = clean(line.dataset.lmfOriginalPlateHelper)
    writeText(strong, original || 'Load / bodyweight as prescribed')
    line.classList.toggle('is-empty', !original)
    line.removeAttribute('data-lmf-live-load')
    line.removeAttribute('data-lmf-load-exact')
  }

  function syncRow(row, card, settings) {
    const line = row.querySelector(':scope > .lmf-plates-line')
    const strong = line?.querySelector('strong')
    const loadInput = row.querySelector('.load-input')
    if (!line || !strong || !loadInput) return

    storeOriginal(line, strong)

    const name = clean(card.querySelector('.exercise-title h3')?.textContent)
    if (!isBarbellExercise(name)) {
      restoreOriginal(line, strong)
      return
    }

    const target = Number.parseFloat(loadInput.value || '')
    if (!Number.isFinite(target) || target <= 0) {
      restoreOriginal(line, strong)
      return
    }

    const unit = unitForRow(row, settings)
    const selectedBar = barWeight(settings, unit)
    const collars = collarWeight(settings, unit)
    const minimum = selectedBar + collars

    line.classList.remove('is-empty')
    line.dataset.lmfLiveLoad = formatWeight(target)
    if (settings[unit === 'kg' ? 'inventoryConfirmedKg' : 'inventoryConfirmedLb'] === false) {
      writeText(strong, `${formatWeight(selectedBar)} ${unit} bar • confirm plate counts in Bar Loader`)
      line.dataset.lmfLoadExact = 'false'
      return
    }

    if (target < minimum) {
      writeText(strong, `${formatWeight(selectedBar)} ${unit} bar • target below bar${collars > 0 ? ' + collars' : ''}`)
      line.dataset.lmfLoadExact = 'false'
      return
    }

    const solution = solvePlates(target, selectedBar, collars, unit, platePairs(settings, unit))
    const plates = plateList(solution.combo, unit)
    const eachSide = plates.length ? plates.map(formatWeight).join(' + ') : 'none'

    if (solution.exact) {
      writeText(strong, `${formatWeight(selectedBar)} ${unit} bar • per side: ${eachSide}`)
      line.dataset.lmfLoadExact = 'true'
    } else {
      writeText(strong, `${formatWeight(selectedBar)} ${unit} bar • closest ${formatWeight(solution.achievedTotal)} ${unit} • per side: ${eachSide}`)
      line.dataset.lmfLoadExact = 'false'
    }
  }

  function syncAll(root = document) {
    const scope = root instanceof Element ? root : document
    const settings = settingsRead()
    scope.querySelectorAll('.active-exercise').forEach((card) => {
      card.querySelectorAll('.set-row[data-set-id]').forEach((row) => syncRow(row, card, settings))
    })
  }

  function scheduleSync(delay = 0) {
    if (refreshTimer !== null) return
    refreshTimer = window.setTimeout(() => { refreshTimer = null; syncAll(document) }, delay)
  }

  function start() {
    syncAll(document)
    window.addEventListener('lmf:barbell-settings-changed', () => scheduleSync(0))
    window.addEventListener('lmf:barbell-inventory-saved', () => scheduleSync(0))

    document.addEventListener('input', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.matches('.load-input')) {
        const row = target.closest('.set-row[data-set-id]')
        const card = target.closest('.active-exercise')
        if (row && card) syncRow(row, card, settingsRead())
        return
      }

      // If the user changes Bar Loader bar/collar/inventory preferences, refresh
      // the workout helper too so both surfaces stay in agreement.
      if (target.closest('.lmf-bar-loader-root')) scheduleSync(0)
    })

    document.addEventListener('change', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.matches('.load-input') || target.closest('.lmf-bar-loader-root')) scheduleSync(0)
    })

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) scheduleSync(0)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    window.addEventListener('hashchange', () => scheduleSync(0))
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) scheduleSync(0)
    })
    window.setTimeout(() => syncAll(document), 350)
    window.setTimeout(() => syncAll(document), 1200)
  }

  window.LetMeFlyWorkoutLoadDisplay = {
    refresh: () => syncAll(document),
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
