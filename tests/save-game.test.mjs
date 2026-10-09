import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  stdin: {
    contents: `
      export * from './src/game/save-game.ts'
      export { createAnimalLife } from './src/game/animal-life.ts'
      export { createProgressLedger } from './src/game/farm-progression.ts'
      export { createPlantSimulation } from './src/game/plants.ts'
      export { createWallet } from './src/game/sales.ts'
      export { createFarmExpansion } from './src/game/farm-expansion.ts'
      export { createAccomplishmentTracker } from './src/game/accomplishments.ts'
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const save = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

/** A `Storage` stand-in that can be told to fail the way a full or blocked browser does. */
function memoryStorage({ failWith } = {}) {
  const items = new Map()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem(key, value) {
      if (failWith) throw failWith
      items.set(key, String(value))
    },
    removeItem: (key) => { items.delete(key) },
  }
}

function sampleData(overrides = {}) {
  return {
    playSeconds: 125,
    clock: { timeOfDay: 0.4, elapsedDays: 3 },
    coins: 40,
    progression: { points: 60, awarded: ['a'] },
    upgrades: { 'tall-grass': 1 },
    accomplishments: [],
    expansionLevel: 1,
    life: { animals: [], discovered: [], pendingVisitors: [], nextAnimalId: 1, arrivalElapsed: 0 },
    animalPlaces: {},
    preyEaten: {},
    plants: { seeds: {}, plants: [], nextInstanceId: 1 },
    props: { inventory: {}, placed: [], fenceRuns: [] },
    terrain: { cols: 2, rows: 2, data: save.packInt16([0, 0.5, -0.5, 0], 1000), scale: 1000 },
    water: { cols: 2, rows: 2, data: save.packInt16([0, 0, 0, 0], 1000), scale: 1000 },
    grass: { xs: '', zs: '', heights: '', count: 0, paintKeys: '', paintCoverage: '', paintCount: 0 },
    tools: { grassPack: 'short' },
    journalBestStage: {},
    ...overrides,
  }
}

const summary = { farmerLevel: 2, coins: 40, day: 4, residents: 1, playSeconds: 125 }
const envelopeAt = (savedAt, data = sampleData()) => save.makeEnvelope(data, summary, savedAt)

test('packed Int16 fields round-trip to the stored precision and clamp out-of-range values', () => {
  const packed = save.packInt16([0, 1.2345, -2.6, 40, Number.NaN], 1000)
  const back = save.unpackInt16(packed, 1000, 5)
  assert.equal(back[0], 0)
  assert.ok(Math.abs(back[1] - 1.235) < 1e-6)
  assert.ok(Math.abs(back[2] + 2.6) < 1e-6)
  assert.ok(Math.abs(back[3] - 32.767) < 1e-3, 'out-of-range values clamp instead of wrapping')
  assert.equal(back[4], 0, 'NaN is stored as zero')
})

test('packed Uint8 heights round-trip and the length is checked', () => {
  const packed = save.packUint8([0, 0.085, 0.95], save.GRASS_HEIGHT_STEPS)
  const back = save.unpackUint8(packed, save.GRASS_HEIGHT_STEPS, 3)
  assert.ok(Math.abs(back[1] - 0.085) <= 1 / save.GRASS_HEIGHT_STEPS)
  assert.ok(Math.abs(back[2] - 0.95) <= 1 / save.GRASS_HEIGHT_STEPS)
  assert.throws(() => save.unpackUint8(packed, save.GRASS_HEIGHT_STEPS, 4), RangeError)
  assert.throws(() => save.unpackInt16('AAA=', 1, 5), RangeError)
})

test('a large field packs without overflowing the call stack', () => {
  const big = new Float32Array(150_000).fill(0.25)
  assert.equal(save.unpackInt16(save.packInt16(big, 1000), 1000, big.length).length, big.length)
})

test('an envelope survives a JSON round trip and reads back as ok', () => {
  const parsed = save.parseEnvelope(JSON.stringify(envelopeAt(1000)))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.envelope.data.coins, 40)
  assert.equal(parsed.envelope.version, save.SAVE_VERSION)
})

test('parseEnvelope refuses what it should, and says why', () => {
  assert.deepEqual(save.parseEnvelope(null), { ok: false, failure: 'unreadable' })
  assert.deepEqual(save.parseEnvelope('{nope'), { ok: false, failure: 'unreadable' })
  assert.equal(save.parseEnvelope('[]').failure, 'wrong-app')
  assert.equal(save.parseEnvelope(JSON.stringify({ app: 'other-game' })).failure, 'wrong-app')
  const future = { ...envelopeAt(1), version: save.SAVE_VERSION + 1 }
  assert.equal(save.parseEnvelope(JSON.stringify(future)).failure, 'too-new')
  const noCoins = envelopeAt(1, { ...sampleData(), coins: 'lots' })
  assert.equal(save.parseEnvelope(JSON.stringify(noCoins)).failure, 'malformed')
  const noLife = envelopeAt(1, { ...sampleData(), life: null })
  assert.equal(save.parseEnvelope(JSON.stringify(noLife)).failure, 'malformed')
  const badSummary = { ...envelopeAt(1), summary: { farmerLevel: 'x' } }
  assert.equal(save.parseEnvelope(JSON.stringify(badSummary)).failure, 'malformed')
})

test('the store writes, lists, reads and erases three slots', () => {
  const store = save.createSaveStore(memoryStorage())
  assert.deepEqual(store.slots().map((slot) => slot.status), ['empty', 'empty', 'empty'])
  assert.deepEqual(store.write(2, envelopeAt(500)), { ok: true })
  const slots = store.slots()
  assert.equal(slots[1].status, 'ok')
  assert.equal(slots[1].summary.coins, 40)
  assert.equal(store.read(2).ok, true)
  assert.equal(store.newestSlot(), 2)
  store.erase(2)
  assert.equal(store.slots()[1].status, 'empty')
  assert.equal(store.newestSlot(), null)
})

test('the store rejects slots outside 1..3', () => {
  const store = save.createSaveStore(memoryStorage())
  for (const slot of [0, 4, 1.5, -1, Number.NaN]) {
    assert.deepEqual(store.write(slot, envelopeAt(1)), { ok: false, reason: 'invalid-slot' })
    assert.equal(store.read(slot).ok, false)
  }
})

test('a full disk and a blocked browser are reported, not thrown', () => {
  const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
  assert.deepEqual(save.createSaveStore(memoryStorage({ failWith: quota })).write(1, envelopeAt(1)), { ok: false, reason: 'full' })
  assert.deepEqual(save.createSaveStore(memoryStorage({ failWith: new Error('denied') })).write(1, envelopeAt(1)), { ok: false, reason: 'unavailable' })
  const none = save.createSaveStore(null)
  assert.equal(none.available, false)
  assert.deepEqual(none.write(1, envelopeAt(1)), { ok: false, reason: 'unavailable' })
  assert.equal(none.slots()[0].status, 'empty')
  assert.equal(none.takeBoot(), null)
  assert.equal(none.queueBoot({ kind: 'new', slot: 1 }), false)
})

test('a failed write leaves the previous save untouched', () => {
  const storage = memoryStorage()
  const store = save.createSaveStore(storage)
  store.write(1, envelopeAt(1, sampleData({ coins: 7 })))
  const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
  storage.setItem = () => { throw quota }
  assert.equal(store.write(1, envelopeAt(2, sampleData({ coins: 99 }))).ok, false)
  assert.equal(store.read(1).envelope.data.coins, 7)
})

test('a damaged slot is listed as damaged and never wins newestSlot', () => {
  const storage = memoryStorage()
  const store = save.createSaveStore(storage)
  store.write(1, envelopeAt(100))
  storage.items.set('animal-balloon-farm.save.slot2', '{"app":"animal-balloon-farm","version":1}')
  const slots = store.slots()
  assert.equal(slots[1].status, 'damaged')
  assert.equal(slots[1].failure, 'malformed')
  assert.equal(store.newestSlot(), 1)
})

test('a queued boot request is read exactly once', () => {
  const store = save.createSaveStore(memoryStorage())
  assert.equal(store.queueBoot({ kind: 'load', slot: 3 }), true)
  assert.deepEqual(store.takeBoot(), { kind: 'load', slot: 3 })
  assert.equal(store.takeBoot(), null)
})

test('a garbled boot request is ignored rather than trusted', () => {
  const storage = memoryStorage()
  const store = save.createSaveStore(storage)
  for (const text of ['nope', '{"kind":"erase","slot":1}', '{"kind":"load","slot":9}', '[]']) {
    storage.items.set('animal-balloon-farm.save.boot', text)
    assert.equal(store.takeBoot(), null)
  }
})

test('start-up with no saves begins a fresh farm in slot 1', () => {
  const startup = save.resolveStartup(save.createSaveStore(memoryStorage()), null)
  assert.deepEqual({ slot: startup.slot, envelope: startup.envelope, notice: startup.notice }, { slot: 1, envelope: null, notice: null })
})

test('start-up with no request continues the farm last played', () => {
  const store = save.createSaveStore(memoryStorage())
  store.write(1, envelopeAt(100, sampleData({ coins: 1 })))
  store.write(3, envelopeAt(900, sampleData({ coins: 3 })))
  assert.equal(save.resolveStartup(store, null).envelope.data.coins, 3, 'newest wins when no slot is marked active')
  store.setActiveSlot(1)
  const startup = save.resolveStartup(store, null)
  assert.equal(startup.slot, 1)
  assert.equal(startup.envelope.data.coins, 1, 'the active slot wins over the newest')
})

test('an erased active slot falls back to the newest farm', () => {
  const store = save.createSaveStore(memoryStorage())
  store.write(2, envelopeAt(100, sampleData({ coins: 2 })))
  store.setActiveSlot(1)
  const startup = save.resolveStartup(store, null)
  assert.equal(startup.slot, 2)
  assert.equal(startup.envelope.data.coins, 2)
})

test('Load and New requests pick their slot', () => {
  const store = save.createSaveStore(memoryStorage())
  store.write(1, envelopeAt(100, sampleData({ coins: 1 })))
  store.write(2, envelopeAt(200, sampleData({ coins: 2 })))
  assert.equal(save.resolveStartup(store, { kind: 'load', slot: 1 }).envelope.data.coins, 1)
  const fresh = save.resolveStartup(store, { kind: 'new', slot: 2 })
  assert.equal(fresh.envelope, null)
  assert.equal(fresh.slot, 2)
})

test('an unreadable save is never overwritten by the farm that replaces it', () => {
  const storage = memoryStorage()
  const store = save.createSaveStore(storage)
  storage.items.set('animal-balloon-farm.save.slot1', 'garbage')
  const startup = save.resolveStartup(store, { kind: 'load', slot: 1 })
  assert.equal(startup.envelope, null)
  assert.equal(startup.slot, 2, 'the new farm goes to a free slot')
  assert.match(startup.notice, /Farm 1 .*new farm was started/)
  store.write(2, envelopeAt(1))
  store.write(3, envelopeAt(1))
  assert.equal(save.resolveStartup(store, { kind: 'load', slot: 1 }).slot, null, 'with no free slot, autosave waits for the player')
})

test('a save from a newer game is reported, not loaded or replaced', () => {
  const storage = memoryStorage()
  const store = save.createSaveStore(storage)
  storage.items.set('animal-balloon-farm.save.slot1', JSON.stringify({ ...envelopeAt(1), version: 99 }))
  const startup = save.resolveStartup(store, { kind: 'load', slot: 1 })
  assert.equal(startup.envelope, null)
  assert.match(startup.notice, /newer version/)
  assert.notEqual(startup.slot, 1)
})

test('play time and saved-ago labels read naturally', () => {
  assert.equal(save.formatPlayTime(0), '0 min')
  assert.equal(save.formatPlayTime(59 * 60), '59 min')
  assert.equal(save.formatPlayTime(3600 + 5 * 60), '1 h 05 min')
  assert.equal(save.formatPlayTime(Number.NaN), '0 min')
  assert.equal(save.formatSavedAgo(1000, 1000 + 10_000), 'just now')
  assert.equal(save.formatSavedAgo(0, 5 * 60_000), '5 min ago')
  assert.equal(save.formatSavedAgo(0, 3 * 3_600_000), '3 h ago')
  assert.equal(save.formatSavedAgo(0, 86_400_000), '1 day ago')
  assert.equal(save.formatSavedAgo(0, 3 * 86_400_000), '3 days ago')
})

// ------------------------------------------------------- simulation state --

const SPECIES = ['cow', 'sheep', 'owl']

test('animal life exports and re-imports to the same farm', () => {
  const life = save.createAnimalLife(SPECIES, { random: () => 0 })
  const animal = life.add('cow', 3)
  life.add('sheep', 4, true)
  const state = life.exportState()
  const clone = save.createAnimalLife(SPECIES, { random: () => 0 })
  clone.importState(JSON.parse(JSON.stringify(state)))
  assert.deepEqual(clone.all(), life.all())
  assert.deepEqual(clone.exportState(), state)
  assert.equal(clone.animal(animal.id).species, 'cow')
  const next = clone.add('owl', 1)
  assert.ok(!life.all().some((entry) => entry.id === next.id), 'new ids continue past the saved ones')
})

test('animal life import drops unknown species, duplicates and garbage instead of trusting them', () => {
  const life = save.createAnimalLife(SPECIES)
  const base = { elapsed: 0, invited: true, baby: false, ageSeconds: 0, parentIds: [] }
  life.importState({
    animals: [
      { ...base, id: 'animal-7', species: 'cow', stage: 3 },
      { ...base, id: 'animal-7', species: 'cow', stage: 1 },
      { ...base, id: 'animal-8', species: 'dragon', stage: 3 },
      { ...base, id: 'animal-9', species: 'sheep', stage: 99, elapsed: Number.NaN, ageSeconds: -5 },
    ],
    discovered: ['cow', 'dragon'],
    pendingVisitors: ['owl', 'dragon'],
    nextAnimalId: 1,
    arrivalElapsed: Number.NaN,
  })
  const all = life.all()
  assert.deepEqual(all.map((entry) => entry.id), ['animal-7', 'animal-9'])
  assert.equal(all[0].stage, 3)
  assert.equal(all[1].stage, 4, 'a stage past the top clamps to the top')
  assert.equal(all[1].elapsed, 0)
  assert.equal(all[1].ageSeconds, 0)
  const state = life.exportState()
  assert.deepEqual(state.discovered, ['cow'])
  assert.deepEqual(state.pendingVisitors, ['owl'])
  assert.ok(state.nextAnimalId > 9, 'the id counter is pushed past every loaded animal')
})

test('a save from before houses, with eggs and courtships, still loads', () => {
  const life = save.createAnimalLife(SPECIES)
  const old = { elapsed: 0, invited: true, baby: false, ageSeconds: 0, romanceCooldown: 30, parentIds: [], paired: true, courtshipPartnerId: 'animal-2', courtshipRemaining: 5, courtshipSuccessful: true }
  life.importState({
    animals: [{ ...old, id: 'animal-1', species: 'cow', stage: 4 }],
    eggs: [{ id: 5, species: 'cow', x: 1, z: 2, incubation: 12, parentIds: ['a', 'b'] }],
    discovered: [], pendingVisitors: [], nextAnimalId: 3, nextEggId: 6, arrivalElapsed: 0,
  })
  const record = life.animal('animal-1')
  assert.equal(record.stage, 4)
  assert.equal(record.insideId, null)
  const state = life.exportState()
  assert.equal('eggs' in state, false)
  assert.equal('paired' in state.animals[0], false)
})

test('an animal indoors is saved as indoors, and loads outside until the caller houses it', () => {
  const life = save.createAnimalLife(SPECIES)
  const cow = life.add('cow', 3)
  life.tick({ farm: { state: { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }, residentSpecies: new Set() }, expansionLevel: 0, houses: [{ id: 'barn-1', prop: 'barn', x: 0, z: 0 }] }, 0)
  assert.equal(life.enterHouse(cow.id, 'barn-1'), true)
  const state = JSON.parse(JSON.stringify(life.exportState()))
  assert.equal(state.animals.find((entry) => entry.id === cow.id).inside, true)
  const clone = save.createAnimalLife(SPECIES)
  clone.importState(state)
  assert.equal(clone.animal(cow.id).insideId, null, "house ids are this session's; main puts it back in")
})

test('the progress ledger keeps its points and its one-time awards', () => {
  const ledger = save.createProgressLedger()
  ledger.awardPoints('first-cow', 20)
  const state = JSON.parse(JSON.stringify(ledger.exportState()))
  const clone = save.createProgressLedger()
  clone.importState(state)
  assert.equal(clone.points, 20)
  assert.equal(clone.awardPoints('first-cow', 20), 20, 'an award already given is not given twice')
  clone.importState({ points: Number.NaN, awarded: [1, 'x'] })
  assert.equal(clone.points, 0)
  assert.equal(clone.awardPoints('x', 5), 0)
})

test('the wallet restores a balance but never a negative or fractional one', () => {
  const wallet = save.createWallet(5)
  assert.equal(wallet.restore(120.9), 120)
  assert.equal(wallet.restore(-4), 0)
  assert.equal(wallet.restore(Number.NaN), 0)
})

test('plants keep their growth, care stops and the seed bag', () => {
  const sim = save.createPlantSimulation()
  sim.addSeeds('poppy', 3)
  const land = { substrate: 'soil', waterDepth: 0, inBounds: true }
  const plant = sim.plant('poppy', 1, 1, land)
  assert.ok(plant)
  sim.tick(5)
  const state = JSON.parse(JSON.stringify(sim.exportState()))
  const clone = save.createPlantSimulation()
  clone.importState(state)
  assert.deepEqual(clone.plants, sim.plants)
  assert.equal(clone.seedsFor('poppy'), 2)
  const second = clone.plant('poppy', 5, 5, land)
  assert.ok(second.instanceId > plant.instanceId, 'new plants never reuse a saved id')
})

test('plants import drops unknown species and clamps growth', () => {
  const sim = save.createPlantSimulation()
  sim.importState({
    seeds: { poppy: 2.9, nonsense: 4 },
    plants: [
      { instanceId: 1, species: 'poppy', x: 0, z: 0, growth: 7, careNeeded: 'water', stopsDone: 99 },
      { instanceId: 2, species: 'triffid', x: 0, z: 0, growth: 0.5, careNeeded: null, stopsDone: 0 },
    ],
    nextInstanceId: 1,
  })
  assert.equal(sim.seedsFor('poppy'), 2)
  assert.equal(sim.plants.length, 1)
  assert.equal(sim.plants[0].growth, 1)
  assert.equal(sim.plants[0].careNeeded, null, 'a fully grown plant needs no care')
})

test('the farm expansion restores a level with no animation and clamps it', () => {
  const expansion = save.createFarmExpansion()
  const start = expansion.bounds
  assert.equal(expansion.restoreLevel(3), 3)
  assert.equal(expansion.level, 3)
  assert.equal(expansion.isAnimating, false)
  assert.ok(expansion.bounds.halfWidth > start.halfWidth || expansion.bounds.halfDepth > start.halfDepth)
  const reached = save.createFarmExpansion()
  reached.expand()
  reached.update(1000)
  assert.deepEqual(expansion.restoreLevel(1), 1)
  assert.deepEqual(expansion.bounds, reached.bounds, 'a restored level matches one earned in play')
  assert.equal(expansion.restoreLevel(-5), 0)
  assert.equal(expansion.restoreLevel(Number.NaN), 0)
  assert.ok(expansion.restoreLevel(10_000) <= expansion.state.totalLevels)
})

test('accomplishments restore in order and ignore ids that no longer exist', () => {
  const defs = [
    { id: 'a', kind: 'plant', species: 'x', points: 1, title: 'A' },
    { id: 'b', kind: 'plant', species: 'y', points: 1, title: 'B' },
  ]
  const tracker = save.createAccomplishmentTracker(defs)
  tracker.importState(['b', 'ghost', 'a', 'b'])
  assert.deepEqual(tracker.exportState(), ['b', 'a'])
  assert.equal(tracker.isAccomplished('ghost'), false)
})
