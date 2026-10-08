import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The shop's unlock rule, build timeline and treeline site stay pure (no
 * Three.js, no DOM), so they are checked here rather than only by eye.
 */
const load = async (entry) => {
  const { outputFiles } = await build({ entryPoints: ['src/game/' + entry + '.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const {
  SHOP_UNLOCK_LEVEL, SHOP_BUILD_SECONDS, SHOP_BUILD_PARTS, shopUnlocked, shopBuildProgress, shopPartPose, easeOutBack,
} = await load('shop-construction')
const { shopSite, isInShopClearing, SHOP_SITE_RADIUS } = await load('shop-site')
const { farmEdgeDistance } = await load('farm-footprint')
const { GARDEN_MAX_BOUNDS } = await load('farm-expansion')

const poseAt = (name, progress) => shopPartPose(SHOP_BUILD_PARTS.find((part) => part.name === name), progress)

test('the shop unlocks at farmer level 2 (index 1) and not before', () => {
  assert.equal(SHOP_UNLOCK_LEVEL, 1)
  assert.equal(shopUnlocked(0), false)
  assert.equal(shopUnlocked(1), true)
  assert.equal(shopUnlocked(3), true)
  assert.equal(shopUnlocked(9), true)
  assert.equal(shopUnlocked(Number.NaN), false)
})

test('build parts are unique, ordered and inside the build window', () => {
  const names = SHOP_BUILD_PARTS.map((part) => part.name)
  assert.equal(new Set(names).size, names.length)
  for (const part of SHOP_BUILD_PARTS) {
    assert.ok(part.enter[0] >= 0 && part.enter[1] <= 1 && part.enter[0] < part.enter[1], `${part.name} enters in window`)
    if (part.exit) assert.ok(part.exit[0] >= part.enter[1] && part.exit[1] <= 1, `${part.name} exits after it arrives`)
  }
  const starts = SHOP_BUILD_PARTS.map((part) => part.enter[0])
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b), 'parts arrive in build order')
})

test('the construction site is up at the start and packed away at the end', () => {
  assert.equal(poseAt('site', 0.05).visible, true)
  assert.equal(poseAt('site', 0.5).scale, 1)
  assert.equal(poseAt('site', 1).visible, false)
})

test('every built part is visible at rest when the build finishes', () => {
  for (const part of SHOP_BUILD_PARTS) {
    if (part.exit) continue
    const pose = shopPartPose(part, 1)
    assert.equal(pose.visible, true, `${part.name} is visible`)
    assert.ok(Math.abs(pose.scale - 1) < 1e-9, `${part.name} settles at full scale`)
    assert.ok(Math.abs(pose.lift) < 1e-9, `${part.name} settles on its rest position`)
  }
})

test('walls and roof fall in from above and settle', () => {
  for (const name of ['walls', 'roof']) {
    const part = SHOP_BUILD_PARTS.find((entry) => entry.name === name)
    const start = part.enter[0]
    assert.equal(poseAt(name, start - 0.01).visible, false, `${name} is hidden before it arrives`)
    const first = poseAt(name, part.enter[0] + (part.enter[1] - part.enter[0]) * 0.2)
    assert.ok(first.lift > 0, `${name} is still above its rest position mid-drop`)
    assert.ok(poseAt(name, part.enter[0] + 0.001).scale < 0.5, `${name} does not appear full size in midair`)
    for (let step = 0; step <= 50; step += 1) {
      const lift = poseAt(name, part.enter[0] + (part.enter[1] - part.enter[0]) * step / 50).lift
      assert.ok(lift >= -1e-9, `${name} never sinks below its rest position`)
    }
  }
})

test('pops grow from nothing, with an overshoot that settles', () => {
  const marquee = SHOP_BUILD_PARTS.find((entry) => entry.name === 'marquee')
  assert.equal(poseAt('marquee', marquee.enter[0] - 0.01).visible, false)
  assert.ok(poseAt('marquee', marquee.enter[0]).scale < 0.05)
  const peak = Math.max(...Array.from({ length: 40 }, (_, step) => poseAt('marquee', marquee.enter[0] + (marquee.enter[1] - marquee.enter[0]) * step / 39).scale))
  assert.ok(peak > 1, 'overshoots past full size')
  assert.ok(Math.abs(poseAt('marquee', marquee.enter[1]).scale - 1) < 1e-9)
})

test('easeOutBack starts at 0, ends at 1 and clamps bad input', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} is ${expected}`)
  near(easeOutBack(0), 0)
  near(easeOutBack(1), 1)
  near(easeOutBack(-5), 0)
  near(easeOutBack(9), 1)
  near(easeOutBack(Number.NaN), 0)
})

test('build progress is clamped to the build length', () => {
  assert.equal(shopBuildProgress(0), 0)
  assert.equal(shopBuildProgress(SHOP_BUILD_SECONDS / 2), 0.5)
  assert.equal(shopBuildProgress(SHOP_BUILD_SECONDS * 3), 1)
  assert.equal(shopBuildProgress(-4), 0)
  assert.equal(shopBuildProgress(Number.NaN), 0)
})

test('the shop site sits just outside the largest farm footprint', () => {
  const site = shopSite()
  assert.ok(Math.abs(Math.hypot(site.x, site.z) - SHOP_SITE_RADIUS) < 1e-9)
  assert.ok(farmEdgeDistance(site.x, site.z, GARDEN_MAX_BOUNDS) > 10, 'clear of the outer farm ring')
})

test('the shop faces the farm', () => {
  const { x, z, rotationY } = shopSite()
  // A model's storefront points at +Z; rotating by rotationY must point it at the farm centre.
  const facing = { x: Math.sin(rotationY), z: Math.cos(rotationY) }
  const toFarm = { x: -x / Math.hypot(x, z), z: -z / Math.hypot(x, z) }
  assert.ok(facing.x * toFarm.x + facing.z * toFarm.z > 0.999)
})

test('the grove clearing covers the shop and leaves the rest of the forest alone', () => {
  const site = shopSite()
  assert.equal(isInShopClearing(site.x, site.z), true)
  assert.equal(isInShopClearing(0, 0), false)
  assert.equal(isInShopClearing(-site.x, -site.z), false)
})
