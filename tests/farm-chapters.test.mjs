import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/farm-chapters.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const signals = (over = {}) => ({
  grownPlants: 0, lawnArea: 0, residentSpecies: new Set(), goodsCoins: 0, harmony: 0, predatorLinks: 0, day: 0, ...over,
})

test('a new farm starts in the garden with every later system quiet', () => {
  const chapters = m.createFarmChapters()
  assert.equal(chapters.current().id, 'garden')
  assert.deepEqual(Object.values(chapters.flags()), Object.values(chapters.flags()).map(() => false))
})

test('chapters open in order as each goal is met', () => {
  const chapters = m.createFarmChapters()
  assert.deepEqual(chapters.tick(signals({ grownPlants: 9 })), [])
  assert.deepEqual(chapters.tick(signals({ grownPlants: 10 })).map((c) => c.id), ['land'])
  assert.equal(chapters.flags().grassSeeder, true)
  assert.equal(chapters.flags().goods, false)
  assert.deepEqual(chapters.tick(signals({ lawnArea: 20 })), [], 'lawn alone is not enough: a grazer must move in')
  assert.deepEqual(chapters.tick(signals({ lawnArea: 20, residentSpecies: new Set(['cow']) })).map((c) => c.id), ['care'])
  assert.equal(chapters.flags().goods, true)
  assert.equal(chapters.flags().starvation, false, 'care teaches feeding before hunger can hurt')
  assert.deepEqual(chapters.tick(signals({ goodsCoins: 100 })).map((c) => c.id), ['husbandry'])
  assert.equal(chapters.flags().starvation, true)
  assert.deepEqual(chapters.tick(signals({ residentSpecies: new Set(['owl']) })).map((c) => c.id), ['harmony'])
  assert.deepEqual(chapters.tick(signals({ harmony: 70, predatorLinks: 1 })), [])
  assert.deepEqual(chapters.tick(signals({ harmony: 70, predatorLinks: 2 })).map((c) => c.id), ['mythical'])
  assert.equal(chapters.flags().mythic, true)
  assert.deepEqual(chapters.tick(signals({ harmony: 100, predatorLinks: 9 })), [], 'mythical is the last chapter')
})

test('only one chapter opens per tick, and a calendar fallback keeps nobody stuck', () => {
  const chapters = m.createFarmChapters()
  assert.deepEqual(chapters.tick(signals({ grownPlants: 99, lawnArea: 99, residentSpecies: new Set(['cow']), goodsCoins: 999 })).map((c) => c.id), ['land'])
  const slow = m.createFarmChapters()
  assert.deepEqual(slow.tick(signals({ day: 3 })), [])
  assert.deepEqual(slow.tick(signals({ day: 4 })).map((c) => c.id), ['land'])
})

test('progress reads 0..1 toward the current goal', () => {
  assert.equal(m.CHAPTERS.garden.progress(signals({ grownPlants: 5 })), 0.5)
  assert.equal(m.CHAPTERS.land.progress(signals({ lawnArea: 15 })), 0.5)
  assert.equal(m.CHAPTERS.care.progress(signals({ goodsCoins: 250 })), 1)
})

test('saves keep their chapters, and a save from before chapters catches up from its farm', () => {
  const chapters = m.createFarmChapters()
  chapters.openThrough('care')
  const saved = JSON.parse(JSON.stringify(chapters.exportState()))
  const loaded = m.createFarmChapters()
  loaded.importState(saved)
  assert.equal(loaded.current().id, 'care')

  const skipped = m.createFarmChapters()
  skipped.importState({ open: ['garden', 'care'] })
  assert.equal(skipped.current().id, 'garden', 'a hand-edited save cannot skip a chapter')

  const legacy = m.createFarmChapters()
  legacy.importState(undefined, signals({ grownPlants: 12, lawnArea: 80, residentSpecies: new Set(['cow', 'pig', 'owl']), goodsCoins: 0 }))
  assert.equal(legacy.current().id, 'care', 'an old farm with cows lands in animal care, goods and all')
  assert.equal(legacy.flags().goods, true)
})
