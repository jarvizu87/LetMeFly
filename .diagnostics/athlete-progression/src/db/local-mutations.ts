// LetMeFly Stage 5 — Atomic local mutations + sync outbox

import {
  type DomainStoreName,
  type LocalDomainRecord,
  type SyncOutboxEntry,
  newId,
  openLetMeFlyDb,
  requestToPromise,
  transactionDone,
} from '../db/local-db'

export interface LocalMutationContext {
  athleteId: string
  deviceId: string
}

export type DomainInput<T extends Record<string, unknown>> = T & {
  id?: string
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  revision?: number
  _local?: LocalDomainRecord['_local']
}

export function stripLocalMetadata<T extends Record<string, unknown>>(
  record: T,
): Record<string, unknown> {
  const { _local, ...cloudPayload } = record as T & {
    _local?: unknown
  }
  return cloudPayload
}

export function prepareLocalMutation<T extends Record<string, unknown>>(
  input: DomainInput<T>,
  context: LocalMutationContext,
  existing?: LocalDomainRecord,
): LocalDomainRecord {
  const now = new Date().toISOString()
  const id = input.id ?? existing?.id ?? newId()
  const baseRevision = existing?._local.baseRevision ?? existing?.revision ?? input.revision ?? 0
  const localVersion = (existing?._local.localVersion ?? input._local?.localVersion ?? 0) + 1

  return {
    ...(existing ?? {}),
    ...input,
    id,
    created_at: existing?.created_at ?? input.created_at ?? now,
    updated_at: now,
    deleted_at: input.deleted_at ?? existing?.deleted_at ?? null,
    revision: existing?.revision ?? input.revision ?? 0,
    _local: {
      localVersion,
      baseRevision,
      dirty: true,
      createdOffline: existing?._local.createdOffline ?? (existing?.revision ?? input.revision ?? 0) === 0,
      lastModifiedByDeviceId: context.deviceId,
    },
  }
}

export function makeOutboxEntry(
  storeName: DomainStoreName,
  record: LocalDomainRecord,
  context: LocalMutationContext,
  operation: 'upsert' | 'delete',
): SyncOutboxEntry {
  const now = new Date().toISOString()

  return {
    operationId: newId(),
    athleteId: context.athleteId,
    entityType: storeName,
    entityId: record.id,
    operation,
    baseRevision: record._local.baseRevision,
    localVersion: record._local.localVersion,
    payload: stripLocalMetadata(record),
    deviceId: context.deviceId,
    createdAt: now,
    updatedAt: now,
    attemptCount: 0,
    nextAttemptAt: now,
    status: 'pending',
    lastError: null,
  }
}

export async function putEntityWithOutbox<T extends Record<string, unknown>>(
  storeName: DomainStoreName,
  input: DomainInput<T>,
  context: LocalMutationContext,
): Promise<LocalDomainRecord> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction([storeName, 'syncOutbox'], 'readwrite')
    const store = tx.objectStore(storeName)
    const existing = input.id
      ? await requestToPromise<LocalDomainRecord | undefined>(store.get(input.id))
      : undefined

    const record = prepareLocalMutation(input, context, existing)

    const athleteId =
      (record.athlete_id as string | undefined) ??
      (storeName === 'athletes' ? record.id : undefined)

    if (athleteId !== context.athleteId) {
      tx.abort()
      throw new Error(`Refusing cross-athlete local write to ${storeName}`)
    }

    store.put(record)
    tx.objectStore('syncOutbox').add(
      makeOutboxEntry(
        storeName,
        record,
        context,
        record.deleted_at ? 'delete' : 'upsert',
      ),
    )

    await transactionDone(tx)
    return record
  } finally {
    db.close()
  }
}

export async function softDeleteEntity(
  storeName: DomainStoreName,
  entityId: string,
  context: LocalMutationContext,
): Promise<LocalDomainRecord> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction([storeName, 'syncOutbox'], 'readwrite')
    const store = tx.objectStore(storeName)
    const existing = await requestToPromise<LocalDomainRecord | undefined>(
      store.get(entityId),
    )

    if (!existing) {
      tx.abort()
      throw new Error(`${storeName}/${entityId} does not exist`)
    }

    const athleteId =
      (existing.athlete_id as string | undefined) ??
      (storeName === 'athletes' ? existing.id : undefined)

    if (athleteId !== context.athleteId) {
      tx.abort()
      throw new Error(`Refusing cross-athlete local delete from ${storeName}`)
    }

    const record = prepareLocalMutation(
      {
        ...existing,
        deleted_at: new Date().toISOString(),
      },
      context,
      existing,
    )

    store.put(record)
    tx.objectStore('syncOutbox').add(
      makeOutboxEntry(storeName, record, context, 'delete'),
    )

    await transactionDone(tx)
    return record
  } finally {
    db.close()
  }
}

export interface SyncAcknowledgement {
  operationId: string
  entityType: DomainStoreName
  entityId: string
  localVersion: number
  serverRevision: number
  serverUpdatedAt: string
}

export async function applySyncAcknowledgement(
  ack: SyncAcknowledgement,
): Promise<void> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(
      [ack.entityType, 'syncOutbox'],
      'readwrite',
    )

    const entityStore = tx.objectStore(ack.entityType)
    const outboxStore = tx.objectStore('syncOutbox')

    const current = await requestToPromise<LocalDomainRecord | undefined>(
      entityStore.get(ack.entityId),
    )

    if (current) {
      const ackIsCurrent = current._local.localVersion === ack.localVersion

      entityStore.put({
        ...current,
        revision: Math.max(current.revision, ack.serverRevision),
        updated_at: ackIsCurrent ? ack.serverUpdatedAt : current.updated_at,
        _local: {
          ...current._local,
          baseRevision: Math.max(current._local.baseRevision, ack.serverRevision),
          dirty: ackIsCurrent ? false : current._local.dirty,
          createdOffline: ackIsCurrent ? false : current._local.createdOffline,
        },
      } satisfies LocalDomainRecord)
    }

    outboxStore.delete(ack.operationId)
    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export async function markOutboxAttempt(
  operationId: string,
): Promise<SyncOutboxEntry> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction('syncOutbox', 'readwrite')
    const store = tx.objectStore('syncOutbox')
    const entry = await requestToPromise<SyncOutboxEntry | undefined>(
      store.get(operationId),
    )

    if (!entry) {
      tx.abort()
      throw new Error(`Outbox operation ${operationId} no longer exists`)
    }

    const updated: SyncOutboxEntry = {
      ...entry,
      status: 'syncing',
      attemptCount: entry.attemptCount + 1,
      updatedAt: new Date().toISOString(),
      lastError: null,
    }

    store.put(updated)
    await transactionDone(tx)
    return updated
  } finally {
    db.close()
  }
}

export async function markOutboxRetry(
  operationId: string,
  error: unknown,
  retryAfterMs: number,
): Promise<void> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction('syncOutbox', 'readwrite')
    const store = tx.objectStore('syncOutbox')
    const entry = await requestToPromise<SyncOutboxEntry | undefined>(
      store.get(operationId),
    )

    if (!entry) {
      await transactionDone(tx)
      return
    }

    store.put({
      ...entry,
      status: 'retry',
      updatedAt: new Date().toISOString(),
      nextAttemptAt: new Date(Date.now() + retryAfterMs).toISOString(),
      lastError: error instanceof Error ? error.message : String(error),
    } satisfies SyncOutboxEntry)

    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export async function markOutboxConflict(
  operationId: string,
  message = 'Remote revision changed',
): Promise<void> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction('syncOutbox', 'readwrite')
    const store = tx.objectStore('syncOutbox')
    const entry = await requestToPromise<SyncOutboxEntry | undefined>(
      store.get(operationId),
    )

    if (!entry) {
      await transactionDone(tx)
      return
    }

    store.put({
      ...entry,
      status: 'conflict',
      updatedAt: new Date().toISOString(),
      lastError: message,
    } satisfies SyncOutboxEntry)

    await transactionDone(tx)
  } finally {
    db.close()
  }
}
