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

if 'export async function unskipLastProgramDay(' in progression or 'data-action="unskip-last-day"' in main:
    raise SystemExit('Unskip Day v1 is already installed')
if 'export async function skipCurrentProgramDay(' not in progression or 'data-action="skip-current-day"' not in main:
    raise SystemExit('Unskip Day v1 requires governed Skip Day v1 first')

action_old = "action: 'advanced' | 'maintenance-started' | 'entry-gate' | 'black-crown-started' | 'blocked' | 'program-complete' | 'repositioned' | 'skipped'"
action_new = action_old + " | 'unskipped'"
if progression.count(action_old) != 1:
    raise SystemExit('ProgressionResult action union changed before Unskip Day install')
progression = progression.replace(action_old, action_new, 1)

unskip_service = r'''
function eventPayloadRecord(event: LocalDomainRecord): Record<string, any> {
  const payload = event.event_payload
  return payload && typeof payload === 'object' ? payload as Record<string, any> : {}
}

function parseEventPosition(value: unknown): ProgramPosition | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const program = String(candidate.program ?? '') as PublicProgramKey
  const week = Number(candidate.week)
  const day = Number(candidate.day)
  if (!(program in PROGRAMS) || !Number.isInteger(week) || !Number.isInteger(day)) return null
  try { validatePosition(program, week, day) } catch (_) { return null }
  return { program, week, day }
}

function isSkipCompanionEvent(event: LocalDomainRecord): boolean {
  if (!['crownforge-complete-maintenance-start', 'black-crown-entry-gate-opened', 'black-crown-program-complete'].includes(String(event.event_type))) return false
  return eventPayloadRecord(event).terminal_day_skipped === true
}

function latestUndoableSkipEvent(events: LocalDomainRecord[]): LocalDomainRecord {
  const live = events.filter((event) => !event.deleted_at)
  const reversed = new Set(live
    .filter((event) => event.event_type === 'program-day-unskipped')
    .map((event) => String(eventPayloadRecord(event).reversed_skip_event_id ?? ''))
    .filter(Boolean))
  const skips = live
    .filter((event) => event.event_type === 'program-day-skipped' && !reversed.has(String(event.id)))
    .sort((a, b) => String(eventPayloadRecord(b).skipped_at ?? b.effective_at ?? '').localeCompare(String(eventPayloadRecord(a).skipped_at ?? a.effective_at ?? '')))
  const skip = skips[0]
  if (!skip) throw new Error('There is no recent Skip Day available to undo')

  const skipAt = String(eventPayloadRecord(skip).skipped_at ?? skip.effective_at ?? '')
  const laterMeaningful = live.find((event) => event.id !== skip.id
    && !isSkipCompanionEvent(event)
    && String(event.effective_at ?? '') >= skipAt)
  if (laterMeaningful) throw new Error('The skipped day can no longer be undone because program activity happened afterward')
  return skip
}

function progressionWithoutEntryGate(instance: LocalDomainRecord): Record<string, unknown> {
  const previous = { ...((instance.progression_state ?? {}) as Record<string, unknown>) }
  delete previous.handoffReady
  delete previous.handoffReadyAt
  delete previous.lastEntryAssessmentAt
  delete previous.lastEntryBlockReason
  delete previous.activatedAt
  delete previous.approvedEntryTmsLb
  previous.blackCrownEntryStatus = 'not-ready'
  delete previous.pendingWorkoutCompletion
  return previous
}

function pendingCompletion(instance: LocalDomainRecord | undefined): boolean {
  return Boolean(instance && ((instance.progression_state ?? {}) as Record<string, any>).pendingWorkoutCompletion)
}

function sessionMatchesPosition(
  session: LocalDomainRecord,
  athleteId: string,
  instanceId: string,
  position: ProgramPosition,
): boolean {
  return !session.deleted_at
    && session.athlete_id === athleteId
    && session.program_instance_id === instanceId
    && session.program_key === position.program
    && Number(session.week_number) === position.week
    && String(session.day_key) === `day-${position.day}`
}

function assertNoWorkoutAfterSkip(
  sessions: LocalDomainRecord[],
  athleteId: string,
  instanceId: string,
  position: ProgramPosition,
): void {
  if (sessions.some((session) => sessionMatchesPosition(session, athleteId, instanceId, position))) {
    throw new Error('Undo Skip is blocked because the next governed day already has workout history')
  }
}

function unskipEventPayload(skip: LocalDomainRecord, from: ProgramPosition, restored: ProgramPosition): Record<string, unknown> {
  return {
    version: 1,
    reason: 'athlete-undo-skip-day',
    reversed_skip_event_id: skip.id,
    skipped_from: from,
    restored_to: restored,
    unskipped_at: new Date().toISOString(),
    counts_as_completed_workout: false,
    counts_as_progression_evidence: false,
  }
}

export async function unskipLastProgramDay(athleteId: string): Promise<ProgressionResult> {
  const device = await getOrCreateDeviceState('5.4.0-rebuild.2')
  const context = { athleteId, deviceId: device.deviceId }
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(['programInstances', 'programEvents', 'workoutSessions', 'syncOutbox'], 'readwrite')
    const programStore = tx.objectStore('programInstances')
    const eventStore = tx.objectStore('programEvents')
    const sessions = await requestToPromise<LocalDomainRecord[]>(tx.objectStore('workoutSessions').getAll())
    const events = (await requestToPromise<LocalDomainRecord[]>(eventStore.getAll())).filter((event) => event.athlete_id === athleteId)
    let skip: LocalDomainRecord
    try { skip = latestUndoableSkipEvent(events) } catch (error) {
      tx.abort()
      throw error
    }
    const payload = eventPayloadRecord(skip)
    const from = parseEventPosition(payload.from)
    if (!from) {
      tx.abort()
      throw new Error('The latest Skip Day record is incomplete and cannot be safely undone')
    }
    const source = await requestToPromise<LocalDomainRecord | undefined>(programStore.get(String(skip.program_instance_id ?? '')))
    if (!source || source.deleted_at || source.athlete_id !== athleteId || source.program_key !== from.program) {
      tx.abort()
      throw new Error('The skipped program instance is no longer available to restore')
    }

    const allPrograms = (await requestToPromise<LocalDomainRecord[]>(programStore.getAll())).filter((row) => row.athlete_id === athleteId && !row.deleted_at)
    const activePrograms = allPrograms.filter((row) => row.status === 'active')
    const governedNext = nextPosition(from.program, from.week, from.day)
    let restored: LocalDomainRecord

    if (governedNext) {
      if (source.status !== 'active' || activePrograms.length !== 1 || activePrograms[0].id !== source.id
        || Number(source.current_week) !== governedNext.week || String(source.current_day_key) !== `day-${governedNext.day}`
        || source.program_key !== governedNext.program) {
        tx.abort()
        throw new Error('Undo Skip is only available while you are still on the immediately following governed day')
      }
      if (pendingCompletion(source)) {
        tx.abort()
        throw new Error('Undo Skip is blocked while workout completion recovery is pending')
      }
      try { assertNoWorkoutAfterSkip(sessions, athleteId, source.id, governedNext) } catch (error) {
        tx.abort(); throw error
      }
      restored = prepareLocalMutation({
        ...source,
        current_week: from.week,
        current_day_key: `day-${from.day}`,
        current_phase_key: phaseFor(from.program, from.week),
        progression_state: withoutPendingWorkoutCompletion(source),
      }, context, source)
      programStore.put(restored)
      tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', restored, context, 'upsert'))
    } else if (from.program === 'crownforge') {
      if (source.status !== 'completed') {
        tx.abort()
        throw new Error('Crownforge is no longer in the skipped terminal state')
      }
      const maintenance = activePrograms.find((row) => row.program_key === 'crown-maintenance'
        && ((row.progression_state ?? {}) as Record<string, any>).handoffFrom === source.id)
      const firstMaintenanceDay = CROWN_MAINTENANCE.weekData[0]?.days[0]?.day ?? 1
      if (!maintenance || activePrograms.length !== 1 || Number(maintenance.current_week) !== 1
        || String(maintenance.current_day_key) !== `day-${firstMaintenanceDay}` || maintenance.current_phase_key !== 'maintenance') {
        tx.abort()
        throw new Error('Undo Skip is only available before Crown Maintenance has moved beyond its fresh handoff state')
      }
      if (pendingCompletion(maintenance)) {
        tx.abort()
        throw new Error('Undo Skip is blocked while workout completion recovery is pending')
      }
      try { assertNoWorkoutAfterSkip(sessions, athleteId, maintenance.id, { program: 'crown-maintenance', week: 1, day: firstMaintenanceDay }) } catch (error) {
        tx.abort(); throw error
      }
      const retiredMaintenance = prepareLocalMutation({ ...maintenance, deleted_at: new Date().toISOString() }, context, maintenance)
      programStore.put(retiredMaintenance)
      tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', retiredMaintenance, context, 'upsert'))
      restored = prepareLocalMutation({
        ...source,
        status: 'active',
        completed_on: null,
        current_week: from.week,
        current_day_key: `day-${from.day}`,
        current_phase_key: phaseFor('crownforge', from.week),
        progression_state: withoutPendingWorkoutCompletion(source),
      }, context, source)
      programStore.put(restored)
      tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', restored, context, 'upsert'))
    } else if (from.program === 'crown-maintenance') {
      if (source.status !== 'active' || activePrograms.length !== 1 || activePrograms[0].id !== source.id
        || source.current_phase_key !== 'black-crown-entry') {
        tx.abort()
        throw new Error('Undo Skip is only available before the Black Crown entry gate is used')
      }
      if (pendingCompletion(source)) {
        tx.abort()
        throw new Error('Undo Skip is blocked while workout completion recovery is pending')
      }
      restored = prepareLocalMutation({
        ...source,
        current_week: from.week,
        current_day_key: `day-${from.day}`,
        current_phase_key: 'maintenance',
        progression_state: progressionWithoutEntryGate(source),
      }, context, source)
      programStore.put(restored)
      tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', restored, context, 'upsert'))
    } else {
      if (source.status !== 'completed' || source.current_phase_key !== 'complete' || activePrograms.length !== 0) {
        tx.abort()
        throw new Error('Undo Skip is only available before any program activity occurs after Black Crown completion')
      }
      try { assertNoWorkoutAfterSkip(sessions, athleteId, source.id, from) } catch (error) {
        tx.abort(); throw error
      }
      restored = prepareLocalMutation({
        ...source,
        status: 'active',
        completed_on: null,
        current_week: from.week,
        current_day_key: `day-${from.day}`,
        current_phase_key: phaseFor('black-crown', from.week),
        progression_state: withoutPendingWorkoutCompletion(source),
      }, context, source)
      programStore.put(restored)
      tx.objectStore('syncOutbox').add(makeOutboxEntry('programInstances', restored, context, 'upsert'))
    }

    const unskipped = prepareLocalMutation(eventInput(athleteId, restored.id, 'program-day-unskipped', unskipEventPayload(skip, from, from)), context)
    eventStore.put(unskipped)
    tx.objectStore('syncOutbox').add(makeOutboxEntry('programEvents', unskipped, context, 'upsert'))
    await transactionDone(tx)
    return {
      action: 'unskipped',
      instance: restored,
      message: `${definitionFor(from.program).name} Week ${from.week} Day ${from.day} restored.`,
    }
  } finally {
    db.close()
  }
}

'''
anchor = 'export async function skipCurrentProgramDay('
if progression.count(anchor) != 1:
    raise SystemExit('Skip service anchor changed before Unskip Day install')
progression = progression.replace(anchor, unskip_service + anchor, 1)

import_old = 'advanceProgramAfterWorkout, skipCurrentProgramDay,'
if main.count(import_old) != 1:
    raise SystemExit('Skip Day progression import changed before Unskip Day install')
main = main.replace(import_old, 'advanceProgramAfterWorkout, skipCurrentProgramDay, unskipLastProgramDay,', 1)

control_old = "  const skipDayControl = currentPosition ? `<div class=\"callout\"><strong>Need to miss this day?</strong> <span class=\"muted\">${skipDayBlocked ? 'A workout is already in progress. Finish it before skipping.' : 'Skip records this scheduled day and moves forward without counting a completed workout.'}</span> <button type=\"button\" class=\"btn ghost small\" data-action=\"skip-current-day\" ${skipDayBlocked ? 'disabled aria-disabled=\"true\"' : ''}>SKIP DAY</button></div>` : ''"
if main.count(control_old) != 1:
    raise SystemExit('Skip Day Train control changed before Unskip Day install')
control_new = "  const skipDayControl = currentPosition ? `<div class=\"callout\"><strong>Need to miss this day?</strong> <span class=\"muted\">${skipDayBlocked ? 'A workout is already in progress. Finish it before skipping or undoing a skip.' : 'Skip moves forward without counting a completed workout. If the last skip was a mistake and no later training occurred, you can undo it.'}</span> <div class=\"button-row\"><button type=\"button\" class=\"btn ghost small\" data-action=\"skip-current-day\" ${skipDayBlocked ? 'disabled aria-disabled=\"true\"' : ''}>SKIP DAY</button><button type=\"button\" class=\"btn ghost small\" data-action=\"unskip-last-day\" ${skipDayBlocked ? 'disabled aria-disabled=\"true\"' : ''}>UNDO LAST SKIP</button></div></div>` : ''"
main = main.replace(control_old, control_new, 1)

handler_anchor = 'async function skipSelectedProgramDay(): Promise<void> {'
if main.count(handler_anchor) != 1:
    raise SystemExit('Skip Day handler anchor changed before Unskip Day install')
unskip_handler = r'''async function unskipLastProgramDayFromTrain(): Promise<void> {
  if (!state.athlete) return
  if (state.workout?.session.status === 'in_progress') {
    return showToast('Finish the workout in progress before undoing a Skip Day.')
  }
  if (!confirm('Undo your most recent Skip Day? This only works if you have not started or completed the following day, and it will not create workout history or change your Training Maxes.')) return
  try {
    const result = await unskipLastProgramDay(state.athlete.id)
    state.programInstance = result.instance
    hydrateSelectedPositionFromProgramInstance()
    await refreshWorkout()
    state.cloud.syncSoon()
    showToast(result.message)
    render()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Undo Skip could not be saved')
  }
}

'''
main = main.replace(handler_anchor, unskip_handler + handler_anchor, 1)

bind_old = "  document.querySelector('[data-action=\"skip-current-day\"]')?.addEventListener('click', skipSelectedProgramDay)\n"
if main.count(bind_old) != 1:
    raise SystemExit('Skip Day binding changed before Unskip Day install')
main = main.replace(bind_old, bind_old + "  document.querySelector('[data-action=\"unskip-last-day\"]')?.addEventListener('click', unskipLastProgramDayFromTrain)\n", 1)

progression_path.write_text(progression)
main_path.write_text(main)
print('LetMeFly governed Unskip Day v1 installed')
PY

grep -Fq "export async function unskipLastProgramDay(" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "'program-day-unskipped'" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "reversed_skip_event_id" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "counts_as_completed_workout: false" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "counts_as_progression_evidence: false" "$TARGET/src/services/program-progression-service.ts"
grep -Fq "deleted_at: new Date().toISOString()" "$TARGET/src/services/program-progression-service.ts"
grep -Fq 'data-action="unskip-last-day"' "$TARGET/src/main.ts"
grep -Fq '>UNDO LAST SKIP</button>' "$TARGET/src/main.ts"
grep -Fq "unskipLastProgramDay(state.athlete.id)" "$TARGET/src/main.ts"

echo "LetMeFly governed Unskip Day v1: PASS"
