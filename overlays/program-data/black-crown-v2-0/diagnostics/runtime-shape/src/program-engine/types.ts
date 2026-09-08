export type ExerciseCategory =
  | 'primary'
  | 'secondary'
  | 'power'
  | 'kettlebell'
  | 'sled'
  | 'core'
  | 'carry'
  | 'recovery'

export interface ProgramSet {
  label: string
  reps?: number | string
  loadValue?: number
  loadUnit?: 'lb' | 'kg'
  loadText?: string
  duration?: string
  distance?: string
  notes?: string
  /** Percentage of the governed load reference; metadata only until private athlete data resolves it. */
  percentage?: number | { min: number; max: number }
  /** Stable source reference for dynamic post-test/test-sheet loads. */
  loadReference?: string
  rounding?: 'nearest-5' | 'up-5' | 'down-5'
  rpe?: string
  rir?: string
  tempo?: string
  sourceText?: string
}

export interface ProgramExercise {
  id: string
  name: string
  category: ExerciseCategory
  priority: 'mandatory' | 'conditional' | 'optional'
  sets: ProgramSet[]
  rest?: string
  notes?: string
  coaching?: string
  videoQuery?: string
}

export interface WorkoutSection {
  id: string
  title: string
  subtitle?: string
  exercises: ProgramExercise[]
}

export interface ProgramDay {
  day: number
  date?: string
  title: string
  role: string
  readinessRule: string
  cutOrder?: string
  restDay?: boolean
  sections: WorkoutSection[]
}

export interface ProgramWeek {
  week: number
  start?: string
  end?: string
  intent: string
  days: ProgramDay[]
}

export type PublicProgramKey = 'crownforge' | 'crown-maintenance' | 'black-crown'

export interface PublicProgramDefinition {
  key: PublicProgramKey
  name: string
  version: string
  sourceEngine?: string
  description: string
  weeks: number
  trainingDaysPerWeek: number
  status: 'active-source' | 'catalog-only'
  sourceNotes: string[]
  weekData: ProgramWeek[]
}
