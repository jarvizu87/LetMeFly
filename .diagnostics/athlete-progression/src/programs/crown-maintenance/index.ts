import type { PublicProgramDefinition } from '../../program-engine/types'
import { CROWN_MAINTENANCE_METADATA } from './metadata'
import { CROWN_MAINTENANCE_SOURCE_NOTES } from './rules'
import { CROWN_MAINTENANCE_WEEKS } from './weeks'

export const CROWN_MAINTENANCE: PublicProgramDefinition = {
  ...CROWN_MAINTENANCE_METADATA,
  sourceNotes: [...CROWN_MAINTENANCE_SOURCE_NOTES],
  weekData: CROWN_MAINTENANCE_WEEKS,
}

export * from './weeks'
export { CROWN_MAINTENANCE_METADATA } from './metadata'
export { CROWN_MAINTENANCE_SOURCE_NOTES } from './rules'
