import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'
import * as THREE from 'three'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const { containsFarmPoint, farmEdgePoint, farmEdgeDistance, clampToFarm } = await load('src/game/farm-footprint.ts')
const { createFarmExpansion, farmBoundsAtLevel, FARM_EXPANSION_CONFIG } = await load('src/game/farm-expansion.ts')
const { createCarnivalMigration } = await load('src/game/carnival-migration.ts')
const { makeGardenLawnGeometry, updateLandRevealMask, consolidateMaterialGroups } = await load('src/scene/fairground.ts')
const { createGardenTerrain } = await load('src/scene/garden-terrain.ts')
const { createAnimalTravelRoute, clearOfFarmBounds } = await load('src/game/animal-travel.ts')
const bounds = FARM_EXPANSION_CONFIG.startBounds

test('starter farm is smaller and organic, with genuinely unowned rectangular corners', () => {
  assert.deepEqual(bounds, { halfWidth: 10, halfDepth: 9, footprint: 'organic' })
  assert.ok(containsFarmPoint(0, 0, bounds))
  assert.equal(containsFarmPoint(9, 8, bounds), false)
  assert.equal(containsFarmPoint(NaN, 0, bounds), false)
  const radii = Array.from({ length: 100 }, (_, i) => {
    const edge = farmEdgePoint(i / 100 * Math.PI * 2, bounds)
    assert.ok(Math.abs(farmEdgeDistance(edge.x, edge.z, bounds)) < 1e-8)
    return Math.hypot(edge.x / bounds.halfWidth, edge.z / bounds.halfDepth)
  })
  assert.ok(Math.max(...radii) - Math.min(...radii) > .08, 'perimeter is not a mathematical ellipse')
})

test('every earned organic parcel is monotonic through the entire progression cap', () => {
  const expansion = createFarmExpansion()
  for (let level = 1; level <= 15; level += 1) {
    const old = expansion.bounds
    const start = expansion.expand()
    for (let i = 0; i < 100; i += 1) {
      const edge = farmEdgePoint(i / 100 * Math.PI * 2, old, -.01)
      assert.ok(containsFarmPoint(edge.x, edge.z, start.targetBounds))
    }
    expansion.update(10)
    assert.deepEqual(expansion.bounds, farmBoundsAtLevel(level))
    assert.equal(expansion.bounds.footprint, 'organic')
  }
})

test('resident clamps and entry routes use the same organic ownership as tools', () => {
  for (let i = 0; i < 100; i += 1) {
    const angle = i / 100 * Math.PI * 2
    const p = clampToFarm(Math.cos(angle) * 40, Math.sin(angle) * 40, bounds, 1.2)
    assert.ok(containsFarmPoint(p.x, p.z, bounds, 1.199))
    const route = createAnimalTravelRoute('enter', bounds, { x: Math.cos(angle) * 30, z: Math.sin(angle) * 30 })
    const inside = route.waypoints.at(-1)
    assert.ok(containsFarmPoint(inside.x, inside.z, bounds, .6))
    const cleared = clearOfFarmBounds(p, bounds)
    assert.equal(containsFarmPoint(cleared.x, cleared.z, bounds, -1.8), false)
  }
})

test('organic terrain corners stay immutable and expansion preserves existing edits', () => {
  let active = bounds
  const terrain = createGardenTerrain([], () => active)
  assert.equal(terrain.splat(9, 8, .3, -.4), 0)
  assert.ok(terrain.splat(0, 0, 1.4, -.4) > 0)
  const before = terrain.heightAt(0, 0)
  active = farmBoundsAtLevel(3)
  terrain.syncBounds()
  assert.equal(terrain.heightAt(0, 0), before)
  assert.ok(terrain.splat(11, 2, .6, -.4) > 0)
})

test('incremental organic land reveal equals full recompute and only uploads the swept band', () => {
  const incremental = makeGardenLawnGeometry()
  const full = makeGardenLawnGeometry()
  let previous = bounds
  updateLandRevealMask(incremental, null, previous)
  for (let step = 1; step <= 12; step += 1) {
    const next = { ...bounds, halfWidth: bounds.halfWidth + step * .14, halfDepth: bounds.halfDepth + step * .1 }
    updateLandRevealMask(incremental, previous, next)
    updateLandRevealMask(full, null, next)
    const actual = incremental.getAttribute('color')
    const expected = full.getAttribute('color')
    assert.deepEqual(actual.array, expected.array)
    assert.ok(actual.updateRanges.reduce((n, r) => n + r.count, 0) < actual.array.length / 4)
    previous = next
  }
  incremental.dispose(); full.dispose()
})

const props = [
  { id: 'tent', kind: 'tent', x: 12, z: 0, radius: 2, removable: true, priority: 1 },
  { id: 'cart', kind: 'stall', x: 10.8, z: 0, radius: .8, removable: true },
  { id: 'sign', kind: 'decoration', x: 10.5, z: 0, radius: .5, removable: true },
  { id: 'landmark', kind: 'ride', x: 11, z: 0, radius: 4, removable: false },
  { id: 'far', kind: 'tent', x: 70, z: 0, radius: 4, removable: true },
]

test('migration targets only affected removable close footprints and never queues them twice', () => {
  const migration = createCarnivalMigration(props)
  assert.equal(migration.target(farmBoundsAtLevel(2)), 3)
  assert.equal(migration.target(farmBoundsAtLevel(2)), 0)
  assert.equal(migration.statuses().find(p => p.id === 'landmark').phase, 'active')
  assert.equal(migration.statuses().find(p => p.id === 'far').phase, 'active')
  const snapshot = migration.statuses()
  snapshot[0].x = 10000
  assert.equal(migration.statuses()[0].x, 12)
})

test('packing is sequential, shuts down first, holds identities still, then relocates after removal', () => {
  const migration = createCarnivalMigration(props)
  migration.target(farmBoundsAtLevel(2))
  migration.update(.1)
  assert.equal(migration.statuses().find(p => p.id === 'sign').phase, 'shutdown')
  assert.equal(migration.statuses().find(p => p.id === 'cart').phase, 'threatened')
  migration.update(.5)
  assert.equal(migration.statuses().find(p => p.id === 'sign').phase, 'packing')
  assert.ok(migration.statuses().find(p => p.id === 'sign').progress > 0)
  for (let i = 0; i < 180; i += 1) {
    migration.update(.05)
    const statuses = migration.statuses()
    assert.ok(statuses.filter(p => p.phase === 'packing' || p.phase === 'shutdown').length <= 1)
    statuses.forEach((p, j) => { assert.equal(p.x, props[j].x); assert.equal(p.z, props[j].z) })
  }
  assert.equal(migration.busy, false)
  assert.deepEqual(migration.statuses().filter(p => p.removable && p.id !== 'far').map(p => p.phase), ['relocated', 'relocated', 'relocated'])
})

test('large attractions pack longer and invalid delta never advances the sequence', () => {
  const one = kind => createCarnivalMigration([{ ...props[0], kind }])
  const small = one('decoration'); const large = one('ride')
  for (const m of [small, large]) {
    m.target(farmBoundsAtLevel(2)); m.update(NaN); m.update(-1)
    assert.equal(m.statuses()[0].phase, 'threatened')
    m.update(1.4)
  }
  assert.equal(small.statuses()[0].phase, 'removed')
  assert.equal(large.statuses()[0].phase, 'packing')
  assert.throws(() => createCarnivalMigration([props[0], props[0]]), /unique/)
  assert.throws(() => createCarnivalMigration([{ ...props[0], radius: -1 }]), RangeError)
})

test('material consolidation preserves every triangle and reduces striped draw groups', () => {
  const geometry = new THREE.ConeGeometry(3, 4, 20)
  const original = Array.from(geometry.index.array)
  geometry.clearGroups()
  for (let i = 0; i < original.length; i += 3) geometry.addGroup(i, 3, i % 2)
  const oldGroupCount = geometry.groups.length
  consolidateMaterialGroups(geometry)
  assert.equal(geometry.groups.length, 2)
  assert.ok(oldGroupCount > 20)
  assert.deepEqual(Array.from(geometry.index.array).sort((a,b)=>a-b), original.sort((a,b)=>a-b))
  geometry.dispose()
})

test('packing returns only unspent time for the delayed soil reveal', () => {
  const migration = createCarnivalMigration([{ ...props[0], kind: 'decoration' }])
  migration.target(farmBoundsAtLevel(2))
  assert.equal(migration.update(.6), 0)
  const available = migration.update(1)
  assert.ok(Math.abs(available - .4) < 1e-8)
  assert.equal(migration.busy, false)
})

test('old rectangular terrain fixtures retain their rounded rectangle mask', () => {
  assert.ok(containsFarmPoint(13, 8, { halfWidth: 14, halfDepth: 9.5 }))
  const geometry = new THREE.PlaneGeometry(28, 19, 20, 20)
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 4), 4))
  updateLandRevealMask(geometry, null, { halfWidth: 14, halfDepth: 9.5 })
  assert.ok(geometry.getAttribute('color').getW(210) > .9)
  geometry.dispose()
})
