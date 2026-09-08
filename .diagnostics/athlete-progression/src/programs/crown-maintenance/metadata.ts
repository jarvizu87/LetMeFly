import type { PublicProgramDefinition } from '../../program-engine/types'

export const CROWN_MAINTENANCE_METADATA = {
  key: 'crown-maintenance',
  name: 'Crown Maintenance — Entry Bridge',
  version: 'v2.1',
  sourceEngine: 'v1.7.20',
  description: 'Mandatory 3-week post-test consolidation, strength-retention, and Black Crown activation bridge.',
  weeks: 3,
  trainingDaysPerWeek: 5,
  status: 'active-source',
} satisfies Omit<PublicProgramDefinition, 'sourceNotes' | 'weekData'>
