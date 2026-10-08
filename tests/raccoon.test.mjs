import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/** Bundle-then-import, matching the other suites, so the pure TS is tested as shipped. */
async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const conditions = await load('src/game/animal-conditions.ts')
const progress = await load('src/game/animal-progress.ts')
const farmProps = await load('src/game/farm-props.ts')
const sleep = await load('src/game/sleep.ts')
const { createWallet } = await load('src/game/sales.ts')

const emptyState = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }
const farmWith = (extra = {}, night = true) => ({ night, state: { ...emptyState, ...extra }, residentSpecies: new Set(['cow']) })

// ---------------------------------------------------------------- ladder --

test('the raccoon is a night animal, found through a resident cow', () => {
  assert.equal(conditions.NIGHT_ONLY_SPECIES.includes('raccoon'), true)
  assert.equal(conditions.isNightOnly('raccoon'), true)
  assert.equal(conditions.isNightOnly('cow'), false)
  const trigger = conditions.DISCOVERY.raccoon
  assert.equal(trigger.kind, 'residentCount')
  assert.equal(trigger.species, 'cow')
  assert.equal(trigger.amount, 1)
})

test('a garbage can settles the raccoon, and a dumpster (with the can) lets it breed', () => {
  const rungs = conditions.getSpeciesConditions('raccoon')
  assert.equal(rungs.length, 4)
  assert.equal(rungs[1].requirement, null)
  assert.deepEqual(rungs[2].requirement, { kind: 'propCount', species: 'garbage-can', amount: 1 })
  assert.equal(rungs[3].requirement.species, 'dumpster')
  const settle = (extra) => progress.requirementMet(rungs[2].requirement, farmWith(extra))
  const breed = (extra) => progress.requirementMet(rungs[3].requirement, farmWith(extra))
  assert.equal(settle({}), false)
  assert.equal(settle({ propCounts: { 'garbage-can': 1 } }), true)
  assert.equal(breed({ propCounts: { 'garbage-can': 1 } }), false)
  assert.equal(breed({ propCounts: { dumpster: 1 } }), false)
  assert.equal(breed({ propCounts: { dumpster: 1, 'garbage-can': 1 } }), true)
})

test('the journal words the prop requirements readably', () => {
  const settle = conditions.getSpeciesConditions('raccoon')[2].requirement
  assert.equal(conditions.conditionMetricLabel(settle), 'Garbage cans on the farm')
})

// ----------------------------------------------------------------- props --

test('the garbage can and dumpster are shop props that block their cells', () => {
  const can = farmProps.PROP_CATALOG['garbage-can']
  const dumpster = farmProps.PROP_CATALOG.dumpster
  assert.deepEqual(can.footprint, { width: 1, depth: 1 })
  assert.deepEqual(dumpster.footprint, { width: 2, depth: 1 })
  for (const prop of [can, dumpster]) {
    assert.equal(prop.blocking, true)
    assert.equal(prop.rotatable, true)
    assert.equal(prop.modelUrl.startsWith('assets/props/'), true)
    assert.equal(farmProps.PROP_ORDER.includes(prop.id), true)
  }
  // Turning the dumpster a quarter swaps its footprint, so it still fits a lane.
  assert.deepEqual(farmProps.footprintExtent('dumpster', 1), { width: 1, depth: 2 })
})

test('both can be bought and owned', () => {
  const inventory = farmProps.createPropInventory({ dumpster: 1 })
  assert.equal(inventory.count('dumpster'), 1)
  assert.equal(inventory.count('garbage-can'), 0)
  const wallet = createWallet(farmProps.propPrice('garbage-can'))
  assert.equal(farmProps.purchaseProp(wallet, inventory, 'garbage-can').ok, true)
  assert.equal(inventory.count('garbage-can'), 1)
})

// ----------------------------------------------------------------- sleep --

test('only night animals sleep, and only in daylight', () => {
  assert.equal(sleep.shouldSleep('raccoon', false), true)
  assert.equal(sleep.shouldSleep('raccoon', true), false)
  assert.equal(sleep.shouldSleep('owl', false), true)
  assert.equal(sleep.shouldSleep('cow', false), false)
  assert.equal(sleep.shouldSleep('cow', true), false)
})

test('a bed is next to the can and faces it', () => {
  const can = { x: 4, z: -2 }
  for (let slot = 0; slot < 4; slot += 1) {
    const bed = sleep.bedBeside(can, slot)
    assert.ok(Math.abs(Math.hypot(bed.x - can.x, bed.z - can.z) - sleep.BED_RADIUS) < 1e-9)
    // A +X-forward model turned by `heading` looks along (cos h, -sin h): straight at the can.
    const toCan = { x: can.x - bed.x, z: can.z - bed.z }
    const length = Math.hypot(toCan.x, toCan.z)
    assert.ok(Math.abs(Math.cos(bed.heading) - toCan.x / length) < 1e-9)
    assert.ok(Math.abs(-Math.sin(bed.heading) - toCan.z / length) < 1e-9)
  }
})

test('sleepers sharing a can do not pile onto one spot', () => {
  const can = { x: 0, z: 0 }
  const spots = [0, 1, 2].map((slot) => sleep.bedBeside(can, slot))
  for (let a = 0; a < spots.length; a += 1) {
    for (let b = a + 1; b < spots.length; b += 1) {
      assert.ok(Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z) > 1.2)
    }
  }
})

test('a sleeper picks the emptiest can, then the nearest', () => {
  const cans = [{ x: 0, z: 0 }, { x: 10, z: 0 }]
  assert.equal(sleep.pickAnchor(cans, [0, 0], { x: 9, z: 1 }), 1)
  assert.equal(sleep.pickAnchor(cans, [1, 0], { x: 1, z: 0 }), 1)
  assert.equal(sleep.pickAnchor([], [], { x: 0, z: 0 }), -1)
})
