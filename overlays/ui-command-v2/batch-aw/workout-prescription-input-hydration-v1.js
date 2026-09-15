(() => {
  'use strict'

  // LetMeFly Workout Prescription Input Hydration v1
  // Presentation/runtime ergonomics only. This layer seeds unfinished blank logging
  // controls from the immutable governed prescription already rendered on the card.
  // It never writes program definitions, history, training maxes, or private athlete data.

  let refreshTimer = 0

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
  const numberText = value => {
    const match = clean(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/)
    if (!match) return ''
    const number = Number(match[0])
    if (!Number.isFinite(number)) return ''
    return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10)
  }
  const isDone = row => Boolean(row?.querySelector('.set-check')?.classList.contains('done'))
  const isBlank = input => input instanceof HTMLInputElement && !clean(input.value)
  const isUserEdited = input => input instanceof HTMLInputElement && input.dataset.lmfUserEdited === 'true'
  const normalizeUnit = unit => /^kg/i.test(clean(unit)) ? 'kg' : /^lb/i.test(clean(unit)) ? 'lb' : ''
  const convertWeight = (value, from, to) => {
    if (!Number.isFinite(value) || !from || !to || from === to) return value
    const converted = from === 'lb' ? value * 0.45359237 : value / 0.45359237
    return Math.round(converted * 10) / 10
  }
  const displayNumber = value => Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)

  function prescriptionText(row) {
    return clean(
      row?.querySelector('.lmf-prescription-cell strong')?.textContent ||
      row?.querySelector('.set-target-cell strong')?.textContent ||
      ''
    )
  }

  function prescriptionSegments(row) {
    return prescriptionText(row).split(/\s*•\s*/).map(clean).filter(Boolean)
  }

  function primaryMetricSeed(row) {
    const kind = clean(row?.dataset?.prescriptionKind || 'reps').toLowerCase()
    const segments = prescriptionSegments(row)

    if (kind === 'distance') {
      const unit = clean(row?.dataset?.metricUnit).toLowerCase()
      const unitPattern = unit === 'yd' ? /\b(?:yd|yard|yards)\b/i : unit === 'ft' ? /\b(?:ft|feet)\b/i : /(?:^|\s)\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?\s*m(?:\b|\/)/i
      const segment = segments.find(value => unitPattern.test(value)) || segments.find(value => /\d/.test(value)) || ''
      return numberText(segment)
    }

    if (kind === 'duration') {
      const segment = segments.find(value => /\b(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)\b/i.test(value)) || ''
      return numberText(segment)
    }

    const segment = segments.find(value => {
      if (!/\d/.test(value)) return false
      if (/\bsets?\b/i.test(value)) return false
      if (/\bRPE\b/i.test(value)) return false
      if (/\b(?:kg|kgs|lb|lbs)\b/i.test(value)) return false
      if (/%/.test(value)) return false
      if (/\b(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)\b/i.test(value)) return false
      if (/^\d+(?:\.\d+)?\s*m(?:\b|\/)/i.test(value)) return false
      return true
    }) || ''
    return numberText(segment)
  }

  function weightTokens(value) {
    const tokens = []
    const regex = /(\d+(?:\.\d+)?)\s*(kg|kgs|lb|lbs)\b/ig
    let match
    while ((match = regex.exec(clean(value)))) {
      const number = Number(match[1])
      const unit = normalizeUnit(match[2])
      if (Number.isFinite(number) && unit) tokens.push({ value: number, unit })
    }
    return tokens
  }

  function previousSamePrescriptionActual(row, preferredUnit) {
    const card = row?.closest?.('.active-exercise')
    if (!(card instanceof Element)) return null
    const rows = [...card.querySelectorAll('.set-row[data-set-id]')]
    const targetIndex = rows.indexOf(row)
    if (targetIndex <= 0) return null
    const targetSignature = clean(row.dataset.programmedLoad)

    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const previous = rows[index]
      if (!isDone(previous)) continue
      const previousInput = previous.querySelector('.load-input')
      const raw = clean(previousInput?.value)
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) continue

      const previousSignature = clean(previous.dataset.programmedLoad)
      // Match the already-governed Workout Logging carry rule exactly:
      // any intentional prescription-signature change blocks carry-forward.
      if ((targetSignature || previousSignature) && targetSignature !== previousSignature) return null

      const fromUnit = normalizeUnit(previous.dataset.loadUnit) || preferredUnit
      return {
        value: convertWeight(value, fromUnit, preferredUnit),
        unit: preferredUnit,
        source: 'previous-actual',
      }
    }
    return null
  }

  function loadSeed(row) {
    const preferredUnit = normalizeUnit(row?.dataset?.loadUnit) || 'lb'
    const signature = clean(row?.dataset?.programmedLoad)
    const defaultRaw = clean(row?.dataset?.programmedLoadDefault)
    const prescription = prescriptionText(row)

    if (/\b(?:body\s*weight|bodyweight|BW)\b/i.test(`${signature} ${prescription}`) && !weightTokens(`${signature} ${prescription}`).length) {
      return null
    }

    // A completed prior actual on the same unchanged prescription outranks the
    // untouched program default. This preserves existing load-carry semantics
    // across rerenders while still letting a changed prescription win.
    const carried = previousSamePrescriptionActual(row, preferredUnit)
    if (carried) return carried

    const signatureNumeric = signature.match(/^\s*(\d+(?:\.\d+)?):\s*(lb|kg)\s*$/i)
    if (signatureNumeric) {
      const value = Number(signatureNumeric[1])
      const from = normalizeUnit(signatureNumeric[2])
      return { value: convertWeight(value, from, preferredUnit), unit: preferredUnit, source: 'program' }
    }

    const tokens = weightTokens(`${signature} ${prescription}`)
    if (tokens.length) {
      const exact = tokens.find(token => token.unit === preferredUnit)
      const chosen = exact || tokens[0]
      return { value: convertWeight(chosen.value, chosen.unit, preferredUnit), unit: preferredUnit, source: 'program' }
    }

    const defaultValue = Number(defaultRaw)
    if (Number.isFinite(defaultValue) && defaultValue > 0) {
      return { value: defaultValue, unit: preferredUnit, source: 'program' }
    }

    return null
  }

  function rpeSeed(row) {
    const match = prescriptionText(row).match(/\bRPE\s*(\d+(?:\.\d+)?)/i)
    return match ? numberText(match[1]) : ''
  }

  function applySeed(input, value, kind) {
    if (!(input instanceof HTMLInputElement) || !value || !isBlank(input) || isUserEdited(input)) return false
    // Do not emit synthetic input/change events here. The native app treats those
    // as athlete edits and may re-render from the still-empty saved actual before
    // the athlete has logged the set, erasing the display default. The native set
    // button remains the authoritative persistence boundary and reads this value.
    input.value = String(value)
    input.dataset.lmfPrescriptionSeed = kind
    return true
  }

  function hydrateRow(row) {
    if (!(row instanceof Element) || !row.matches('.set-row[data-set-id]') || isDone(row)) return false

    let changed = false
    const kind = clean(row.dataset.prescriptionKind || 'reps').toLowerCase()
    const primary = kind === 'reps' ? row.querySelector('.reps-input') : row.querySelector('.metric-input')
    changed = applySeed(primary, primaryMetricSeed(row), kind) || changed

    const load = loadSeed(row)
    if (load?.value > 0) {
      if (row.dataset.loadUnit !== load.unit) row.dataset.loadUnit = load.unit
      changed = applySeed(row.querySelector('.load-input'), displayNumber(load.value), load.source === 'previous-actual' ? 'carried-load' : 'load') || changed
    }

    changed = applySeed(row.querySelector('.rpe-input'), rpeSeed(row), 'rpe') || changed
    if (changed) {
      row.dataset.lmfPrescriptionHydrated = 'true'
      window.setTimeout(() => window.LetMeFlyWorkoutLoadDisplay?.refresh?.(), 0)
    }
    return changed
  }

  function hydrateAll(root = document) {
    const scope = root instanceof Element || root instanceof Document ? root : document
    let changed = 0
    scope.querySelectorAll('.set-row[data-set-id]').forEach(row => {
      if (hydrateRow(row)) changed += 1
    })
    return changed
  }

  function schedule(delay = 0) {
    if (refreshTimer) window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(() => {
      refreshTimer = 0
      hydrateAll(document)
    }, delay)
  }

  function start() {
    hydrateAll(document)

    document.addEventListener('input', event => {
      const input = event.target instanceof HTMLInputElement ? event.target : null
      if (!input?.matches('.set-input')) return
      if (event.isTrusted) input.dataset.lmfUserEdited = 'true'
    }, true)

    new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.addedNodes.length || mutation.type === 'attributes')) schedule(20)
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-prescription-kind', 'data-programmed-load', 'data-programmed-load-default', 'data-load-unit'],
    })

    window.addEventListener('hashchange', () => schedule(20))
    window.setTimeout(() => hydrateAll(document), 250)
    window.setTimeout(() => hydrateAll(document), 900)
    window.setTimeout(() => hydrateAll(document), 1800)

    window.__LMF_WORKOUT_PRESCRIPTION_INPUT_HYDRATION_V1__ = Object.freeze({
      version: 1,
      hydrateAll: () => hydrateAll(document),
      hydrateRow,
      primaryMetricSeed,
      loadSeed,
      rpeSeed,
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
