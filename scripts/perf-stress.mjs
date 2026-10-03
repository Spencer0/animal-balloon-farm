import process from 'node:process'

/** @typedef {{ type: string, url: string, webSocketDebuggerUrl: string }} DevToolsTarget */
/** @typedef {{ resolve: (value: any) => void, reject: (reason: Error) => void }} PendingRequest */

const baseUrl = process.env.GARDEN_URL ?? 'http://127.0.0.1:8000/'
const cdpUrl = process.env.GARDEN_CDP_URL ?? 'http://127.0.0.1:9222'
const targetUrl = new URL(baseUrl)
targetUrl.searchParams.set('gardenDebug', '1')

async function connect() {
  const response = await fetch(`${cdpUrl}/json/list`)
  if (!response.ok) throw new Error(`Chrome DevTools returned HTTP ${response.status}`)
  /** @type {DevToolsTarget[]} */
  const targets = await response.json()
  const pages = targets.filter((entry) => entry.type === 'page')
  const target = pages.find((entry) => new URL(entry.url).origin === targetUrl.origin)
    ?? (pages.length === 1 && pages[0].url === 'about:blank' ? pages[0] : undefined)
  if (!target) throw new Error(`Open ${targetUrl.origin} in Chromium with remote debugging enabled.`)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let nextId = 0
  /** @type {Map<number, PendingRequest>} */
  const pending = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  /** @param {string} method @param {Record<string, unknown>} [params] */
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  /** @param {string} expression */
  async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text)
    return response.result?.value
  }
  return { socket, send, evaluate }
}

const cdp = await connect()
try {
  await cdp.send('Page.enable')
  await cdp.send('Page.navigate', { url: targetUrl.href })
  const readyBy = Date.now() + 30_000
  let ready = false
  while (Date.now() < readyBy) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    ready = await cdp.evaluate('window.__gardenDebug?.enabled === true')
    if (ready) break
  }
  if (!ready) throw new Error('Debug harness failed to initialize; use the debug dev build.')

  const result = await cdp.evaluate(`(async () => {
    const debug = window.__gardenDebug
    const canvas = document.querySelector('#game')
    if (!canvas || innerWidth < 1200 || innerWidth > 1360 || innerHeight < 680 || innerHeight > 760) {
      throw new Error('Resize Chromium to about 1280×720 before running the performance gate.')
    }
    const waitFrames = (count) => new Promise((resolve) => {
      const step = () => --count <= 0 ? resolve() : requestAnimationFrame(step)
      requestAnimationFrame(step)
    })
    const pointer = (type, x, y, button = 0) => canvas.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, pointerId: 77, button, bubbles: true,
      buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
    }))

    debug.closeMenu()
    debug.focusGarden()
    debug.clearGarden()
    debug.digPond(0, 0, 2.5)
    debug.pourAt(0, 0, 2.2, 1.4)
    for (const x of [-4, 0, 4]) {
      for (const z of [-4, 0, 4]) debug.sowGrass(x, z, 2.8)
    }
    const fixtureTools = debug.state().tools
    if (!fixtureTools || fixtureTools.grassBlades < 1000 || fixtureTools.waterCells < 4) {
      throw new Error('Stress fixture failed to populate: ' + JSON.stringify(fixtureTools))
    }
    debug.selectTool('shovel')
    const startPoint = debug.projectGardenPoint(0, 0)
    const endPoint = debug.projectGardenPoint(1.5, 0.35)
    if (!startPoint || !endPoint) throw new Error('Could not project the shovel drag into the canvas.')
    const rect = canvas.getBoundingClientRect()
    if (![startPoint.x, startPoint.y, endPoint.x, endPoint.y].every((value) =>
      value >= rect.left && value <= rect.right && value >= rect.top && value <= rect.bottom)) {
      throw new Error('Projected shovel drag is outside the visible garden canvas.')
    }
    pointer('pointermove', startPoint.x, startPoint.y)
    await waitFrames(3)
    pointer('pointerdown', startPoint.x, startPoint.y)
    await waitFrames(45)

    const samples = []
    const intervals = []
    const start = performance.now()
    const duration = 2200
    let sampledFrameNumber = 0
    try {
      while (performance.now() - start < duration) {
        const t = (performance.now() - start) / duration
        const x = startPoint.x + (endPoint.x - startPoint.x) * t
        const y = startPoint.y + (endPoint.y - startPoint.y) * t
        pointer('pointermove', x, y)
        await waitFrames(1)
        const latest = debug.performanceSamples().at(-1)
        if (latest && latest.frameNumber !== sampledFrameNumber && latest.intervalMs > 0) {
          sampledFrameNumber = latest.frameNumber
          samples.push(latest.workMs)
          intervals.push(latest.intervalMs)
        }
      }
    } finally {
      pointer('pointerup', endPoint.x, endPoint.y)
    }
    await waitFrames(3)
    const percentile = (values, fraction) => {
      const sorted = [...values].sort((a, b) => a - b)
      return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : null
    }
    const averageIntervalMs = intervals.reduce((sum, interval) => sum + interval, 0) / Math.max(1, intervals.length)
    return {
      viewport: [innerWidth, innerHeight],
      fixtureBlades: fixtureTools.grassBlades,
      fixtureWaterCells: fixtureTools.waterCells,
      shovelHoldSeconds: debug.state().tools?.holdSeconds ?? 0,
      terrainChanged: debug.state().tools?.terrainDirty === false && debug.state().tools?.terrainMin < 0,
      sustainedFps: intervals.length ? 1000 / averageIntervalMs : null,
      p95FrameIntervalMs: percentile(intervals, 0.95),
      p95WorkMs: percentile(samples, 0.95),
      sampleCount: samples.length,
      averageIntervalMs,
      finalTools: debug.state().tools,
    }
  })()`)
  console.log(JSON.stringify(result, null, 2))
  const minFps = Number(process.env.MIN_FPS ?? 60)
  if (!Number.isFinite(minFps) || minFps <= 0) throw new Error('MIN_FPS must be a positive number.')
  const maxFrameMs = 1000 / minFps
  if (result.sampleCount < 60 || result.shovelHoldSeconds < 1 || !result.terrainChanged
    || result.p95WorkMs === null || result.p95FrameIntervalMs === null
    || result.p95WorkMs > maxFrameMs || result.p95FrameIntervalMs > maxFrameMs || result.sustainedFps < minFps) {
    console.error(`FAIL: p95 frame work ${result.p95WorkMs}ms, p95 frame interval ${result.p95FrameIntervalMs}ms / ${result.sustainedFps} FPS (required ${minFps} FPS with at least 60 samples)`)
    process.exitCode = 1
  } else {
    console.log(`PASS: p95 frame work ${result.p95WorkMs}ms, p95 frame interval ${result.p95FrameIntervalMs}ms / ${result.sustainedFps} FPS (required ${minFps} FPS)`)
  }
} finally {
  cdp.socket.close()
}
