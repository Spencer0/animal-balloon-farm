// Uses external Playwright, never adds it to the game's dependencies.
// NODE_PATH=C:/Users/Spencer/.codex/pw-scratch/node_modules node scripts/carnival-review.mjs
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium } = createRequire(import.meta.url)('playwright-core')
const url = process.env.CARNIVAL_URL ?? 'http://127.0.0.1:8141/?gardenDebug=1'
const out = resolve(process.env.CARNIVAL_REVIEW_DIR ?? 'review')
await mkdir(out, { recursive: true })
const candidates = [`${process.env.LOCALAPPDATA}/ms-playwright/chromium-1208/chrome-win64/chrome.exe`, 'C:/Program Files/Google/Chrome/Application/chrome.exe']
const browser = await chromium.launch({ headless: true, executablePath: candidates.find(existsSync), args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
/** @type {string[]} */
const errors = []
page.on('pageerror', (/** @type {Error} */ error) => errors.push(String(error)))
page.on('console', (/** @type {{type(): string; text(): string}} */ msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('response', (/** @type {{status(): number; url(): string}} */ response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
/** @type {{url: string; viewport: number[]; checks: string[]; errors: string[]; performance?: unknown; stages?: unknown}} */
const results = { url, viewport: [1280, 720], checks: [], errors }
/** @param {string} name @param {boolean} condition */
const check = (name, condition) => { assert.ok(condition, name); results.checks.push(name) }
/** @param {string} name */
const shot = async name => { await page.screenshot({ path: resolve(out, `${name}.jpg`), type: 'jpeg', quality: 70 }) }
try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForFunction('window.__gardenDebug && window.__gardenDebug.carnivalReport().length > 0')
  await page.keyboard.press('1')
  await page.waitForTimeout(1600)
  await page.evaluate(`window.__reviewInitial = { bounds: __gardenDebug.gardenReport().bounds, props: __gardenDebug.carnivalReport(), camera: __gardenDebug.camera(), shop: __gardenDebug.scene.getObjectByName('Farm shop building').position.toArray() }`)
  check('starter farm has organic ownership', await page.evaluate(`__reviewInitial.bounds.footprint === 'organic' && __reviewInitial.bounds.halfWidth === 10`))
  await shot('01-clearing')
  await page.evaluate('__gardenDebug.expandOnce()')
  await page.waitForFunction(`__gardenDebug.carnivalReport().some(p => p.phase === 'packing')`)
  check('old farm boundary holds while a prop packs', await page.evaluate('__gardenDebug.gardenReport().bounds.halfWidth === __reviewInitial.bounds.halfWidth'))
  check('only one attraction packs at a time', await page.evaluate(`__gardenDebug.carnivalReport().filter(p => p.phase === 'packing' || p.phase === 'shutdown').length === 1`))
  check('packing never translates close attractions', await page.evaluate(`__gardenDebug.scene.getObjectByName('Layer 1 · authored close carnival · removable').children.every(p => { const old = __reviewInitial.props.find(o => o.id === p.userData.carnivalId); return !old || old.x === p.position.x && old.z === p.position.z })`))
  await shot('02-packing')
  await page.waitForFunction(`__gardenDebug.gardenReport().bounds.halfWidth >= 11.6 && !__gardenDebug.carnivalReport().some(p => ['threatened', 'packing', 'shutdown', 'removed'].includes(p.phase))`, { timeout: 45000 })
  check('farm claims ground only after packing completes', await page.evaluate('__gardenDebug.gardenReport().bounds.halfWidth === 11.6'))
  check('removed identities reappear in far carnival', await page.evaluate(`__gardenDebug.carnivalReport().filter(p => p.phase === 'relocated').every(p => __gardenDebug.scene.getObjectByName('Layer 2 · permanent quiet carnival').children.some(o => o.userData.sourceId === p.id))`))
  await shot('03-claimed')
  // Actual pointer stroke, not an artificial grass fixture.
  await page.evaluate(`__gardenDebug.focusGarden(); __gardenDebug.selectTool('grass')`)
  const start = await page.evaluate('__gardenDebug.projectGardenPoint(-1, 0)')
  const end = await page.evaluate('__gardenDebug.projectGardenPoint(1, 0)')
  await page.mouse.move(start.x, start.y); await page.mouse.down()
  for (let i = 1; i <= 15; i += 1) {
    await page.mouse.move(start.x + (end.x - start.x) * i / 15, start.y + (end.y - start.y) * i / 15)
    await page.waitForTimeout(100)
  }
  await page.mouse.up()
  check('real seeder pointer input grows grass', await page.evaluate('__gardenDebug.state().tools.grassBlades > 100 && __gardenDebug.state().tools.holdSeconds > 1'))
  check('unowned organic corner rejects terrain edits', await page.evaluate('__gardenDebug.digAt(11, 9, .25, -.5) === 0'))
  await page.evaluate(`__gardenDebug.digPond(-3, 1, 2); __gardenDebug.pourAt(-3, 1, 1.5, 1.4); __gardenDebug.sowGrass(3, 0, 2.2)`)
  check('pond water still works on organic terrain', await page.evaluate('__gardenDebug.waterSummary().wetCells > 0'))
  check('planting still works', await page.evaluate(`(()=>{const p=__gardenDebug.plant('clover', 3, 0); return Boolean(p && p.ok !== false)})()`))
  await shot('04-garden-tools')
  await page.evaluate('__gardenDebug.expandFarm(7)')
  check('large expansion preserves progression and relocates many attractions', await page.evaluate(`__gardenDebug.gardenReport().bounds.halfWidth === 21.2 && __gardenDebug.carnivalReport().filter(p=>p.phase==='relocated').length > 20`))
  check('permanent farm shop does not scoot', await page.evaluate(`(()=>{const p=__gardenDebug.scene.getObjectByName('Farm shop building').position;return p.x===__reviewInitial.shop[0] && p.z===__reviewInitial.shop[2]})()`))
  await shot('05-animal-haven')
  await page.evaluate(`__gardenDebug.selectTool('hand'); __gardenDebug.focusGarden(); window.__reviewCamera = __gardenDebug.camera()`)
  await page.mouse.move(640, 250); await page.mouse.wheel(0, 500); await page.waitForTimeout(400)
  check('mouse wheel zoom works with backdrop', await page.evaluate('__gardenDebug.camera().viewHeight > __reviewCamera.viewHeight'))
  await page.evaluate('window.__reviewZoom = __gardenDebug.camera()')
  // Short drags inside the non-HUD canvas avoid tool panels stealing the gesture.
  for (const endX of [880, 880, 880]) {
    await page.mouse.move(640, 200); await page.mouse.down(); await page.mouse.move(endX, 300, { steps: 12 }); await page.mouse.up()
  }
  await page.mouse.move(640, 250)
  check('left-drag orbit works with full-circle world', await page.evaluate('__gardenDebug.camera().position.x !== __reviewZoom.position.x'))
  check('scene raycasts have no invalid material groups', await page.evaluate(`__gardenDebug.probeGround(0,0).length > 0`))
  await shot('06-orbit-horizon')
  await page.evaluate('window.__reviewOrbit = __gardenDebug.camera()')
  await page.mouse.move(640, 270); await page.mouse.down({ button: 'right' }); await page.mouse.move(820, 340, { steps: 10 }); await page.mouse.up({ button: 'right' }); await page.mouse.move(640, 250)
  check('right-drag pans the 3D scenery', await page.evaluate('__gardenDebug.camera().target.x !== __reviewOrbit.target.x || __gardenDebug.camera().target.z !== __reviewOrbit.target.z'))
  await shot('07-panned-horizon')
  await page.evaluate('__gardenDebug.expandFarm(15)')
  check('all fifteen parcels still work and stop at cap', await page.evaluate('__gardenDebug.gardenReport().bounds.halfWidth === 34 && __gardenDebug.expandOnce() === null'))
  await page.waitForTimeout(500)
  await shot('08-carnival-farm')
  await page.waitForTimeout(3000)
  results.performance = await page.evaluate('__gardenDebug.state().performance')
  results.stages = await page.evaluate('({ initial: __reviewInitial, finalBounds: __gardenDebug.gardenReport().bounds, finalProps: __gardenDebug.carnivalReport() })')
  check('no runtime errors or failed assets', errors.length === 0)
  console.log(JSON.stringify({ checks: results.checks, errors, performance: results.performance }, null, 2))
} finally {
  await writeFile(resolve(out, 'browser-verification.json'), JSON.stringify(results, null, 2))
  await browser.close()
}
