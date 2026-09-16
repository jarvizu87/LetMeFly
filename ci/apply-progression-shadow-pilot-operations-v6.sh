#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

if [[ ! -f "$TARGET/src/services/progression-shadow-provenance-review.ts" ]]; then
  echo "Stage 6 requires the Stage-5 provenance and human-review ledger" >&2
  exit 1
fi
if [[ ! -f "$TARGET/src/services/progression-shadow-pilot-journal.ts" ]]; then
  echo "Stage 6 requires the Stage-4 pilot journal" >&2
  exit 1
fi

cat > "$TARGET/src/services/progression-shadow-pilot-operations.ts" <<'TS'
/**
 * LetMeFly Progression Shadow — Stage 6 pilot operations hardening.
 *
 * Stores only derived pilot QA operations. Finalized receipts, provenance, and
 * human reviews remain immutable. Disqualification never repairs or suppresses
 * a technical failure; a replacement must be a different accepted real review.
 */
import {
  progressionShadowPilotReceiptBacklog,
  progressionShadowGetPilotReceipt,
  type ProgressionShadowPilotReceipt,
} from './progression-shadow-pilot-journal'
import {
  progressionShadowGetFinalizedHumanReview,
  progressionShadowGetOriginalHookProvenance,
  progressionShadowRebuildFinalizedPilotReview,
  type ProgressionShadowFinalizedHumanReview,
  type ProgressionShadowOriginalHookProvenance,
} from './progression-shadow-provenance-review'

const OPS_DB_NAME = 'letmefly.progression.shadow.pilot.operations.v1'
const OPS_DB_VERSION = 1
const DISPOSITIONS_STORE = 'dispositions'
const REPLACEMENTS_STORE = 'replacements'

export type ProgressionShadowDispositionReason = 'HUMAN_REVIEW_ERROR' | 'INVALID_RELOAD_CONFIRMATION'

export interface ProgressionShadowReviewDispositionInput {
  athleteId: string
  workoutId: string
  reviewerRef: string
  reason: ProgressionShadowDispositionReason
  dispositionedAt?: string
  notes?: string
}

export interface ProgressionShadowReviewDisposition {
  schemaVersion: 'lmf.progression.shadow.disposition.current.v1'
  key: string
  athleteId: string
  workoutId: string
  reviewerRef: string
  reason: ProgressionShadowDispositionReason
  dispositionedAt: string
  notes: string | null
  originalReceiptDigest: string
  provenanceDigest: string
  humanReviewDigest: string
  dispositionDigest: string
  replacementRequired: true
}

export interface ProgressionShadowReplacementInput {
  athleteId: string
  disqualifiedWorkoutId: string
  replacementWorkoutId: string
  reviewerRef: string
  linkedAt?: string
}

export interface ProgressionShadowReplacementRecord {
  schemaVersion: 'lmf.progression.shadow.replacement.current.v1'
  key: string
  athleteId: string
  disqualifiedWorkoutId: string
  replacementWorkoutId: string
  reviewerRef: string
  linkedAt: string
  dispositionDigest: string
  replacementReceiptDigest: string
  replacementProvenanceDigest: string
  replacementHumanReviewDigest: string
  replacementDigest: string
}

export interface ProgressionShadowPilotOperationsBacklog {
  schemaVersion: 'lmf.progression.shadow.operations-backlog.current.v1'
  athleteId: string
  receiptCount: number
  pendingHumanReviewWorkoutIds: readonly string[]
  disqualifiedWorkoutIds: readonly string[]
  activeAcceptedWorkoutIds: readonly string[]
  replacementPendingWorkoutIds: readonly string[]
  greenAcceptedCount: number
  yellowAcceptedCount: number
  redAcceptedCount: number
  pilotMinimumRemaining: number
  replacementLinksRemaining: number
  evidenceGateSatisfied: boolean
  visibilityAuthorized: false
  autoApplyAllowed: false
}

export interface ProgressionShadowPilotAuditExport {
  schemaVersion: 'lmf.progression.shadow.audit-export.current.v1'
  athleteId: string
  generatedAt: string
  receipts: readonly ProgressionShadowPilotReceipt[]
  provenance: readonly ProgressionShadowOriginalHookProvenance[]
  humanReviews: readonly ProgressionShadowFinalizedHumanReview[]
  dispositions: readonly ProgressionShadowReviewDisposition[]
  replacements: readonly ProgressionShadowReplacementRecord[]
  backlog: ProgressionShadowPilotOperationsBacklog
  contentDigest: string
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Progression Shadow operations request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Progression Shadow operations transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Progression Shadow operations transaction aborted'))
  })
}

function openOpsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OPS_DB_NAME, OPS_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DISPOSITIONS_STORE)) {
        const store = db.createObjectStore(DISPOSITIONS_STORE, { keyPath: 'key' })
        store.createIndex('by-athlete', 'athleteId', { unique: false })
        store.createIndex('by-workout', 'workoutId', { unique: false })
      }
      if (!db.objectStoreNames.contains(REPLACEMENTS_STORE)) {
        const store = db.createObjectStore(REPLACEMENTS_STORE, { keyPath: 'key' })
        store.createIndex('by-athlete', 'athleteId', { unique: false })
        store.createIndex('by-replacement-workout', 'replacementWorkoutId', { unique: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Progression Shadow operations ledger open failed'))
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

function requiredText(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`Progression Shadow operations requires ${label}`)
  return trimmed
}

async function listStoreByAthlete<T>(storeName: string, athleteId: string): Promise<T[]> {
  const db = await openOpsDb()
  try {
    const tx = db.transaction(storeName, 'readonly')
    const rows = await requestToPromise(tx.objectStore(storeName).index('by-athlete').getAll(athleteId))
    await transactionDone(tx)
    return rows as T[]
  } finally {
    db.close()
  }
}

export async function progressionShadowGetReviewDisposition(
  athleteId: string,
  workoutId: string,
): Promise<ProgressionShadowReviewDisposition | null> {
  const db = await openOpsDb()
  try {
    const tx = db.transaction(DISPOSITIONS_STORE, 'readonly')
    const value = await requestToPromise(tx.objectStore(DISPOSITIONS_STORE).get(`${athleteId}:${workoutId}`))
    await transactionDone(tx)
    return (value as ProgressionShadowReviewDisposition | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function progressionShadowRecordReviewDisposition(
  input: ProgressionShadowReviewDispositionInput,
): Promise<ProgressionShadowReviewDisposition> {
  const athleteId = requiredText(input.athleteId, 'athleteId')
  const workoutId = requiredText(input.workoutId, 'workoutId')
  const reviewerRef = requiredText(input.reviewerRef, 'reviewerRef')
  if (!['HUMAN_REVIEW_ERROR', 'INVALID_RELOAD_CONFIRMATION'].includes(input.reason)) {
    throw new Error('Progression Shadow disposition reason is invalid')
  }

  const receipt = await progressionShadowGetPilotReceipt(athleteId, workoutId)
  const provenance = await progressionShadowGetOriginalHookProvenance(athleteId, workoutId)
  const human = await progressionShadowGetFinalizedHumanReview(athleteId, workoutId)
  const rebuilt = await progressionShadowRebuildFinalizedPilotReview(athleteId, workoutId)
  if (!receipt || !provenance || !human) throw new Error('Progression Shadow disposition requires finalized pilot evidence')
  if (!rebuilt.provenanceClean) throw new Error('Progression Shadow disposition cannot hide provenance failure')
  if (!rebuilt.technicallyHealthy || !receipt.processingSucceeded) throw new Error('Progression Shadow disposition cannot hide technical failure')
  if (!rebuilt.decisionCoverageClean) throw new Error('Progression Shadow disposition cannot hide decision-coverage failure')
  if (!rebuilt.eligibleForRealPilotReview) throw new Error('Progression Shadow disposition requires a real-pilot-eligible workout')

  const key = `${athleteId}:${workoutId}`
  const notes = input.notes?.trim() || null
  const dispositionDigest = await sha256Hex({
    schemaVersion: 'lmf.progression.shadow.disposition.current.v1',
    key,
    athleteId,
    workoutId,
    reviewerRef,
    reason: input.reason,
    notes,
    originalReceiptDigest: receipt.evidenceDigest,
    provenanceDigest: provenance.provenanceDigest,
    humanReviewDigest: human.humanReviewDigest,
  })

  const existing = await progressionShadowGetReviewDisposition(athleteId, workoutId)
  if (existing) {
    if (existing.dispositionDigest !== dispositionDigest) throw new Error('Progression Shadow disposition is already finalized with different evidence')
    return existing
  }

  const record: ProgressionShadowReviewDisposition = Object.freeze({
    schemaVersion: 'lmf.progression.shadow.disposition.current.v1' as const,
    key,
    athleteId,
    workoutId,
    reviewerRef,
    reason: input.reason,
    dispositionedAt: input.dispositionedAt ?? new Date().toISOString(),
    notes,
    originalReceiptDigest: receipt.evidenceDigest,
    provenanceDigest: provenance.provenanceDigest,
    humanReviewDigest: human.humanReviewDigest,
    dispositionDigest,
    replacementRequired: true as const,
  })

  const db = await openOpsDb()
  try {
    const tx = db.transaction(DISPOSITIONS_STORE, 'readwrite')
    tx.objectStore(DISPOSITIONS_STORE).add(record)
    try {
      await transactionDone(tx)
      return record
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        const raced = await progressionShadowGetReviewDisposition(athleteId, workoutId)
        if (raced?.dispositionDigest === dispositionDigest) return raced
        throw new Error('Progression Shadow disposition conflict after replay race')
      }
      throw error
    }
  } finally {
    db.close()
  }
}

export async function progressionShadowGetReplacementRecord(
  athleteId: string,
  disqualifiedWorkoutId: string,
): Promise<ProgressionShadowReplacementRecord | null> {
  const db = await openOpsDb()
  try {
    const tx = db.transaction(REPLACEMENTS_STORE, 'readonly')
    const value = await requestToPromise(tx.objectStore(REPLACEMENTS_STORE).get(`${athleteId}:${disqualifiedWorkoutId}`))
    await transactionDone(tx)
    return (value as ProgressionShadowReplacementRecord | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function progressionShadowRecordReplacementWorkout(
  input: ProgressionShadowReplacementInput,
): Promise<ProgressionShadowReplacementRecord> {
  const athleteId = requiredText(input.athleteId, 'athleteId')
  const disqualifiedWorkoutId = requiredText(input.disqualifiedWorkoutId, 'disqualifiedWorkoutId')
  const replacementWorkoutId = requiredText(input.replacementWorkoutId, 'replacementWorkoutId')
  const reviewerRef = requiredText(input.reviewerRef, 'reviewerRef')
  if (disqualifiedWorkoutId === replacementWorkoutId) throw new Error('Progression Shadow replacement must be a different workout')

  const disposition = await progressionShadowGetReviewDisposition(athleteId, disqualifiedWorkoutId)
  if (!disposition) throw new Error('Progression Shadow replacement requires an immutable disposition')
  const replacementDisposition = await progressionShadowGetReviewDisposition(athleteId, replacementWorkoutId)
  if (replacementDisposition) throw new Error('Progression Shadow replacement workout is itself disqualified')

  const replacementReceipt = await progressionShadowGetPilotReceipt(athleteId, replacementWorkoutId)
  const replacementProvenance = await progressionShadowGetOriginalHookProvenance(athleteId, replacementWorkoutId)
  const replacementHuman = await progressionShadowGetFinalizedHumanReview(athleteId, replacementWorkoutId)
  const replacementStatus = await progressionShadowRebuildFinalizedPilotReview(athleteId, replacementWorkoutId)
  if (!replacementReceipt || !replacementProvenance || !replacementHuman) throw new Error('Progression Shadow replacement requires finalized evidence')
  if (!replacementStatus.eligibleForHumanAcceptedPilotSample) throw new Error('Progression Shadow replacement must be a human-accepted pilot sample')

  const key = `${athleteId}:${disqualifiedWorkoutId}`
  const replacementDigest = await sha256Hex({
    schemaVersion: 'lmf.progression.shadow.replacement.current.v1',
    key,
    athleteId,
    disqualifiedWorkoutId,
    replacementWorkoutId,
    reviewerRef,
    dispositionDigest: disposition.dispositionDigest,
    replacementReceiptDigest: replacementReceipt.evidenceDigest,
    replacementProvenanceDigest: replacementProvenance.provenanceDigest,
    replacementHumanReviewDigest: replacementHuman.humanReviewDigest,
  })

  const existing = await progressionShadowGetReplacementRecord(athleteId, disqualifiedWorkoutId)
  if (existing) {
    if (existing.replacementDigest !== replacementDigest) throw new Error('Progression Shadow replacement is already finalized with different evidence')
    return existing
  }

  const record: ProgressionShadowReplacementRecord = Object.freeze({
    schemaVersion: 'lmf.progression.shadow.replacement.current.v1' as const,
    key,
    athleteId,
    disqualifiedWorkoutId,
    replacementWorkoutId,
    reviewerRef,
    linkedAt: input.linkedAt ?? new Date().toISOString(),
    dispositionDigest: disposition.dispositionDigest,
    replacementReceiptDigest: replacementReceipt.evidenceDigest,
    replacementProvenanceDigest: replacementProvenance.provenanceDigest,
    replacementHumanReviewDigest: replacementHuman.humanReviewDigest,
    replacementDigest,
  })

  const db = await openOpsDb()
  try {
    const tx = db.transaction(REPLACEMENTS_STORE, 'readwrite')
    tx.objectStore(REPLACEMENTS_STORE).add(record)
    try {
      await transactionDone(tx)
      return record
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        const raced = await progressionShadowGetReplacementRecord(athleteId, disqualifiedWorkoutId)
        if (raced?.replacementDigest === replacementDigest) return raced
        throw new Error('Progression Shadow replacement conflict after replay race')
      }
      throw error
    }
  } finally {
    db.close()
  }
}

export async function progressionShadowPilotOperationsBacklog(
  athleteIdInput: string,
): Promise<ProgressionShadowPilotOperationsBacklog> {
  const athleteId = requiredText(athleteIdInput, 'athleteId')
  const receipts = [...await progressionShadowPilotReceiptBacklog(athleteId)]
  const dispositions = await listStoreByAthlete<ProgressionShadowReviewDisposition>(DISPOSITIONS_STORE, athleteId)
  const replacements = await listStoreByAthlete<ProgressionShadowReplacementRecord>(REPLACEMENTS_STORE, athleteId)
  const dispositionByWorkout = new Map(dispositions.map((row) => [row.workoutId, row]))
  const replacementByWorkout = new Map(replacements.map((row) => [row.disqualifiedWorkoutId, row]))
  const pendingHumanReviewWorkoutIds: string[] = []
  const activeAcceptedWorkoutIds: string[] = []
  let greenAcceptedCount = 0
  let yellowAcceptedCount = 0
  let redAcceptedCount = 0

  for (const receipt of receipts) {
    const disposition = dispositionByWorkout.get(receipt.workoutId)
    if (disposition) continue
    const human = await progressionShadowGetFinalizedHumanReview(athleteId, receipt.workoutId)
    const status = await progressionShadowRebuildFinalizedPilotReview(athleteId, receipt.workoutId)
    if (!human && receipt.processingSucceeded && receipt.technicalHealthy && receipt.decisionCoverageClean && receipt.eligibleForRealPilotReview) {
      pendingHumanReviewWorkoutIds.push(receipt.workoutId)
    }
    if (status.eligibleForHumanAcceptedPilotSample) {
      activeAcceptedWorkoutIds.push(receipt.workoutId)
      if (receipt.readiness === 'green') greenAcceptedCount += 1
      else if (receipt.readiness === 'yellow') yellowAcceptedCount += 1
      else if (receipt.readiness === 'red') redAcceptedCount += 1
    }
  }

  const disqualifiedWorkoutIds = dispositions.map((row) => row.workoutId).sort()
  const replacementPendingWorkoutIds = disqualifiedWorkoutIds.filter((workoutId) => !replacementByWorkout.has(workoutId))
  pendingHumanReviewWorkoutIds.sort()
  activeAcceptedWorkoutIds.sort()

  const pilotMinimumRemaining = Math.max(0, 3 - activeAcceptedWorkoutIds.length)
  const evidenceGateSatisfied = Boolean(
    activeAcceptedWorkoutIds.length >= 3 &&
    greenAcceptedCount >= 1 &&
    yellowAcceptedCount >= 1 &&
    replacementPendingWorkoutIds.length === 0,
  )

  return Object.freeze({
    schemaVersion: 'lmf.progression.shadow.operations-backlog.current.v1' as const,
    athleteId,
    receiptCount: receipts.length,
    pendingHumanReviewWorkoutIds: Object.freeze(pendingHumanReviewWorkoutIds),
    disqualifiedWorkoutIds: Object.freeze(disqualifiedWorkoutIds),
    activeAcceptedWorkoutIds: Object.freeze(activeAcceptedWorkoutIds),
    replacementPendingWorkoutIds: Object.freeze(replacementPendingWorkoutIds),
    greenAcceptedCount,
    yellowAcceptedCount,
    redAcceptedCount,
    pilotMinimumRemaining,
    replacementLinksRemaining: replacementPendingWorkoutIds.length,
    evidenceGateSatisfied,
    visibilityAuthorized: false as const,
    autoApplyAllowed: false as const,
  })
}

export async function progressionShadowExportPilotAuditJournal(
  athleteIdInput: string,
  generatedAt = new Date().toISOString(),
): Promise<ProgressionShadowPilotAuditExport> {
  const athleteId = requiredText(athleteIdInput, 'athleteId')
  const receipts = [...await progressionShadowPilotReceiptBacklog(athleteId)]
  const provenance: ProgressionShadowOriginalHookProvenance[] = []
  const humanReviews: ProgressionShadowFinalizedHumanReview[] = []
  for (const receipt of receipts) {
    const provenanceRow = await progressionShadowGetOriginalHookProvenance(athleteId, receipt.workoutId)
    if (provenanceRow) provenance.push(provenanceRow)
    const humanRow = await progressionShadowGetFinalizedHumanReview(athleteId, receipt.workoutId)
    if (humanRow) humanReviews.push(humanRow)
  }
  const dispositions = await listStoreByAthlete<ProgressionShadowReviewDisposition>(DISPOSITIONS_STORE, athleteId)
  const replacements = await listStoreByAthlete<ProgressionShadowReplacementRecord>(REPLACEMENTS_STORE, athleteId)
  const backlog = await progressionShadowPilotOperationsBacklog(athleteId)

  const byWorkout = <T extends { workoutId?: string; disqualifiedWorkoutId?: string }>(a: T, b: T) =>
    (a.workoutId ?? a.disqualifiedWorkoutId ?? '').localeCompare(b.workoutId ?? b.disqualifiedWorkoutId ?? '')
  receipts.sort((a, b) => a.workoutId.localeCompare(b.workoutId))
  provenance.sort((a, b) => a.workoutId.localeCompare(b.workoutId))
  humanReviews.sort((a, b) => a.workoutId.localeCompare(b.workoutId))
  dispositions.sort(byWorkout)
  replacements.sort(byWorkout)

  const content = {
    schemaVersion: 'lmf.progression.shadow.audit-export.current.v1' as const,
    athleteId,
    receipts,
    provenance,
    humanReviews,
    dispositions,
    replacements,
    backlog,
  }
  const contentDigest = await sha256Hex(content)
  return Object.freeze({
    ...content,
    generatedAt,
    receipts: Object.freeze(receipts),
    provenance: Object.freeze(provenance),
    humanReviews: Object.freeze(humanReviews),
    dispositions: Object.freeze(dispositions),
    replacements: Object.freeze(replacements),
    contentDigest,
  })
}
TS

echo "LetMeFly Progression Shadow Stage-6 pilot operations hardening: APPLIED"
