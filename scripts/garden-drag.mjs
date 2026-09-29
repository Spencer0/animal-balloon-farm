import { writeFile } from 'node:fs/promises'
import process from 'node:process'

const [command = 'help', ...args] = process.argv.slice(2)
const baseUrl = process.env.GARDEN_URL ?? 'http://127.0.0.1:8000/'
const base = new URL(baseUrl)
base.searchParams.set('gardenDebug', '1')
const browserBase = new URL(baseUrl)

/** @typedef {{ type: string, url: string, webSocketDebuggerUrl: string }} DevToolsTarget */
/** @typedef {{ resolve: (value: any) => void, reject: (reason: Error) => void }} PendingRequest */

function printHelp() {
  console.log(`Garden pointer harness

Usage:
  npm run dev
  Open the game in Chromium with --remote-debugging-port=9222.
  node scripts/garden-drag.mjs open
  node scripts/garden-drag.mjs state
  node scripts/garden-drag.mjs move <x> <y>
  node scripts/garden-drag.mjs down <x> <y> [left|right]
  node scripts/garden-drag.mjs drag <hold-ms> <x,y> [x,y ...]
  node scripts/garden-drag.mjs sample <columns> <rows> <hold-ms>
  node scripts/garden-drag.mjs up
  node scripts/garden-drag.mjs trim <x> <y>
  node scripts/garden-drag.mjs clear
  node scripts/garden-drag.mjs focus
  node scripts/garden-drag.mjs screenshot [path]

The helper talks to a browser already running with remote debugging enabled.
Set GARDEN_CDP_URL or GARDEN_URL to target a different local browser/game.`)
}

async function connect() {
  const cdpUrl = process.env.GARDEN_CDP_URL ?? 'http://127.0.0.1:9222'
  let response
  try {
    response = await fetch(`${cdpUrl}/json/list`)
  } catch {
    throw new Error(`Could not reach Chrome DevTools at ${cdpUrl}. Start Chromium with remote debugging enabled.`)
  }
  if (!response.ok) throw new Error(`Chrome DevTools discovery returned HTTP ${response.status}`)
  /** @type {DevToolsTarget[]} */
  const targets = await response.json()
  const target = targets.find((item) => item.type === 'page' && new URL(item.url).origin === browserBase.origin)
  if (!target) throw new Error(`No open browser tab for ${browserBase.origin}. Open ${browserBase.href} first.`)

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  /** @type {Map<number, PendingRequest>} */
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
  })

  /** @param {string} method @param {Record<string, unknown>} [params] */
  function send(method, params = {}) {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  /** @param {string} expression */
  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
    return response.result?.value
  }

  return { socket, send, evaluate }
}

async function main() {
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  const cdp = await connect()
  try {
    if (command === 'open') {
      await cdp.send('Page.enable')
      await cdp.send('Page.navigate', { url: base.href })
      const readyAt = Date.now() + 30000
      let state = null
      while (Date.now() < readyAt) {
        await new Promise((resolve) => setTimeout(resolve, 150))
        state = await cdp.evaluate('window.__gardenDebug?.state() ?? null')
        if (state) break
      }
      if (!state) throw new Error('Debug harness did not initialize. Check the browser console and local game server.')
      console.log(JSON.stringify({ url: base.href, viewport: await cdp.evaluate('[innerWidth, innerHeight]'), state }, null, 2))
      return
    }

    const ready = await cdp.evaluate('window.__gardenDebug?.enabled === true')
    if (!ready) throw new Error('Debug harness is not enabled. Run the open command or navigate to the game with ?gardenDebug=1.')

    /** @param {unknown} value */
    const quote = (value) => JSON.stringify(value)
    let expression
    if (command === 'state') expression = 'window.__gardenDebug.state()'
    else if (command === 'move') expression = `window.__gardenDebug.move(${Number(args[0])}, ${Number(args[1])}); window.__gardenDebug.state()`
    else if (command === 'down') expression = `window.__gardenDebug.down(${Number(args[0])}, ${Number(args[1])}, ${args[2] === 'right' ? 2 : 0}); window.__gardenDebug.state()`
    else if (command === 'up') expression = 'window.__gardenDebug.up(); window.__gardenDebug.state()'
    else if (command === 'trim') expression = `window.__gardenDebug.trim(${Number(args[0])}, ${Number(args[1])}); window.__gardenDebug.state()`
    else if (command === 'clear') expression = 'window.__gardenDebug.clearGrass(); window.__gardenDebug.state()'
    else if (command === 'focus') expression = 'window.__gardenDebug.focusGarden(); ({ state: window.__gardenDebug.state(), viewport: [innerWidth, innerHeight] })'
    else if (command === 'sample') expression = `window.__gardenDebug.sampleGarden(${Math.max(2, Number(args[0] ?? 5))}, ${Math.max(2, Number(args[1] ?? 4))}, ${Math.max(1000, Number(args[2] ?? 25000))})`
    else if (command === 'drag') {
      const holdMs = Math.max(0, Number(args[0] ?? 1200))
      const points = args.slice(1).map((point) => {
        const [x, y] = point.split(',').map(Number)
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`Invalid drag point: ${point}`)
        return { x, y }
      })
      expression = `window.__gardenDebug.drag(${quote(points)}, ${holdMs})`
    }    else if (command === 'screenshot') {
      const viewport = await cdp.evaluate('[innerWidth, innerHeight]')
      if (viewport[0] < 1200 || viewport[0] > 1360 || viewport[1] < 680 || viewport[1] > 760) throw new Error(`Refusing screenshot at ${viewport[0]}×${viewport[1]}; resize to about 1280×720 first.`)

      await cdp.evaluate('window.__gardenDebug.up()')
      const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
      const path = args[0] ?? 'garden-debug.png'
      await writeFile(path, Buffer.from(capture.data, 'base64'))
      console.log(`Saved viewport screenshot: ${path}`)
      expression = '({ state: window.__gardenDebug.state(), viewport: [innerWidth, innerHeight] })'
    } else throw new Error(`Unknown command: ${command}`)

    const result = await cdp.evaluate(expression)
    console.log(JSON.stringify(result, null, 2))
  } finally {
    cdp.socket.close()
  }
}

main().catch((error) => {
  console.error(`Garden drag harness: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
