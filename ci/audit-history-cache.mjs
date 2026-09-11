import test from 'node:test'
import assert from 'node:assert/strict'
import { createHistoryCache } from '../overlays/athlete-insights-v1/history-cache.mjs'

function controlledSource() {
  let waiting = null
  const attempts = []
  return {
    read: () => new Promise((resolve, reject) => {
      const attempt = { resolve, reject }
      if (waiting) { const notify = waiting; waiting = null; notify(attempt) }
      else attempts.push(attempt)
    }),
    next: () => attempts.length ? Promise.resolve(attempts.shift()) : new Promise(resolve => { waiting = resolve }),
  }
}

test('refresh after a program write does not return an older in-flight snapshot', async () => {
  const source = controlledSource(), cache = createHistoryCache(source.read)
  const initial = cache.get(), oldRead = await source.next()
  const refreshed = cache.get({ force: true })
  oldRead.resolve({ athlete: 'A', week: 1 })
  const freshRead = await source.next()
  freshRead.resolve({ athlete: 'A', week: 2 })
  assert.deepEqual(await refreshed, { athlete: 'A', week: 2 })
  assert.deepEqual(await initial, { athlete: 'A', week: 2 })
})

test('concurrent forced refreshes coalesce after the latest invalidation', async () => {
  const source = controlledSource(), cache = createHistoryCache(source.read)
  const initial = cache.get(), oldRead = await source.next()
  const readers = [cache.get({ force: true }), cache.get({ force: true }), cache.get()]
  oldRead.resolve('stale')
  const freshRead = await source.next(); freshRead.resolve('current')
  assert.deepEqual(await Promise.all([initial, ...readers]), Array(4).fill('current'))
})

test('route or athlete invalidation discards an older read without requiring a force caller', async () => {
  const source = controlledSource(), cache = createHistoryCache(source.read)
  const initial = cache.get(), oldRead = await source.next()
  cache.invalidate()
  oldRead.resolve({ athlete: 'A' })
  const freshRead = await source.next(); freshRead.resolve({ athlete: 'B' })
  assert.deepEqual(await initial, { athlete: 'B' })
})

test('a failed obsolete read cannot replace a newer requested context with an error', async () => {
  const source = controlledSource(), cache = createHistoryCache(source.read)
  const initial = cache.get(), oldRead = await source.next()
  const refreshed = cache.get({ force: true })
  oldRead.reject(new Error('Old connection closed'))
  const freshRead = await source.next(); freshRead.resolve('new context')
  assert.deepEqual(await Promise.all([initial, refreshed]), ['new context', 'new context'])
})

test('current errors are reported and later reads can recover', async () => {
  let fail = true
  const cache = createHistoryCache(async () => { if (fail) throw new Error('Unavailable'); return 'recovered' })
  await assert.rejects(cache.get(), /Unavailable/)
  fail = false
  assert.equal(await cache.get(), 'recovered')
})

test('empty history is a completed read and the cache refreshes when it expires', async () => {
  let clock = 1000, calls = 0
  const cache = createHistoryCache(async () => { calls++; return null }, { now: () => clock })
  assert.equal(await cache.get(), null)
  assert.equal(await cache.get(), null)
  assert.equal(calls, 1)
  clock += 3001
  assert.equal(await cache.get(), null)
  assert.equal(calls, 2)
})
