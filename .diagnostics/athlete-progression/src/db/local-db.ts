// LetMeFly Stage 5 — Native IndexedDB layer
// No external IndexedDB dependency required.

export const LMF_DB_NAME = 'letmefly-private'
export const LMF_DB_VERSION = 1
export const LMF_DOMAIN_SCHEMA_VERSION = 1

export type DomainStoreName =
  | 'athletes'
  | 'athletePreferences'
  | 'athleteGoals'
  | 'athleteEquipment'
  | 'devices'
  | 'trainingMaxHistory'
  | 'programInstances'
  | 'programEvents'
  | 'readinessEntries'
  | 'workoutSessions'
  | 'workoutExercises'
  | 'workoutSets'
  | 'bodyweightEntries'
  | 'personalRecords'
  | 'coachingDecisions'
  | 'exerciseSubstitutions'
  | 'tmRecommendations'

export type LocalOnlyStoreName =
  | 'syncOutbox'
  | 'syncState'
  | 'syncConflicts'
  | 'deviceState'
  | 'meta'
  | 'internalBackups'

export type LmfStoreName = DomainStoreName | LocalOnlyStoreName

export const DOMAIN_STORES: readonly DomainStoreName[] = [
  'athletes',
  'athletePreferences',
  'athleteGoals',
  'athleteEquipment',
  'devices',
  'trainingMaxHistory',
  'programInstances',
  'programEvents',
  'readinessEntries',
  'workoutSessions',
  'workoutExercises',
  'workoutSets',
  'bodyweightEntries',
  'personalRecords',
  'coachingDecisions',
  'exerciseSubstitutions',
  'tmRecommendations',
] as const

export const ALL_STORES: readonly LmfStoreName[] = [
  ...DOMAIN_STORES,
  'syncOutbox',
  'syncState',
  'syncConflicts',
  'deviceState',
  'meta',
  'internalBackups',
] as const

export interface LocalRecordMeta {
  localVersion: number
  baseRevision: number
  dirty: boolean
  createdOffline: boolean
  lastModifiedByDeviceId: string
}

export interface LocalDomainRecord {
  id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  revision: number
  _local: LocalRecordMeta
  [key: string]: unknown
}

export interface DeviceState {
  id: 'current'
  deviceId: string
  createdAt: string
  label?: string
  platform?: string
  appVersion?: string
}

export interface SyncState {
  athleteId: string
  ownerUserId?: string
  deviceId: string
  linkedAt?: string
  lastSuccessfulAuthAt?: string | null
  lastSuccessfulSyncAt?: string | null
  lastChangeSeq: number
  cloudSchemaVersion: number
  bootstrapStatus: 'unlinked' | 'pending' | 'complete'
}

export type SyncOutboxStatus =
  | 'pending'
  | 'syncing'
  | 'retry'
  | 'conflict'
  | 'failed'

export interface SyncOutboxEntry {
  operationId: string
  athleteId: string
  entityType: DomainStoreName
  entityId: string
  operation: 'upsert' | 'delete'
  baseRevision: number
  localVersion: number
  payload: Record<string, unknown>
  deviceId: string
  createdAt: string
  updatedAt: string
  attemptCount: number
  nextAttemptAt: string | null
  status: SyncOutboxStatus
  lastError: string | null
}

export interface SyncConflict {
  conflictId: string
  athleteId: string
  entityType: DomainStoreName
  entityId: string
  localPayload: Record<string, unknown>
  remotePayload: Record<string, unknown>
  baseRevision: number
  remoteRevision: number
  detectedAt: string
  resolvedAt: string | null
  resolution: 'local' | 'remote' | 'merged' | null
}

export interface InternalBackup {
  id: string
  createdAt: string
  reason: 'migration' | 'cloud-bootstrap' | 'manual-internal' | 'legacy-migration' | 'pre-restore'
  dbVersion: number
  domainSchemaVersion: number
  stores: Record<string, unknown[]>
}

type StoreDefinition = {
  keyPath: string
  indexes?: Array<{
    name: string
    keyPath: string | string[]
    options?: IDBIndexParameters
  }>
}

const STORE_DEFINITIONS: Record<LmfStoreName, StoreDefinition> = {
  athletes: {
    keyPath: 'id',
    indexes: [
      { name: 'by-owner', keyPath: 'owner_user_id' },
      { name: 'by-deleted', keyPath: 'deleted_at' },
    ],
  },
  athletePreferences: {
    keyPath: 'id',
    indexes: [{ name: 'by-athlete', keyPath: 'athlete_id' }],
  },
  athleteGoals: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-athlete-status', keyPath: ['athlete_id', 'status'] },
    ],
  },
  athleteEquipment: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-athlete-available', keyPath: ['athlete_id', 'available'] },
    ],
  },
  devices: {
    keyPath: 'id',
    indexes: [{ name: 'by-athlete', keyPath: 'athlete_id' }],
  },
  trainingMaxHistory: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-athlete-exercise', keyPath: ['athlete_id', 'exercise_key'] },
      { name: 'by-effective', keyPath: ['athlete_id', 'exercise_key', 'effective_at'] },
    ],
  },
  programInstances: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-athlete-status', keyPath: ['athlete_id', 'status'] },
    ],
  },
  programEvents: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-program', keyPath: 'program_instance_id' },
      { name: 'by-program-time', keyPath: ['program_instance_id', 'effective_at'] },
    ],
  },
  readinessEntries: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-athlete-time', keyPath: ['athlete_id', 'recorded_at'] },
    ],
  },
  workoutSessions: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-athlete-started', keyPath: ['athlete_id', 'started_at'] },
      { name: 'by-program', keyPath: 'program_instance_id' },
      { name: 'by-status', keyPath: ['athlete_id', 'status'] },
    ],
  },
  workoutExercises: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-session', keyPath: 'workout_session_id' },
      { name: 'by-session-order', keyPath: ['workout_session_id', 'order_index'] },
      { name: 'by-athlete-exercise', keyPath: ['athlete_id', 'exercise_key'] },
    ],
  },
  workoutSets: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-session', keyPath: 'workout_session_id' },
      { name: 'by-exercise', keyPath: 'workout_exercise_id' },
      { name: 'by-exercise-set', keyPath: ['workout_exercise_id', 'set_number'] },
    ],
  },
  bodyweightEntries: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-athlete-time', keyPath: ['athlete_id', 'measured_at'] },
    ],
  },
  personalRecords: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-athlete-exercise', keyPath: ['athlete_id', 'exercise_key'] },
    ],
  },
  coachingDecisions: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-program', keyPath: 'program_instance_id' },
      { name: 'by-session', keyPath: 'workout_session_id' },
    ],
  },
  exerciseSubstitutions: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-original', keyPath: ['athlete_id', 'original_exercise_key'] },
    ],
  },
  tmRecommendations: {
    keyPath: 'id',
    indexes: [
      { name: 'by-athlete', keyPath: 'athlete_id' },
      { name: 'by-exercise', keyPath: ['athlete_id', 'exercise_key'] },
      { name: 'by-status', keyPath: ['athlete_id', 'status'] },
    ],
  },
  syncOutbox: {
    keyPath: 'operationId',
    indexes: [
      { name: 'by-status', keyPath: 'status' },
      { name: 'by-athlete-status', keyPath: ['athleteId', 'status'] },
      { name: 'by-entity', keyPath: ['entityType', 'entityId'] },
      { name: 'by-next-attempt', keyPath: ['status', 'nextAttemptAt'] },
    ],
  },
  syncState: {
    keyPath: 'athleteId',
  },
  syncConflicts: {
    keyPath: 'conflictId',
    indexes: [
      { name: 'by-athlete', keyPath: 'athleteId' },
      { name: 'by-entity', keyPath: ['entityType', 'entityId'] },
      { name: 'by-unresolved', keyPath: ['athleteId', 'resolvedAt'] },
    ],
  },
  deviceState: {
    keyPath: 'id',
  },
  meta: {
    keyPath: 'key',
  },
  internalBackups: {
    keyPath: 'id',
    indexes: [{ name: 'by-created', keyPath: 'createdAt' }],
  },
}

export function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

function createMissingStoresAndIndexes(db: IDBDatabase, tx: IDBTransaction): void {
  for (const [storeName, def] of Object.entries(STORE_DEFINITIONS) as Array<
    [LmfStoreName, StoreDefinition]
  >) {
    let store: IDBObjectStore

    if (!db.objectStoreNames.contains(storeName)) {
      store = db.createObjectStore(storeName, { keyPath: def.keyPath })
    } else {
      store = tx.objectStore(storeName)
    }

    for (const index of def.indexes ?? []) {
      if (!store.indexNames.contains(index.name)) {
        store.createIndex(index.name, index.keyPath, index.options)
      }
    }
  }
}

export function openLetMeFlyDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LMF_DB_NAME, LMF_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      const tx = request.transaction
      if (!tx) throw new Error('Missing IndexedDB upgrade transaction')

      createMissingStoresAndIndexes(db, tx)

      tx.objectStore('meta').put({
        key: 'domainSchemaVersion',
        value: LMF_DOMAIN_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
      })
    }

    request.onsuccess = () => {
      const db = request.result

      db.onversionchange = () => {
        // Another tab/device context is upgrading this origin.
        db.close()
      }

      resolve(db)
    }

    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'))
    request.onblocked = () =>
      reject(new Error('IndexedDB upgrade blocked by another open LetMeFly tab'))
  })
}

export function newId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Secure UUID generation is unavailable in this browser')
  }
  return globalThis.crypto.randomUUID()
}

export async function getOrCreateDeviceState(
  appVersion?: string,
): Promise<DeviceState> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction('deviceState', 'readwrite')
    const store = tx.objectStore('deviceState')
    const existing = await requestToPromise<DeviceState | undefined>(store.get('current'))

    if (existing) {
      const updated: DeviceState = {
        ...existing,
        appVersion: appVersion ?? existing.appVersion,
      }
      store.put(updated)
      await transactionDone(tx)
      return updated
    }

    const created: DeviceState = {
      id: 'current',
      deviceId: newId(),
      createdAt: new Date().toISOString(),
      platform: navigator.userAgent,
      appVersion,
    }

    store.add(created)
    await transactionDone(tx)
    return created
  } finally {
    db.close()
  }
}

export async function getById<T>(
  storeName: LmfStoreName,
  id: IDBValidKey,
): Promise<T | undefined> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(storeName, 'readonly')
    const result = await requestToPromise<T | undefined>(
      tx.objectStore(storeName).get(id),
    )
    await transactionDone(tx)
    return result
  } finally {
    db.close()
  }
}

export async function getAll<T>(storeName: LmfStoreName): Promise<T[]> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(storeName, 'readonly')
    const result = await requestToPromise<T[]>(tx.objectStore(storeName).getAll())
    await transactionDone(tx)
    return result
  } finally {
    db.close()
  }
}

export async function getAllFromIndex<T>(
  storeName: LmfStoreName,
  indexName: string,
  query?: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction(storeName, 'readonly')
    const index = tx.objectStore(storeName).index(indexName)
    const result = await requestToPromise<T[]>(index.getAll(query))
    await transactionDone(tx)
    return result
  } finally {
    db.close()
  }
}

export async function requestPersistentStorage(): Promise<{
  supported: boolean
  persisted: boolean
}> {
  if (!navigator.storage?.persist) {
    return { supported: false, persisted: false }
  }

  const persisted = await navigator.storage.persist()
  return { supported: true, persisted }
}

export async function getStorageEstimate(): Promise<{
  usage?: number
  quota?: number
  percentUsed?: number
}> {
  if (!navigator.storage?.estimate) return {}

  const estimate = await navigator.storage.estimate()
  const percentUsed =
    estimate.usage != null && estimate.quota
      ? (estimate.usage / estimate.quota) * 100
      : undefined

  return {
    usage: estimate.usage,
    quota: estimate.quota,
    percentUsed,
  }
}

export async function createInternalBackup(
  reason: InternalBackup['reason'],
): Promise<InternalBackup> {
  const db = await openLetMeFlyDb()
  try {
    const storesToBackup = ALL_STORES.filter((name) => name !== 'internalBackups')
    const tx = db.transaction(storesToBackup, 'readonly')
    const stores: Record<string, unknown[]> = {}

    const reads = storesToBackup.map(async (storeName) => {
      stores[storeName] = await requestToPromise<unknown[]>(
        tx.objectStore(storeName).getAll(),
      )
    })

    await Promise.all(reads)
    await transactionDone(tx)

    const backup: InternalBackup = {
      id: newId(),
      createdAt: new Date().toISOString(),
      reason,
      dbVersion: LMF_DB_VERSION,
      domainSchemaVersion: LMF_DOMAIN_SCHEMA_VERSION,
      stores,
    }

    const backupTx = db.transaction('internalBackups', 'readwrite')
    backupTx.objectStore('internalBackups').add(backup)
    await transactionDone(backupTx)

    return backup
  } finally {
    db.close()
  }
}

export async function restoreInternalBackup(backup: InternalBackup): Promise<void> {
  if (backup.dbVersion > LMF_DB_VERSION) {
    throw new Error('Backup was created by a newer LetMeFly database version')
  }

  const db = await openLetMeFlyDb()
  try {
    const storeNames = Object.keys(backup.stores).filter((name) =>
      db.objectStoreNames.contains(name),
    ) as LmfStoreName[]

    const tx = db.transaction(storeNames, 'readwrite')

    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName)
      store.clear()

      for (const record of backup.stores[storeName] ?? []) {
        store.put(record)
      }
    }

    await transactionDone(tx)
  } finally {
    db.close()
  }
}

export async function recoverStaleOutboxOperations(
  staleAfterMs = 5 * 60 * 1000,
): Promise<number> {
  const db = await openLetMeFlyDb()
  try {
    const tx = db.transaction('syncOutbox', 'readwrite')
    const store = tx.objectStore('syncOutbox')
    const index = store.index('by-status')
    const syncing = await requestToPromise<SyncOutboxEntry[]>(
      index.getAll('syncing'),
    )

    const cutoff = Date.now() - staleAfterMs
    let recovered = 0

    for (const entry of syncing) {
      const lastTouched = Date.parse(entry.updatedAt)
      if (Number.isFinite(lastTouched) && lastTouched <= cutoff) {
        store.put({
          ...entry,
          status: 'retry',
          nextAttemptAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastError: 'Recovered after interrupted/stale sync attempt',
        } satisfies SyncOutboxEntry)
        recovered += 1
      }
    }

    await transactionDone(tx)
    return recovered
  } finally {
    db.close()
  }
}

export async function wipePrivateDatabase(): Promise<void> {
  const db = await openLetMeFlyDb()
  db.close()

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LMF_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to delete LetMeFly private database'))
    request.onblocked = () =>
      reject(new Error('Private database wipe blocked by another open LetMeFly tab'))
  })
}
