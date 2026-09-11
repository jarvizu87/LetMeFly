import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const root = path.resolve(import.meta.dirname, '..'), app = path.join(root, '.build-src/letmefly_app')
const { chromium } = createRequire(path.join(app, 'package.json'))('playwright-core')
const base = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
const out = path.join(app, 'BARBELL_SETTINGS_AUDIT'); fs.mkdirSync(out, { recursive: true })
const report = { result: 'PASS', checks: [] }
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
try {
  for (const width of [412, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' })
    await context.route('**/*', route => route.request().url().startsWith(`${base}/`) ? route.continue() : route.abort())
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    const create = page.getByRole('button', { name: /CREATE LOCAL ATHLETE/i }); await create.waitFor()
    await create.locator('xpath=ancestor::*[contains(@class,"modal")][1]').locator('input[type="text"],input:not([type])').first().fill('Barbell settings QA')
    await create.click(); await create.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => window.LetMeFlyBarbellSettings?.version === 1 && window.LetMeFlyBarLoader)
    // Reproduce the legacy behavior: merely closing saved full defaults.
    await page.evaluate(() => {
      window.LetMeFlyBarLoader.open({ target: 155, unit: 'lb' })
      document.querySelector('[data-lmf-bar-close="button"]').click()
      const stored = JSON.parse(localStorage.getItem('letmefly-bar-loader-v1'))
      if (stored.pairsLb['55'] !== 2 || stored.inventoryConfirmedLb !== undefined) throw new Error('Legacy auto-save fixture differs')
    })
    // Seed only a disposable athlete's confirmed denominations, not quantities.
    await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      const tx = db.transaction('athletePreferences', 'readwrite'), store = tx.objectStore('athletePreferences')
      const rows = await new Promise((resolve, reject) => { const r = store.getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      store.put({ ...rows[0], weight_unit: 'lb', preferences: { ...rows[0].preferences, barbell: { barWeight: 45, plates: [45, 25, 10, 5, 2.5] } } })
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }); db.close()
      await window.LetMeFlyBarbellSettings.refresh()
      window.LetMeFlyBarLoader.open({ target: 155, unit: 'lb', exerciseName: 'Deadlift' })
    })
    const modal = page.locator('.lmf-bar-loader-root'); await modal.waitFor()
    assert.equal(await modal.locator('#lmf-bar-weight').inputValue(), '45')
    assert.match(await modal.locator('#lmf-bar-result').innerText(), /Confirm how many pairs/)
    for (const plate of ['55', '35', '1.25']) assert.equal(await modal.locator(`[data-lmf-plate="${plate}"]`).inputValue(), '0')
    await modal.locator('.lmf-bar-inventory>summary').click()
    for (const [plate, count] of Object.entries({ '45': 2, '25': 1, '10': 2, '5': 1, '2.5': 1 })) await modal.locator(`[data-lmf-plate="${plate}"]`).fill(String(count))
    assert.match(await modal.locator('#lmf-bar-result').innerText(), /Confirm how many pairs/, 'Typing drafts must not imply confirmation')
    await modal.locator('[data-lmf-confirm-inventory]').click()
    for (const target of [155, 170, 180, 190]) {
      await modal.locator('#lmf-bar-target').fill(String(target))
      assert.equal((await modal.locator('.lmf-load-status').innerText()).trim(), 'EXACT')
      const plates = (await modal.locator('.lmf-bar-per-side strong').innerText()).split(' + ').map(Number)
      assert.ok(plates.every(plate => [45, 25, 10, 5, 2.5].includes(plate)))
      assert.equal(45 + 2 * plates.reduce((a,b) => a+b, 0), target)
    }
    // Exercise the inline presentation reader with the same confirmed utility
    // settings. This disposable DOM row never enters workout persistence.
    await page.evaluate(() => {
      const fixture = document.createElement('div'); fixture.dataset.barbellQa = ''
      fixture.innerHTML = '<article class="active-exercise"><div class="exercise-title"><h3>Deadlift</h3></div><div class="set-row" data-set-id="presentation-only"><div class="load-field"><input class="load-input" value="190"><small>lb</small></div><div class="lmf-plates-line"><strong>Initial</strong></div></div></article>'
      document.body.appendChild(fixture)
      window.dispatchEvent(new Event('lmf:barbell-inventory-saved'))
    })
    await page.waitForFunction(() => document.querySelector('[data-barbell-qa] .lmf-plates-line strong')?.textContent === '45 lb bar • per side: 45 + 25 + 2.5')
    await page.evaluate(() => document.querySelector('[data-barbell-qa]').remove())
    await modal.screenshot({ path: path.join(out, `confirmed-${width}.png`) })
    await modal.locator('#lmf-bar-weight').fill('35')
    await modal.locator('[data-lmf-bar-close="button"]').click()
    await page.reload(); await page.waitForFunction(() => window.LetMeFlyBarbellSettings && window.LetMeFlyBarLoader)
    await page.evaluate(async () => { await window.LetMeFlyBarbellSettings.refresh(); window.LetMeFlyBarLoader.open({ target: 155, unit: 'lb' }) })
    assert.equal(await modal.locator('#lmf-bar-weight').inputValue(), '35', 'Device override must survive athlete defaults and reload')
    await modal.locator('#lmf-bar-unit').selectOption('kg')
    assert.equal(await modal.locator('#lmf-bar-weight').inputValue(), '20', 'Lb bar must not be relabeled as kg')
    await modal.locator('[data-lmf-bar-close="button"]').click()
    // Native workout creation and the real card tool: no manual enhancer call.
    await page.evaluate(async () => {
      localStorage.removeItem('letmefly-bar-loader-v1')
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('letmefly-private'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      const tx = db.transaction('programInstances', 'readwrite'), store = tx.objectStore('programInstances')
      const rows = await new Promise((resolve, reject) => { const r = store.getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      store.put({ ...rows.find(row => row.status === 'active'), current_week: 1, current_day_key: 'day-4' })
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) }); db.close()
    })
    await page.goto(`${base}/#/train`); await page.reload()
    await page.locator('.readiness-field').first().waitFor()
    const dismiss = page.getByRole('button', { name: /Dismiss install prompt/i }); if (await dismiss.isVisible()) await dismiss.click()
    await page.evaluate(() => {
      for (const input of document.querySelectorAll('.readiness-field input[type="radio"][value="4"]')) {
        input.checked = true; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await page.locator('[data-action="start-workout"]').first().click()
    await page.locator('.active-exercise').first().waitFor({ state: 'attached' })
    const sectionB = page.getByRole('button', { name: 'B', exact: true }); if (await sectionB.count()) await sectionB.first().click()
    const deadlift = page.locator('.active-exercise').filter({ has: page.locator('.exercise-title h3', { hasText: /^Deadlift$/ }) })
    await deadlift.locator('[data-lmf-bar-loader-open="exercise"]').waitFor({ state: 'visible', timeout: 10000 })
    assert.deepEqual(await deadlift.locator('.load-input').evaluateAll(inputs => inputs.map(input => input.value)), ['155', '170', '180', '190'])
    await page.waitForFunction(() => [...document.querySelectorAll('.active-exercise')].find(card => card.querySelector('h3')?.textContent === 'Deadlift')?.querySelector('.lmf-plates-line strong')?.textContent.includes('confirm plate counts'))
    await deadlift.locator('[data-lmf-bar-loader-open="exercise"]').click()
    assert.equal(await modal.locator('#lmf-bar-target').inputValue(), '155')
    assert.equal(await modal.locator('#lmf-bar-weight').inputValue(), '45')
    assert.equal((await modal.locator('.lmf-bar-context strong').innerText()).trim(), 'Deadlift')
    await modal.screenshot({ path: path.join(out, `workout-card-${width}.png`) })
    assert.deepEqual(errors, [])
    report.checks.push({ viewport: width, result: 'PASS', coverage: ['native athlete preference bridge', 'legacy auto-saved defaults do not imply confirmed quantities', 'known denominations without invented counts', 'explicit count confirmation', '155/170/180/190 lb exact plate math', 'inline helper shares utility settings', 'no unsupported plate suggestions', 'device override and reload', 'kg utility fallback', 'native Day 4 start → actual Deadlift card → prefilled 155 lb Bar Loader without manual refresh'] })
    await context.close()
  }
} catch (error) { report.result = 'FAIL'; report.error = error.stack; throw error }
finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close() }
console.log(JSON.stringify(report))
