#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

if [[ ! -f "$TARGET/src/services/progression-shadow-pilot-journal.ts" ]]; then
  echo "Stage 5 requires the Stage-4 pilot journal" >&2
  exit 1
fi

cat > "$TARGET/src/services/progression-shadow-provenance-review.ts" <<'TS'
/**
 * LetMeFly Progression Shadow — Stage 5 immutable provenance + human review.
 *
 * This is an isolated pilot QA ledger. It is not canonical training state and
 * cannot authorize visible progression, mutate programming, or apply changes.
 */
import type { ProgressionShadowEvidenceBuildResult } from './progression-shadow-evidence-builder'
import {
  progressionShadowGetPilotReceipt,
  type ProgressionShadowPilotReceipt,
} from './progression-shadow-pilot-journal'

const REVIEW_DB_NAME = 'letmefly.progression.shadow.pilot.review.v1'
const REVIEW_DB_VERSION = 1
const PROVENANCE_STORE = 'provenance'
const HUMAN_REVIEW_STORE = 'humanReviews'

export type ProgressionShadowHumanVerdict = 'agree' | 'disagree' | 'needs_followup'

export interface ProgressionShadowOriginalHookProvenance {
  schemaVersion: 'lmf.progression.shadow.provenance.current.v1'
  key: string
  athleteId: string
  workoutId: string
  completedAt: string | null
  capturedAt: string
  readiness: ProgressionShadowEvidenceBuildResult['readiness']
  originalReceiptDigest: string
  mappedReviewDigest: string
  provenanceDigest: string
}

export interface ProgressionShadowHumanReviewInput {
  athleteId: string
  workoutId: string
  reviewerRef: string
  reviewedAt?: string
  expectedReadiness: ProgressionShadowEvidenceBuildResult['readiness']
  expectedCoreRequiredUnits: number | null
  expectedCoreCompletedUnits: number | null
  expectedDecisionCoverageClean: boolean
  verdict: ProgressionShadowHumanVerdict
  notes?: string
}

export interface ProgressionShadowFinalizedHumanReview {
  schemaVersion: 'lmf.progression.shadow.human-review.current.v1'
  key: string
  athleteId: string
  workoutId: string
  reviewerRef: string
  reviewedAt: string
  expectedReadiness: ProgressionShadowEvidenceBuildResult['readiness']
  expectedCoreRequiredUnits: number | null
  expectedCoreCompletedUnits: number | null
  expectedDecisionCoverageClean: boolean
  verdict: ProgressionShadowHumanVerdict
  notes: string | null
  originalReceiptDigest: string
  provenanceDigest: string
  humanReviewDigest: string
}

export interface ProgressionShadowRebuiltPilotReview {
  athleteId: string
  workoutId: string
  receiptPresent: boolean
  provenancePresent: boolean
  provenanceClean: boolean
  humanReviewPresent: boolean
  humanMatchesMachine: boolean
  technicallyHealthy: boolean
  decisionCoverageClean: boolean
  eligibleForRealPilotReview: boolean
  eligibleForHumanAcceptedPilotSample: boolean
  visibilityAuthorized: false
  autoApplyAllowed: false
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Progression Shadow review-ledger request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Progression Shadow review-ledger transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Progression Shadow review-ledger transaction aborted'))
  })
}

function openReviewDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REVIEW_DB_NAME, REVIEW_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROVENANCE_STORE)) {
        const store = db.createObjectStore(PROVENANCE_STORE, { keyPath: 'key' })
        store.createIndex('by-athlete', 'athleteId', { unique: false })
        store.createIndex('by-workout', 'workoutId', { unique: false })
      }
      if (!db.objectStoreNames.contains(HUMAN_REVIEW_STORE)) {
        const store = db.createObjectStore(HUMAN_REVIEW_STORE, { keyPath: 'key' })
        store.createIndex('by-athlete', 'athleteId', { unique: false })
        store.createIndex('by-workout', 'workoutId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Progression Shadow review-ledger open failed'))
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

function mappedReviewPacket(result: ProgressionShadowEvidenceBuildResult) {
  return {
    athleteId: result.athleteId,
    workoutId: result.sessionId,
    completedAt: result.completedAt,
    readiness: result.readiness,
    technicalHealthy: result.technicalHealthy,
    warnings: [...result.warnings],
    review: result.review ? {
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

export async function progressionShadowGetOriginalHookProvenance(
  athleteId: string,
  workoutId: string,
): Promise<ProgressionShadowOriginalHookProvenance | null> {
  const db = await openReviewDb()
  try {
    const tx = db.transaction(PROVENANCE_STORE, 'readonly')
    const value = await requestToPromise(tx.objectStore(PROVENANCE_STORE).get(`${athleteId}:${workoutId}`))
    await transactionDone(tx)
    return (value as ProgressionShadowOriginalHookProvenance | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function progressionShadowRecordOriginalHookProvenance(
  result: ProgressionShadowEvidenceBuildResult,
  receipt: ProgressionShadowPilotReceipt,
  capturedAt = new Date().toISOString(),
): Promise<ProgressionShadowOriginalHookProvenance | null> {
  if (!result.athleteId || !result.sessionId) return null
  if (receipt.athleteId !== result.athleteId || receipt.workoutId !== result.sessionId) {
    throw new Error('Progression Shadow provenance receipt identity mismatch')
  }

  const storedReceipt = await progressionShadowGetPilotReceipt(result.athleteId, result.sessionId)
  if (!storedReceipt || storedReceipt.evidenceDigest !== receipt.evidenceDigest) {
    throw new Error('Progression Shadow provenance requires the immutable stored original receipt')
  }

  const key = `${result.athleteId}:${result.sessionId}`
  const mappedReviewDigest = await sha256Hex(mappedReviewPacket(result))
  const provenanceDigest = await sha256Hex({
    schemaVersion: 'lmf.progression.shadow.provenance.current.v1',
    key,
    athleteId: result.athleteId,
    workoutId: result.sessionId,
    completedAt: result.completedAt,
    readiness: result.readiness,
    originalReceiptDigest: receipt.evidenceDigest,
    mappedReviewDigest,
  })

  const existing = await progressionShadowGetOriginalHookProvenance(result.athleteId, result.sessionId)
  if (existing) {
    if (
      existing.originalReceiptDigest !== receipt.evidenceDigest ||
      existing.mappedReviewDigest !== mappedReviewDigest ||
      existing.provenanceDigest !== provenanceDigest
    ) {
      throw new Error('Progression Shadow original-hook provenance conflict')
    }
    return existing
  }

  const record: ProgressionShadowOriginalHookProvenance = Object.freeze({
    schemaVersion: 'lmf.progression.shadow.provenance.current.v1' as const,
    key,
    athleteId: result.athleteId,
    workoutId: result.sessionId,
    completedAt: result.completedAt,
    capturedAt,
    readiness: result.readiness,
    originalReceiptDigest: receipt.evidenceDigest,
    mappedReviewDigest,
    provenanceDigest,
  })

  const db = await openReviewDb()
  try {
    const tx = db.transaction(PROVENANCE_STORE, 'readwrite')
    tx.objectStore(PROVENANCE_STORE).add(record)
    try {
      await transactionDone(tx)
      return record
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        const raced = await progressionShadowGetOriginalHookProvenance(result.athleteId, result.sessionId)
        if (raced?.provenanceDigest === provenanceDigest) return raced
        throw new Error('Progression Shadow original-hook provenance conflict after replay race')
      }
      throw error
    }
  } finally {
    db.close()
  }
}

export async function progressionShadowGetFinalizedHumanReview(
  athleteId: string,
  workoutId: string,
): Promise<ProgressionShadowFinalizedHumanReview | null> {
  const db = await openReviewDb()
  try {
    const tx = db.transaction(HUMAN_REVIEW_STORE, 'readonly')
    const value = await requestToPromise(tx.objectStore(HUMAN_REVIEW_STORE).get(`${athleteId}:${workoutId}`))
    await transactionDone(tx)
    return (value as ProgressionShadowFinalizedHumanReview | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function progressionShadowFinalizeHumanReview(
  input: ProgressionShadowHumanReviewInput,
): Promise<ProgressionShadowFinalizedHumanReview> {
  const athleteId = input.athleteId.trim()
  const workoutId = input.workoutId.trim()
  const reviewerRef = input.reviewerRef.trim()
  if (!athleteId || !workoutId || !reviewerRef) throw new Error('Progression Shadow human review requires athlete, workout, and reviewer references')
  if (!['agree', 'disagree', 'needs_followup'].includes(input.verdict)) throw new Error('Progression Shadow human review verdict is invalid')

  const receipt = await progressionShadowGetPilotReceipt(athleteId, workoutId)
  const provenance = await progressionShadowGetOriginalHookProvenance(athleteId, workoutId)
  if (!receipt || !provenance) throw new Error('Progression Shadow human review requires receipt and provenance')
  if (provenance.originalReceiptDigest !== receipt.evidenceDigest) throw new Error('Progression Shadow human review provenance mismatch')

  const key = `${athleteId}:${workoutId}`
  const notes = input.notes?.trim() || null
  const humanReviewDigest = await sha256Hex({
    schemaVersion: 'lmf.progression.shadow.human-review.current.v1',
    key,
    athleteId,
    workoutId,
    reviewerRef,
    expectedReadiness: input.expectedReadiness,
    expectedCoreRequiredUnits: input.expectedCoreRequiredUnits,
    expectedCoreCompletedUnits: input.expectedCoreCompletedUnits,
    expectedDecisionCoverageClean: input.expectedDecisionCoverageClean,
    verdict: input.verdict,
    notes,
    originalReceiptDigest: receipt.evidenceDigest,
    provenanceDigest: provenance.provenanceDigest,
  })

  const existing = await progressionShadowGetFinalizedHumanReview(athleteId, workoutId)
  if (existing) {
    if (existing.humanReviewDigest !== humanReviewDigest) {
      throw new Error('Progression Shadow human review is already finalized with different evidence')
    }
    return existing
  }

  const record: ProgressionShadowFinalizedHumanReview = Object.freeze({
    schemaVersion: 'lmf.progression.shadow.human-review.current.v1' as const,
    key,
    athleteId,
    workoutId,
    reviewerRef,
    reviewedAt: input.reviewedAt ?? new Date().toISOString(),
    expectedReadiness: input.expectedReadiness,
    expectedCoreRequiredUnits: input.expectedCoreRequiredUnits,
    expectedCoreCompletedUnits: input.expectedCoreCompletedUnits,
    expectedDecisionCoverageClean: input.expectedDecisionCoverageClean,
    verdict: input.verdict,
    notes,
    originalReceiptDigest: receipt.evidenceDigest,
    provenanceDigest: provenance.provenanceDigest,
    humanReviewDigest,
  })

  const db = await openReviewDb()
  try {
    const tx = db.transaction(HUMAN_REVIEW_STORE, 'readwrite')
    tx.objectStore(HUMAN_REVIEW_STORE).add(record)
    try {
      await transactionDone(tx)
      return record
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        const raced = await progressionShadowGetFinalizedHumanReview(athleteId, workoutId)
        if (raced?.humanReviewDigest === humanReviewDigest) return raced
        throw new Error('Progression Shadow human review conflict after replay race')
      }
      throw error
    }
  } finally {
    db.close()
  }
}

export async function progressionShadowRebuildFinalizedPilotReview(
  athleteId: string,
  workoutId: string,
): Promise<ProgressionShadowRebuiltPilotReview> {
  const receipt = await progressionShadowGetPilotReceipt(athleteId, workoutId)
  const provenance = await progressionShadowGetOriginalHookProvenance(athleteId, workoutId)
  const human = await progressionShadowGetFinalizedHumanReview(athleteId, workoutId)

  const provenanceClean = Boolean(
    receipt &&
    provenance &&
    provenance.originalReceiptDigest === receipt.evidenceDigest,
  )

  const humanMatchesMachine = Boolean(
    receipt &&
    provenanceClean &&
    human &&
    human.originalReceiptDigest === receipt.evidenceDigest &&
    human.provenanceDigest === provenance?.provenanceDigest &&
    human.expectedReadiness === receipt.readiness &&
    human.expectedCoreRequiredUnits === receipt.coreRequiredUnits &&
    human.expectedCoreCompletedUnits === receipt.coreCompletedUnits &&
    human.expectedDecisionCoverageClean === receipt.decisionCoverageClean &&
    human.verdict === 'agree',
  )

  const technicallyHealthy = Boolean(receipt?.technicalHealthy)
  const decisionCoverageClean = Boolean(receipt?.decisionCoverageClean)
  const eligibleForRealPilotReview = Boolean(receipt?.eligibleForRealPilotReview)

  return Object.freeze({
    athleteId,
    workoutId,
    receiptPresent: Boolean(receipt),
    provenancePresent: Boolean(provenance),
    provenanceClean,
    humanReviewPresent: Boolean(human),
    humanMatchesMachine,
    technicallyHealthy,
    decisionCoverageClean,
    eligibleForRealPilotReview,
    eligibleForHumanAcceptedPilotSample: Boolean(
      eligibleForRealPilotReview &&
      technicallyHealthy &&
      decisionCoverageClean &&
      provenanceClean &&
      humanMatchesMachine,
    ),
    visibilityAuthorized: false as const,
    autoApplyAllowed: false as const,
  })
}
TS

python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
p = root / 'src/main.ts'
text = p.read_text()

anchor = "import { progressionShadowRecordOriginalHookReceipt } from './services/progression-shadow-pilot-journal'\n"
new_import = "import { progressionShadowRecordOriginalHookProvenance } from './services/progression-shadow-provenance-review'\n"
if new_import not in text:
    if anchor not in text:
        raise SystemExit('Stage 5 could not find Stage-4 journal import')
    text = text.replace(anchor, anchor + new_import, 1)

old = "    await progressionShadowRecordOriginalHookReceipt(shadowReview)"
new = "    const shadowReceipt = await progressionShadowRecordOriginalHookReceipt(shadowReview)\n    if (shadowReceipt) await progressionShadowRecordOriginalHookProvenance(shadowReview, shadowReceipt)"
if old in text:
    text = text.replace(old, new, 1)
elif 'progressionShadowRecordOriginalHookProvenance(shadowReview, shadowReceipt)' not in text:
    raise SystemExit('Stage 5 could not find Stage-4 receipt call')

p.write_text(text)
PY

echo "LetMeFly Progression Shadow Stage-5 provenance + human review ledger: APPLIED"
