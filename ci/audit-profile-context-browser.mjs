import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const root = path.resolve(import.meta.dirname, '..'), app = path.join(root, '.build-src/letmefly_app')
const { chromium } = createRequire(path.join(app, 'package.json'))('playwright-core')
const out = path.join(app, 'PROFILE_CONTEXT_AUDIT'); fs.mkdirSync(out, { recursive: true })
const report = { result: 'PASS', checks: [] }
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const data = await new Promise((resolve, reject) => { const names = Array.from(db.objectStoreNames), tx = db.transaction(names, 'readonly'), data = {}; tx.oncomplete = () => resolve(data); tx.onerror = () => reject(tx.error); for (const name of names) { const r = tx.objectStore(name).getAll(); r.onsuccess = () => { data[name] = r.result } } }); db.close(); return data
  })
}
const profileFile = (athleteId, fields) => ({ name: 'qa.letmefly-profile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'letmefly-athlete-profile', formatVersion: 1, athleteId, profileContext: fields })) })
try {
  for (const width of [412, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' })
    await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:4173/') ? route.continue() : route.abort())
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' })
    const create = page.getByRole('button', { name: /CREATE LOCAL ATHLETE/i }); await create.waitFor({ state: 'visible' })
    const modal = create.locator('xpath=ancestor::*[contains(@class,"modal")][1]')
    await modal.locator('input[type="text"],input:not([type])').first().fill('Profile import QA')
    await create.click(); await create.waitFor({ state: 'hidden' })
    const dismiss = page.getByRole('button', { name: /Not now/i }); if (await dismiss.isVisible()) await dismiss.click()
    await page.goto('http://127.0.0.1:4173/#/profile', { waitUntil: 'domcontentloaded' })
    const section = page.locator('#lmf-profile-v2'); await section.waitFor({ state: 'visible' })
    await page.waitForFunction(() => window.LetMeFlyProfileContext?.version === 1)
    const before = await snapshot(page), athlete = before.athletes.find(a => !a.deleted_at), id = athlete.id
    // Existing native form save must enter the normal sync queue exactly once.
    await section.locator('[data-profile-key="primaryGoal"]').fill('Keep my current goal')
    await section.locator('[data-action="save-profile-v2"]').click()
    await page.waitForFunction(() => document.querySelector('[data-profile-save-status]')?.textContent.includes('queued for sync'))
    let saved = await snapshot(page)
    assert.equal(saved.syncOutbox.length, before.syncOutbox.length + 1)
    const first = saved.syncOutbox.find(row => !before.syncOutbox.some(old => old.operationId === row.operationId))
    assert.equal(first.entityType, 'athletes'); assert.equal(first.entityId, id)
    assert.equal(first.payload.profile_context_v2.primaryGoal, 'Keep my current goal')
    assert.equal(first.localVersion, saved.athletes.find(a => a.id === id)._local.localVersion)
    for (const key of Object.keys(before).filter(key => !['athletes', 'syncOutbox'].includes(key))) assert.deepEqual(saved[key], before[key], `${key} must be preserved`)
    await section.locator('.lmf-profile-import>summary').click()
    const picker = section.locator('[data-profile-import-file]'), importStatus = section.locator('[data-profile-import-status]')
    await picker.setInputFiles(profileFile('another-athlete', { trainingHistory: 'Foreign data' }))
    await importStatus.filter({ hasText: 'different athlete' }).waitFor()
    assert.deepEqual(await snapshot(page), saved)
    await picker.setInputFiles(profileFile(id, { trainingMaxHistory: 'Unsupported' }))
    await importStatus.filter({ hasText: 'unsupported' }).waitFor()
    assert.deepEqual(await snapshot(page), saved)
    const history = 'Experienced lifter <img src=x onerror=alert(1)>'
    await picker.setInputFiles(profileFile(id, { primaryGoal: 'Older goal', trainingHistory: history, equipment: 'Rack' }))
    const preview = section.locator('[data-profile-import-preview]')
    await preview.locator('[data-profile-import-key="trainingHistory"]').waitFor()
    assert.equal(await preview.locator('[data-profile-import-key="primaryGoal"]').isChecked(), false)
    assert.equal(await preview.locator('[data-profile-import-key="trainingHistory"]').isChecked(), true)
    await preview.locator('details').nth(1).locator('summary').click()
    assert.equal(await preview.locator('img').count(), 0)
    assert.deepEqual(await snapshot(page), saved, 'Preview must not write')
    if (await dismiss.isVisible()) await dismiss.click()
    await section.locator('.lmf-profile-import').screenshot({ path: path.join(out, `import-${width}.png`) })
    // A newer form edit must not be replaced by an older import preview.
    await section.locator('[data-profile-key="trainingHistory"]').fill('Newer typing')
    await preview.locator('[data-profile-import-apply]').click()
    await importStatus.filter({ hasText: 'form changed' }).waitFor()
    assert.equal(await section.locator('[data-profile-key="equipment"]').inputValue(), '')
    await section.locator('[data-profile-key="trainingHistory"]').fill('')
    await picker.setInputFiles(profileFile(id, { primaryGoal: 'Older goal', trainingHistory: history, equipment: 'Rack' }))
    await importStatus.filter({ hasText: 'Blank fields' }).waitFor()
    await preview.locator('[data-profile-import-apply]').click()
    await importStatus.filter({ hasText: '2 details loaded' }).waitFor()
    assert.equal(await section.locator('[data-profile-key="primaryGoal"]').inputValue(), 'Keep my current goal')
    assert.deepEqual(await snapshot(page), saved, 'Loading form must not write')
    await section.locator('[data-action="save-profile-v2"]').click()
    await page.waitForFunction(() => document.querySelector('[data-profile-save-status]')?.textContent.includes('queued for sync'))
    const imported = await snapshot(page)
    assert.equal(imported.syncOutbox.length, saved.syncOutbox.length + 1)
    assert.equal(imported.athletes.find(a => a.id === id).profile_context_v2.trainingHistory, history)
    for (const key of Object.keys(saved).filter(key => !['athletes', 'syncOutbox'].includes(key))) assert.deepEqual(imported[key], saved[key], `Import preserves ${key}`)
    await page.reload(); await section.waitFor({ state: 'visible' })
    assert.equal(await section.locator('[data-profile-key="equipment"]').inputValue(), 'Rack')
    await page.goto('http://127.0.0.1:4173/#/coach', { waitUntil: 'domcontentloaded' })
    const coach = page.locator('#lmf-athlete-coach'); await coach.waitFor({ state: 'visible' })
    assert.match(await coach.innerText(), /3 of 9 coaching details saved/)
    await coach.locator('[data-ai-profile] summary').click()
    assert.ok((await coach.innerText()).includes(history)); assert.equal(await coach.locator('[data-ai-profile] img').count(), 0)
    assert.deepEqual(await snapshot(page), imported)
    // Concurrent writers serialize; stale drafts cannot overwrite the winner.
    const race = await page.evaluate(async id => Promise.allSettled([
      window.LetMeFlyProfileContext.save(id, { coachingNotes: 'First writer' }, { coachingNotes: '' }),
      window.LetMeFlyProfileContext.save(id, { coachingNotes: 'Second writer' }, { coachingNotes: '' }),
    ]).then(results => results.map(r => ({ status: r.status, message: r.reason?.message }))), id)
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1)
    assert.match(race.find(r => r.status === 'rejected').message, /changed elsewhere/)
    saved = await snapshot(page)
    const current = saved.athletes.find(a => a.id === id)
    assert.equal(saved.syncOutbox.length, imported.syncOutbox.length + 1)
    // Idempotent repeat: same value is safe even with a stale expected field.
    await page.evaluate(({ id, value }) => window.LetMeFlyProfileContext.save(id, { coachingNotes: value }, { coachingNotes: '' }), { id, value: current.profile_context_v2.coachingNotes })
    assert.deepEqual(await snapshot(page), saved)
    const foreignError = await page.evaluate(async () => { try { await window.LetMeFlyProfileContext.save('foreign', { primaryGoal: 'Wrong athlete' }, { primaryGoal: '' }) } catch (e) { return e.message } })
    assert.match(foreignError, /active athlete changed/); assert.deepEqual(await snapshot(page), saved)
    // Simulate a queue write failure after the athlete put: both must roll back.
    const fault = await page.evaluate(async id => {
      const original = IDBObjectStore.prototype.add
      IDBObjectStore.prototype.add = function (...args) { if (this.name === 'syncOutbox') throw new Error('Injected outbox failure'); return original.apply(this, args) }
      try { await window.LetMeFlyProfileContext.save(id, { strengthGoals: 'Must roll back' }, { strengthGoals: '' }); return 'unexpected success' }
      catch (e) { return e.message }
      finally { IDBObjectStore.prototype.add = original }
    }, id)
    assert.match(fault, /Injected outbox failure/); assert.deepEqual(await snapshot(page), saved)
    assert.deepEqual(errors, [])
    report.checks.push({ viewport: width, result: 'PASS', coverage: ['native save and outbox', 'profile-only import', 'wrong-athlete rejection', 'unsupported field rejection', 'preview and form do not persist', 'current values protected', 'new typing protected', 'literal text', 'reload and Coach', 'all unrelated stores preserved', 'concurrent stale writer rejected', 'idempotent repeat', 'outbox failure rolls back athlete'] })
    await context.close()
  }
} catch (error) { report.result = 'FAIL'; report.error = error.stack; throw error }
finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close() }
console.log(JSON.stringify(report))
