import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/animal-life.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const lifeModule = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createAnimalLife } = lifeModule
const emptyFarm = { state: { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }, residentSpecies: new Set(['cow']) }
const lushFarm = { state: { tallGrassArea: 40, waterArea: 0, flatGrassArea: 40, plantCounts: {} }, residentSpecies: new Set(['cow']) }
const snapshot = (farm = emptyFarm, expansionLevel = 0) => ({ farm, expansionLevel })
const quickConfig = {
  visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0,
  romanceChance: 1, romanceCooldownSeconds: 2, eggIncubationSeconds: 3,
  babyDurationSeconds: 10, courtshipSeconds: 0, baseResidentCapacity: 20, residentsPerExpansion: 2,
}
const runFor = (life, world, seconds, events = []) => {
  for (let i = 0; i < seconds * 4; i += 1) events.push(...life.tick(world, 0.25))
  return events
}

test('arrivals trickle one at a time and a species may have duplicate residents', () => {
  const life = createAnimalLife(['cow', 'sheep'], { config: { ...quickConfig, arrivalIntervalSeconds: 1 }, random: () => 0.99 })
  assert.equal(life.all().filter((animal) => animal.stage > 0).length, 0)
  runFor(life, snapshot(), 2)
  const arrivals = life.all().filter((animal) => animal.stage > 0)
  assert.ok(arrivals.length >= 1 && arrivals.length <= 2, JSON.stringify(arrivals))
  assert.ok(arrivals.every((animal) => animal.stage <= 2))
})

test('a successful same-species courtship lays a timed egg and hatching creates a baby', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig, random: () => 0 })
  const events = []
  runFor(life, snapshot(lushFarm), 2, events)
  const courtship = events.find((event) => event.kind === 'courtship')
  const laid = events.find((event) => event.kind === 'layEgg')
  assert.ok(courtship)
  assert.ok(laid)
  assert.equal(laid.species, 'cow')
  assert.equal(life.eggs()[0].ready, false)
  assert.equal(life.hatch(laid.eggId), null)
  runFor(life, snapshot(lushFarm), 3)
  assert.equal(life.eggs()[0].ready, true)
  const hatch = life.hatch(laid.eggId)
  assert.equal(hatch.kind, 'hatch')
  const baby = life.animal(hatch.animalId)
  assert.equal(baby.baby, true)
  assert.equal(baby.growth, 0.1)
  assert.equal(baby.heartEyes, false)
  runFor(life, snapshot(lushFarm), 5)
  assert.ok(life.animal(baby.id).growth > 0.5)
  runFor(life, snapshot(lushFarm), 5)
  assert.equal(life.animal(baby.id).baby, false)
  assert.equal(life.animal(baby.id).growth, 1)
})

test('the default simulation and renderer population limits are 50 animals', () => {
  const life = createAnimalLife(Array.from({ length: 75 }, (_, index) => `species-${index}`))
  assert.equal(life.all().length, 50)
  assert.equal(life.capacity(15), 50)
  assert.equal(life.capacity(99), 50)
})

test('the simulation-wide population cap is hard, including starter records and explicit additions', () => {
  const life = createAnimalLife(['cow', 'sheep', 'pig'], {
    config: { ...quickConfig, maximumPopulation: 2 }, random: () => 0,
  })
  assert.equal(life.all().length, 2, 'starter records respect the global cap')
  assert.equal(life.add('cow'), null, 'explicit creation cannot exceed the global cap')
  assert.equal(life.all().length, 2)
  assert.equal(life.add('sheep'), null)
  assert.equal(life.add('unknown'), null)
  life.reset()
  assert.equal(life.all().length, 2)
})

test('population capacity scales with expansions and a hatch replaces its reserved egg slot', () => {
  const life = createAnimalLife(['cow'], { config: { ...quickConfig, baseResidentCapacity: 5 }, random: () => 0 })
  assert.equal(life.capacity(0), 5)
  assert.equal(life.capacity(4), 13)
  const events = []
  runFor(life, snapshot(lushFarm), 3, events)
  const egg = events.find((event) => event.kind === 'layEgg')
  assert.ok(egg)
  runFor(life, snapshot(lushFarm), 3)
  const populationBefore = life.all().filter((animal) => animal.stage > 0).length + life.eggs().length
  const hatch = life.hatch(egg.eggId)
  assert.equal(hatch.kind, 'hatch', 'the egg already reserves the population slot used by its baby')
  const populationAfter = life.all().filter((animal) => animal.stage > 0).length + life.eggs().length
  assert.equal(populationAfter, populationBefore)
})

test('courtship stays in progress until its timer completes before laying an egg', () => {
  const life = createAnimalLife(['cow'], { config: { ...quickConfig, courtshipSeconds: 1 }, random: () => 0 })
  const events = []
  while (!events.some((event) => event.kind === 'courtship')) {
    events.push(...life.tick(snapshot(lushFarm), 0.25))
  }
  const duringCourtship = life.tick(snapshot(lushFarm), 0.25)
  assert.equal(duringCourtship.some((event) => event.kind === 'layEgg'), false)
  runFor(life, snapshot(lushFarm), 1, events)
  assert.ok(events.some((event) => event.kind === 'layEgg'))
})

test('same-species partners cannot immediately court a second time', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig, random: () => 0 })
  const events = []
  runFor(life, snapshot(lushFarm), 3, events)
  assert.equal(events.filter((event) => event.kind === 'courtship').length, 1)
})
