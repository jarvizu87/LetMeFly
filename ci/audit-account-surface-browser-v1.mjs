#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src', 'letmefly_app')
const require = createRequire(path.join(target, 'package.json'))
const { chromium } = require('playwright-core')
const chromeBin = process.env.CHROME_BIN
if (!chromeBin) throw new Error('CHROME_BIN is required')
const baseUrl = process.env.LMF_AUDIT_BASE_URL || 'http://127.0.0.1:4173'
const outDir = path.join(target, 'ACCOUNT_SURFACE_AUDIT')
fs.mkdirSync(outDir, { recursive: true })

const report = { result: 'PASS', failures: [], passes: [], observations: {} }
const pass = (label, detail = '') => { report.passes.push({ label, detail }); console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`) }
const fail = (label, detail = '') => { report.result = 'FAIL'; report.failures.push({ label, detail }); console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }

const browser = await chromium.launch({ headless: true, executablePath: chromeBin, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true })
const page = await context.newPage()

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForSelector('body', { timeout: 10000 })
  await page.waitForFunction(() => /LETMEFLY/i.test(document.body.innerText), null, { timeout: 10000 }).catch(() => null)

  const bodyText = await page.locator('body').innerText()
  report.observations.initialText = bodyText.slice(0, 4000)

  const createLocal = page.getByRole('button', { name: /CREATE LOCAL ATHLETE/i }).first()
  if (await createLocal.isVisible().catch(() => false)) pass('Create Local Athlete is visible on opening screen')
  else fail('Create Local Athlete is visible on opening screen')

  const importBackup = page.getByText(/^\s*Import Backup\s*$/i).first()
  const importInput = page.locator('#onboard-restore-file').first()
  if (await importBackup.isVisible().catch(() => false)) pass('Import Backup is visible on opening screen')
  else fail('Import Backup is visible on opening screen')
  const accept = await importInput.getAttribute('accept').catch(() => null)
  if (await importInput.count() && /json/i.test(accept || '')) pass('Import Backup is wired to a JSON file picker')
  else fail('Import Backup is wired to a JSON file picker', `accept=${accept}`)

  const signIn = page.getByRole('button', { name: /^Sign In$/i }).first()
  const register = page.getByRole('button', { name: /^Register$/i }).first()
  if (await signIn.isVisible().catch(() => false)) pass('Sign In is visible on opening screen')
  else fail('Sign In is visible on opening screen')
  if (await register.isVisible().catch(() => false)) pass('Register is visible on opening screen')
  else fail('Register is visible on opening screen')

  const forgot = page.getByRole('button', { name: /Forgot password\?/i }).first()
  if (await forgot.isVisible().catch(() => false)) pass('Forgot Password is visible from Sign In')
  else fail('Forgot Password is visible from Sign In')

  if (await register.isVisible().catch(() => false)) {
    await register.click({ timeout: 3000 })
    await page.waitForTimeout(150)
    const registerHeading = page.getByRole('heading', { name: /Create your LetMeFly account/i }).first()
    if (await registerHeading.isVisible().catch(() => false)) pass('Register view opens without creating an account')
    else fail('Register view opens without creating an account')
    const createAccount = page.getByRole('button', { name: /CREATE ACCOUNT/i }).first()
    if (await createAccount.count()) pass('Register view exposes Create Account action')
    else fail('Register view exposes Create Account action')
  }

  const signInAgain = page.getByRole('button', { name: /^Sign In$/i }).first()
  if (await signInAgain.isVisible().catch(() => false)) {
    await signInAgain.click({ timeout: 3000 })
    await page.waitForTimeout(150)
  }
  const forgotAgain = page.getByRole('button', { name: /Forgot password\?/i }).first()
  if (await forgotAgain.isVisible().catch(() => false)) {
    await forgotAgain.click({ timeout: 3000 })
    await page.waitForTimeout(150)
    const recoveryHeading = page.getByRole('heading', { name: /Reset your LetMeFly password/i }).first()
    const recoveryForm = page.locator('[data-password-recovery-form], [data-password-form="recovery"]').first()
    if (await recoveryHeading.isVisible().catch(() => false) || await recoveryForm.count()) pass('Forgot Password opens recovery UI without sending email')
    else fail('Forgot Password opens recovery UI without sending email')
  }

  // This audit intentionally does not click Import Backup: the native file chooser
  // and verified restore path are covered by source/restore contracts. It must also
  // never submit account forms or create an athlete as a side effect.
  const athletes = await page.evaluate(async () => {
    if (typeof indexedDB.databases !== 'function') return []
    const dbs = await indexedDB.databases()
    const found = []
    for (const entry of dbs) {
      if (!entry.name) continue
      const rows = await new Promise(resolve => {
        const req = indexedDB.open(entry.name)
        req.onerror = () => resolve([])
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('athletes')) { db.close(); resolve([]); return }
          const tx = db.transaction('athletes', 'readonly')
          const get = tx.objectStore('athletes').getAll()
          get.onerror = () => { db.close(); resolve([]) }
          get.onsuccess = () => { const value = get.result || []; db.close(); resolve(value) }
        }
      })
      found.push(...rows)
    }
    return found
  })
  if (athletes.length === 0) pass('Account surface audit creates no athlete data')
  else fail('Account surface audit creates no athlete data', `${athletes.length} athlete rows appeared`)
} catch (error) {
  fail('Account surface browser audit execution', error instanceof Error ? error.message : String(error))
} finally {
  await page.screenshot({ path: path.join(outDir, 'final.png'), fullPage: true }).catch(() => null)
  await browser.close()
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
if (report.failures.length) process.exit(1)
console.log('LetMeFly account surface browser audit: PASS')
