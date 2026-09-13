import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'

const script = fs.readFileSync(new URL('../overlays/ui-command-v2/batch-s/pwa-install.js', import.meta.url), 'utf8')
const settle = () => new Promise(resolve => setImmediate(resolve))

function visit({mode = 'browser', ios = false, referrer = '', search = '', storage = new Map(), blockedStorage = false, delayWrites = false} = {}) {
  const listeners = new Map(), media = new Map(), timers = [], elements = [], channelListeners = new Map()
  const pendingWrites = []
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
    indexedDB: {
      open() {
        if (blockedStorage) throw Error('Storage disabled')
        const request = {}
        queueMicrotask(() => {
          request.result = {
            close() {},
            transaction() {
              const tx = {objectStore() { return {
                get(key) {
                  const read = {}
                  queueMicrotask(() => { read.result = storage.get(key); read.onsuccess?.() })
                  return read
                },
                put(value, key) { queueMicrotask(() => {
                  const commit = () => { storage.set(key, value); tx.oncomplete?.() }
                  if (delayWrites) pendingWrites.push(commit)
                  else commit()
                }) },
              } }}
              return tx
            },
          }
          request.onsuccess?.()
        })
        return request
      },
    },
    BroadcastChannel: class {
      addEventListener(name, fn) { channelListeners.set(name, fn) }
      postMessage() {}
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
    commitWrites() { for (const commit of pendingWrites.splice(0)) commit() },
    async start() { await settle(); for (const fn of timers.splice(0)) fn(); await settle() },
    banner() { return elements.findLast(el => el.id === 'lmf-install-banner' && !el.removed) },
    emit(name, event = {}) { listeners.get(name)?.(event) },
    message(data) { channelListeners.get('message')?.({data}) },
    displayMode(next) {
      for (const [query, item] of media) item.matches = query === `(display-mode: ${next})`
      for (const item of media.values()) item.change?.()
    },
    async offer(outcome = 'accepted') {
      let prompted = 0
      await listeners.get('beforeinstallprompt')({preventDefault() {}, prompt() { prompted++ }, userChoice:Promise.resolve({outcome})})
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
    await page.start()
    assert.equal(page.banner(), undefined)
    assert.equal(page.api.canInstall(), false)
    assert.equal(await page.api.prompt(), false)
    const browserTab = visit({storage:page.storage})
    await browserTab.start()
    assert.equal(browserTab.banner(), undefined)
  }
})

test('dismissing survives reload and a late install offer; a requested install remains possible', async () => {
  const first = visit()
  await first.start()
  assert.ok(first.banner())
  await first.banner().querySelector('.lmf-install-dismiss').click()
  await settle()
  const reloaded = visit({storage:first.storage})
  await reloaded.start()
  const prompted = await reloaded.offer()
  assert.equal(reloaded.banner(), undefined)
  assert.equal(prompted(), 0)
  assert.equal(await reloaded.api.prompt(), true)
  assert.equal(prompted(), 1)
  await settle()
  const installedReload = visit({storage:reloaded.storage})
  await installedReload.start()
  assert.equal(installedReload.banner(), undefined)
  assert.equal(installedReload.api.canInstall(), false)
})

test('dismissal is acknowledged only after a delayed preference commit, then survives immediate reload', async () => {
  const page = visit({delayWrites:true})
  await page.start()
  const dismissal = page.banner().querySelector('.lmf-install-dismiss').click()
  await settle()
  assert.ok(page.banner(),'The dismissal has not been acknowledged while storage is pending')
  assert.equal(page.storage.get('lmf-pwa-install-dismissed-v1'),undefined)
  page.commitWrites()
  await dismissal
  assert.equal(page.banner(),undefined)
  const reloaded = visit({storage:page.storage})
  await reloaded.start()
  assert.equal(reloaded.banner(),undefined)
})

test('installation, display-mode changes and another tab dismiss the visible banner immediately', async () => {
  for (const transition of [page => page.emit('appinstalled'), page => page.displayMode('standalone')]) {
    const page = visit()
    await page.start()
    assert.ok(page.banner())
    transition(page)
    assert.equal(page.banner(), undefined)
    assert.equal(page.api.canInstall(), false)
  }
  const first = visit(), second = visit({storage:first.storage})
  await first.start(); await second.start()
  first.banner().querySelector('.lmf-install-dismiss').click()
  second.message({key:'lmf-pwa-install-dismissed-v1',value:true})
  assert.equal(second.banner(), undefined)
})

test('declining the native prompt is remembered and does not falsely mark the app installed', async () => {
  const page = visit()
  await page.start()
  const prompted = await page.offer('dismissed')
  await page.banner().querySelector('.lmf-install-confirm').click()
  assert.equal(prompted(), 1)
  assert.equal(page.api.canInstall(), true)
  await settle()
  const reloaded = visit({storage:page.storage})
  await reloaded.start()
  await reloaded.offer()
  assert.equal(reloaded.banner(), undefined)
})

test('restricted storage still supports installed detection and dismissal for this visit', async () => {
  const installed = visit({ios:true,blockedStorage:true})
  await installed.start()
  assert.equal(installed.banner(), undefined)
  const page = visit({blockedStorage:true})
  await page.start()
  page.banner().querySelector('.lmf-install-dismiss').click()
  await page.offer()
  assert.equal(page.banner(), undefined)
})

test('installation during preference loading cannot be overwritten by an older install offer', async () => {
  const page = visit()
  const offer = page.offer()
  page.emit('appinstalled')
  await offer
  await page.start()
  assert.equal(page.api.canInstall(), false)
  assert.equal(page.banner(), undefined)
})
