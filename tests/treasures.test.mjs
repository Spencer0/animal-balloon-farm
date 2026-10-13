import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/** Treasures: end-game upgrades bought with star gems. Pure, so one bundle. */
const { outputFiles } = await build({
  stdin: {
    contents: [
      "export * from './src/game/treasures.ts'",
      "export * from './src/game/save-game.ts'",
      "export { createWallet } from './src/game/sales.ts'",
      "export { foodSupply } from './src/game/animal-diet.ts'",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('the four treasures cost 3, 5, 8 and 6 gems', () => {
  assert.deepEqual(m.TREASURE_ORDER, ['helium-pump', 'clover-charm', 'rain-barrel', 'golden-pail'])
  assert.deepEqual(m.TREASURE_ORDER.map((id) => m.TREASURE_CATALOG[id].price), [3, 5, 8, 6])
})

test('owning nothing changes nothing', () => {
  const effects = m.treasureEffects([])
  assert.deepEqual(effects, m.NO_TREASURE_EFFECTS)
  assert.equal(effects.goodsValueMultiplier, 1)
  assert.equal(effects.starveLeakFactor, 1)
})

test('each treasure gives its own multiplier and nothing else', () => {
  assert.equal(m.treasureEffects(['helium-pump']).starveLeakFactor, 0.5)
  assert.equal(m.treasureEffects(['helium-pump']).foodBoosts.all, 1)
  assert.equal(m.treasureEffects(['clover-charm']).foodBoosts.all, 1.25)
  assert.equal(m.treasureEffects(['clover-charm']).foodBoosts.grass, 1)
  assert.equal(m.treasureEffects(['rain-barrel']).foodBoosts.grass, 1.5)
  assert.equal(m.treasureEffects(['rain-barrel']).foodBoosts.all, 1)
  assert.equal(m.treasureEffects(['golden-pail']).goodsValueMultiplier, 2)
  assert.equal(m.treasureEffects(['golden-pail']).starveLeakFactor, 1)
  const all = m.treasureEffects(m.TREASURE_ORDER)
  assert.deepEqual(all, { foodBoosts: { all: 1.25, grass: 1.5 }, starveLeakFactor: 0.5, goodsValueMultiplier: 2 })
})

test('the boosts feed straight into the food supply: grass gets both, the rest only the charm', () => {
  const farm = { tallGrassArea: 10, waterArea: 0, flatGrassArea: 0, plantCounts: { clover: 4 } }
  const { foodBoosts } = m.treasureEffects(m.TREASURE_ORDER)
  assert.ok(Math.abs(m.foodSupply('grass', farm, foodBoosts) - 1.25 * 1.5 * m.foodSupply('grass', farm)) < 1e-9)
  assert.ok(Math.abs(m.foodSupply('seeds', farm, foodBoosts) - 1.25 * m.foodSupply('seeds', farm)) < 1e-9)
})

test('buying: gems leave the purse only when the treasure is granted, and each can be bought once', () => {
  const gems = m.createWallet(4)
  const ledger = m.createTreasureLedger()
  const poor = m.purchaseTreasure(gems, ledger, 'clover-charm')
  assert.deepEqual({ ok: poor.ok, failure: poor.failure, price: poor.price }, { ok: false, failure: 'poor', price: 5 })
  assert.equal(gems.balance, 4)
  assert.equal(ledger.owns('clover-charm'), false)
  const bought = m.purchaseTreasure(gems, ledger, 'helium-pump')
  assert.equal(bought.ok, true)
  assert.equal(gems.balance, 1)
  assert.equal(ledger.owns('helium-pump'), true)
  gems.credit(10)
  const again = m.purchaseTreasure(gems, ledger, 'helium-pump')
  assert.equal(again.failure, 'owned')
  assert.equal(gems.balance, 11, 'refused, so no charge')
})

test('the ledger lists owned ids in catalog order and restores from a save, dropping unknown ids', () => {
  const ledger = m.createTreasureLedger()
  ledger.restore(['golden-pail', 'nonsense', 7, 'helium-pump'])
  assert.deepEqual(ledger.owned(), ['helium-pump', 'golden-pail'])
  ledger.restore([])
  assert.deepEqual(ledger.owned(), [])
})

// ---- save compatibility ----------------------------------------------------------

test('a save with no gems or treasures (made before the starhorn) still validates', () => {
  const field = { cols: 1, rows: 1, data: '', scale: 1000 }
  const data = {
    playSeconds: 10, clock: { timeOfDay: 0.5, elapsedDays: 1 }, coins: 5, progression: { awarded: [] },
    upgrades: {}, accomplishments: [], expansionLevel: 0,
    life: { animals: [], discovered: [], pendingVisitors: [] }, animalPlaces: {}, preyEaten: {},
    plants: { plants: [], seeds: {} }, props: { inventory: {}, placed: [], fenceRuns: [] },
    terrain: field, water: field,
    grass: { xs: '', zs: '', heights: '', count: 0, paintKeys: '', paintCoverage: '', paintCount: 0 },
    tools: { grassPack: 'short' }, journalBestStage: {},
  }
  const summary = { farmerLevel: 1, coins: 5, day: 1, residents: 0, playSeconds: 10 }
  const parse = (extra) => m.parseEnvelope(JSON.stringify(m.makeEnvelope({ ...data, ...extra }, summary, 1)))
  assert.equal(parse({}).ok, true)
  assert.equal(parse({ gems: 7, treasures: ['helium-pump'] }).ok, true)
  assert.equal(parse({ gems: 'lots' }).ok, false)
  assert.equal(parse({ treasures: 'all' }).ok, false)
})
