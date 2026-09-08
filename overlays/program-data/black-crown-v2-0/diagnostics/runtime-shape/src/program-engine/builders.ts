import type { ExerciseCategory, ProgramExercise, ProgramSet } from './types'

export const programSet = (
  label: string,
  reps?: number | string,
  loadText?: string,
  loadValue?: number,
  loadUnit?: 'lb' | 'kg',
  notes?: string,
): ProgramSet => ({ label, reps, loadText, loadValue, loadUnit, notes })

export const programExercise = (
  id: string,
  name: string,
  category: ExerciseCategory,
  priority: ProgramExercise['priority'],
  sets: ProgramSet[],
  notes?: string,
  coaching?: string,
): ProgramExercise => ({
  id,
  name,
  category,
  priority,
  sets,
  notes,
  coaching,
  videoQuery: `${name} exercise tutorial`,
})
