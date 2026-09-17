#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:?reconstructed app root required}"
TARGET="$TARGET" python3 - <<'PY'
from pathlib import Path
import os

root = Path(os.environ['TARGET'])
progression_path = root / 'src/services/program-progression-service.ts'
main_path = root / 'src/main.ts'
progression = progression_path.read_text()
main = main_path.read_text()

if 'export async function skipCurrentProgramDay(' in progression or 'data-action="skip-current-day"' in main:
    raise SystemExit('Skip Day v1 is already installed')

# A skip is an explicit athlete action, distinct from completion and repositioning.
action_old = "action: 'advanced' | 'maintenance-started' | 'entry-gate' | 'black-crown-started' | 'blocked' | 'program-complete' | 'repositioned'"
action_new = "action: 'advanced' | 'maintenance-started' | 'entry-gate' | 'black-crown-started' | 'blocked' | 'program-complete' | 'repositioned' | 'skipped'"
if progression.count(action_old) != 1:
    raise SystemExit('ProgressionResult action union changed before Skip Day install')
progression = progression.replace(action_old, action_new, 1)

skip_service = r'''
async function assertCurrentProgramDaySkippable(
  tx: IDBTransaction,
  current: LocalDomainRecord | undefined,
  athleteId: string,
  instanceId: string,
  program: PublicProgramKey,
  week: number,
  day: number,
): Promise<LocalDomainRecord> {
  const invalid = (message: string): never => {
    try { tx.abort() } catch (_) { /* transaction may already be closing */ }
    throw new Error(message)
  }
  if (!current || current.deleted_at || current.athlete_id !== athleteId || current.id !== instanceId || current.status !== 'active'
    || current.program_key !== program || Number(current.current_week) !== week || String(current.current_day_key) !== `day-${day}`) {
    return invalid('Current program position changed; reload before skipping')
  }
  const pending = ((current.progression_state ?? {}) as Record<string, any>).pendingWorkoutCompletion
  if (pending) return invalid('A completed workout is waiting to advance this day; recover it before using Skip Day')

  const sessions = await requestToPromise<LocalDomainRecord[]>(tx.objectStore('workoutSessions').getAll())
  const activeSession = sessions.find((session) => !session.deleted_at
    && session.athlete_id === athleteId
    && session.program_instance_id === current.id
    && session.program_key === program
    && Number(session.week_number) === week
    && String(session.day_key) === `day-${day}`
    && session.status === 'in_progress')
  if (activeSession) return invalid('This day already has a workout in progress. Finish that workout before using Skip Day.')
  return current
}

function skipEventPayload(from: ProgramPosition, to: ProgramPosition | null): Record<string, unknown> {
  return {
    version: 1,
    reason: 'athlete-skip-day',
    from,
    to,
    skipped_at: new Date().toISOString(),
    counts_as_completed_workout: false,
  }
}

async function skipToNextProgramPosition(
  athleteId: string,
  instance: LocalDomainRecord,
  from: ProgramPosition,
  next: ProgramPosition,
): Promise<LocalDomainRecord> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'workoutSessions', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await assertCurrentProgramDaySkippable(
      tx,
      await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id)),
      athleteId,
      instance.id,
      from.program,
      from.week,
      from.day,
    )
    const updated = prepareLocalMutation({
      ...current,
      progression_state: withoutPendingWorkoutCompletion(current),
      current_week: next.week,
      current_day_key: `day-${next.day}`,
      current_phase_key: phaseFor(next.program, next.week),
    }, context, current)
    store.put(updated)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', updated, context, 'upsert'))
    const event = prepareLocalMutation(eventInput(athleteId, current.id, 'program-day-skipped', skipEventPayload(from, next)), context)
    tx.objectStore('programEvents').put(event)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', event, context, 'upsert'))
    await transactionDone(tx)
    return updated
  } finally {
    db.close()
  }
}

async function skipTerminalCrownforgeDay(
  athleteId: string,
  instance: LocalDomainRecord,
  from: ProgramPosition,
): Promise<LocalDomainRecord> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'workoutSessions', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await assertCurrentProgramDaySkippable(
      tx,
      await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id)),
      athleteId,
      instance.id,
      from.program,
      from.week,
      from.day,
    )
    const completed = prepareLocalMutation({
      ...current,
      progression_state: withoutPendingWorkoutCompletion(current),
      status: 'completed',
      completed_on: new Date().toISOString().slice(0, 10),
    }, context, current)
    store.put(completed)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', completed, context, 'upsert'))

    const firstMaintenanceDay = CROWN_MAINTENANCE.weekData[0]?.days[0]?.day ?? 1
    const maintenanceId = newId()
    const maintenance = prepareLocalMutation({
      id: maintenanceId,
      athlete_id: athleteId,
      program_key: 'crown-maintenance',
      program_name: CROWN_MAINTENANCE.name,
      program_version: CROWN_MAINTENANCE.version,
      program_definition_hash: null,
      program_snapshot: { sourceEngine: CROWN_MAINTENANCE.sourceEngine ?? null, handoffFrom: 'crownforge' },
      status: 'active',
      started_on: new Date().toISOString().slice(0, 10),
      current_phase_key: 'maintenance',
      current_week: 1,
      current_day_key: `day-${firstMaintenanceDay}`,
      progression_state: { handoffFrom: current.id, blackCrownEntryStatus: 'not-ready' },
    }, context)
    store.put(maintenance)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', maintenance, context, 'upsert'))

    const next: ProgramPosition = { program: 'crown-maintenance', week: 1, day: firstMaintenanceDay }
    const skipped = prepareLocalMutation(eventInput(athleteId, current.id, 'program-day-skipped', skipEventPayload(from, next)), context)
    tx.objectStore('programEvents').put(skipped)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', skipped, context, 'upsert'))
    const handoff = prepareLocalMutation(eventInput(athleteId, current.id, 'crownforge-complete-maintenance-start', {
      from_program_instance_id: current.id,
      to_program_instance_id: maintenance.id,
      terminal_day_skipped: true,
    }), context)
    tx.objectStore('programEvents').put(handoff)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', handoff, context, 'upsert'))
    await transactionDone(tx)
    return maintenance
  } finally {
    db.close()
  }
}

async function skipTerminalMaintenanceDay(
  athleteId: string,
  instance: LocalDomainRecord,
  from: ProgramPosition,
): Promise<LocalDomainRecord> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'workoutSessions', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await assertCurrentProgramDaySkippable(
      tx,
      await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id)),
      athleteId,
      instance.id,
      from.program,
      from.week,
      from.day,
    )
    const previous = withoutPendingWorkoutCompletion(current)
    const updated = prepareLocalMutation({
      ...current,
      current_phase_key: 'black-crown-entry',
      progression_state: {
        ...previous,
        handoffReady: true,
        blackCrownEntryStatus: 'pending',
        handoffReadyAt: new Date().toISOString(),
      },
    }, context, current)
    store.put(updated)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', updated, context, 'upsert'))

    const skipped = prepareLocalMutation(eventInput(athleteId, current.id, 'program-day-skipped', skipEventPayload(from, null)), context)
    tx.objectStore('programEvents').put(skipped)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', skipped, context, 'upsert'))
    const gate = prepareLocalMutation(eventInput(athleteId, current.id, 'black-crown-entry-gate-opened', {
      source: 'crown-maintenance-complete',
      terminal_day_skipped: true,
    }), context)
    tx.objectStore('programEvents').put(gate)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', gate, context, 'upsert'))
    await transactionDone(tx)
    return updated
  } finally {
    db.close()
  }
}

async function skipTerminalBlackCrownDay(
  athleteId: string,
  instance: LocalDomainRecord,
  from: ProgramPosition,
): Promise<void> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'workoutSessions', 'syncOutbox'], 'readwrite')
    const store = tx.objectStore('programInstances')
    const current = await assertCurrentProgramDaySkippable(
      tx,
      await requestToPromise<LocalDomainRecord | undefined>(store.get(instance.id)),
      athleteId,
      instance.id,
      from.program,
      from.week,
      from.day,
    )
    const completed = prepareLocalMutation({
      ...current,
      progression_state: withoutPendingWorkoutCompletion(current),
      status: 'completed',
      current_phase_key: 'complete',
      completed_on: new Date().toISOString().slice(0, 10),
    }, context, current)
    store.put(completed)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', completed, context, 'upsert'))

    const skipped = prepareLocalMutation(eventInput(athleteId, current.id, 'program-day-skipped', skipEventPayload(from, null)), context)
    tx.objectStore('programEvents').put(skipped)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', skipped, context, 'upsert'))
    const complete = prepareLocalMutation(eventInput(athleteId, current.id, 'black-crown-program-complete', {
      week: from.week,
      day: from.day,
      terminal_day_skipped: true,
    }), context)
    tx.objectStore('programEvents').put(complete)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', complete, context, 'upsert'))
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export async function skipCurrentProgramDay(
  athleteId: string,
  program: PublicProgramKey,
  week: number,
  day: number,
): Promise<ProgressionResult> {
  validatePosition(program, week, day)
  const instance = await getCurrentProgramInstance(athleteId)
  if (!instance || !isCurrentProgramPosition(instance, program, week, day)) {
    throw new Error('Only the athlete’s current governed program day can be skipped')
  }
  const from: ProgramPosition = { program, week, day }
  const next = nextPosition(program, week, day)
  if (next) {
    const updated = await skipToNextProgramPosition(athleteId, instance, from, next)
    return {
      action: 'skipped',
      instance: updated,
      message: `${definitionFor(program).name} Week ${week} Day ${day} skipped. Now at Week ${next.week} Day ${next.day}.`,
    }
  }
  if (program === 'crownforge') {
    const maintenance = await skipTerminalCrownforgeDay(athleteId, instance, from)
    return {
      action: 'skipped',
      instance: maintenance,
      message: `Crownforge Week ${week} Day ${day} skipped. Crown Maintenance Week 1 Day 1 is now active.`,
    }
  }
  if (program === 'crown-maintenance') {
    const gated = await skipTerminalMaintenanceDay(athleteId, instance, from)
    return {
      action: 'skipped',
      instance: gated,
      message: `Crown Maintenance Week ${week} Day ${day} skipped. Black Crown entry gate is ready.`,
    }
  }
  await skipTerminalBlackCrownDay(athleteId, instance, from)
  return {
    action: 'skipped',
    instance: null,
    message: `Black Crown Week ${week} Day ${day} skipped. Program complete; no next program was invented.`,
  }
}

'''
anchor = 'export async function advanceProgramAfterWorkout('
if progression.count(anchor) != 1:
    raise SystemExit('advanceProgramAfterWorkout anchor changed before Skip Day install')
progression = progression.replace(anchor, skip_service + anchor, 1)

# Wire the athlete-facing Train control through the authoritative progression service.
import_anchor = 'import { recoverPendingWorkoutProgression, activateBlackCrownFromEntry, advanceProgramAfterWorkout,'
if main.count(import_anchor) != 1:
    raise SystemExit('Progression import anchor changed before Skip Day install')
main = main.replace(
    import_anchor,
    'import { recoverPendingWorkoutProgression, activateBlackCrownFromEntry, advanceProgramAfterWorkout, skipCurrentProgramDay,',
    1,
)

position_start = main.find('  const positionControl = currentPosition')
if position_start < 0:
    raise SystemExit('Train current-position control missing before Skip Day install')
return_anchor = main.find('  return `', position_start)
if return_anchor < 0:
    raise SystemExit('Train render return anchor missing before Skip Day install')
skip_control = r'''  const skipDayBlocked = state.workout?.session.status === 'in_progress'
  const skipDayControl = currentPosition ? `<div class="callout"><strong>Need to miss this day?</strong> <span class="muted">${skipDayBlocked ? 'A workout is already in progress. Finish it before skipping.' : 'Skip records this scheduled day and moves forward without counting a completed workout.'}</span> <button type="button" class="btn ghost small" data-action="skip-current-day" ${skipDayBlocked ? 'disabled aria-disabled="true"' : ''}>SKIP DAY</button></div>` : ''
'''
main = main[:return_anchor] + skip_control + main[return_anchor:]

control_anchor = '      ${positionControl}\n      <div class="train-rule"><strong>Readiness rule</strong>'
if main.count(control_anchor) != 1:
    raise SystemExit('Train position-control render anchor changed before Skip Day install')
main = main.replace(
    control_anchor,
    '      ${positionControl}\n      ${skipDayControl}\n      <div class="train-rule"><strong>Readiness rule</strong>',
    1,
)

function_anchor = 'async function makeSelectedPositionCurrent(): Promise<void> {'
if main.count(function_anchor) != 1:
    raise SystemExit('makeSelectedPositionCurrent anchor changed before Skip Day install')
skip_handler = r'''async function skipSelectedProgramDay(): Promise<void> {
  if (!state.athlete) return
  const current = positionFromProgramInstance(state.programInstance)
  if (!current || current.program !== state.selectedProgram || current.week !== state.selectedWeek || current.day !== state.selectedDay) {
    return showToast('Only your current governed program day can be skipped')
  }
  if (state.workout?.session.status === 'in_progress') {
    return showToast('This day already has a workout in progress. Finish it before using Skip Day.')
  }
  const selectedDay = getProgramDay(state.selectedProgram, state.selectedWeek, state.selectedDay)
  const title = selectedDay?.title ? ` — ${selectedDay.title}` : ''
  if (!confirm(`Skip ${selectedProgramName()} Week ${state.selectedWeek} Day ${state.selectedDay}${title}? This records the day as skipped and moves to the next governed day. It will NOT count as a completed workout or change your Training Maxes.`)) return
  try {
    const result = await skipCurrentProgramDay(state.athlete.id, state.selectedProgram, state.selectedWeek, state.selectedDay)
    state.programInstance = result.instance
    hydrateSelectedPositionFromProgramInstance()
    await refreshWorkout()
    state.cloud.syncSoon()
    showToast(result.message)
    render()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Skip Day could not be saved')
  }
}

'''
main = main.replace(function_anchor, skip_handler + function_anchor, 1)

bind_anchor = "  document.querySelector('[data-action=\"make-current-position\"]')?.addEventListener('click', makeSelectedPositionCurrent)\n"
if main.count(bind_anchor) != 1:
    raise SystemExit('Train current-position event binding changed before Skip Day install')
main = main.replace(
    bind_anchor,
    bind_anchor + "  document.querySelector('[data-action=\"skip-current-day\"]')?.addEventListener('click', skipSelectedProgramDay)\n",
    1,
)

progression_path.write_text(progression)
main_path.write_text(main)
print('LetMeFly governed Skip Day v1 installed')
PY

# Source-level safety markers. These are deliberately strict because Skip Day may
# move program position but may never impersonate workout completion.
grep -Fq "export async function skipCurrentProgramDay(" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "'program-day-skipped'" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "counts_as_completed_workout: false" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "pendingWorkoutCompletion" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "session.status === 'in_progress'" "$TARGET/src/services/program-progression-service.ts"
grep -Fq 'data-action="skip-current-day"' "$TARGET/src/main.ts"
grep -Fq '>SKIP DAY</button>' "$TARGET/src/main.ts"
grep -Fq "It will NOT count as a completed workout or change your Training Maxes." "$TARGET/src/main.ts"
grep -Fq "skipCurrentProgramDay(state.athlete.id" "$TARGET/src/main.ts"

echo "LetMeFly governed Skip Day v1: PASS"
