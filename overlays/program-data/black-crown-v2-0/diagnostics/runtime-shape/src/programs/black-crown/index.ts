import type { PublicProgramDefinition } from '../../program-engine/types'
import { BLACK_CROWN_METADATA } from './metadata'
import { BLACK_CROWN_SOURCE_NOTES } from './rules'

export const BLACK_CROWN: PublicProgramDefinition = {
  ...BLACK_CROWN_METADATA,
  sourceNotes: [...BLACK_CROWN_SOURCE_NOTES],
  weekData: [],
}

export { BLACK_CROWN_METADATA, BLACK_CROWN_PHASES } from './metadata'
export { BLACK_CROWN_SOURCE_NOTES } from './rules'
