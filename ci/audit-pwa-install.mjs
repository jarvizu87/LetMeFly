import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'

const script = fs.readFileSync(new URL('../overlays/ui-command-v2/batch-s/pwa-install.js', import.meta.url), 'utf8')

function visit({mode = 'browser', ios = false, referrer = '', search = '', storage = new Map(), blockedStorage = false} = {}) {
  const listeners = new Map(), media = new Map(), timers = [], elements = []
  const node = () => {
    const children = new Map(), handlers = new Map()
    return {
      dataset: {}, textContent: '', removed: false,
      setAttribute() {},
      querySelector(selector) { if (!children.has(selector)) children.set(selector, node()); return children.get(selector) },
      addEventListener(name, fn) { handlers.set(name, fn) },
      click() { return handlers.get('click')?.({currentTarget:this}) },
      remove() { this.removed = true },
    }
  }
  const navigator = {standalone:ios, userAgent:'Chrome/140'}
  const window = {
    navigator, location:{search,href:'https://example.test/'+search},
    matchMedia(query) {
      const item = {matches:query === `(display-mode: ${mode})`, addEventListener(name, fn) { this.change = fn }}
      media.set(query, item)
      return item
    },
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('Storage disabled'); return storage.get(key) },
      setItem(key, value) { if (blockedStorage) throw Error('Storage disabled'); storage.set(key, value) },
      removeItem(key) { if (blockedStorage) throw Error('Storage disabled'); storage.delete(key) },
    },
    addEventListener(name, fn) { listeners.set(name, fn) },
  }
  const document = {
    readyState:'complete', referrer,
    body:{appendChild(element) { elements.push(element) }}, head:{appendChild() {}},
    createElement:node, getElementById() { return null },
  }
  vm.runInNewContext(script, {window, navigator, document, URLSearchParams, URL, setTimeout(fn) { timers.push(fn) }, alert() {}})
  return {
    storage, api:window.__LMF_PWA_INSTALL__,
    start() { for (const fn of timers.splice(0)) fn() },
    banner() { return elements.findLast(el => el.id === 'lmf-install-banner' && !el.removed) },
    emit(name, event = {}) { listeners.get(name)?.(event) },
    displayMode(next) {
      for (const [query, item] of media) item.matches = query === `(display-mode: ${next})`
      for (const item of media.values()) item.change?.()
    },
    offer(outcome = 'accepted') {
      let prompted = 0
      listeners.get('beforeinstallprompt')({preventDefault() {}, prompt() { prompted++ }, userChoice:Promise.resolve({outcome})})
      return () => prompted
    },
  }
}

test('installed launches hide the banner without special URL markers, and are remembered', async () => {
  for (const settings of [
    {mode:'standalone'}, {mode:'fullscreen'}, {mode:'minimal-ui'}, {mode:'window-controls-overlay'},
    {ios:true}, {referrer:'android-app://app.letmefly'},
    {mode:'standalone',search:'?source=pwa&app=letmefly-v2'},
  ]) {
    const page = visit(settings)
    page.start()
    assert.equal(page.banner(), undefined)
    assert.equal(page.api.canInstall(), false)
    assert.equal(await page.api.prompt(), false)
    const browserTab = visit({storage:page.storage})
    browserTab.start()
    assert.equal(browserTab.banner(), undefined)
  }
})

test('dismissing survives reload and a late install offer; a requested install remains possible', async () => {
  const first = visit()
  first.start()
  assert.ok(first.banner())
  first.banner().querySelector('.lmf-install-dismiss').click()
  const reloaded = visit({storage:first.storage})
  reloaded.start()
  const prompted = reloaded.offer()
  assert.equal(reloaded.banner(), undefined)
  assert.equal(prompted(), 0)
  assert.equal(await reloaded.api.prompt(), true)
  assert.equal(prompted(), 1)
  const installedReload = visit({storage:reloaded.storage})
  installedReload.start()
  assert.equal(installedReload.banner(), undefined)
  assert.equal(installedReload.api.canInstall(), false)
})

test('installation, display-mode changes and another tab dismiss the visible banner immediately', () => {
  for (const transition of [page => page.emit('appinstalled'), page => page.displayMode('standalone')]) {
    const page = visit()
    page.start()
    assert.ok(page.banner())
    transition(page)
    assert.equal(page.banner(), undefined)
    assert.equal(page.api.canInstall(), false)
  }
  const first = visit(), second = visit({storage:first.storage})
  first.start(); second.start()
  first.banner().querySelector('.lmf-install-dismiss').click()
  second.emit('storage', {key:'lmf-pwa-install-dismissed-v1'})
  assert.equal(second.banner(), undefined)
})

test('declining the native prompt is remembered and does not falsely mark the app installed', async () => {
  const page = visit()
  page.start()
  const prompted = page.offer('dismissed')
  await page.banner().querySelector('.lmf-install-confirm').click()
  assert.equal(prompted(), 1)
  assert.equal(page.api.canInstall(), true)
  const reloaded = visit({storage:page.storage})
  reloaded.start()
  reloaded.offer()
  assert.equal(reloaded.banner(), undefined)
})

test('restricted storage still supports installed detection and dismissal for this visit', () => {
  const installed = visit({ios:true,blockedStorage:true})
  installed.start()
  assert.equal(installed.banner(), undefined)
  const page = visit({blockedStorage:true})
  page.start()
  page.banner().querySelector('.lmf-install-dismiss').click()
  page.offer()
  assert.equal(page.banner(), undefined)
})
