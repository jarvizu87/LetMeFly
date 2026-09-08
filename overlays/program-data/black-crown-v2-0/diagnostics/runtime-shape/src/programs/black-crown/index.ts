import type { PublicProgramDefinition } from '../../program-engine/types'
import { BLACK_CROWN_METADATA } from './metadata'
import { BLACK_CROWN_SOURCE_NOTES } from './rules'
import { BLACK_CROWN_WEEKS } from './weeks'

export const BLACK_CROWN: PublicProgramDefinition = {
  ...BLACK_CROWN_METADATA,
  sourceNotes: [...BLACK_CROWN_SOURCE_NOTES],
  weekData: BLACK_CROWN_WEEKS,
}

export { BLACK_CROWN_METADATA, BLACK_CROWN_BLOCKS, BLACK_CROWN_PHASES } from './metadata'
export { BLACK_CROWN_SOURCE_NOTES } from './rules'
export { BLACK_CROWN_WEEKS } from './weeks'
