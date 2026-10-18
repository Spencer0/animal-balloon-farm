import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The mountain lion as a species: unique and houseless, never at the carnival,
 * summoned onto the farm by a crowd and sent back to the hills after, and tamed
 * only on a farm of legend. One bundle so the modules share state.
 */
const { outputFiles } = await build({
  stdin: {
    contents: [
      "export * from './src/game/animal-life.ts'",
      "export * from './src/game/animal-conditions.ts'",
      "export * from './src/game/animal-progress.ts'",
      "export * from './src/game/farm-state.ts'",
      "export { houseFor } from './src/game/animal-housing.ts'",
      "export { ANIMAL_CATALOG } from './src/animals/animal-catalog.ts'",
      "export { ANIMAL_SALE_PRICES, UNIQUE_ANIMAL_NAMES } from './src/game/sales.ts'",
      "export { DIETS } from './src/game/animal-diet.ts'",
      "export { APEX_SPECIES } from './src/game/apex-raid.ts'",
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
const legend = { chapter: 6, harmony: 90, propCounts: { oak: 2 }, largestHerd: 9 }

test('the mountain lion is in the catalog as the apex species: unique, houseless, priced, and it eats no daily meals', () => {
  const entry = m.ANIMAL_CATALOG.find((animal) => animal.id === 'cougar')
  assert.ok(entry)
  assert.equal(entry.name, 'Mountain Lion')
  assert.equal(entry.assetUrl, 'assets/animals/balloon-cougar.glb')
  assert.deepEqual(m.APEX_SPECIES, ['cougar'])
  assert.equal(m.isUniqueSpecies('cougar'), true)
  assert.equal(m.houseFor('cougar'), null)
  assert.ok(m.ANIMAL_SALE_PRICES.cougar > m.ANIMAL_SALE_PRICES.owl)
  assert.equal(m.UNIQUE_ANIMAL_NAMES.cougar, 'Sable')
  // It gorges on a raid and needs nothing between, so a tamed lion never starves.
  assert.equal(m.DIETS.cougar, undefined)
  // It is never lured to the carnival, and it keeps any hours.
  assert.equal(m.DISCOVERY.cougar, undefined)
  assert.equal(m.isNightOnly('cougar'), false)
})

test('its ladder: a crowd brings it, and only a farm of legend keeps it', () => {
  const stages = m.getSpeciesConditions('cougar')
  assert.equal(stages.length, 4)
  assert.equal(stages[0].requirement, null)
  assert.deepEqual(stages[1].requirement, { kind: 'largestHerd', amount: 7 })
  const home = stages[2].requirement
  assert.equal(home.kind, 'chapter')
  assert.equal(home.amount, 6)
  assert.ok(home.and.some((also) => also.kind === 'harmony' && also.amount >= 85))
  assert.ok(home.and.some((also) => also.kind === 'propCount' && also.species === 'oak' && also.amount === 2))
  assert.ok(m.requirementMet(home, farm(legend)))
  // Each part on its own is not enough.
  assert.ok(!m.requirementMet(home, farm({ ...legend, chapter: 5 })))
  assert.ok(!m.requirementMet(home, farm({ ...legend, harmony: 84 })))
  assert.ok(!m.requirementMet(home, farm({ ...legend, propCounts: { oak: 1 } })))
})

test('the new condition kinds read the chapter and the biggest herd, and have journal labels', () => {
  const state = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {}, chapter: 4, largestHerd: 8 }
  assert.equal(m.farmMetric(state, 'chapter'), 4)
  assert.equal(m.farmMetric(state, 'largestHerd'), 8)
  assert.equal(m.farmMetric({ ...state, chapter: undefined }, 'chapter'), 0)
  assert.equal(m.conditionMetricLabel({ kind: 'chapter', amount: 6 }), 'Chapter reached')
  assert.equal(m.conditionMetricLabel({ kind: 'largestHerd', amount: 7 }), 'Biggest herd')
  assert.equal(m.isCountKind('chapter'), true)
  assert.equal(m.isCountKind('largestHerd'), true)
})

test('it never comes by the carnival, however long the farm runs', () => {
  const life = m.createAnimalLife(['cow', 'cougar'], { random: () => 0.5 })
  const crowded = { farm: farm({ grassArea: 40, largestHerd: 12 }, []), expansionLevel: 2 }
  for (let second = 0; second < 1200; second += 1) life.tick(crowded, 1)
  assert.ok(life.all().filter((animal) => animal.species === 'cougar').every((animal) => animal.stage === 0))
  assert.ok(!life.exportState().pendingVisitors.includes('cougar'))
})

test('a crowd summons it straight onto the farm, and sending it away does not queue a carnival visit', () => {
  const life = m.createAnimalLife(['cow', 'cougar'], { random: () => 0.5 })
  const events = life.summon('cougar')
  assert.equal(events.length, 1)
  assert.equal(events[0].kind, 'enterFarm')
  assert.equal(events[0].stage, 2)
  const lion = life.animal(events[0].animalId)
  assert.equal(lion.stage, 2)
  // There is only one: a second summon while it is out is refused.
  assert.deepEqual(life.summon('cougar'), [])
  const away = life.sendAway(lion.id)
  assert.equal(away[0].kind, 'departCarnival')
  assert.equal(life.animal(lion.id).stage, 0)
  assert.ok(!life.exportState().pendingVisitors.includes('cougar'))
  // It can be summoned again later, and it is the same lion.
  assert.equal(life.summon('cougar')[0].animalId, lion.id)
})

test('a raiding lion on an ordinary farm stays wild; on a farm of legend it settles at once and loves it', () => {
  const ordinary = m.createAnimalLife(['cow', 'cougar'], { random: () => 0.5 })
  const wild = ordinary.summon('cougar')[0].animalId
  for (let second = 0; second < 30; second += 1) ordinary.tick({ farm: farm({ chapter: 4, harmony: 60, largestHerd: 9 }), expansionLevel: 1 }, 1)
  assert.equal(ordinary.animal(wild).stage, 2)

  const legendary = m.createAnimalLife(['cow', 'cougar'], { random: () => 0.5 })
  const tame = legendary.summon('cougar')[0].animalId
  const seen = []
  // Five seconds in quarter-second ticks (the ladder counts at most a quarter second a tick).
  for (let tick = 0; tick < 20; tick += 1) seen.push(...legendary.tick({ farm: farm(legend), expansionLevel: 1 }, 0.25))
  assert.equal(legendary.animal(tame).stage, 4)
  assert.ok(seen.some((event) => event.kind === 'settle' && event.animalId === tame))
})

test('losing a tamed lion does not send another round through the carnival', () => {
  const life = m.createAnimalLife(['cow', 'cougar'], { random: () => 0.5 })
  const lion = life.summon('cougar')[0].animalId
  life.setStage(lion, 3)
  life.remove(lion)
  assert.ok(!life.exportState().pendingVisitors.includes('cougar'))
  // A save that somehow queued it is cleaned on load.
  const state = life.exportState()
  life.importState({ ...state, pendingVisitors: ['cougar', 'cow'] })
  assert.deepEqual(life.exportState().pendingVisitors.filter((species) => species === 'cougar'), [])
})
