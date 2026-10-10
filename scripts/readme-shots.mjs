// @ts-nocheck
// Regenerates the README screenshots in docs/screenshots/ from dev scenarios.
//
// Usage (dev server running, playwright-core resolvable as for screenshot.mjs):
//   NODE_PATH=<scratch>/node_modules node scripts/readme-shots.mjs [shotName]
//
// GARDEN_URL overrides the server (default http://127.0.0.1:8000/). Each shot
// loads a scenario with ?nohud so the debug FPS panel stays out of frame.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'

const { chromium } = createRequire(import.meta.url)('playwright-core')
const [only] = process.argv.slice(2)
const outDir = 'docs/screenshots'
const base = process.env.GARDEN_URL ?? 'http://127.0.0.1:8000/'
const scenario = (id) => `${base}?gardenDebug=1&nohud&scenario=${id}`

const SHOTS = [
  { name: 'title', url: `${base}?nohud`, wait: 7000 },
  { name: 'meadow-hunt', url: scenario('meadow/snake-hunt'), wait: 12000 },
  { name: 'owl-night', url: scenario('owl/breed-ready'), wait: 9000,
    js: `__gardenDebug.focusSpecies('owl', 9)`, after: 4000 },
  { name: 'animal-card', url: scenario('meadow/tall-grass-garden'), wait: 9000,
    js: `(() => { const r = __gardenDebug.animalReport(); const list = Array.isArray(r) ? r : (r.animals ?? Object.values(r).find(Array.isArray) ?? []); const a = list.find((x) => /mouse|snake/.test(JSON.stringify(x))) ?? list[0]; return __gardenDebug.animalCard(a.id) })()`, after: 2500 },
  { name: 'shop', url: scenario('sandbox/farmer-10'), wait: 9000,
    js: `__gardenDebug.shop()`, after: 2500 },
]

const local = process.env.LOCALAPPDATA ?? ''
const executablePath = [
  `${local}/ms-playwright/chromium-1208/chrome-win64/chrome.exe`,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((path) => existsSync(path))

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  // Real GPU where there is one: SwiftShader renders the farm noticeably flatter.
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'],
  ...(executablePath ? { executablePath } : {}),
})
for (const shot of SHOTS) {
  if (only && shot.name !== only) continue
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (error) => console.error(`[${shot.name}] pageerror`, error.message))
  await page.goto(shot.url)
  await page.waitForTimeout(shot.wait)
  if (shot.js) {
    await page.evaluate(shot.js).catch((error) => console.error(`[${shot.name}]`, error.message))
    await page.waitForTimeout(shot.after ?? 2000)
  }
  await page.screenshot({ path: `${outDir}/${shot.name}.jpg`, type: 'jpeg', quality: 82 })
  console.log('saved', `${outDir}/${shot.name}.jpg`)
  await page.close()
}
await browser.close()
