#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

if [[ ! -f "$TARGET/src/services/progression-shadow-read-adapter.ts" ]]; then
  echo "Stage 4 requires the Stage-3 read-only Shadow adapter" >&2
  exit 1
fi

cat > "$TARGET/src/services/progression-shadow-pilot-journal.ts" <<'TS'
/**
 * LetMeFly Progression Shadow — Stage 4 isolated append-only pilot journal.
 *
 * This database is NOT canonical athlete/workout state. It stores only derived
 * QA evidence proving what the original post-completion Shadow hook observed.
 * There is no secondary key-value storage fallback, cloud sync, UI, program
 * mutation, or overwrite path.
 */
import type { ProgressionShadowEvidenceBuildResult } from './progression-shadow-evidence-builder'

const PILOT_DB_NAME = 'letmefly.progression.shadow.pilot.v1'
const PILOT_DB_VERSION = 1
const RECEIPTS_STORE = 'receipts'

export interface ProgressionShadowPilotReceipt {
  schemaVersion: 'lmf.progression.shadow.pilot-receipt.current.v1'
  key: string
  athleteId: string
  workoutId: string
  completedAt: string | null
  capturedAt: string
  processingSucceeded: boolean
  readiness: ProgressionShadowEvidenceBuildResult['readiness']
  technicalHealthy: boolean
  decisionCoverageClean: boolean
  eligibleForRealPilotReview: boolean
  coreRequiredUnits: number | null
  coreCompletedUnits: number | null
  coreCompletionRate: number | null
  decisionGapCount: number | null
  warnings: readonly string[]
  evidenceDigest: string
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Progression Shadow pilot journal request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Progression Shadow pilot journal transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Progression Shadow pilot journal transaction aborted'))
  })
}

function openPilotDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PILOT_DB_NAME, PILOT_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RECEIPTS_STORE)) {
        const store = db.createObjectStore(RECEIPTS_STORE, { keyPath: 'key' })
        store.createIndex('by-athlete', 'athleteId', { unique: false })
        store.createIndex('by-workout', 'workoutId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Progression Shadow pilot journal open failed'))
  })
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}

async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(value)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function evidencePacket(result: ProgressionShadowEvidenceBuildResult) {
  return {
    athleteId: result.athleteId,
    sessionId: result.sessionId,
    completedAt: result.completedAt,
    readiness: result.readiness,
    technicalHealthy: result.technicalHealthy,
    warnings: [...result.warnings],
    review: result.review ? {
      workoutId: result.review.workoutId,
      readiness: result.review.readiness,
      work: result.review.work.map((row) => ({
        id: row.id,
        priority: row.priority,
        prescribedUnits: row.prescribedUnits,
        completedUnits: row.completedUnits,
        effectiveRequiredUnits: row.effectiveRequiredUnits,
        countsTowardCoreAdherence: row.countsTowardCoreAdherence,
        conditionalActive: row.conditionalActive,
      })),
      decisionGaps: result.review.decisionGaps.map((gap) => ({ ...gap })),
      decisionGapCount: result.review.decisionGapCount,
      pilotDecisionCoverageClean: result.review.pilotDecisionCoverageClean,
      coreRequiredUnits: result.review.coreRequiredUnits,
      coreCompletedUnits: result.review.coreCompletedUnits,
      coreCompletionRate: result.review.coreCompletionRate,
      eligibleForRealPilotReview: result.review.eligibleForRealPilotReview,
    } : null,
  }
}

export async function progressionShadowGetPilotReceipt(
  athleteId: string,
  workoutId: string,
): Promise<ProgressionShadowPilotReceipt | null> {
  const db = await openPilotDb()
  try {
    const tx = db.transaction(RECEIPTS_STORE, 'readonly')
    const value = await requestToPromise(tx.objectStore(RECEIPTS_STORE).get(`${athleteId}:${workoutId}`))
    await transactionDone(tx)
    return (value as ProgressionShadowPilotReceipt | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function progressionShadowRecordOriginalHookReceipt(
  result: ProgressionShadowEvidenceBuildResult,
  capturedAt = new Date().toISOString(),
): Promise<ProgressionShadowPilotReceipt | null> {
  if (!result.athleteId || !result.sessionId) return null
  const key = `${result.athleteId}:${result.sessionId}`
  const digest = await sha256Hex(evidencePacket(result))
  const existing = await progressionShadowGetPilotReceipt(result.athleteId, result.sessionId)
  if (existing) {
    if (existing.evidenceDigest !== digest) {
      throw new Error('Progression Shadow original-hook evidence conflict')
    }
    return existing
  }

  const review = result.review
  const receipt: ProgressionShadowPilotReceipt = Object.freeze({
    schemaVersion: 'lmf.progression.shadow.pilot-receipt.current.v1' as const,
    key,
    athleteId: result.athleteId,
    workoutId: result.sessionId,
    completedAt: result.completedAt,
    capturedAt,
    processingSucceeded: review !== null,
    readiness: result.readiness,
    technicalHealthy: result.technicalHealthy,
    decisionCoverageClean: review?.pilotDecisionCoverageClean ?? false,
    eligibleForRealPilotReview: Boolean(result.pilotSample),
    coreRequiredUnits: review?.coreRequiredUnits ?? null,
    coreCompletedUnits: review?.coreCompletedUnits ?? null,
    coreCompletionRate: review?.coreCompletionRate ?? null,
    decisionGapCount: review?.decisionGapCount ?? null,
    warnings: Object.freeze([...result.warnings]),
    evidenceDigest: digest,
  })

  const db = await openPilotDb()
  try {
    const tx = db.transaction(RECEIPTS_STORE, 'readwrite')
    tx.objectStore(RECEIPTS_STORE).add(receipt)
    try {
      await transactionDone(tx)
      return receipt
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        const raced = await progressionShadowGetPilotReceipt(result.athleteId, result.sessionId)
        if (raced?.evidenceDigest === digest) return raced
        throw new Error('Progression Shadow original-hook evidence conflict after replay race')
      }
      throw error
    }
  } finally {
    db.close()
  }
}

export async function progressionShadowPilotReceiptBacklog(
  athleteId: string,
): Promise<readonly ProgressionShadowPilotReceipt[]> {
  const db = await openPilotDb()
  try {
    const tx = db.transaction(RECEIPTS_STORE, 'readonly')
    const rows = await requestToPromise(tx.objectStore(RECEIPTS_STORE).index('by-athlete').getAll(athleteId))
    await transactionDone(tx)
    return Object.freeze((rows as ProgressionShadowPilotReceipt[])
      .slice()
      .sort((a, b) => Date.parse(a.completedAt ?? a.capturedAt) - Date.parse(b.completedAt ?? b.capturedAt)))
  } finally {
    db.close()
  }
}
TS

python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
p = root / 'src/main.ts'
text = p.read_text()

anchor = "import { progressionShadowReviewCompletedWorkout } from './services/progression-shadow-read-adapter'\n"
journal_import = "import { progressionShadowRecordOriginalHookReceipt } from './services/progression-shadow-pilot-journal'\n"
if journal_import not in text:
    if anchor not in text:
        raise SystemExit('Stage 4 could not find Stage-3 Shadow import')
    text = text.replace(anchor, anchor + journal_import, 1)

old = "    await progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)"
new = "    const shadowReview = await progressionShadowReviewCompletedWorkout(state.athlete.id, completedSessionId)\n    await progressionShadowRecordOriginalHookReceipt(shadowReview)"
if old in text:
    text = text.replace(old, new, 1)
elif 'progressionShadowRecordOriginalHookReceipt(shadowReview)' not in text:
    raise SystemExit('Stage 4 could not find Stage-3 Shadow completion call')

p.write_text(text)
PY

echo "LetMeFly Progression Shadow Stage-4 append-only pilot journal: APPLIED"
