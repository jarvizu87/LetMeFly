import type { PublicProgramDefinition } from '../../program-engine/types'

export const BLACK_CROWN_METADATA = {
  key: 'black-crown',
  name: 'Black Crown Revised',
  version: 'v2.0',
  sourceEngine: 'Black Crown Revised v2.0 / Stage-5A production source',
  description: '54-week strength, powerbuilding, athletic-development, and realization system with governed TM calibration, readiness, Olympic derivatives, kettlebells, sleds, carries, and weak-point work.',
  weeks: 54,
  trainingDaysPerWeek: 5,
  status: 'active-source',
} satisfies Omit<PublicProgramDefinition, 'sourceNotes' | 'weekData'>

export const BLACK_CROWN_BLOCKS = [
  {
    key: "foundation-re-entry",
    startWeek: 1,
    endWeek: 6,
    title: "Foundation / Re-Entry"
  },
  {
    key: "strength-accumulation",
    startWeek: 7,
    endWeek: 12,
    title: "Strength Accumulation / Intensification"
  },
  {
    key: "strength-peak",
    startWeek: 13,
    endWeek: 18,
    title: "Strength Peak / Intensification"
  },
  {
    key: "strength-consolidation",
    startWeek: 19,
    endWeek: 24,
    title: "Strength Consolidation / Rebuild"
  },
  {
    key: "powerbuilding-yoke",
    startWeek: 25,
    endWeek: 30,
    title: "Powerbuilding / Weak-Point Accumulation + Yoke"
  },
  {
    key: "specificity-bridge",
    startWeek: 31,
    endWeek: 36,
    title: "Strength Intensification / Specificity Bridge"
  },
  {
    key: "crazy-ivan-rebuild",
    startWeek: 37,
    endWeek: 42,
    title: "Crazy Ivan Controlled Rebuild / Armor Density"
  },
  {
    key: "post-realization-rebuild",
    startWeek: 43,
    endWeek: 48,
    title: "Post-Realization Rebuild / Armor Accumulation"
  },
  {
    key: "final-realization",
    startWeek: 49,
    endWeek: 54,
    title: "Final Realization / Maintenance Accessory"
  }
] as const

// Compatibility export for older consumers. Canonical v2.0 governance uses nine six-week blocks.
export const BLACK_CROWN_PHASES = BLACK_CROWN_BLOCKS
