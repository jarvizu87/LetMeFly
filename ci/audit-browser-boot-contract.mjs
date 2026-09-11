#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { applicationBootState } from './browser-boot-contract.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, '.build-src/letmefly_app')
const { chromium } = createRequire(path.join(target, 'package.json'))('playwright-core')
if (!process.env.CHROME_BIN) throw new Error('CHROME_BIN is required')
const output = path.join(target, 'BROWSER_SMOKE_AUDIT', 'boot-contract')
fs.mkdirSync(output, {recursive:true})
const report = {result:'RUNNING', passes:[], failures:[]}
const browser = await chromium.launch({executablePath:process.env.CHROME_BIN, headless:true, args:['--no-sandbox','--disable-dev-shm-usage']})
const form = '<div id="app"><div class="app-shell"><div class="modal-backdrop"><input id="onboard-name"><button data-action="create-athlete">Create Local Athlete</button></div></div></div>'
const shell = '<div id="app"><div class="app-shell"><main><section>Today’s workout</section></main><nav><a href="#/home">Home</a><a href="#/train">Train</a></nav></div></div>'
async function test(name, fn) {
  const page = await browser.newPage()
  try { await fn(page); report.passes.push(name); console.log('PASS ' + name) }
  catch(error){report.failures.push({name,error:error.stack});console.log('FAIL ' + name + ': ' + error.message)}
  finally {await page.close()}
}
try {
  for (const [name, html] of [
    ['blank root', '<div id="app"></div>'],
    ['brand-only placeholder','<div id="app">LETMEFLY</div>'],
    ['standalone install prompt','<div id="app"></div><div>Install LetMeFly<button>Not now</button></div>'],
    ['missing name field',form.replace('<input id="onboard-name">','')],
    ['disabled create button',form.replace('data-action="create-athlete"','data-action="create-athlete" disabled')],
    ['disabled name field',form.replace('id="onboard-name"','id="onboard-name" disabled')],
    ['hidden onboarding',form.replace('class="app-shell"','class="app-shell" style="display:none"')],
    ['empty shell',shell.replace('<section>Today’s workout</section>','')],
    ['missing navigation',shell.replace('<a href="#/train">Train</a>','')],
  ]) await test('Reject ' + name,async page=>{await page.setContent(html);assert.equal(await page.evaluate(applicationBootState),false)})
  await test('Accept usable first-run form',async page=>{await page.setContent(form);assert.equal(await page.evaluate(applicationBootState),'first-run athlete form')})
  await test('Accept content and real navigation',async page=>{await page.setContent(shell);assert.equal(await page.evaluate(applicationBootState),'application content and navigation')})
  await test('Wait through branded install-only and blank transition until usable form',async page=>{
    await page.setContent('<div id="app"></div><div id="install">Install LetMeFly<button>Not now</button></div>')
    await page.evaluate(html=>{
      setTimeout(()=>document.querySelector('#install').remove(),100)
      setTimeout(()=>document.body.innerHTML=html,600)
    },form)
    const ready=await page.waitForFunction(applicationBootState,null,{timeout:2500})
    assert.equal(await ready.jsonValue(),'first-run athlete form');await ready.dispose()
  })
  await test('Permanently blank app still times out',async page=>{
    await page.setContent('<div id="app"></div>')
    await assert.rejects(page.waitForFunction(applicationBootState,null,{timeout:250}), /Timeout/)
  })
} finally {
  await browser.close()
  report.result=report.failures.length||report.passes.length!==13?'FAIL':'PASS'
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n')
}
if(report.result!=='PASS')process.exitCode=1
