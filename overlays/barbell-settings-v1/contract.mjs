const object = value => value && typeof value === 'object' && !Array.isArray(value)
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0
export function resolveBarbellSettings(defaults, saved, preference) {
  const override = object(saved) ? saved : {}
  const result = { ...defaults, ...override, pairsLb: { ...defaults.pairsLb, ...override.pairsLb }, pairsKg: { ...defaults.pairsKg, ...override.pairsKg } }
  const barbell = preference?.preferences?.barbell
  if (!object(barbell)) return result
  const unit = barbell.unit === 'lb' || barbell.unit === 'kg' ? barbell.unit : preference.weight_unit
  if (unit !== 'lb' && unit !== 'kg') return result
  const suffix = unit === 'kg' ? 'Kg' : 'Lb', barKey = `bar${suffix}`, pairsKey = `pairs${suffix}`, confirmedKey = `inventoryConfirmed${suffix}`
  if (!Object.hasOwn(override, 'unit')) result.unit = unit
  if (!Object.hasOwn(override, barKey) && positive(barbell.barWeight)) result[barKey] = barbell.barWeight
  if (!Array.isArray(barbell.plates)) return result
  const plates = [...new Set(barbell.plates.filter(positive))]
  if (!plates.length) return result
  result[pairsKey] = Object.fromEntries(Object.keys(defaults[pairsKey]).map(plate => [plate, 0]))
  result[`knownPlates${suffix}`] = plates.filter(plate => Object.hasOwn(result[pairsKey], String(plate)))
  result[`platePreset${suffix}`] = 'custom'
  const hasCountFlag = typeof override[confirmedKey] === 'boolean'
  const hasChangedLegacyCounts = object(override[pairsKey]) && Object.keys(defaults[pairsKey]).some(plate => Object.hasOwn(override[pairsKey], plate) && override[pairsKey][plate] !== defaults[pairsKey][plate])
  if (object(override[pairsKey]) && (hasCountFlag || hasChangedLegacyCounts)) {
    // Old utility versions saved their full defaults even on an untouched
    // close. Only the explicit confirmation flag proves approved quantities.
    // Retain older changed quantities as a draft for the user to confirm.
    for (const plate of Object.keys(result[pairsKey])) if (Object.hasOwn(override[pairsKey], plate)) result[pairsKey][plate] = override[pairsKey][plate]
    result[confirmedKey] = override[confirmedKey] === true
    result[`platePreset${suffix}`] = override[`platePreset${suffix}`] ?? 'custom'
    return result
  }
  // A list of denominations provides no evidence about the number of pairs.
  // An explicit saved pairs object may supply them; otherwise ask once in UI.
  const counts = object(barbell.pairs) ? barbell.pairs : null
  result[confirmedKey] = Boolean(counts && plates.every(plate => Number.isInteger(counts[String(plate)]) && counts[String(plate)] >= 0 && counts[String(plate)] <= 12))
  if (result[confirmedKey]) for (const plate of result[`knownPlates${suffix}`]) result[pairsKey][String(plate)] = counts[String(plate)]
  return result
}
