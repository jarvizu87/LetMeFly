import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
const script = fs.readFileSync(new URL('../overlays/ui-command-v2/batch-s/pwa-update.js', import.meta.url), 'utf8')
function app(controller = null) {
  let reloads = 0
  const listeners = {}, serviceWorker = { controller, addEventListener: (name, fn) => { listeners[name] = fn } }
  vm.runInNewContext(script, { navigator: { serviceWorker }, window: { addEventListener() {}, location: { reload() { reloads++ } } }, document: { addEventListener() {} } })
  return { change(next) { serviceWorker.controller = next; listeners.controllerchange() }, reloads: () => reloads }
}
test('first worker claim preserves first-run inputs; later update reloads once', () => {
  const page = app(), first = {}, second = {}
  page.change(first); assert.equal(page.reloads(),0)
  page.change(first); assert.equal(page.reloads(),0)
  page.change(second); assert.equal(page.reloads(),1)
  page.change({}); assert.equal(page.reloads(),1)
})
test('an already controlled app still refreshes for a new worker', () => {
  const first = {}, page = app(first)
  page.change(first); assert.equal(page.reloads(),0)
  page.change({}); assert.equal(page.reloads(),1)
})
test('loss of controller does not reload into an uncontrolled loop', () => {
  const page = app({}); page.change(null); assert.equal(page.reloads(),0)
  page.change({}); assert.equal(page.reloads(),0)
})
