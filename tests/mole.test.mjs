import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/** One bundle, so the residency override and the life simulation share a conditions module. */
const { outputFiles } = await build({
  stdin: {
    contents: [
      "export * from './src/game/animal-life.ts'",
      "export * from './src/game/animal-conditions.ts'",
      "export * from './src/game/animal-progress.ts'",
      "export * from './src/game/animal-housing.ts'",
      "export * from './src/game/farm-props.ts'",
      "export * from './src/game/tool-unlocks.ts'",
      "export * from './src/game/farm-state.ts'",
      "export { ANIMAL_CATALOG } from './src/animals/animal-catalog.ts'",
    ].join(';'),
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const baseState = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }
const farm = (extra = {}) => ({ state: { ...baseState, ...extra }, residentSpecies: new Set() })
const dirt = (percent) => ({ terrainShares: { dirt: percent } })

test('the mole is in the catalog, with a house, a price and a journal ladder', () => {
  assert.ok(m.ANIMAL_CATALOG.some((entry) => entry.id === 'mole'))
  assert.deepEqual(m.HOUSE_SPECIES.molehill, ['mole'])
  assert.equal(m.PROP_CATALOG.molehill.modelUrl, 'assets/props/molehill.glb')
  assert.ok(m.PROP_ORDER.includes('molehill'))
  assert.equal(m.getSpeciesConditions('mole').length, 4)
})

test('a mole is lured by owning the shovel, and by nothing else', () => {
  const trigger = m.DISCOVERY.mole
  assert.equal(trigger.kind, 'toolOwned')
  assert.equal(m.requirementMet(trigger, farm()), false, 'a new farmer has no shovel')
  assert.equal(m.requirementMet(trigger, farm({ toolsOwned: { shovel: false, water: true } })), false, 'the bucket does not count')
  assert.equal(m.requirementMet(trigger, farm({ toolsOwned: { shovel: true } })), true)
})

test('it visits at half dirt, settles at ninety percent, and breeds with a molehill', () => {
  const rungs = m.getSpeciesConditions('mole')
  const visit = (extra) => m.requirementMet(rungs[1].requirement, farm(extra))
  const settle = (extra) => m.requirementMet(rungs[2].requirement, farm(extra))
  const breed = (extra) => m.requirementMet(rungs[3].requirement, farm(extra))
  assert.equal(visit(dirt(49)), false)
  assert.equal(visit(dirt(50)), true)
  assert.equal(settle(dirt(89)), false)
  assert.equal(settle(dirt(90)), true)
  assert.equal(breed(dirt(95)), false, 'needs the molehill')
  assert.equal(breed({ ...dirt(95), propCounts: { molehill: 1 } }), true)
  assert.equal(breed({ ...dirt(60), propCounts: { molehill: 1 } }), false, 'and the farm still nearly all dirt')
})

test('a settled mole holds its residency: it is the species that goes flat when the lawn returns', () => {
  assert.equal(m.holdsResidency('mole'), true)
  assert.equal(m.holdsResidency('cow'), false)
  const life = m.createAnimalLife(['mole'], { config: { visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0 } })
  const mole = life.add('mole', 3)
  const lawn = { farm: farm(dirt(40)), expansionLevel: 0 }
  const events = []
  for (let i = 0; i < 4 * 150; i += 1) events.push(...life.tick(lawn, 0.25))
  assert.ok(events.some((event) => event.kind === 'deflate' && event.animalId === mole.id), 'it popped')
  assert.equal(life.animal(mole.id), undefined)
})

test('a settled mole is fine while the farm stays dirt', () => {
  const life = m.createAnimalLife(['mole'], { config: { visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0 } })
  const mole = life.add('mole', 3)
  const bare = { farm: farm(dirt(95)), expansionLevel: 0 }
  for (let i = 0; i < 4 * 300; i += 1) life.tick(bare, 0.25)
  assert.equal(life.animal(mole.id).helium, 1)
})

test('the shovel is a level-0 purchase, so the mole can be reached from the start', () => {
  assert.equal(m.UPGRADE_CATALOG.shovel.unlockLevel(0), 0)
  assert.equal(m.propUnlockLevel('molehill') <= 1, true, 'the molehill is stocked early enough to breed')
})
