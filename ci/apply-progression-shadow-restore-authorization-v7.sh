#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR/.build-src/letmefly_app}"

if [[ ! -f "$TARGET/src/services/progression-shadow-pilot-operations.ts" ]]; then
  echo "Stage 7 requires the Stage-6 pilot operations layer" >&2
  exit 1
fi

cat > "$TARGET/src/services/progression-shadow-restore-authorization.ts" <<'TS'
/**
 * LetMeFly Progression Shadow — Stage 7 verified restore + authorization boundary.
 *
 * Restores only derived pilot QA packages into isolated QA storage. It never
 * writes canonical athlete/workout/program state. Visibility authorization is a
 * separate explicit operator action and cannot be derived from evidence alone.
 */
import type { ProgressionShadowPilotAuditExport } from './progression-shadow-pilot-operations'

const RESTORE_DB_NAME = 'letmefly.progression.shadow.pilot.restore.v1'
const RESTORE_DB_VERSION = 1
const PACKAGES_STORE = 'packages'
const AUTH_STORE = 'authorizations'
const EXPORT_SCHEMA = 'lmf.progression.shadow.audit-export.current.v1'

export interface ProgressionShadowRestoredAuditPackage {
  schemaVersion: 'lmf.progression.shadow.restore.current.v1'
  key: string
  athleteId: string
  contentDigest: string
  restoredAt: string
  sourceSchemaVersion: 'lmf.progression.shadow.audit-export.current.v1'
  rebuiltBacklog: ProgressionShadowPilotAuditExport['backlog']
  package: ProgressionShadowPilotAuditExport
  restoreDigest: string
}

export interface ProgressionShadowOperatorAuthorizationInput {
  athleteId: string
  contentDigest: string
  operatorRef: string
  operatorIntent: 'AUTHORIZE_VISIBLE_PILOT'
  realPilotEvidenceConfirmed: true
  authorizedAt?: string
  notes?: string
}

export interface ProgressionShadowOperatorAuthorization {
  schemaVersion: 'lmf.progression.shadow.operator-authorization.current.v1'
  key: string
  athleteId: string
  contentDigest: string
  operatorRef: string
  operatorIntent: 'AUTHORIZE_VISIBLE_PILOT'
  realPilotEvidenceConfirmed: true
  authorizedAt: string
  notes: string | null
  restoreDigest: string
  authorizationDigest: string
}

export interface ProgressionShadowAuthorizationStatus {
  athleteId: string
  contentDigest: string
  restoredPackagePresent: boolean
  evidenceGateSatisfied: boolean
  operatorAuthorizationPresent: boolean
  operatorAuthorizationMatchesRestore: boolean
  realPilotEvidenceConfirmed: boolean
  visibilityAuthorized: boolean
  autoApplyAllowed: false
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Progression Shadow Stage-7 request failed'))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Progression Shadow Stage-7 transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('Progression Shadow Stage-7 transaction aborted'))
  })
}

function openRestoreDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RESTORE_DB_NAME, RESTORE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PACKAGES_STORE)) {
        const store = db.createObjectStore(PACKAGES_STORE, { keyPath: 'key' })
        store.createIndex('by-athlete', 'athleteId', { unique: false })
        store.createIndex('by-content-digest', 'contentDigest', { unique: true })
      }
      if (!db.objectStoreNames.contains(AUTH_STORE)) {
        const store = db.createObjectStore(AUTH_STORE, { keyPath: 'key' })
        store.createIndex('by-athlete', 'athleteId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Progression Shadow Stage-7 database open failed'))
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

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Progression Shadow Stage 7 requires ${label}`)
  return value.trim()
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  const left = sortedUnique(a)
  const right = sortedUnique(b)
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function exportContent(pkg: ProgressionShadowPilotAuditExport) {
  return {
    schemaVersion: pkg.schemaVersion,
    athleteId: pkg.athleteId,
    receipts: pkg.receipts,
    provenance: pkg.provenance,
    humanReviews: pkg.humanReviews,
    dispositions: pkg.dispositions,
    replacements: pkg.replacements,
    backlog: pkg.backlog,
  }
}

function assertRowAthlete(rows: readonly any[], athleteId: string, label: string): void {
  for (const row of rows) {
    if (!row || row.athleteId !== athleteId) throw new Error(`Progression Shadow restore ${label} athlete mismatch`)
  }
}

function assertUnique(rows: readonly any[], key: (row: any) => string, label: string): void {
  const seen = new Set<string>()
  for (const row of rows) {
    const value = key(row)
    if (!value || seen.has(value)) throw new Error(`Progression Shadow restore duplicate ${label}`)
    seen.add(value)
  }
}

export function progressionShadowRebuildAuditBacklogFromPackage(
  pkg: ProgressionShadowPilotAuditExport,
): ProgressionShadowPilotAuditExport['backlog'] {
  const athleteId = requiredText(pkg.athleteId, 'athleteId')
  const receipts = [...pkg.receipts]
  const provenance = new Map(pkg.provenance.map((row) => [row.workoutId, row]))
  const humanReviews = new Map(pkg.humanReviews.map((row) => [row.workoutId, row]))
  const dispositions = new Map(pkg.dispositions.map((row) => [row.workoutId, row]))
  const replacements = new Map(pkg.replacements.map((row) => [row.disqualifiedWorkoutId, row]))

  const pendingHumanReviewWorkoutIds: string[] = []
  const activeAcceptedWorkoutIds: string[] = []
  let greenAcceptedCount = 0
  let yellowAcceptedCount = 0
  let redAcceptedCount = 0

  for (const receipt of receipts) {
    const prov = provenance.get(receipt.workoutId)
    const human = humanReviews.get(receipt.workoutId)
    if (prov && !human) pendingHumanReviewWorkoutIds.push(receipt.workoutId)
    if (dispositions.has(receipt.workoutId)) continue

    const provenanceClean = Boolean(prov && prov.originalReceiptDigest === receipt.evidenceDigest)
    const humanMatchesMachine = Boolean(
      human &&
      provenanceClean &&
      human.originalReceiptDigest === receipt.evidenceDigest &&
      human.provenanceDigest === prov?.provenanceDigest &&
      human.expectedReadiness === receipt.readiness &&
      human.expectedCoreRequiredUnits === receipt.coreRequiredUnits &&
      human.expectedCoreCompletedUnits === receipt.coreCompletedUnits &&
      human.expectedDecisionCoverageClean === receipt.decisionCoverageClean &&
      human.verdict === 'agree',
    )
    const accepted = Boolean(
      receipt.processingSucceeded &&
      receipt.technicalHealthy &&
      receipt.decisionCoverageClean &&
      receipt.eligibleForRealPilotReview &&
      provenanceClean &&
      humanMatchesMachine,
    )
    if (!accepted) continue
    activeAcceptedWorkoutIds.push(receipt.workoutId)
    if (receipt.readiness === 'green') greenAcceptedCount += 1
    if (receipt.readiness === 'yellow') yellowAcceptedCount += 1
    if (receipt.readiness === 'red') redAcceptedCount += 1
  }

  const disqualifiedWorkoutIds = sortedUnique([...dispositions.keys()])
  const replacementPendingWorkoutIds = disqualifiedWorkoutIds.filter((workoutId) => !replacements.has(workoutId))
  const active = sortedUnique(activeAcceptedWorkoutIds)
  const pilotMinimumRemaining = Math.max(0, 3 - active.length)
  const replacementLinksRemaining = replacementPendingWorkoutIds.length
  const evidenceGateSatisfied = Boolean(
    active.length >= 3 &&
    greenAcceptedCount >= 1 &&
    yellowAcceptedCount >= 1 &&
    replacementLinksRemaining === 0,
  )

  return Object.freeze({
    schemaVersion: 'lmf.progression.shadow.operations-backlog.current.v1' as const,
    athleteId,
    receiptCount: receipts.length,
    pendingHumanReviewWorkoutIds: Object.freeze(sortedUnique(pendingHumanReviewWorkoutIds)),
    disqualifiedWorkoutIds: Object.freeze(disqualifiedWorkoutIds),
    activeAcceptedWorkoutIds: Object.freeze(active),
    replacementPendingWorkoutIds: Object.freeze(sortedUnique(replacementPendingWorkoutIds)),
    greenAcceptedCount,
    yellowAcceptedCount,
    redAcceptedCount,
    pilotMinimumRemaining,
    replacementLinksRemaining,
    evidenceGateSatisfied,
    visibilityAuthorized: false as const,
    autoApplyAllowed: false as const,
  })
}

function backlogEquivalent(
  expected: ProgressionShadowPilotAuditExport['backlog'],
  rebuilt: ProgressionShadowPilotAuditExport['backlog'],
): boolean {
  return (
    expected.schemaVersion === rebuilt.schemaVersion &&
    expected.athleteId === rebuilt.athleteId &&
    expected.receiptCount === rebuilt.receiptCount &&
    sameStrings(expected.pendingHumanReviewWorkoutIds, rebuilt.pendingHumanReviewWorkoutIds) &&
    sameStrings(expected.disqualifiedWorkoutIds, rebuilt.disqualifiedWorkoutIds) &&
    sameStrings(expected.activeAcceptedWorkoutIds, rebuilt.activeAcceptedWorkoutIds) &&
    sameStrings(expected.replacementPendingWorkoutIds, rebuilt.replacementPendingWorkoutIds) &&
    expected.greenAcceptedCount === rebuilt.greenAcceptedCount &&
    expected.yellowAcceptedCount === rebuilt.yellowAcceptedCount &&
    expected.redAcceptedCount === rebuilt.redAcceptedCount &&
    expected.pilotMinimumRemaining === rebuilt.pilotMinimumRemaining &&
    expected.replacementLinksRemaining === rebuilt.replacementLinksRemaining &&
    expected.evidenceGateSatisfied === rebuilt.evidenceGateSatisfied &&
    expected.visibilityAuthorized === false &&
    expected.autoApplyAllowed === false
  )
}

export async function progressionShadowVerifyAuditPackage(
  pkg: ProgressionShadowPilotAuditExport,
): Promise<ProgressionShadowPilotAuditExport['backlog']> {
  if (!pkg || pkg.schemaVersion !== EXPORT_SCHEMA) throw new Error('Progression Shadow restore schema mismatch')
  const athleteId = requiredText(pkg.athleteId, 'athleteId')
  if (!/^[a-f0-9]{64}$/.test(pkg.contentDigest)) throw new Error('Progression Shadow restore digest format invalid')
  const computed = await sha256Hex(exportContent(pkg))
  if (computed !== pkg.contentDigest) throw new Error('Progression Shadow restore content digest mismatch')

  assertRowAthlete(pkg.receipts, athleteId, 'receipt')
  assertRowAthlete(pkg.provenance, athleteId, 'provenance')
  assertRowAthlete(pkg.humanReviews, athleteId, 'human review')
  assertRowAthlete(pkg.dispositions, athleteId, 'disposition')
  assertRowAthlete(pkg.replacements, athleteId, 'replacement')
  assertUnique(pkg.receipts, (row) => row.workoutId, 'receipt workout')
  assertUnique(pkg.provenance, (row) => row.workoutId, 'provenance workout')
  assertUnique(pkg.humanReviews, (row) => row.workoutId, 'human-review workout')
  assertUnique(pkg.dispositions, (row) => row.workoutId, 'disposition workout')
  assertUnique(pkg.replacements, (row) => row.disqualifiedWorkoutId, 'replacement source workout')

  const rebuilt = progressionShadowRebuildAuditBacklogFromPackage(pkg)
  if (!backlogEquivalent(pkg.backlog, rebuilt)) throw new Error('Progression Shadow restore rebuilt backlog mismatch')
  return rebuilt
}

export async function progressionShadowGetRestoredAuditPackage(
  athleteId: string,
  contentDigest: string,
): Promise<ProgressionShadowRestoredAuditPackage | null> {
  const db = await openRestoreDb()
  try {
    const tx = db.transaction(PACKAGES_STORE, 'readonly')
    const value = await requestToPromise(tx.objectStore(PACKAGES_STORE).get(`${athleteId}:${contentDigest}`))
    await transactionDone(tx)
    return (value as ProgressionShadowRestoredAuditPackage | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function progressionShadowRestoreAuditPackage(
  pkg: ProgressionShadowPilotAuditExport,
  restoredAt = new Date().toISOString(),
): Promise<ProgressionShadowRestoredAuditPackage> {
  const rebuiltBacklog = await progressionShadowVerifyAuditPackage(pkg)
  const athleteId = pkg.athleteId
  const key = `${athleteId}:${pkg.contentDigest}`
  const restoreDigest = await sha256Hex({
    schemaVersion: 'lmf.progression.shadow.restore.current.v1',
    key,
    athleteId,
    contentDigest: pkg.contentDigest,
    sourceSchemaVersion: pkg.schemaVersion,
    rebuiltBacklog,
  })
  const existing = await progressionShadowGetRestoredAuditPackage(athleteId, pkg.contentDigest)
  if (existing) {
    if (existing.restoreDigest !== restoreDigest) throw new Error('Progression Shadow restore conflict')
    return existing
  }

  const record: ProgressionShadowRestoredAuditPackage = Object.freeze({
    schemaVersion: 'lmf.progression.shadow.restore.current.v1' as const,
    key,
    athleteId,
    contentDigest: pkg.contentDigest,
    restoredAt,
    sourceSchemaVersion: EXPORT_SCHEMA as 'lmf.progression.shadow.audit-export.current.v1',
    rebuiltBacklog,
    package: structuredClone(pkg),
    restoreDigest,
  })
  const db = await openRestoreDb()
  try {
    const tx = db.transaction(PACKAGES_STORE, 'readwrite')
    tx.objectStore(PACKAGES_STORE).add(record)
    try {
      await transactionDone(tx)
      return record
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        const raced = await progressionShadowGetRestoredAuditPackage(athleteId, pkg.contentDigest)
        if (raced?.restoreDigest === restoreDigest) return raced
        throw new Error('Progression Shadow restore conflict after replay race')
      }
      throw error
    }
  } finally {
    db.close()
  }
}

export async function progressionShadowGetOperatorAuthorization(
  athleteId: string,
  contentDigest: string,
): Promise<ProgressionShadowOperatorAuthorization | null> {
  const db = await openRestoreDb()
  try {
    const tx = db.transaction(AUTH_STORE, 'readonly')
    const value = await requestToPromise(tx.objectStore(AUTH_STORE).get(`${athleteId}:${contentDigest}`))
    await transactionDone(tx)
    return (value as ProgressionShadowOperatorAuthorization | undefined) ?? null
  } finally {
    db.close()
  }
}

export async function progressionShadowRecordOperatorAuthorization(
  input: ProgressionShadowOperatorAuthorizationInput,
): Promise<ProgressionShadowOperatorAuthorization> {
  const athleteId = requiredText(input.athleteId, 'athleteId')
  const contentDigest = requiredText(input.contentDigest, 'contentDigest')
  const operatorRef = requiredText(input.operatorRef, 'operatorRef')
  if (input.operatorIntent !== 'AUTHORIZE_VISIBLE_PILOT') throw new Error('Progression Shadow operator intent is invalid')
  if (input.realPilotEvidenceConfirmed !== true) throw new Error('Progression Shadow operator must explicitly confirm real pilot evidence')

  const restored = await progressionShadowGetRestoredAuditPackage(athleteId, contentDigest)
  if (!restored) throw new Error('Progression Shadow authorization requires verified restored evidence')
  if (!restored.rebuiltBacklog.evidenceGateSatisfied) throw new Error('Progression Shadow authorization requires satisfied evidence gate')

  const key = `${athleteId}:${contentDigest}`
  const notes = input.notes?.trim() || null
  const authorizationDigest = await sha256Hex({
    schemaVersion: 'lmf.progression.shadow.operator-authorization.current.v1',
    key,
    athleteId,
    contentDigest,
    operatorRef,
    operatorIntent: input.operatorIntent,
    realPilotEvidenceConfirmed: true,
    notes,
    restoreDigest: restored.restoreDigest,
  })
  const existing = await progressionShadowGetOperatorAuthorization(athleteId, contentDigest)
  if (existing) {
    if (existing.authorizationDigest !== authorizationDigest) throw new Error('Progression Shadow operator authorization is already finalized with different evidence')
    return existing
  }

  const record: ProgressionShadowOperatorAuthorization = Object.freeze({
    schemaVersion: 'lmf.progression.shadow.operator-authorization.current.v1' as const,
    key,
    athleteId,
    contentDigest,
    operatorRef,
    operatorIntent: 'AUTHORIZE_VISIBLE_PILOT' as const,
    realPilotEvidenceConfirmed: true as const,
    authorizedAt: input.authorizedAt ?? new Date().toISOString(),
    notes,
    restoreDigest: restored.restoreDigest,
    authorizationDigest,
  })
  const db = await openRestoreDb()
  try {
    const tx = db.transaction(AUTH_STORE, 'readwrite')
    tx.objectStore(AUTH_STORE).add(record)
    try {
      await transactionDone(tx)
      return record
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        const raced = await progressionShadowGetOperatorAuthorization(athleteId, contentDigest)
        if (raced?.authorizationDigest === authorizationDigest) return raced
        throw new Error('Progression Shadow operator authorization conflict after replay race')
      }
      throw error
    }
  } finally {
    db.close()
  }
}

export async function progressionShadowAuthorizationStatus(
  athleteId: string,
  contentDigest: string,
): Promise<ProgressionShadowAuthorizationStatus> {
  const restored = await progressionShadowGetRestoredAuditPackage(athleteId, contentDigest)
  const authorization = await progressionShadowGetOperatorAuthorization(athleteId, contentDigest)
  const authorizationMatchesRestore = Boolean(
    restored && authorization &&
    authorization.restoreDigest === restored.restoreDigest &&
    authorization.contentDigest === restored.contentDigest &&
    authorization.operatorIntent === 'AUTHORIZE_VISIBLE_PILOT',
  )
  const realPilotEvidenceConfirmed = Boolean(authorization?.realPilotEvidenceConfirmed)
  const evidenceGateSatisfied = Boolean(restored?.rebuiltBacklog.evidenceGateSatisfied)
  return Object.freeze({
    athleteId,
    contentDigest,
    restoredPackagePresent: Boolean(restored),
    evidenceGateSatisfied,
    operatorAuthorizationPresent: Boolean(authorization),
    operatorAuthorizationMatchesRestore: authorizationMatchesRestore,
    realPilotEvidenceConfirmed,
    visibilityAuthorized: Boolean(
      evidenceGateSatisfied &&
      authorizationMatchesRestore &&
      realPilotEvidenceConfirmed,
    ),
    autoApplyAllowed: false as const,
  })
}
TS

echo "LetMeFly Progression Shadow Stage-7 restore + authorization boundary: APPLIED"
