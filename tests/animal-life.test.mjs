import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/animal-life.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const lifeModule = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createAnimalLife } = lifeModule
const emptyFarm = { state: { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }, residentSpecies: new Set(['cow']) }
const lushFarm = { state: { tallGrassArea: 40, waterArea: 0, flatGrassArea: 40, plantCounts: {}, propCounts: { barn: 1, coop: 1 } }, residentSpecies: new Set(['cow']) }
const barn = { id: 'barn-1', prop: 'barn', x: 0, z: 0 }
const snapshot = (farm = emptyFarm, houses = [], expansionLevel = 0) => ({ farm, expansionLevel, houses })
const quickConfig = {
  visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0,
  breedIntervalSeconds: 3, babyDurationSeconds: 10,
}
const runFor = (life, world, seconds, events = []) => {
  for (let i = 0; i < seconds * 4; i += 1) events.push(...life.tick(world, 0.25))
  return events
}
const lovingCows = (life, count) => {
  for (let index = 0; index < count; index += 1) life.add('cow', 4)
}

test('arrivals trickle one at a time and a species may have duplicate residents', () => {
  const life = createAnimalLife(['cow', 'sheep'], { config: { ...quickConfig, arrivalIntervalSeconds: 1 } })
  assert.equal(life.all().filter((animal) => animal.stage > 0).length, 0)
  runFor(life, snapshot(), 2)
  const arrivals = life.all().filter((animal) => animal.stage > 0)
  assert.ok(arrivals.length >= 1 && arrivals.length <= 2, JSON.stringify(arrivals))
  assert.ok(arrivals.every((animal) => animal.stage <= 2))
})

test('no eggs: two loving adults with room in a house have a baby born inside the house', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  lovingCows(life, 2)
  const events = runFor(life, snapshot(lushFarm, [barn]), 4)
  const birth = events.find((event) => event.kind === 'birth')
  assert.ok(birth, JSON.stringify(events))
  assert.equal(birth.species, 'cow')
  assert.equal(birth.houseId, 'barn-1')
  assert.equal(birth.parentIds.length, 2)
  assert.equal(birth.action, 'breedSpecies')
  assert.equal(events.some((event) => ['layEgg', 'hatch', 'courtship'].includes(event.kind)), false)
  const baby = life.animal(birth.animalId)
  assert.equal(baby.baby, true)
  assert.equal(baby.insideId, 'barn-1', 'born indoors')
  assert.equal(baby.stage, 3)
  assert.equal(baby.heartEyes, false)
  runFor(life, snapshot(lushFarm, [barn]), 12)
  assert.equal(life.animal(baby.id).baby, false)
  assert.equal(life.animal(baby.id).growth, 1)
})

test('without a house there are no births, however long the pair waits', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  lovingCows(life, 2)
  const events = runFor(life, snapshot(lushFarm, []), 30)
  assert.equal(events.some((event) => event.kind === 'birth'), false)
})

test('a house only takes the species it is built for', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  lovingCows(life, 2)
  const events = runFor(life, snapshot(lushFarm, [{ id: 'coop-1', prop: 'coop', x: 0, z: 0 }]), 30)
  assert.equal(events.some((event) => event.kind === 'birth'), false)
  assert.ok(life.all().every((animal) => animal.insideId === null))
})

test('nobody owns a bed: any resident can walk into a house with room, and a full house stops births', () => {
  const life = createAnimalLife(['cow'], { config: { ...quickConfig, houseCapacity: 3 } })
  lovingCows(life, 2)
  const visitor = life.add('cow', 2)
  const resident = life.add('cow', 3)
  runFor(life, snapshot(emptyFarm, [barn]), 0.25)
  assert.equal(life.enterHouse(visitor.id, 'barn-1'), false, 'a visitor is still deciding whether to stay')
  assert.equal(life.enterHouse(resident.id, 'barn-1'), true)
  assert.equal(life.enterHouse(resident.id, 'coop-1'), false, 'no such house')
  // A bare farm, so the visitor never settles and the loving pair keeps its rung.
  const events = runFor(life, snapshot(emptyFarm, [barn]), 30)
  const births = events.filter((event) => event.kind === 'birth')
  assert.equal(births.length, 2, 'one cow inside, so room for two babies')
  assert.equal(life.housing().capacity, 3)
  assert.equal(life.housing().used, 3)
  const [first] = life.all().filter((animal) => animal.stage >= 4)
  assert.equal(life.enterHouse(first.id, 'barn-1'), false, 'the barn is full')
  life.leaveHouse(resident.id)
  assert.equal(life.enterHouse(first.id, 'barn-1'), true, 'whoever walks in takes the space')
})

test('taking a house away puts everyone inside back out on the farm', () => {
  const life = createAnimalLife(['cow'], { config: quickConfig })
  const cow = life.add('cow', 3)
  runFor(life, snapshot(lushFarm, [barn]), 0.25)
  assert.equal(life.enterHouse(cow.id, 'barn-1'), true)
  runFor(life, snapshot(lushFarm, [barn]), 1)
  assert.equal(life.animal(cow.id).insideId, 'barn-1')
  runFor(life, snapshot(lushFarm, []), 0.25)
  assert.equal(life.animal(cow.id).insideId, null)
})

test('more pairs breed faster, up to the cap', () => {
  const countBirths = (cows) => {
    const life = createAnimalLife(['cow'], { config: { ...quickConfig, breedIntervalSeconds: 12 } })
    lovingCows(life, cows)
    return runFor(life, snapshot(lushFarm, [barn, { id: 'barn-2', prop: 'barn', x: 4, z: 0 }]), 12).filter((event) => event.kind === 'birth').length
  }
  assert.equal(countBirths(2), 1)
  assert.ok(countBirths(6) > countBirths(2))
})

test('the simulation-wide population cap is hard, including starter records and explicit additions', () => {
  const life = createAnimalLife(['cow', 'sheep', 'pig'], { config: { ...quickConfig, maximumPopulation: 2 } })
  assert.equal(life.all().length, 2, 'starter records respect the global cap')
  assert.equal(life.add('cow'), null, 'explicit creation cannot exceed the global cap')
  assert.equal(life.all().length, 2)
  assert.equal(life.add('sheep'), null)
  assert.equal(life.add('unknown'), null)
  life.reset()
  assert.equal(life.all().length, 2)
})

test('a species with no room indoors keeps only a few animals before new arrivals stop', () => {
  const life = createAnimalLife(['cow'], { config: { ...quickConfig, unhousedPerSpecies: 2 } })
  life.add('cow', 3)
  life.add('cow', 3)
  assert.equal(life.hasRoomFor('cow'), false, 'two cows out on the farm fill the outdoor allowance')
  runFor(life, snapshot(lushFarm, [barn]), 1)
  assert.equal(life.hasRoomFor('cow'), true, 'a barn adds room')
})

test('selling the only cow queues a new cow instead of ending its visits', () => {
  const life = createAnimalLife(['cow'], { config: { ...quickConfig, arrivalIntervalSeconds: 1, breedIntervalSeconds: 10_000 } })
  runFor(life, snapshot(lushFarm), 6)
  const sold = life.all().filter((animal) => animal.species === 'cow' && animal.stage > 0)
  assert.ok(sold.length > 0)
  for (const cow of sold) life.remove(cow.id)
  assert.equal(life.all().filter((animal) => animal.species === 'cow' && animal.stage > 0).length, 0)
  runFor(life, snapshot(lushFarm), 6)
  assert.ok(life.all().some((animal) => animal.species === 'cow' && animal.stage > 0 && !sold.some((old) => old.id === animal.id)))
})
