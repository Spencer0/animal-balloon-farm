import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/plant-helpers.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const helpers = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createGreenThumb, CARE_HELPERS, helperPrice } = helpers

test('every chore has a helper', () => {
  assert.deepEqual(Object.keys(CARE_HELPERS).sort(), ['pest', 'prune', 'water'])
  assert.equal(CARE_HELPERS.pest.name, 'Ladybug Lodge')
})

test('a helper waits for its ribbon, then for coins, then works for good', () => {
  const thumb = createGreenThumb()
  let coins = 100
  const pay = (price) => {
    if (coins < price) return false
    coins -= price
    return true
  }
  assert.equal(thumb.quote('blueberry', 'pest', 12).status, 'needs-ribbon')
  assert.equal(thumb.hire('blueberry', 'pest', 12, pay).status, 'needs-ribbon')
  assert.equal(coins, 100, 'no ribbon, no charge')
  assert.equal(thumb.earnRibbon('blueberry', 'pest'), true)
  assert.equal(thumb.earnRibbon('blueberry', 'pest'), false, 'a ribbon is only new once')
  assert.equal(thumb.quote('blueberry', 'pest', 12).status, 'available')
  const hired = thumb.hire('blueberry', 'pest', 12, pay)
  assert.equal(hired.status, 'hired')
  assert.equal(coins, 100 - helperPrice('pest', 12))
  assert.equal(thumb.hire('blueberry', 'pest', 12, pay).status, 'hired')
  assert.equal(coins, 100 - helperPrice('pest', 12), 'hiring twice charges once')
  assert.equal(thumb.isHired('blueberry', 'water'), false, 'one chore at a time')
})

test('a broke farmer keeps the ribbon and the helper stays on the shelf', () => {
  const thumb = createGreenThumb()
  thumb.earnRibbon('blueberry', 'prune')
  assert.equal(thumb.hire('blueberry', 'prune', 12, () => false).status, 'available')
})

test('ribbons and helpers survive a save, and a save cannot hire without the ribbon', () => {
  const thumb = createGreenThumb()
  thumb.earnRibbon('blueberry', 'water')
  thumb.hire('blueberry', 'water', 12, () => true)
  const restored = createGreenThumb()
  restored.importState(JSON.parse(JSON.stringify(thumb.exportState())))
  assert.equal(restored.isHired('blueberry', 'water'), true)
  assert.equal(restored.ribbonCount('blueberry'), 1)
  const forged = createGreenThumb()
  forged.importState({ ribbons: ['poppy:water', 'weed:water', 'poppy:wash', 'blueberry:nonsense'], helpers: ['blueberry:pest'] })
  assert.equal(forged.isHired('blueberry', 'pest'), false)
  assert.equal(forged.hasRibbon('poppy', 'water'), true, 'a real chore on a real plant is kept')
  assert.equal(forged.hasRibbon('weed', 'water'), false, 'unknown plants earn no ribbons')
  assert.equal(forged.ribbonCount('poppy'), 1, 'unknown chores are dropped')
  forged.importState(null)
  assert.equal(forged.ribbonCount('blueberry'), 0)
})

test('only winning a real minigame earns a ribbon; a plain tap on an unbuilt game does not', () => {
  const { earnsRibbon } = helpers
  assert.equal(earnsRibbon('game-won'), true)
  assert.equal(earnsRibbon('plain-tap'), false)
})
