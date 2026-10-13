import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The starhorn: a unique, houseless end-game animal that comes only to a farm in
 * harmony and makes star gems. One bundle so the modules share state.
 */
const { outputFiles } = await build({
  stdin: {
    contents: [
      "export * from './src/game/animal-life.ts'",
      "export * from './src/game/animal-conditions.ts'",
      "export * from './src/game/animal-progress.ts'",
      "export * from './src/game/farm-state.ts'",
      "export * from './src/game/animal-housing.ts'",
      "export * from './src/game/harmony.ts'",
      "export * from './src/game/accomplishments.ts'",
      "export { ANIMAL_CATALOG } from './src/animals/animal-catalog.ts'",
      "export { createWallet, ANIMAL_SALE_PRICES } from './src/game/sales.ts'",
      "export { DIETS, PRODUCE } from './src/game/animal-diet.ts'",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const farm = (state = {}, residentSpecies = []) => ({
  state: { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {}, ...state },
  residentSpecies: new Set(residentSpecies),
})

// ---- the ladder ----------------------------------------------------------------

test('the starhorn is in the catalog, priced, and has a harmony ladder', () => {
  assert.ok(m.ANIMAL_CATALOG.some((entry) => entry.id === 'starhorn'))
  assert.ok(m.ANIMAL_SALE_PRICES.starhorn > 0)
  const stages = m.getSpeciesConditions('starhorn')
  assert.equal(stages.length, 4)
  assert.deepEqual(stages.map((stage) => stage.requirement?.kind), ['harmony', 'harmony', 'harmony', 'harmony'])
  assert.deepEqual(stages.map((stage) => stage.requirement?.amount), [70, 75, 80, 90])
  assert.deepEqual(stages[2].requirement.and, [{ kind: 'flowerCount', amount: 6 }])
})

test('discovery is harmony 70, and it is the same bar as the carnival rung', () => {
  assert.deepEqual({ kind: m.DISCOVERY.starhorn.kind, amount: m.DISCOVERY.starhorn.amount }, { kind: 'harmony', amount: 70 })
  assert.equal(m.requirementMet(m.DISCOVERY.starhorn, farm({ harmony: 69 })), false)
  assert.equal(m.requirementMet(m.DISCOVERY.starhorn, farm({ harmony: 70 })), true)
})

test('visit at harmony 75; home needs harmony 80 and six grown flowers of any kind; love is harmony 90', () => {
  const [, visit, home, love] = m.getSpeciesConditions('starhorn')
  assert.equal(m.requirementMet(visit.requirement, farm({ harmony: 74 })), false)
  assert.equal(m.requirementMet(visit.requirement, farm({ harmony: 75 })), true)
  assert.equal(m.requirementMet(home.requirement, farm({ harmony: 90 })), false, 'no flowers')
  assert.equal(m.requirementMet(home.requirement, farm({ harmony: 80, plantCounts: { dandelion: 3, poppy: 2 } })), false, 'five flowers')
  assert.equal(m.requirementMet(home.requirement, farm({ harmony: 80, plantCounts: { dandelion: 3, poppy: 2, clover: 1 } })), true, 'six, mixed')
  assert.equal(m.requirementMet(home.requirement, farm({ harmony: 79, plantCounts: { clover: 6 } })), false, 'harmony too low')
  assert.equal(m.requirementMet(love.requirement, farm({ harmony: 89 })), false)
  assert.equal(m.requirementMet(love.requirement, farm({ harmony: 90 })), true)
})

test('a water lily is not a flower for the starhorn', () => {
  assert.equal(m.farmMetric(farm({ plantCounts: { 'water-lily': 9 } }).state, 'flowerCount'), 0)
  assert.equal(m.farmMetric(farm({ plantCounts: { dandelion: 1, poppy: 2, clover: 3 } }).state, 'flowerCount'), 6)
})

test('harmony reads as a plain score, and reads zero when the farm was not measured', () => {
  assert.equal(m.farmMetric(farm({ harmony: 72 }).state, 'harmony'), 72)
  assert.equal(m.farmMetric(farm().state, 'harmony'), 0)
  const req = { kind: 'harmony', amount: 70 }
  assert.equal(m.conditionMetricLabel(req), 'Farm harmony')
  assert.equal(m.conditionMetricUnit(req), '', 'a score has no m²')
  assert.equal(m.formatConditionMetric(req, 71.6), '72')
  assert.equal(m.hasOwnMetricUnit('harmony'), true)
  assert.equal(m.conditionMetricLabel({ kind: 'flowerCount', amount: 6 }), 'Grown flowers')
  assert.equal(m.conditionMetricUnit({ kind: 'flowerCount', amount: 6 }), '')
})

test('the hint says it leaves if the farm falls out of harmony, and the love rung says there are no young', () => {
  const [, , home, love] = m.getSpeciesConditions('starhorn')
  assert.match(home.hint, /deflates/)
  assert.match(home.hint, /harmony/)
  assert.match(love.hint, /no young/)
  assert.equal(m.holdsResidency('starhorn'), true)
})

test('harmony over real residents reaches the ladder: a varied, fed farm is in harmony', () => {
  const species = ['cow', 'sheep', 'chicken', 'duck', 'goose', 'pig', 'frog', 'owl']
  const residents = species.flatMap((name) => [{ species: name, fullness: 1 }, { species: name, fullness: 1 }])
  assert.ok(m.measureHarmony(residents).score >= 80)
  const lonely = Array.from({ length: 12 }, () => ({ species: 'cow', fullness: 1 }))
  assert.ok(m.measureHarmony(lonely).score < 70, 'twelve cows are not a harmony')
  // A few well-fed, even species (the farm in Spencer's screenshot: cows and pigs) is not enough to call it.
  const starter = ['cow', 'pig', 'duck'].flatMap((name) => Array.from({ length: 4 }, () => ({ species: name, fullness: 1 })))
  assert.ok(m.measureHarmony(starter).score < 70, `three fed species: ${m.measureHarmony(starter).score}`)
})

// ---- no house, no young ----------------------------------------------------------

test('the starhorn has no house, so nothing can breed it', () => {
  assert.equal(m.houseFor('starhorn'), null)
  for (const prop of Object.keys(m.HOUSE_SPECIES)) assert.equal(m.houseAccepts(prop, 'starhorn'), false)
  assert.equal(m.isUniqueSpecies('starhorn'), true)
  assert.equal(m.isUniqueSpecies('cow'), false)
  const life = m.createAnimalLife(['starhorn'], { config: { visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0, breedIntervalSeconds: 1 } })
  life.add('starhorn', 4)
  life.add('starhorn', 4)
  const world = { farm: farm({ harmony: 100, plantCounts: { clover: 8 } }), expansionLevel: 0, houses: [{ id: 'barn-1', prop: 'barn', x: 0, z: 0 }] }
  const events = []
  for (let i = 0; i < 2400; i += 1) events.push(...life.tick(world, 0.5))
  assert.equal(events.filter((event) => event.kind === 'birth').length, 0)
  assert.equal(life.all().filter((animal) => animal.baby).length, 0)
})

test('only one starhorn is ever invited back as a repeat guest', () => {
  const life = m.createAnimalLife(['starhorn'], { config: { visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0, replacementCooldownSeconds: 0 } })
  life.add('starhorn', 4)
  const world = { farm: farm({ harmony: 100, plantCounts: { clover: 8 } }), expansionLevel: 6, houses: [] }
  for (let i = 0; i < 2000; i += 1) life.tick(world, 0.5)
  assert.equal(life.all().filter((animal) => animal.species === 'starhorn').length <= 2, true, 'no flock of starhorns')
})

// ---- residency held, gems made -----------------------------------------------------

test('it deflates when harmony falls, and a well-fed resident makes a gem a day', () => {
  const life = m.createAnimalLife(['starhorn'], { config: { visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 1e9 } })
  const horn = life.add('starhorn', 4)
  life.addFeed(1e6)
  const good = { farm: farm({ harmony: 90, plantCounts: { clover: 8 }, residentCounts: {} }), expansionLevel: 0, houses: [] }
  let gems = 0
  // Four days at full harmony: nectar from eight clovers feeds it, and a gem a day comes out.
  for (let i = 0; i < 480 * 4 * 2; i += 1) {
    for (const event of life.tick(good, 0.5)) if (event.kind === 'produce' && event.good === 'gem') gems += 1
  }
  assert.ok(life.animal(horn.id), 'still on the farm')
  assert.ok(gems >= 3 && gems <= 5, `about a gem a day, got ${gems}`)
  const bad = { farm: farm({ harmony: 20, plantCounts: { clover: 8 } }), expansionLevel: 0, houses: [] }
  const events = []
  for (let i = 0; i < 400; i += 1) events.push(...life.tick(bad, 0.5))
  assert.ok(events.some((event) => event.kind === 'unsettle'), 'it is warned')
  for (let i = 0; i < 400; i += 1) events.push(...life.tick(bad, 0.5))
  assert.ok(events.some((event) => event.kind === 'deflate' && event.reason === 'unsuited'), 'and it goes flat')
  assert.equal(life.animal(horn.id), undefined)
})

test('the accomplishment for its last rung says glow, not breed', () => {
  const defs = m.buildAccomplishmentCatalog([{ id: 'starhorn', name: 'Starhorn' }, { id: 'cow', name: 'Cow' }], [])
  assert.equal(defs.find((def) => def.id === 'animal.starhorn.breed').title, 'Starhorn · Glow')
  assert.equal(defs.find((def) => def.id === 'animal.cow.breed').title, 'Cow · Breed')
})

// ---- the Helium Pump hook ---------------------------------------------------------

test('a starving balloon leaks helium at the factor the pump sets', () => {
  const leaked = (factor, bare) => {
    const life = m.createAnimalLife(['cow'], { config: { visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 1e9 } })
    const cow = life.add('cow', 3)
    life.setStarveLeakFactor(factor)
    life.setFullness(cow.id, 0)
    // A bare farm feeds nothing, so the cow starves for the whole run (one dt of 0.25 s keeps fullness at zero).
    const world = { farm: farm(bare ? {} : { tallGrassArea: 0 }), expansionLevel: 0, houses: [] }
    for (let i = 0; i < 40; i += 1) {
      life.setFullness(cow.id, 0)
      life.tick(world, 0.25)
    }
    return 1 - life.animal(cow.id).helium
  }
  const normal = leaked(1, true)
  const pumped = leaked(0.5, true)
  assert.ok(normal > 0, 'it leaks')
  assert.ok(Math.abs(pumped - normal / 2) < normal * 0.1, `half speed: ${pumped} vs ${normal}`)
  assert.equal(leaked(0, true), 0, 'a factor of zero stops the leak')
})
