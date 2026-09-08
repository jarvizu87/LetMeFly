import type { PublicProgramDefinition } from '../../program-engine/types'

export const BLACK_CROWN_METADATA = {
  key: 'black-crown',
  name: 'Black Crown Revised',
  version: 'v2.0',
  description: '54-week strength / powerbuilding / realization system with governed TM calibration and readiness rules.',
  weeks: 54,
  trainingDaysPerWeek: 5,
  status: 'catalog-only',
} satisfies Omit<PublicProgramDefinition, 'sourceNotes' | 'weekData'>

export const BLACK_CROWN_PHASES = [
  { key: 'foundation', startWeek: 1, endWeek: 12 },
  { key: 'volume', startWeek: 13, endWeek: 24 },
  { key: 'intensification', startWeek: 25, endWeek: 36 },
  { key: 'realization', startWeek: 37, endWeek: 54 },
] as const
