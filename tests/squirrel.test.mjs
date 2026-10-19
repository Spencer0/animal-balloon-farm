import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const plants = await load('src/game/plants.ts')
const conditions = await load('src/game/animal-conditions.ts')
const { requirementMet } = await load('src/game/animal-progress.ts')
const { createAnimalLife } = await load('src/game/animal-life.ts')
const raid = await load('src/game/plant-raid.ts')
const props = await load('src/game/farm-props.ts')
const { houseFor } = await load('src/game/animal-housing.ts')
const { propUnlocked } = await load('src/game/tool-unlocks.ts')
const { createWallet } = await load('src/game/sales.ts')
const { measureShortGrass, measureMeadow } = await load('src/game/farm-state.ts')
const empty = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }
const farm = (extra = {}) => ({ state: { ...empty, ...extra }, residentSpecies: new Set(), night: false })

function matureBush() {
  const simulation = plants.createPlantSimulation()
  simulation.addSeeds('blueberry', 1)
  assert.equal(simulation.placementResult('blueberry', 0, 0, { inBounds: true, substrate: 'grass', waterDepth: 0 }).valid, false)
  const bush = simulation.plant('blueberry', 0, 0, { inBounds: true, substrate: 'soil', waterDepth: 0 })
  assert.ok(bush)
  assert.equal(simulation.pickFruit(bush.instanceId), null, 'a seedling cannot feed a squirrel')
  const care = []
  for (let i = 0; i < 400 && !simulation.plants[0].mature; i++) {
    simulation.tick(1)
    const request = simulation.plants[0].careNeeded
    if (request) { care.push(request); simulation.resolveCare(bush.instanceId, request) }
  }
  assert.deepEqual(care, ['water', 'pest', 'prune'])
  assert.equal(simulation.plants[0].mature, true)
  return simulation
}

test('squirrel is in the catalog with custom animation; mainline blueberry minigames, seed gift and price remain', async () => {
  const { ANIMAL_CATALOG } = await load('src/animals/animal-catalog.ts')
  const squirrel = ANIMAL_CATALOG.find(({ id }) => id === 'squirrel')
  assert.ok(squirrel)
  assert.equal(squirrel.assetUrl, 'assets/animals/balloon-squirrel.glb')
  assert.deepEqual(plants.PLANT_CATALOG.find(({ id }) => id === 'blueberry').care.map(({ kind }) => kind), ['water', 'pest', 'prune'])
  assert.equal(plants.SEED_PRICES.blueberry, 12)
  assert.deepEqual(plants.STARTING_SEED_GIFTS.map(({ species }) => species), ['poppy', 'blueberry'])
})

test('formerly unrestricted visitors require short lawn; plant-lured visitors retain their food criterion', () => {
  for (const species of ['cow', 'pig', 'duck', 'goose', 'frog']) {
    const visit = conditions.getSpeciesConditions(species)[1].requirement
    assert.deepEqual(visit, { kind: 'shortGrassArea', amount: 2 })
    assert.equal(requirementMet(visit, farm({ meadowArea: 100, tallGrassArea: 100 })), false)
    assert.equal(requirementMet(visit, farm({ shortGrassArea: 1.99 })), false)
    assert.equal(requirementMet(visit, farm({ shortGrassArea: 2 })), true)
  }
  assert.deepEqual(conditions.getSpeciesConditions('raccoon')[1].requirement, { kind: 'shortGrassArea', amount: 2 })
  for (const [species, plant] of [['sheep', 'clover'], ['chicken', 'dandelion'], ['squirrel', 'blueberry']]) {
    assert.deepEqual(conditions.getSpeciesConditions(species)[1].requirement, { kind: 'plantCount', species: plant, amount: 1 })
  }
})

test('short grass counts established lawn cells but excludes stubs and tall meadow blades', () => {
  const lawn = [0, 1, 2].flatMap((cell) => Array.from({ length: 3 }, (_, i) => ({ x: cell * .58 + .01, z: .01 + i * .01, height: cell === 0 ? .3 : cell === 1 ? .05 : .9 })))
  assert.equal(measureShortGrass(lawn), .34)
  assert.equal(measureMeadow(lawn), .34)
})

test('blueberry crop depletes one visible slot at a time and regrows after 60 seconds without losing maturity', () => {
  const simulation = matureBush()
  const id = simulation.plants[0].instanceId
  assert.equal(simulation.plants[0].ripeFruit, 6)
  for (let slot = 0; slot < 6; slot++) {
    assert.equal(simulation.pickFruit(id), slot)
    assert.equal(simulation.plants[0].ripeFruit, 5 - slot)
  }
  assert.equal(simulation.pickFruit(id), null)
  assert.equal(simulation.plants[0].mature, true)
  simulation.tick(59.9)
  assert.equal(simulation.plants[0].ripeFruit, 0)
  simulation.tick(.1 + 1e-9)
  assert.equal(simulation.plants[0].ripeFruit, 6)
  assert.equal(simulation.plants[0].careNeeded, null)
})

test('fruit timers survive saves and older/malformed saves load safely', () => {
  const simulation = matureBush()
  simulation.pickFruit(1)
  simulation.tick(20)
  const saved = simulation.exportState()
  const restored = plants.createPlantSimulation()
  restored.importState(saved)
  assert.deepEqual(restored.plants, simulation.plants)
  restored.tick(39)
  assert.equal(restored.plants[0].ripeFruit, 5)
  restored.tick(1)
  assert.equal(restored.plants[0].ripeFruit, 6)
  const old = { ...saved, plants: saved.plants.map(({ fruitTimers, ...plant }) => plant) }
  restored.importState(old)
  assert.equal(restored.plants[0].ripeFruit, 6)
  restored.importState({ ...saved, plants: [{ ...saved.plants[0], fruitTimers: [-1, Infinity, NaN, 10000] }] })
  assert.deepEqual(restored.plants[0].fruitTimers, [0, 0, 0, 60, 0, 0])
})

test('squirrel discovery, visit, personal full-crop residency and house ladder are registered', () => {
  assert.equal(conditions.isNightOnly('squirrel'), false)
  assert.equal(requirementMet(conditions.DISCOVERY.squirrel, farm()), false)
  assert.equal(requirementMet(conditions.DISCOVERY.squirrel, farm({ plantCounts: { blueberry: 1 } })), true)
  assert.deepEqual(conditions.getSpeciesConditions('squirrel').map(({ stage }) => stage), [1, 2, 3, 4])
  assert.deepEqual(conditions.getSpeciesConditions('squirrel')[2].requirement, { kind: 'fruitEaten', species: 'blueberry', amount: 6 })
  assert.equal(houseFor('squirrel'), 'squirrel-house')
  assert.equal(propUnlocked('squirrel-house', 1), true)
  const inventory = props.createPropInventory()
  assert.equal(props.purchaseProp(createWallet(65), inventory, 'squirrel-house').ok, true)
  assert.equal(inventory.count('squirrel-house'), 1)
  assert.deepEqual(props.PROP_CATALOG['squirrel-house'].footprint, { width: 1, depth: 1 })
})

test('six berries settle only their eater; partial progress persists and house enables love and indoor births', () => {
  const life = createAnimalLife(['squirrel'], { config: { enterFarmSeconds: 0, arrivalIntervalSeconds: 10000, breedIntervalSeconds: 1 } })
  const a = life.add('squirrel', 2)
  const b = life.add('squirrel', 2)
  const world = { farm: farm({ plantCounts: { blueberry: 1 }, fruitEaten: { blueberry: 99 } }), expansionLevel: 0 }
  life.tick(world, .25)
  assert.equal(life.animal(a.id).stage, 2, 'shared external tallies cannot settle it')
  for (let i = 0; i < 5; i++) life.recordFruitEaten(a.id, 'blueberry')
  life.tick(world, .25)
  assert.equal(life.animal(a.id).stage, 2)
  assert.equal(life.statusOf(a.id)[2].current, 5)
  const restored = createAnimalLife(['squirrel'], { config: { enterFarmSeconds: 0, arrivalIntervalSeconds: 10000, breedIntervalSeconds: 1 } })
  restored.importState(life.exportState())
  assert.equal(restored.animal(a.id).fruitEaten.blueberry, 5)
  restored.recordFruitEaten(a.id, 'blueberry')
  restored.tick(world, .25)
  assert.equal(restored.animal(a.id).stage, 3)
  assert.equal(restored.animal(b.id).stage, 2)
  assert.equal(restored.statusOf(a.id)[2].met, true)
  for (let i = 0; i < 6; i++) restored.recordFruitEaten(b.id, 'blueberry')
  const house = { id: 'den-1', prop: 'squirrel-house', x: 3, z: 0 }
  const housed = { ...world, houses: [house], farm: farm({ plantCounts: { blueberry: 1 }, propCounts: { 'squirrel-house': 1 } }) }
  const events = []
  for (let i = 0; i < 8; i++) events.push(...restored.tick(housed, .25))
  assert.equal(restored.animal(a.id).stage, 4)
  assert.equal(restored.animal(b.id).stage, 4)
  const birth = events.find((event) => event.kind === 'birth')
  assert.ok(birth)
  assert.equal(restored.animal(birth.animalId).insideId, 'den-1')
})

test('foraging approaches a bush, plucks after the reach, chews before credit, and cannot double-pick a contested berry', () => {
  const simulation = matureBush()
  for (let i = 0; i < 5; i++) simulation.raid(1)
  const state = raid.createPlantRaider()
  const other = raid.createPlantRaider()
  const bite = (id) => simulation.raid(id)
  const step = (s, x, dt) => raid.stepPlantRaider(s, { species: 'squirrel', x, z: 0, eligible: true }, simulation.plants, dt, bite)
  assert.ok(step(state, 4, .1).target.speedScale > 0)
  assert.equal(step(state, .82, .1).eating, true)
  assert.equal(step(other, -.82, .1).eating, true)
  const pluck = step(state, .82, .7)
  assert.equal(pluck.holdingBerry, true)
  assert.equal(pluck.completedBite, false)
  assert.equal(simulation.plants[0].ripeFruit, 0)
  assert.equal(step(other, -.82, .7).holdingBerry, false)
  assert.equal(step(state, .82, 1.8).completedBite, true)
  assert.equal(step(state, .82, .1).completedBite, false, 'a bite is credited only once')
})

test('selling the target or interrupting a feed stops eating without phantom credit', () => {
  const simulation = matureBush()
  const state = raid.createPlantRaider()
  const actor = { species: 'squirrel', x: .82, z: 0, eligible: true }
  raid.stepPlantRaider(state, actor, simulation.plants, .1, (id) => simulation.raid(id))
  simulation.remove(1)
  assert.equal(raid.stepPlantRaider(state, actor, simulation.plants, 3, () => false).completedBite, false)
  assert.equal(raid.stepPlantRaider(state, { ...actor, eligible: false }, [], .1, () => false).eating, false)
  assert.equal(state.phase, 'seek')
})

test('delivered Blender assets exist, use six berry slots and ship matching WALK/IDLE/EAT joint channels', () => {
  const readGlb = (path) => {
    const bytes = readFileSync(path)
    return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  }
  for (const path of ['public/assets/animals/balloon-squirrel.blend', 'public/assets/animals/balloon-squirrel-review.png', 'public/assets/props/squirrel-house.glb', 'public/assets/props/prop-squirrel-house.png', 'public/assets/seeds/seed-blueberry.png']) assert.ok(existsSync(path), path)
  const squirrel = readGlb('public/assets/animals/balloon-squirrel.glb')
  assert.deepEqual(squirrel.animations.map((a) => a.name).sort(), ['EAT', 'IDLE', 'WALK'])
  const channels = squirrel.animations.map((a) => a.channels.map((c) => `${c.target.node}:${c.target.path}`).sort())
  assert.deepEqual(channels[0], channels[1])
  assert.deepEqual(channels[1], channels[2])
  assert.ok(squirrel.nodes.some((node) => node.name === 'SQUIRREL RIG held berry'))
  const bush = readGlb('public/assets/plants/blueberry-bush.glb')
  for (let slot = 1; slot <= 6; slot++) assert.ok(bush.nodes.some((node) => node.name === `BB_berry_${slot}_1`), `berry group ${slot}`)
})

test('six squirrel bites strip a bush bare: it withers for good and stops counting as grown', () => {
  const simulation = matureBush()
  for (let i = 0; i < 5; i++) assert.equal(simulation.raid(1), true)
  assert.equal(simulation.plants[0].withered, false)
  assert.equal(simulation.raid(1), true)
  const bush = simulation.plants[0]
  assert.equal(bush.withered, true)
  assert.equal(bush.mature, false, 'a withered bush is not a grown bush')
  assert.equal(bush.ripeFruit, 0)
  simulation.tick(600)
  assert.equal(simulation.plants[0].ripeFruit, 0, 'its berries never come back')
  assert.equal(simulation.raid(1), false)
  assert.equal(simulation.pickFruit(1), null)
  const restored = plants.createPlantSimulation()
  restored.importState(JSON.parse(JSON.stringify(simulation.exportState())))
  assert.equal(restored.plants[0].withered, true, 'a save keeps the bush withered')
})

test('the bite that withers the bush still counts toward the picnic', () => {
  const simulation = matureBush()
  for (let i = 0; i < 5; i++) simulation.raid(1)
  const state = raid.createPlantRaider()
  const step = (dt) => raid.stepPlantRaider(state, { species: 'squirrel', x: .82, z: 0, eligible: true }, simulation.plants, dt, (id) => simulation.raid(id))
  step(.1)
  step(.7)
  assert.equal(simulation.plants[0].withered, true)
  assert.equal(step(1.8).completedBite, true)
})

test('raiders eat only their own plants, and never a fenced-in one', () => {
  const simulation = matureBush()
  const actor = (species) => ({ species, x: 4, z: 0, eligible: true })
  assert.equal(raid.stepPlantRaider(raid.createPlantRaider(), actor('mole'), simulation.plants, .1, () => true).target, null, 'a mole leaves berries alone')
  assert.ok(raid.stepPlantRaider(raid.createPlantRaider(), actor('squirrel'), simulation.plants, .1, () => true).target)
  const fenced = new Set([1])
  assert.equal(raid.stepPlantRaider(raid.createPlantRaider(), actor('squirrel'), simulation.plants, .1, () => true, fenced).target, null)
  // Fenced in mid-approach: it gives up.
  const state = raid.createPlantRaider()
  raid.stepPlantRaider(state, actor('squirrel'), simulation.plants, .1, () => true)
  assert.equal(raid.stepPlantRaider(state, actor('squirrel'), simulation.plants, .1, () => true, fenced).target, null)
  assert.equal(state.phase, 'rest')
})

test('every plant but the flowers has a raider, and the fence pen math shuts plants in', () => {
  for (const species of plants.PLANT_CATALOG) {
    if (species.careType === 'flower') assert.equal(species.raid, undefined, `${species.id} is never eaten`)
    else assert.ok(species.raid && species.raid.by.length > 0 && species.raid.bites > 0, `${species.id} has a raider`)
  }
  // A 2x1-cell pen from vertex (0,0) to (2,1).
  const pen = [
    ...props.fenceSegmentsBetween({ x: 0, z: 0 }, { x: 2, z: 0 }),
    ...props.fenceSegmentsBetween({ x: 0, z: 1 }, { x: 2, z: 1 }),
    ...props.fenceSegmentsBetween({ x: 0, z: 0 }, { x: 0, z: 1 }),
    ...props.fenceSegmentsBetween({ x: 2, z: 0 }, { x: 2, z: 1 }),
  ]
  assert.deepEqual([...props.fencedCells(pen)].sort(), ['0,0', '1,0'])
  assert.equal(props.fencedCells(pen.slice(1)).size, 0, 'one missing rail leaves the pen open')
  assert.equal(props.fencedCells([]).size, 0)
})
