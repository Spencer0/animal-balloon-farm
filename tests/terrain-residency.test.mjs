import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * Terrain share conditions, residency that has to be kept, and the shovel and
 * bucket as shop purchases. All pure: one bundle so the override set in the
 * conditions module is the one the life simulation reads.
 */
const { outputFiles } = await build({
  stdin: {
    contents: [
      "export * from './src/game/animal-life.ts'",
      "export * from './src/game/animal-conditions.ts'",
      "export * from './src/game/animal-progress.ts'",
      "export * from './src/game/farm-state.ts'",
      "export * from './src/game/tool-unlocks.ts'",
      "export * from './src/game/animal-card.ts'",
      "export { createWallet } from './src/game/sales.ts'",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const lawnOf = (coverages) => ({
  count: coverages.length,
  xs: Float32Array.from(coverages, (_, i) => i),
  zs: new Float32Array(coverages.length),
  coverage: Float32Array.from(coverages),
})

// ---- the terrain share -------------------------------------------------------

test('dirt share is the percent of the farm with no grass paint and no pond', () => {
  const lawn = lawnOf([0, 0, 0, 1, 1, 0.02, 0.5, 0.9, 0, 1])
  assert.equal(m.measureDirtShare(lawn), 50, 'five bare vertices of ten; 0.02 paint is still soil')
})

test('a vertex under water is water, not dirt', () => {
  const lawn = lawnOf([0, 0, 0, 0])
  const wet = (x) => x === 1 || x === 2
  assert.equal(m.measureDirtShare(lawn, wet), 50)
  assert.equal(m.measureDirtShare(lawnOf([])), 0, 'an empty lawn is not 100% anything')
})

test('only ground inside the fence counts toward the share', () => {
  // Ten vertices; the last six are bare and the last four lie outside the farm, which must not pad the dirt share.
  const lawn = lawnOf([1, 1, 1, 1, 0, 0, 0, 0, 0, 0])
  assert.equal(m.measureDirtShare(lawn), 60)
  assert.equal(m.measureDirtShare(lawn, undefined, (x) => x < 6), 33.33)
  assert.equal(m.measureDirtShare(lawn, undefined, () => false), 0, 'no farm, no share')
})

test('terrainShare is read by terrain name and reads as zero when unknown', () => {
  const state = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {}, terrainShares: { dirt: 62 } }
  assert.equal(m.farmMetric(state, 'terrainShare', 'dirt'), 62)
  assert.equal(m.farmMetric(state, 'terrainShare', 'snow'), 0)
  assert.equal(m.farmMetric(state, 'terrainShare'), 0)
})

test('a share requirement is met at its percent, and journals as a percent', () => {
  const half = { kind: 'terrainShare', species: 'dirt', amount: 50 }
  const farm = (dirt) => ({ state: { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {}, terrainShares: { dirt } }, residentSpecies: new Set() })
  assert.equal(m.requirementMet(half, farm(49.9)), false)
  assert.equal(m.requirementMet(half, farm(50)), true)
  assert.equal(m.conditionMetricUnit(half), '%')
  assert.equal(m.formatConditionMetric(half, 62.4), '62')
  assert.equal(m.conditionMetricLabel(half), 'Bare dirt share of the farm')
  assert.equal(m.hasOwnMetricUnit('terrainShare'), true)
})

// ---- residency that must be kept --------------------------------------------

const quick = { visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0 }
const farmWith = (grass) => ({ farm: { state: { tallGrassArea: grass, waterArea: 0, flatGrassArea: 0, plantCounts: {} }, residentSpecies: new Set() }, expansionLevel: 0 })
const run = (life, world, seconds, events = []) => {
  for (let i = 0; i < seconds * 4; i += 1) events.push(...life.tick(world, 0.25))
  return events
}
const createLife = () => m.createAnimalLife(['cow'], { config: quick })

test('by default a settled resident stays for good, however bare the farm gets', () => {
  const life = createLife()
  const cow = life.add('cow', 3)
  run(life, farmWith(0), 600)
  assert.ok(life.animal(cow.id), 'the cow is still here')
  assert.equal(life.animal(cow.id).helium, 1)
})

test('a resident that holds its residency loses helium while the farm stops suiting it, then pops', () => {
  m.setResidencyOverride('cow', true)
  try {
    const life = createLife()
    const cow = life.add('cow', 3)
    const events = run(life, farmWith(0), 60)
    const mid = life.animal(cow.id)
    assert.ok(mid, 'still aloft a minute in')
    assert.ok(mid.helium < 1 && mid.helium > 0, `leaking: ${mid.helium}`)
    assert.equal(mid.unsettled, true)
    assert.equal(events.filter((event) => event.kind === 'unsettle').length, 1, 'one warning, not one per tick')
    const rest = run(life, farmWith(0), 90)
    assert.ok(rest.some((event) => event.kind === 'deflate' && event.animalId === cow.id), 'it ran out of helium')
    assert.equal(life.animal(cow.id), undefined, 'and is gone from the farm')
  } finally {
    m.setResidencyOverride('cow', null)
  }
})

test('putting the farm back refills a leaking resident, and a refilled one is not popped', () => {
  m.setResidencyOverride('cow', true)
  try {
    const life = createLife()
    const cow = life.add('cow', 3)
    run(life, farmWith(0), 60)
    const events = run(life, farmWith(40), 60)
    assert.ok(events.some((event) => event.kind === 'resettle'))
    assert.equal(life.animal(cow.id).helium, 1, 'topped up well inside a minute')
    assert.equal(life.animal(cow.id).unsettled, false)
  } finally {
    m.setResidencyOverride('cow', null)
  }
})

test('setHelium sets a resident’s helium outright, so a deflate can be watched on demand', () => {
  m.setResidencyOverride('cow', true)
  try {
    const life = createLife()
    const cow = life.add('cow', 3)
    life.setHelium(cow.id, 0.1)
    assert.equal(life.animal(cow.id).helium, 0.1)
    life.setHelium(cow.id, 7)
    assert.equal(life.animal(cow.id).helium, 1, 'clamped')
    life.setHelium(cow.id, Number.NaN)
    assert.equal(life.animal(cow.id).helium, 1, 'a bad level is ignored')
    life.setHelium(cow.id, 0.1)
    const events = run(life, farmWith(0), 20)
    assert.ok(events.some((event) => event.kind === 'deflate'), 'with 12 s left it goes flat inside 20 s')
  } finally {
    m.setResidencyOverride('cow', null)
  }
})

test('visitors and babies do not leak: only settled adults must keep their residency', () => {
  m.setResidencyOverride('cow', true)
  try {
    const life = createLife()
    const visitor = life.add('cow', 2)
    const baby = life.add('cow', 3, true)
    // Well inside the 60 seconds a baby takes to grow up: after that it is an adult like any other.
    run(life, farmWith(0), 50)
    assert.equal(life.animal(visitor.id).helium, 1)
    assert.equal(life.animal(baby.id).helium, 1)
  } finally {
    m.setResidencyOverride('cow', null)
  }
})

test('helium survives a save, and an old save without it reads full', () => {
  m.setResidencyOverride('cow', true)
  try {
    const life = createLife()
    const cow = life.add('cow', 3)
    run(life, farmWith(0), 30)
    const saved = life.exportState()
    const entry = saved.animals.find((animal) => animal.id === cow.id)
    assert.ok(entry.helium < 1)
    const again = createLife()
    again.importState(saved)
    assert.equal(again.animal(cow.id).helium, entry.helium)
    const legacy = { ...saved, animals: saved.animals.map(({ helium, ...rest }) => rest) }
    again.importState(legacy)
    assert.equal(again.animal(cow.id).helium, 1)
  } finally {
    m.setResidencyOverride('cow', null)
  }
})

test('the animal card meter follows the helium and says when it is leaking', () => {
  assert.equal(m.heliumLevel(), 1)
  assert.equal(m.heliumStatus(), 'helium')
  assert.equal(m.heliumLevel(0.4), 0.4)
  assert.equal(m.heliumStatus(0.4), 'leaking')
  assert.equal(m.heliumLevel(-3), 0)
  assert.equal(m.heliumLevel(Number.NaN), 1)
})

// ---- the shovel and the bucket are bought ------------------------------------

test('a new farmer owns the seed bag only; the shovel and the bucket are shop upgrades', () => {
  const ledger = m.createUpgradeLedger()
  assert.equal(m.ownsGardenTool(ledger, 'grass'), true)
  assert.equal(m.ownsGardenTool(ledger, 'shovel'), false)
  assert.equal(m.ownsGardenTool(ledger, 'water'), false)
  const wallet = m.createWallet(100)
  assert.equal(m.purchaseUpgrade(wallet, ledger, 'shovel', 0).ok, true)
  assert.equal(m.ownsGardenTool(ledger, 'shovel'), true)
  assert.equal(m.ownsGardenTool(ledger, 'water'), false, 'buying one does not hand over the other')
  assert.equal(m.purchaseUpgrade(wallet, ledger, 'water-bucket', 0).ok, true)
  assert.equal(m.ownsGardenTool(ledger, 'water'), true)
  assert.equal(m.purchaseUpgrade(wallet, ledger, 'shovel', 0).failure, 'maxed')
})

test('a refused purchase of the bucket costs nothing', () => {
  const ledger = m.createUpgradeLedger()
  const wallet = m.createWallet(5)
  assert.equal(m.purchaseUpgrade(wallet, ledger, 'water-bucket', 0).failure, 'poor')
  assert.equal(wallet.balance, 5)
  assert.equal(m.ownsGardenTool(ledger, 'water'), false)
})

test('saves from before the shop sold them are named as keeping both tools', () => {
  assert.deepEqual([...m.LEGACY_FREE_UPGRADES].sort(), ['shovel', 'water-bucket'])
})
