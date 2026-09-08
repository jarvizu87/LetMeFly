import {
  getAllFromIndex,
  getById,
  getOrCreateDeviceState,
  newId,
  openLetMeFlyDb,
  transactionDone,
  type LocalDomainRecord,
} from '../db/local-db'
import { putEntityWithOutbox, prepareLocalMutation, makeOutboxEntry } from '../db/local-mutations'
import type { ProgramDay, ProgramExercise, ProgramSet, PublicProgramKey } from '../program-engine/types'

export interface WorkoutBundle {
  session: LocalDomainRecord
  exercises: Array<{
    record: LocalDomainRecord
    sets: LocalDomainRecord[]
  }>
}

export async function findWorkoutForDay(
  athleteId: string,
  programKey: string,
  week: number,
  day: number,
): Promise<WorkoutBundle | null> {
  const sessions = await getAllFromIndex<LocalDomainRecord>('workoutSessions', 'by-athlete', athleteId)
  const session = sessions
    .filter((s) => !s.deleted_at)
    .find((s) => s.program_key === programKey && s.week_number === week && s.day_key === `day-${day}`)
  if (!session) return null
  return loadWorkoutBundle(session)
}

export async function startWorkout(
  athleteId: string,
  programInstanceId: string | null,
  programKey: PublicProgramKey,
  week: number,
  day: ProgramDay,
  readinessId: string,
): Promise<WorkoutBundle> {
  const existing = await findWorkoutForDay(athleteId, programKey, week, day.day)
  if (existing) return existing

  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  const context = { athleteId, deviceId: device.deviceId }
  const sessionId = newId()
  const now = new Date().toISOString()

  // Create the entire workout skeleton plus its sync operations atomically.
  // A crash can never leave a session row with only half its exercises/sets.
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(
      ['workoutSessions', 'workoutExercises', 'workoutSets', 'syncOutbox'],
      'readwrite',
    )

    const session = prepareLocalMutation(
      {
        id: sessionId,
        athlete_id: athleteId,
        program_instance_id: programInstanceId,
        readiness_id: readinessId,
        originating_device_id: null,
        program_key: programKey,
        program_version: programKey === 'black-crown' ? 'v2.0' : 'v2.1',
        phase_key: programKey === 'black-crown' ? `block-${Math.ceil(week / 6)}` : programKey === 'crown-maintenance' ? 'maintenance' : week <= 12 ? 'build' : 'testing',
        week_number: week,
        day_key: `day-${day.day}`,
        workout_name: day.title,
        scheduled_for: day.date ?? null,
        started_at: now,
        completed_at: null,
        status: 'in_progress',
        notes: null,
      },
      context,
    )
    tx.objectStore('workoutSessions').put(session)
    tx.objectStore('syncOutbox').add(
      makeOutboxEntry('workoutSessions', session, context, 'upsert'),
    )

    let orderIndex = 0
    for (const section of day.sections) {
      for (const exercise of section.exercises) {
        const exerciseId = newId()
        const exerciseRecord = prepareLocalMutation(
          {
            id: exerciseId,
            athlete_id: athleteId,
            workout_session_id: sessionId,
            exercise_key: exercise.id,
            exercise_name_snapshot: exercise.name,
            order_index: orderIndex++,
            group_key: section.id,
            group_type: 'section',
            prescription_snapshot: {
              priority: exercise.priority,
              category: exercise.category,
              notes: exercise.notes ?? null,
              coaching: exercise.coaching ?? null,
              sourceSets: exercise.sets,
            },
            substituted_from_exercise_key: null,
            completion_state: 'pending',
            notes: null,
          },
          context,
        )
        tx.objectStore('workoutExercises').put(exerciseRecord)
        tx.objectStore('syncOutbox').add(
          makeOutboxEntry('workoutExercises', exerciseRecord, context, 'upsert'),
        )

        for (let i = 0; i < exercise.sets.length; i += 1) {
          const setId = newId()
          const setRecord = prepareLocalMutation(
            {
              id: setId,
              ...setRecordFromProgram(
                athleteId,
                sessionId,
                exerciseId,
                i + 1,
                exercise.sets[i],
              ),
            },
            context,
          )
          tx.objectStore('workoutSets').put(setRecord)
          tx.objectStore('syncOutbox').add(
            makeOutboxEntry('workoutSets', setRecord, context, 'upsert'),
          )
        }
      }
    }

    await transactionDone(tx)
  } finally {
    db.close()
  }

  const created = await findWorkoutForDay(athleteId, programKey, week, day.day)
  if (!created) throw new Error('Workout creation transaction committed but session could not be reloaded')
  return created
}

function setRecordFromProgram(
  athleteId: string,
  sessionId: string,
  exerciseId: string,
  setNumber: number,
  programmed: ProgramSet,
) {
  return {
    athlete_id: athleteId,
    workout_session_id: sessionId,
    workout_exercise_id: exerciseId,
    set_number: setNumber,
    set_type: 'work',
    reps: typeof programmed.reps === 'number' ? programmed.reps : null,
    load_value: programmed.loadValue ?? null,
    load_unit: programmed.loadUnit ?? null,
    rpe: null,
    rir: null,
    tempo: null,
    rest_seconds: null,
    performance_data: {
      programmedLabel: programmed.label,
      programmedReps: programmed.reps ?? null,
      programmedLoadText: programmed.loadText ?? null,
      duration: programmed.duration ?? null,
      distance: programmed.distance ?? null,
      notes: programmed.notes ?? null,
      percentage: programmed.percentage ?? null,
      loadReference: programmed.loadReference ?? null,
      rounding: programmed.rounding ?? null,
    },
    completed: false,
    completed_at: null,
    notes: null,
  }
}

export async function logSet(
  athleteId: string,
  setId: string,
  values: { reps?: number | null; loadValue?: number | null; loadUnit?: 'lb' | 'kg' | null; rpe?: number | null; rir?: number | null; notes?: string | null },
): Promise<LocalDomainRecord> {
  const existing = await getById<LocalDomainRecord>('workoutSets', setId)
  if (!existing || existing.athlete_id !== athleteId) throw new Error('Workout set not found')
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  return putEntityWithOutbox(
    'workoutSets',
    {
      ...existing,
      reps: values.reps ?? existing.reps ?? null,
      load_value: values.loadValue ?? existing.load_value ?? null,
      load_unit: values.loadUnit ?? existing.load_unit ?? null,
      rpe: values.rpe ?? existing.rpe ?? null,
      rir: values.rir ?? existing.rir ?? null,
      notes: values.notes ?? existing.notes ?? null,
      completed: true,
      completed_at: new Date().toISOString(),
    },
    { athleteId, deviceId: device.deviceId },
  )
}

export async function uncompleteSet(athleteId: string, setId: string): Promise<void> {
  const existing = await getById<LocalDomainRecord>('workoutSets', setId)
  if (!existing || existing.athlete_id !== athleteId) throw new Error('Workout set not found')
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  await putEntityWithOutbox('workoutSets', { ...existing, completed: false, completed_at: null }, { athleteId, deviceId: device.deviceId })
}

export async function completeWorkout(athleteId: string, sessionId: string): Promise<void> {
  const session = await getById<LocalDomainRecord>('workoutSessions', sessionId)
  if (!session || session.athlete_id !== athleteId) throw new Error('Workout session not found')
  const device = await getOrCreateDeviceState('5.0.0-rebuild.1')
  await putEntityWithOutbox(
    'workoutSessions',
    { ...session, status: 'completed', completed_at: new Date().toISOString() },
    { athleteId, deviceId: device.deviceId },
  )
}

export async function loadWorkoutBundle(session: LocalDomainRecord): Promise<WorkoutBundle> {
  const exercises = await getAllFromIndex<LocalDomainRecord>('workoutExercises', 'by-session', session.id)
  exercises.sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
  const grouped = []
  for (const record of exercises.filter((e) => !e.deleted_at)) {
    const sets = await getAllFromIndex<LocalDomainRecord>('workoutSets', 'by-exercise', record.id)
    sets.sort((a, b) => Number(a.set_number) - Number(b.set_number))
    grouped.push({ record, sets: sets.filter((s) => !s.deleted_at) })
  }
  return { session, exercises: grouped }
}

export async function recentWorkoutSessions(athleteId: string, limit = 10): Promise<LocalDomainRecord[]> {
  const rows = await getAllFromIndex<LocalDomainRecord>('workoutSessions', 'by-athlete', athleteId)
  return rows
    .filter((row) => !row.deleted_at)
    .sort((a, b) => Date.parse(String(b.started_at ?? b.created_at)) - Date.parse(String(a.started_at ?? a.created_at)))
    .slice(0, limit)
}

export function programmedSetFromExercise(exercise: ProgramExercise, index: number): ProgramSet | undefined {
  return exercise.sets[index]
}
