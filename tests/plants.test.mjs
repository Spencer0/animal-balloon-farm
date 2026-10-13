import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/plants.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const plants = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createPlantSimulation, PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, STARTING_SEEDS_PER_PLANT, STARTING_SEED_GIFTS, SEED_PRICES } = plants
const stockedSimulation = () => {
  const simulation = createPlantSimulation()
  for (const species of PLANT_CATALOG) simulation.addSeeds(species.id, 5)
  return simulation
}
const surface = (substrate, waterDepth = 0, inBounds = true) => ({ substrate, waterDepth, inBounds })

test('catalog lists every plant and the seed shed starts empty', () => {
  assert.deepEqual(PLANT_CATALOG.map(({ id }) => id), ['clover', 'dandelion', 'poppy', 'water-lily', 'blueberry'])
  const simulation = createPlantSimulation()
  for (const species of PLANT_CATALOG) {
    const gift = STARTING_SEED_GIFTS.find((entry) => entry.species === species.id)
    assert.equal(simulation.seedsFor(species.id), gift ? gift.count : STARTING_SEEDS_PER_PLANT)
  }
  assert.equal(STARTING_SEEDS_PER_PLANT, 0)
  assert.deepEqual(STARTING_SEED_GIFTS.map(({ species }) => species), ['poppy', 'blueberry'])
  assert.equal(simulation.seedsFor('blueberry'), 1)
  assert.equal(simulation.placementResult('clover', 0, 0, surface('grass')).failure, 'out-of-seeds')
})

test('bought seeds land in the shed and every plant has a seed price', () => {
  const simulation = createPlantSimulation()
  const gift = simulation.seedsFor('poppy')
  assert.equal(simulation.addSeeds('poppy', 2), gift + 2)
  assert.equal(simulation.addSeeds('poppy'), gift + 3)
  assert.equal(simulation.addSeeds('poppy', -4), gift + 3)
  for (const species of PLANT_CATALOG) assert.ok(SEED_PRICES[species.id] > 0)
  assert.ok(simulation.plant('poppy', 0, 0, surface('soil')))
  assert.equal(simulation.seedsFor('poppy'), gift + 2)
})

test('placement enforces bounds, substrate, visible pond water, seeds, and spacing', () => {
  const simulation = stockedSimulation()
  assert.equal(simulation.placementResult('clover', 0, 0, surface('soil')).failure, 'wrong-substrate')
  assert.equal(simulation.placementResult('clover', 0, 0, surface('grass', 0, false)).failure, 'out-of-bounds')
  assert.equal(simulation.placementResult('water-lily', 0, 0, surface('water', PLANT_WATER_MIN_DEPTH / 2)).failure, 'needs-visible-water')
  assert.ok(simulation.plant('clover', 0, 0, surface('grass')))
  assert.equal(simulation.placementResult('poppy', 1.2, 0, surface('soil')).failure, 'too-close')
  assert.equal(simulation.placementResult('poppy', 2, 0, surface('soil')).valid, true)
  assert.equal(simulation.placementResult('water-lily', 4, 0, surface('water', PLANT_WATER_MIN_DEPTH)).valid, true)
})

test('planting spends only that seed and exposes species counts for future habitat rules', () => {
  const simulation = stockedSimulation()
  for (let index = 0; index < 3; index += 1) {
    assert.ok(simulation.plant('water-lily', 4 + index * 2.3, 0, surface('water', 0.12)))
  }
  assert.equal(simulation.countPlants('water-lily'), 3)
  assert.equal(simulation.countPlants(), 3)
  assert.equal(simulation.seedsFor('water-lily'), 2)
  assert.equal(simulation.seedsFor('clover'), 5)
})

test('selling a plant removes it, keeps its spent seed consumed, and cannot sell twice', () => {
  const simulation = stockedSimulation()
  const before = simulation.seedsFor('poppy')
  const poppy = simulation.plant('poppy', 0, 0, surface('soil'))
  assert.ok(poppy)
  assert.equal(simulation.seedsFor('poppy'), before - 1)
  assert.equal(simulation.countPlants('poppy'), 1)
  assert.equal(simulation.remove(poppy.instanceId).instanceId, poppy.instanceId)
  assert.equal(simulation.countPlants('poppy'), 0)
  assert.equal(simulation.seedsFor('poppy'), before - 1)
  assert.equal(simulation.remove(poppy.instanceId), null)
  assert.equal(simulation.seedsFor('poppy'), before - 1)
})

test('ground cover needs real turf: thin grass is refused, thick grass is fine', () => {
  const simulation = stockedSimulation()
  assert.equal(simulation.placementResult('clover', 0, 0, { ...surface('grass'), coverage: 0.3 }).failure, 'wrong-substrate')
  assert.equal(simulation.placementResult('dandelion', 0, 0, { ...surface('grass'), coverage: 0.3 }).failure, 'wrong-substrate')
  assert.equal(simulation.placementResult('clover', 0, 0, { ...surface('grass'), coverage: 0.9 }).valid, true)
  assert.equal(simulation.placementResult('dandelion', 0, 0, surface('soil')).failure, 'wrong-substrate')
})

test('ground-cover patches claim a round patch of lawn, so neighbours cannot overlap', () => {
  const simulation = stockedSimulation()
  assert.ok(simulation.plant('clover', 0, 0, surface('grass')))
  assert.equal(simulation.placementResult('dandelion', 1.5, 0, surface('grass')).failure, 'too-close')
  assert.equal(simulation.placementResult('dandelion', 2.6, 0, surface('grass')).valid, true)
})

test('clover asks for exactly two drinks, pausing at each, then grows up and stays for good', () => {
  const simulation = stockedSimulation()
  const clover = simulation.plant('clover', 0, 0, surface('grass'))
  assert.ok(clover)
  let asked = 0
  for (let step = 0; step < 400 && !simulation.plants[0].mature; step += 1) {
    simulation.tick(1)
    const state = simulation.plants[0]
    if (state.careNeeded) {
      assert.equal(state.careNeeded, 'water')
      const pausedAt = state.growth
      simulation.tick(30)
      assert.equal(simulation.plants[0].growth, pausedAt, 'growth waits for the player')
      assert.equal(simulation.resolveCare(clover.instanceId, 'prune'), false)
      assert.equal(simulation.resolveCare(clover.instanceId, 'water'), true)
      asked += 1
    }
  }
  assert.equal(asked, 2)
  assert.equal(simulation.plants[0].mature, true)
  simulation.tick(10000)
  assert.equal(simulation.plants[0].careNeeded, null)
  assert.equal(simulation.plants[0].growth, 1)
})

test('care is paced by growth, not by a clock: an unattended seedling never withers', () => {
  const simulation = stockedSimulation()
  simulation.plant('dandelion', 0, 0, surface('grass'))
  simulation.tick(5000)
  const waiting = simulation.plants[0]
  assert.equal(waiting.careNeeded, 'water')
  assert.ok(waiting.growth < 0.3 && waiting.growth > 0)
  assert.equal(simulation.countPlants('dandelion'), 1)
})

test('poppy asks for a drink, a pest shoo and a prune during growth, then matures without further maintenance', () => {
  const simulation = stockedSimulation()
  const poppy = simulation.plant('poppy', 0, 0, surface('soil'))
  assert.ok(poppy)
  const answered = []
  for (let step = 0; step < 600 && !simulation.plants[0].mature; step += 1) {
    simulation.tick(1)
    const care = simulation.plants[0].careNeeded
    if (care) {
      answered.push(care)
      assert.equal(simulation.resolveCare(poppy.instanceId, care === 'water' ? 'prune' : 'water'), false)
      assert.equal(simulation.resolveCare(poppy.instanceId, care), true)
    }
  }
  assert.deepEqual(answered, ['water', 'pest', 'prune', 'water'])
  assert.equal(simulation.plants[0].mature, true)
  simulation.tick(100)
  assert.equal(simulation.plants[0].growth, 1)
  assert.equal(simulation.plants[0].careNeeded, null)
})

test('every species has a care type and plays a minigame for each chore it asks for', () => {
  const types = new Set(['flower', 'bush', 'water'])
  for (const species of PLANT_CATALOG) {
    assert.ok(types.has(species.careType), `${species.id} has a care type`)
    assert.equal(species.minigames, true, `${species.id} plays minigames`)
    for (const stop of species.care) assert.ok(['water', 'pest', 'prune'].includes(stop.kind), `${species.id} asks a known chore`)
  }
  const byType = Object.fromEntries(['flower', 'bush', 'water'].map((type) => [type, PLANT_CATALOG.filter((species) => species.careType === type).map(({ id }) => id)]))
  assert.deepEqual(byType, { flower: ['clover', 'dandelion', 'poppy'], bush: ['blueberry'], water: ['water-lily'] })
})

test('every flower and water plant asks for all three chores, so each type uses all three games', () => {
  for (const id of ['poppy', 'water-lily']) {
    const kinds = PLANT_CATALOG.find((species) => species.id === id).care.map((stop) => stop.kind)
    assert.deepEqual([...new Set(kinds)].sort(), ['pest', 'prune', 'water'], id)
  }
})

test('a blueberry bush asks for a drink, a beetle swat and a snip, in that order', () => {
  const simulation = stockedSimulation()
  const bush = simulation.plant('blueberry', 0, 0, surface('soil'))
  assert.ok(bush)
  assert.equal(PLANT_CATALOG.find(({ id }) => id === 'blueberry').minigames, true)
  const answered = []
  for (let step = 0; step < 400; step += 1) {
    simulation.tick(1)
    const state = simulation.plants[0]
    if (state.careNeeded) {
      answered.push(state.careNeeded)
      assert.equal(simulation.resolveCare(bush.instanceId, state.careNeeded), true)
    }
  }
  assert.deepEqual(answered, ['water', 'pest', 'prune'])
  assert.equal(simulation.plants[0].mature, true)
})

test('a save from before the blueberry gift gets one blueberry seed, and a used-up one stays at zero', () => {
  const legacy = createPlantSimulation()
  const saved = JSON.parse(JSON.stringify(legacy.exportState()))
  delete saved.seeds.blueberry
  saved.seeds.poppy = 0
  const restored = createPlantSimulation()
  restored.importState(saved)
  assert.equal(restored.seedsFor('blueberry'), 1)
  assert.equal(restored.seedsFor('poppy'), 0)

  const usedUp = createPlantSimulation()
  const state = JSON.parse(JSON.stringify(usedUp.exportState()))
  state.seeds.blueberry = 0
  usedUp.importState(state)
  assert.equal(usedUp.seedsFor('blueberry'), 0)
})

test('a saved bush waiting on its beetles is still waiting after a reload', () => {
  const simulation = stockedSimulation()
  const bush = simulation.plant('blueberry', 0, 0, surface('soil'))
  while (simulation.plants[0].careNeeded !== 'pest') {
    simulation.tick(1)
    const state = simulation.plants[0]
    if (state.careNeeded === 'water') simulation.resolveCare(bush.instanceId, 'water')
  }
  const restored = createPlantSimulation()
  restored.importState(JSON.parse(JSON.stringify(simulation.exportState())))
  assert.equal(restored.plants[0].careNeeded, 'pest')
})
