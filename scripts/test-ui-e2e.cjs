const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const WebSocket = require('ws')

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browserPath = process.env.E2E_BROWSER_PATH || edgePath
const port = 9335 + Math.floor(Math.random() * 500)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'oyama-ui-e2e-'))
let browser
let socket
let nextId = 0
const pending = new Map()
const characterSelector = '.character-studio:not(.accessory-studio):not(.wardrobe-studio):not(.location-studio):not(.hair-studio)'
const browserErrors = []

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function until(fn, label, timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const value = await fn().catch(() => null)
    if (value) return value
    await delay(150)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function send(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result?.value
}

async function clickText(text) {
  return evaluate(`(() => {
    const target = [...document.querySelectorAll('button, [role="tab"], a')]
      .find(node => node.textContent.trim() === ${JSON.stringify(text)});
    if (!target) return false;
    target.click(); return true;
  })()`)
}

async function clickStudioText(text) {
  const rect = await evaluate(`(() => {
    const target = [...document.querySelectorAll(${JSON.stringify(characterSelector + ' [role="tab"]')})]
      .find(node => node.textContent.trim() === ${JSON.stringify(text)});
    return target?.getBoundingClientRect().toJSON() ?? null;
  })()`)
  if (!rect) return false
  const x = rect.x + rect.width / 2
  const y = rect.y + rect.height / 2
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  return true
}

async function main() {
  assert.ok(fs.existsSync(browserPath), `Browser missing: ${browserPath}`)
  browser = spawn(browserPath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })

  const target = await until(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`)
    return (await response.json()).find(item => item.type === 'page')
  }, 'browser debug endpoint')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  socket.on('message', data => {
    const message = JSON.parse(String(data))
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text)
    if (!message.id || !pending.has(message.id)) return
    const request = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1379, height: 982, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await until(() => evaluate(`document.querySelector('#root')?.textContent.includes('Oyama AI Video Studio')`), 'app shell')

  const firstView = await evaluate(`document.body.innerText.slice(0, 3000)`)
  assert.ok(firstView.includes('Browse workspaces'))
  assert.ok(firstView.includes('Offline · Set up'), 'ComfyUI disconnection is visible')
  assert.ok(await evaluate(`(() => { const generate = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Generate' && node.offsetWidth > 0); return generate?.disabled === true })()`), 'H3 Generate is disabled while ComfyUI is offline')

  assert.ok(await clickText('Characters'), 'Characters navigation is available')
  await until(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(characterSelector)})?.getClientRects().length)`), 'Characters workspace')
  assert.ok(await evaluate(`(() => { const button = document.querySelector('[aria-label="Find workspace setting"]'); if (!button?.getClientRects().length) return false; button.click(); return true })()`), 'Companion workspace exposes visible setting search')
  await until(() => evaluate(`Boolean(document.querySelector('.workspace-search-backdrop'))`), 'Workspace setting search')
  await until(() => evaluate(`document.activeElement?.matches('.workspace-search-input-wrap input')`), 'setting search focus')
  await send('Input.insertText', { text: 'Character name' })
  await until(() => evaluate(`document.querySelector('.workspace-search-result')?.textContent.includes('Character name')`), 'Character name search result')
  await evaluate(`document.querySelector('.workspace-search-result')?.click()`)
  await until(() => evaluate(`!document.querySelector('.workspace-search-backdrop')`), 'setting search close')
  assert.ok(await clickStudioText('Hair'), 'Hair inspector tab is available')
  await until(() => evaluate(`document.querySelector(${JSON.stringify(characterSelector + ' .character-context-inspector')})?.getAttribute('aria-label') === 'Hair inspector'`), 'Hair inspector')
  assert.ok(await clickStudioText('Wardrobe'), 'Wardrobe inspector tab is available')
  await until(() => evaluate(`document.querySelector(${JSON.stringify(characterSelector + ' .character-context-inspector')})?.getAttribute('aria-label') === 'Wardrobe inspector'`), 'Wardrobe inspector')
  assert.ok(await clickStudioText('Identity'), 'Identity inspector tab is available')
  await until(() => evaluate(`document.querySelector(${JSON.stringify(characterSelector + ' .character-context-inspector')})?.getAttribute('aria-label') === 'Identity inspector'`), 'Identity inspector')
  assert.ok(await evaluate(`(() => { const tab = [...document.querySelectorAll(${JSON.stringify(characterSelector + ' .workspace-section-tabs button')})].find(node => node.querySelector('strong')?.textContent === 'Generate'); tab?.click(); return Boolean(tab) })()`), 'Character Generate section is available')
  await until(() => evaluate(`document.querySelector(${JSON.stringify(characterSelector + ' .workspace-section-tabs button.active strong')})?.textContent === 'Generate'`), 'Character Generate section')
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(characterSelector + ' .character-visual-canvas')})?.getBoundingClientRect().width > 0`), 'Character preview stays visible in Generate')
  assert.ok(await evaluate(`(() => { const tab = [...document.querySelectorAll(${JSON.stringify(characterSelector + ' .workspace-section-tabs button')})].find(node => node.querySelector('strong')?.textContent === 'Characters'); tab?.click(); return Boolean(tab) })()`), 'Character library section is available')
  await until(() => evaluate(`document.querySelector(${JSON.stringify(characterSelector + ' .workspace-section-tabs button.active strong')})?.textContent === 'Characters'`), 'Character library section')
  assert.ok(await evaluate(`document.querySelector(${JSON.stringify(characterSelector + ' .character-library-tab-panel')})?.hidden === false`), 'Character library is visible')

  await send('Emulation.setDeviceMetricsOverride', { width: 860, height: 620, deviceScaleFactor: 1, mobile: false })
  await delay(250)
  const compact = await evaluate(`({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, text: document.body.innerText.slice(0, 3000) })`)
  assert.equal(compact.viewport, 860)
  assert.ok(compact.scrollWidth <= 860, `Horizontal document overflow: ${compact.scrollWidth}px`)
  assert.ok(await evaluate(`Boolean(document.querySelector('[aria-label="Find workspace setting"]')?.getClientRects().length)`), 'Setting search remains accessible at compact size')
  await send('Emulation.setDeviceMetricsOverride', { width: 1379, height: 982, deviceScaleFactor: 1, mobile: false })
  assert.ok(await clickText('Queue'), 'Queue navigation is available')
  await until(() => evaluate(`document.querySelector('.job-list, .empty-page')?.getClientRects().length`), 'Queue view')
  assert.ok(await evaluate(`document.body.innerText.includes('No generations have been queued.')`), 'Empty Queue explains its state')
  assert.ok(await clickText('Renders'), 'Render library navigation is available')
  await until(() => evaluate(`Boolean(document.querySelector('.library-page')?.getClientRects().length)`), 'Render library')
  assert.ok(await evaluate(`document.querySelector('.library-page')?.innerText.includes('Your finished renders will live here')`), 'Empty render library explains its state')
  assert.ok(await clickText('Settings'), 'Settings navigation is available')
  await until(() => evaluate(`Boolean(document.querySelector('#settings-engine')?.getClientRects().length)`), 'Settings view')
  assert.ok(await evaluate(`document.querySelector('#settings-engine')?.innerText.includes('ComfyUI')`), 'Engine settings render')
  assert.ok(await evaluate(`Boolean(document.querySelector('#settings-h3')?.getClientRects().length)`), 'H3 model stack settings render')
  assert.deepEqual(browserErrors, [], 'No uncaught browser errors')
  console.log('UI E2E: PASS — H3 offline state, Character search/tabs/library/Generate, Queue, Renders, Settings, 1379×982 and 860×620')
}

main().catch(error => { console.error(error); process.exitCode = 1 }).finally(async () => {
  if (socket) socket.close()
  if (browser) {
    browser.kill()
    await delay(400)
  }
  const resolved = path.resolve(profile)
  const tempRoot = fs.realpathSync(os.tmpdir())
  if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith('oyama-ui-e2e-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true }) }
    catch { console.warn(`Browser profile could not be removed: ${resolved}`) }
  }
})
