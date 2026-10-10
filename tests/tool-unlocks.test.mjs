import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const unlocks = await load('src/game/tool-unlocks.ts')
const { createWallet } = await load('src/game/sales.ts')
const { createPropInventory, PROP_ORDER } = await load('src/game/farm-props.ts')
const { createPlantSimulation } = await load('src/game/plants.ts')
const { createProgressLedger } = await load('src/game/farm-progression.ts')

test('the lawn pack stops well below the meadow pack, and the meadow is taller than the old 0.72', () => {
  const short = unlocks.GRASS_PACKS.short.maxBladeHeight
  const tall = unlocks.GRASS_PACKS.tall.maxBladeHeight
  assert.ok(short < 0.4, 'short grass stays ankle high')
  assert.ok(tall > 0.72, 'tall grass grows past what the single seeder used to reach')
  assert.ok(unlocks.SHORT_GRASS_CEILING > short, 'a fully grown lawn blade is not mistaken for meadow')
  assert.notEqual(unlocks.GRASS_PACKS.short.sack, unlocks.GRASS_PACKS.tall.sack)
})

test('the tall pack waits for farmer level 1 and costs coins once', () => {
  const ledger = unlocks.createUpgradeLedger()
  const wallet = createWallet(500)
  const early = unlocks.purchaseUpgrade(wallet, ledger, 'tall-grass', 0)
  assert.equal(early.failure, 'locked')
  assert.equal(wallet.balance, 500, 'a refused purchase costs nothing')
  const bought = unlocks.purchaseUpgrade(wallet, ledger, 'tall-grass', 1)
  assert.equal(bought.ok, true)
  assert.ok(ledger.owns('tall-grass'))
  assert.equal(wallet.balance, 500 - bought.price)
  assert.equal(unlocks.purchaseUpgrade(wallet, ledger, 'tall-grass', 9).failure, 'maxed')
})

test('the Snower costs 250 coins, is bought once, and opens at farmer level 1', () => {
  assert.equal(unlocks.SNOWER_PRICE, 250)
  assert.ok(unlocks.UPGRADE_ORDER.includes('snower'))
  const ledger = unlocks.createUpgradeLedger()
  const wallet = createWallet(300)
  assert.equal(unlocks.purchaseUpgrade(wallet, ledger, 'snower', 0).failure, 'locked')
  const bought = unlocks.purchaseUpgrade(wallet, ledger, 'snower', 1)
  assert.equal(bought.ok, true)
  assert.equal(bought.price, 250)
  assert.equal(wallet.balance, 50)
  assert.ok(ledger.owns('snower'))
  assert.equal(unlocks.purchaseUpgrade(wallet, ledger, 'snower', 9).failure, 'maxed')
  assert.ok(unlocks.unlocksAtFarmerLevel(1).includes('Snower'))
})

test('a purchase needs the coins as well as the level', () => {
  const ledger = unlocks.createUpgradeLedger()
  const wallet = createWallet(5)
  const result = unlocks.purchaseUpgrade(wallet, ledger, 'tall-grass', 3)
  assert.equal(result.failure, 'poor')
  assert.equal(ledger.owns('tall-grass'), false)
  assert.equal(wallet.balance, 5)
})

test('land deeds cost more each time and ask for one more farmer level than the last', () => {
  const ledger = unlocks.createUpgradeLedger()
  const wallet = createWallet(10_000)
  assert.equal(unlocks.upgradeQuote('land-deed', ledger, 0).status, 'locked')
  let lastPrice = 0
  for (let deed = 1; deed <= 4; deed += 1) {
    assert.equal(unlocks.upgradeQuote('land-deed', ledger, deed - 1).status, 'locked', `deed ${deed} needs level ${deed}`)
    const result = unlocks.purchaseUpgrade(wallet, ledger, 'land-deed', deed)
    assert.equal(result.ok, true)
    assert.ok(result.price > lastPrice, 'each parcel is dearer than the one before')
    lastPrice = result.price
  }
  assert.equal(ledger.count('land-deed'), 4)
})

test('there are exactly as many land deeds as the farm has parcels to open', () => {
  const ledger = unlocks.createUpgradeLedger()
  ledger.set('land-deed', 999)
  assert.equal(ledger.count('land-deed'), unlocks.LAND_DEED_LIMIT)
  assert.equal(unlocks.upgradeQuote('land-deed', ledger, 99).status, 'maxed')
})

test('the shop stocks props by farmer level: the fence first, the oak last', () => {
  assert.equal(unlocks.propUnlocked('fence', 0), true)
  assert.equal(unlocks.propUnlocked('barn', 0), false)
  assert.equal(unlocks.propUnlocked('barn', 1), true)
  assert.equal(unlocks.propUnlocked('coop', 1), true, 'chickens and cows can get their buildings with the first level')
  assert.equal(unlocks.propUnlocked('oak', 2), false)
  assert.equal(unlocks.propUnlocked('oak', 3), true)
  for (const id of PROP_ORDER) assert.ok(Number.isInteger(unlocks.propUnlockLevel(id)), `${id} has a level`)
})

test('a locked prop cannot be bought even with the coins', () => {
  const wallet = createWallet(1000)
  const inventory = createPropInventory()
  const locked = unlocks.purchasePropAtLevel(wallet, inventory, 'oak', 0)
  assert.equal(locked.ok, false)
  assert.equal(locked.locked, true)
  assert.equal(locked.requiredLevel, 3)
  assert.equal(wallet.balance, 1000)
  assert.equal(inventory.count('oak'), 0)
  const open = unlocks.purchasePropAtLevel(wallet, inventory, 'oak', 3)
  assert.equal(open.ok, true)
  assert.equal(inventory.count('oak'), 1)
})

test('each farmer level lists what it opens, for the player panel', () => {
  assert.deepEqual(unlocks.unlocksAtFarmerLevel(0), ['Shovel', 'Water Bucket', 'Fence'])
  const first = unlocks.unlocksAtFarmerLevel(1)
  for (const name of ['Tall Grass Seed Pack', 'Land deed 1', 'Chicken Coop', 'Small Barn']) assert.ok(first.includes(name), name)
})

test('farmer level still comes from progression points', () => {
  const ledger = createProgressLedger()
  assert.equal(ledger.level, 0)
  ledger.awardPoints('a', 50)
  assert.equal(ledger.level, 1)
  ledger.awardPoints('b', 50)
  assert.equal(ledger.level, 2)
})

test('ground cover refuses a meadow but still takes a short lawn', () => {
  const lawn = { substrate: 'grass', waterDepth: 0, inBounds: true, coverage: 1 }
  const sim = createPlantSimulation()
  // Seeds are bought now, so stock the shed before asking where things may go.
  for (const species of ['clover', 'dandelion', 'poppy']) sim.addSeeds(species, 1)
  assert.equal(sim.placementResult('clover', 0, 0, { ...lawn, tallGrass: false }).valid, true)
  const meadow = sim.placementResult('dandelion', 0, 0, { ...lawn, tallGrass: true })
  assert.equal(meadow.valid, false)
  assert.equal(meadow.failure, 'tall-grass')
  assert.equal(sim.placementResult('poppy', 0, 0, { substrate: 'soil', waterDepth: 0, inBounds: true, tallGrass: true }).valid, true, 'only ground cover cares')
})
