import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const { createAnimalLife } = await load('src/game/animal-life.ts')
const conditions = await load('src/game/animal-conditions.ts')
const props = await load('src/game/farm-props.ts')
const { createWallet } = await load('src/game/sales.ts')

const EMPTY = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {}, residentCounts: {}, preyEaten: {}, propCounts: {} }
const farm = (state = {}, night = false) => ({
  night,
  state: { ...EMPTY, ...state },
  residentSpecies: new Set(),
})
const quick = {
  visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0,
  baseResidentCapacity: 20, residentsPerExpansion: 2, romanceChance: 0,
}
const SPECIES = ['cow', 'sheep', 'chicken', 'owl']
const lifeOf = () => createAnimalLife(SPECIES, { config: quick })
const run = (life, world, seconds) => {
  const events = []
  for (let i = 0; i < seconds * 4; i += 1) events.push(...life.tick({ farm: world, expansionLevel: 0 }, 0.25))
  return events
}
const stageOf = (life, species) => Math.max(0, ...life.all().filter((a) => a.species === species).map((a) => a.stage))

test('on a bare plot only the cow turns up: sheep and chickens wait for their plants', () => {
  const life = lifeOf()
  run(life, farm(), 60)
  assert.ok(stageOf(life, 'cow') >= 1)
  assert.equal(stageOf(life, 'sheep'), 0)
  assert.equal(stageOf(life, 'chicken'), 0)
  assert.equal(stageOf(life, 'owl'), 0)
})

test('two clover patches bring the sheep, two dandelion patches bring the chickens', () => {
  const life = lifeOf()
  run(life, farm({ tallGrassArea: 20 }), 10)
  assert.equal(stageOf(life, 'cow'), 3, 'the cow settles on grass alone')
  run(life, farm({ tallGrassArea: 20, plantCounts: { clover: 1, dandelion: 1 } }), 30)
  assert.equal(stageOf(life, 'sheep'), 0)
  assert.equal(stageOf(life, 'chicken'), 0)
  run(life, farm({ tallGrassArea: 20, plantCounts: { clover: 2 } }), 30)
  assert.ok(stageOf(life, 'sheep') >= 1)
  assert.equal(stageOf(life, 'chicken'), 0)
  run(life, farm({ tallGrassArea: 20, plantCounts: { clover: 2, dandelion: 2 } }), 30)
  assert.ok(stageOf(life, 'chicken') >= 1)
})

test('a sheep only wanders onto the farm once three clover patches are growing', () => {
  const life = lifeOf()
  run(life, farm({ tallGrassArea: 20 }), 10)
  run(life, farm({ tallGrassArea: 20, plantCounts: { clover: 2 } }), 30)
  assert.equal(stageOf(life, 'sheep'), 1)
  run(life, farm({ tallGrassArea: 20, plantCounts: { clover: 3 } }), 5)
  assert.equal(stageOf(life, 'sheep'), 2)
})

test('sheep settle only with level pasture and a barn; chickens only with grass and a coop', () => {
  const life = lifeOf()
  const plants = { clover: 3, dandelion: 3 }
  const pasture = { plantCounts: plants, flatGrassArea: 20, tallGrassArea: 20 }
  run(life, farm({ tallGrassArea: 20 }), 10)
  run(life, farm(pasture), 40)
  run(life, farm({ plantCounts: plants, tallGrassArea: 0 }), 0.25)
  run(life, farm(pasture), 10)
  assert.equal(stageOf(life, 'sheep'), 2, 'no barn yet')
  assert.equal(stageOf(life, 'chicken'), 2, 'no coop yet')
  run(life, farm({ ...pasture, propCounts: { barn: 1 } }), 10)
  assert.equal(stageOf(life, 'sheep'), 3)
  assert.equal(stageOf(life, 'chicken'), 2)
  run(life, farm({ ...pasture, propCounts: { barn: 1, coop: 1 } }), 10)
  assert.ok(stageOf(life, 'chicken') >= 3)
})

test("the breeding rung asks for every species' own house, since babies are born indoors", () => {
  const cow = conditions.getSpeciesConditions('cow')[3].requirement
  assert.equal(cow.kind, 'grassArea')
  assert.deepEqual(cow.and, [{ kind: 'propCount', species: 'barn', amount: 1 }])
  const houses = { cow: 'barn', sheep: 'barn', chicken: 'coop', duck: 'coop', goose: 'goose-house', pig: 'sty', frog: 'frog-house', owl: 'owl-box', raccoon: 'dumpster' }
  const asks = (requirement, prop) => (requirement.kind === 'propCount' && requirement.species === prop)
    || (requirement.and ?? []).some((also) => asks(also, prop))
  for (const [species, prop] of Object.entries(houses)) {
    assert.ok(asks(conditions.getSpeciesConditions(species)[3].requirement, prop), `${species} loves the farm only with a ${prop}`)
  }
  assert.equal(conditions.getSpeciesConditions('sheep')[3].requirement.and[0].species, 'clover')
})

test('day animals arrive and visit only in daylight, owls only after dark', () => {
  const life = lifeOf()
  run(life, farm({}, true), 60)
  assert.equal(stageOf(life, 'cow'), 0, 'the cow waits out the night')
  run(life, farm({ residentCounts: { chicken: 1 } }, true), 30)
  assert.ok(stageOf(life, 'owl') >= 1, 'the owl comes by night')
  run(life, farm({ residentCounts: { chicken: 3 } }, false), 30)
  assert.ok(stageOf(life, 'cow') >= 1, 'the cow comes by day')
  assert.equal(stageOf(life, 'owl'), 1, 'the owl does not visit by day')
})

test('a day animal that has already arrived waits for morning to step inside the fence', () => {
  const life = createAnimalLife(['cow'], { config: { ...quick, visitDelaySeconds: 0 } })
  run(life, farm({}, false), 2)
  assert.equal(stageOf(life, 'cow'), 2)
  const night = createAnimalLife(['cow'], { config: quick })
  night.setStage(night.all()[0].id, 1)
  run(night, farm({}, true), 10)
  assert.equal(stageOf(night, 'cow'), 1)
  run(night, farm({}, false), 2)
  assert.equal(stageOf(night, 'cow'), 2)
})

test('residents are not driven off at night: chickens must be there for the owl to hunt', () => {
  const life = lifeOf()
  life.setStage(life.all().find((a) => a.species === 'chicken').id, 3)
  run(life, farm({}, true), 30)
  assert.equal(stageOf(life, 'chicken'), 3)
})

test('the small barn is a two-cell blocking prop sold in the shop', () => {
  const barn = props.PROP_CATALOG.barn
  assert.equal(barn.modelUrl, 'assets/props/barn.glb')
  assert.deepEqual(barn.footprint, { width: 2, depth: 2 })
  assert.equal(barn.blocking, true)
  assert.ok(props.PROP_ORDER.includes('barn'))
  const wallet = createWallet(barn.price)
  const inventory = props.createPropInventory()
  assert.equal(props.purchaseProp(wallet, inventory, 'barn').ok, true)
  assert.equal(inventory.count('barn'), 1)
})

test('journal labels read naturally for the new plant and prop requirements', () => {
  assert.equal(conditions.conditionMetricLabel({ kind: 'plantCount', species: 'clover', amount: 3 }), 'Clover patches')
  assert.equal(conditions.conditionMetricLabel({ kind: 'plantCount', species: 'dandelion', amount: 3 }), 'Dandelion patches')
  assert.equal(conditions.conditionMetricLabel({ kind: 'propCount', species: 'barn', amount: 1 }), 'Small barns on the farm')
  assert.equal(conditions.conditionMetricLabel({ kind: 'propCount', species: 'coop', amount: 1 }), 'Chicken coops on the farm')
  assert.equal(conditions.conditionMetricLabel({ kind: 'propCount', species: 'oak', amount: 1 }), 'Oak trees on the farm')
})
