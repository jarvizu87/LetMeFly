export interface PlateLoad {
  total: number
  bar: number
  perSide: number[]
  remainderPerSide: number
}

export function calculatePlates(total: number, bar = 45, plates = [45, 25, 10, 5, 2.5]): PlateLoad | null {
  if (!Number.isFinite(total) || total < bar) return null
  let remaining = (total - bar) / 2
  const perSide: number[] = []
  for (const plate of [...plates].sort((a, b) => b - a)) {
    while (remaining + 1e-9 >= plate) {
      perSide.push(plate)
      remaining = Math.round((remaining - plate) * 100) / 100
    }
  }
  return { total, bar, perSide, remainderPerSide: remaining }
}

export function formatPlates(load: PlateLoad | null): string {
  if (!load) return ''
  const plates = load.perSide.length ? load.perSide.join(' + ') : 'no plates'
  const remainder = load.remainderPerSide > 0 ? ` (+${load.remainderPerSide} lb/side unavailable)` : ''
  return `${load.bar} lb bar • per side: ${plates}${remainder}`
}
