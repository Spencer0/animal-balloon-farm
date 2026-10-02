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
const { createPlantSimulation, PLANT_CATALOG, PLANT_WATER_MIN_DEPTH, STARTING_SEEDS_PER_PLANT } = plants
const surface = (substrate, waterDepth = 0, inBounds = true) => ({ substrate, waterDepth, inBounds })

test('catalog starts with three useful plants and five seeds each', () => {
  assert.deepEqual(PLANT_CATALOG.map(({ id }) => id), ['clover', 'poppy', 'water-lily'])
  const simulation = createPlantSimulation()
  for (const species of PLANT_CATALOG) assert.equal(simulation.seedsFor(species.id), STARTING_SEEDS_PER_PLANT)
})

test('placement enforces bounds, substrate, visible pond water, seeds, and spacing', () => {
  const simulation = createPlantSimulation()
  assert.equal(simulation.placementResult('clover', 0, 0, surface('soil')).failure, 'wrong-substrate')
  assert.equal(simulation.placementResult('clover', 0, 0, surface('grass', 0, false)).failure, 'out-of-bounds')
  assert.equal(simulation.placementResult('water-lily', 0, 0, surface('water', PLANT_WATER_MIN_DEPTH / 2)).failure, 'needs-visible-water')
  assert.ok(simulation.plant('clover', 0, 0, surface('grass')))
  assert.equal(simulation.placementResult('poppy', 1.2, 0, surface('soil')).failure, 'too-close')
  assert.equal(simulation.placementResult('poppy', 1.5, 0, surface('soil')).valid, true)
  assert.equal(simulation.placementResult('water-lily', 4, 0, surface('water', PLANT_WATER_MIN_DEPTH)).valid, true)
})

test('planting spends only that seed and exposes species counts for future habitat rules', () => {
  const simulation = createPlantSimulation()
  for (let index = 0; index < 3; index += 1) {
    assert.ok(simulation.plant('water-lily', 4 + index * 2.3, 0, surface('water', 0.12)))
  }
  assert.equal(simulation.countPlants('water-lily'), 3)
  assert.equal(simulation.countPlants(), 3)
  assert.equal(simulation.seedsFor('water-lily'), 2)
  assert.equal(simulation.seedsFor('clover'), STARTING_SEEDS_PER_PLANT)
})

test('selling a plant removes it, keeps its spent seed consumed, and cannot sell twice', () => {
  const simulation = createPlantSimulation()
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

test('watering pauses clover growth until the player answers its care marker', () => {
  const simulation = createPlantSimulation()
  const clover = simulation.plant('clover', 0, 0, surface('grass'))
  assert.ok(clover)
  simulation.tick(15)
  assert.equal(simulation.plants[0].careNeeded, 'water')
  const pausedAt = simulation.plants[0].growth
  simulation.tick(8)
  assert.equal(simulation.plants[0].growth, pausedAt)
  assert.equal(simulation.resolveCare(clover.instanceId, 'prune'), false)
  assert.equal(simulation.resolveCare(clover.instanceId, 'water'), true)
  assert.equal(simulation.plants[0].careNeeded, null)
})

test('poppy needs pruning during growth, then matures without further maintenance', () => {
  const simulation = createPlantSimulation()
  const poppy = simulation.plant('poppy', 0, 0, surface('soil'))
  assert.ok(poppy)
  simulation.tick(26)
  assert.equal(simulation.plants[0].careNeeded, 'prune')
  const pausedAt = simulation.plants[0].growth
  simulation.tick(8)
  assert.equal(simulation.plants[0].growth, pausedAt)
  assert.equal(simulation.resolveCare(poppy.instanceId, 'water'), false)
  assert.equal(simulation.resolveCare(poppy.instanceId, 'prune'), true)

  for (let step = 0; step < 20 && !simulation.plants[0].mature; step += 1) {
    simulation.tick(10)
    if (simulation.plants[0].careNeeded === 'water') simulation.resolveCare(poppy.instanceId, 'water')
  }
  assert.equal(simulation.plants[0].mature, true)
  const matureGrowth = simulation.plants[0].growth
  simulation.tick(100)
  assert.equal(simulation.plants[0].growth, matureGrowth)
  assert.equal(simulation.plants[0].careNeeded, null)
})
