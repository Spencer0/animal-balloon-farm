import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/** The tree line's layout is pure (no Three.js, no DOM), so its rules are checked here. */
const { outputFiles } = await build({
  entryPoints: ['src/game/treeline-plan.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const plan = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const shop = await import(`data:text/javascript;base64,${Buffer.from((await build({
  entryPoints: ['src/game/shop-site.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})).outputFiles[0].text).toString('base64')}`)

const layout = plan.createTreelinePlan()

test('the same seed lays out the same horizon every visit', () => {
  const again = plan.createTreelinePlan()
  assert.equal(again.placements.length, layout.placements.length)
  assert.deepEqual(again.placements[10], layout.placements[10])
})

test('every biome grows its own props', () => {
  const biomes = new Set(layout.placements.map((p) => p.biome))
  for (const id of ['meadow', 'woods', 'rocky', 'lake', 'swamp', 'ocean']) assert.ok(biomes.has(id), `no props in ${id}`)
  const props = new Set(layout.placements.map((p) => p.prop))
  for (const id of ['pine', 'birch', 'peak_tall', 'boulder', 'willow', 'reeds', 'cypress', 'cattails', 'palm', 'sea_stack', 'sailboat']) {
    assert.ok(props.has(id), `no ${id} placed`)
  }
  assert.ok(layout.placements.every((p) => plan.TREELINE_PROPS.includes(p.prop)))
})

test('nothing stands inside the farm or the arcade store clearing', () => {
  for (const p of layout.placements) {
    assert.ok(Math.hypot(p.x, p.z) >= plan.TREELINE_INNER_RADIUS - 1, `${p.prop} at ${p.x.toFixed(1)},${p.z.toFixed(1)} is inside the farm ring`)
    if (p.prop.startsWith('peak')) continue
    assert.ok(!shop.isInShopClearing(p.x, p.z, 6), `${p.prop} is in the shop clearing`)
  }
})

test('land props stay out of the water, and water props stay in it', () => {
  const wet = new Set(['lily_pads', 'sea_stack', 'sailboat'])
  for (const p of layout.placements) {
    if (wet.has(p.prop)) assert.ok(plan.isTreelineWater(p.x, p.z), `${p.prop} is on dry land at ${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    else if (!p.prop.startsWith('peak') && !['reeds', 'cattails', 'dune_grass'].includes(p.prop)) {
      assert.ok(!plan.isTreelineWater(p.x, p.z, true), `${p.prop} is in the water at ${p.x.toFixed(1)},${p.z.toFixed(1)}`)
    }
  }
})

test('the arcade store site is dry land in the mountain meadow', () => {
  const site = shop.shopSite()
  assert.ok(!plan.isTreelineWater(site.x, site.z, true))
  assert.equal(plan.biomeAtAngle(Math.atan2(site.z, site.x)), 'meadow')
})

test('biomes follow the compass', () => {
  const at = (degrees) => plan.biomeAtAngle(degrees * Math.PI / 180)
  assert.equal(at(-90), 'meadow')
  assert.equal(at(-20), 'rocky')
  assert.equal(at(40), 'lake')
  assert.equal(at(110), 'swamp')
  assert.equal(at(180), 'ocean')
  assert.equal(at(225), 'woods')
})
