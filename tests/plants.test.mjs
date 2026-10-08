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
const { createPlantSimulation, PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, STARTING_SEEDS_PER_PLANT, SEED_PRICES } = plants
const stockedSimulation = () => {
  const simulation = createPlantSimulation()
  for (const species of PLANT_CATALOG) simulation.addSeeds(species.id, 5)
  return simulation
}
const surface = (substrate, waterDepth = 0, inBounds = true) => ({ substrate, waterDepth, inBounds })

test('catalog starts with four useful plants and an empty seed shed', () => {
  assert.deepEqual(PLANT_CATALOG.map(({ id }) => id), ['clover', 'dandelion', 'poppy', 'water-lily'])
  const simulation = createPlantSimulation()
  for (const species of PLANT_CATALOG) assert.equal(simulation.seedsFor(species.id), STARTING_SEEDS_PER_PLANT)
  assert.equal(STARTING_SEEDS_PER_PLANT, 0)
  assert.equal(simulation.placementResult('clover', 0, 0, surface('grass')).failure, 'out-of-seeds')
})

test('bought seeds land in the shed and every plant has a seed price', () => {
  const simulation = createPlantSimulation()
  assert.equal(simulation.addSeeds('poppy', 2), 2)
  assert.equal(simulation.addSeeds('poppy'), 3)
  assert.equal(simulation.addSeeds('poppy', -4), 3)
  for (const species of PLANT_CATALOG) assert.ok(SEED_PRICES[species.id] > 0)
  assert.ok(simulation.plant('poppy', 0, 0, surface('soil')))
  assert.equal(simulation.seedsFor('poppy'), 2)
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
  const poppy = simulation.plant('poppy', 0, 0, surface('soil'))
  assert.ok(poppy)
  assert.equal(simulation.seedsFor('poppy'), 4)
  assert.equal(simulation.countPlants('poppy'), 1)
  assert.equal(simulation.remove(poppy.instanceId).instanceId, poppy.instanceId)
  assert.equal(simulation.countPlants('poppy'), 0)
  assert.equal(simulation.seedsFor('poppy'), 4)
  assert.equal(simulation.remove(poppy.instanceId), null)
  assert.equal(simulation.seedsFor('poppy'), 4)
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

test('poppy needs pruning during growth, then matures without further maintenance', () => {
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
  assert.deepEqual(answered, ['water', 'prune', 'water'])
  assert.equal(simulation.plants[0].mature, true)
  simulation.tick(100)
  assert.equal(simulation.plants[0].growth, 1)
  assert.equal(simulation.plants[0].careNeeded, null)
})
