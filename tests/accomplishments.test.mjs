import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/accomplishments.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const mod = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  ACCOMPLISHMENT_POINTS,
  buildAccomplishmentCatalog,
  createAccomplishmentTracker,
  filterAccomplishmentRows,
  sortAccomplishmentRows,
} = mod

const animals = [{ id: 'pig', name: 'Pig' }, { id: 'cow', name: 'Cow' }]
const plants = [{ id: 'clover', name: 'Clover' }]

function catalog() {
  return buildAccomplishmentCatalog(animals, plants)
}

test('catalog holds four stage entries per animal plus one per plant', () => {
  const defs = catalog()
  assert.equal(defs.length, 2 * 4 + 1)
  const appear = defs.find((def) => def.id === 'animal.pig.appear')
  assert.ok(appear)
  assert.equal(appear.title, 'Pig · Appear')
  assert.equal(appear.points, ACCOMPLISHMENT_POINTS.appear)
  const breed = defs.find((def) => def.id === 'animal.cow.breed')
  assert.equal(breed.points, ACCOMPLISHMENT_POINTS.breed)
  const grown = defs.find((def) => def.id === 'plant.clover.grown')
  assert.equal(grown.points, ACCOMPLISHMENT_POINTS.plantGrown)
})

test('each accomplishment is awarded exactly once', () => {
  const tracker = createAccomplishmentTracker(catalog())
  const first = tracker.discoverAnimalStage('pig', 'appear')
  assert.ok(first)
  assert.equal(tracker.discoverAnimalStage('pig', 'appear'), null)
  assert.equal(tracker.isAccomplished('animal.pig.appear'), true)
  const grown = tracker.discoverPlantGrown('clover')
  assert.ok(grown)
  assert.equal(tracker.discoverPlantGrown('clover'), null)
})

test('unknown species and stages award nothing', () => {
  const tracker = createAccomplishmentTracker(catalog())
  assert.equal(tracker.discoverAnimalStage('dragon', 'appear'), null)
  assert.equal(tracker.discoverAnimalStage('pig', 'hatch'), null)
  assert.equal(tracker.discoverPlantGrown('rose'), null)
})

test('later stages stay hidden until the species appears', () => {
  const tracker = createAccomplishmentTracker(catalog())
  const hidden = new Map(tracker.list(new Set()).map((row) => [row.def.id, row.state]))
  assert.equal(hidden.get('animal.pig.appear'), 'unaccomplished')
  assert.equal(hidden.get('animal.pig.visit'), 'hidden')
  assert.equal(hidden.get('animal.pig.live'), 'hidden')
  tracker.discoverAnimalStage('pig', 'appear')
  const shown = new Map(tracker.list(new Set()).map((row) => [row.def.id, row.state]))
  assert.equal(shown.get('animal.pig.visit'), 'unaccomplished')
  assert.equal(shown.get('animal.cow.visit'), 'hidden')
})

test('plant rows stay hidden until the seed is owned', () => {
  const tracker = createAccomplishmentTracker(catalog())
  assert.equal(tracker.list(new Set())[8].state, 'hidden')
  assert.equal(tracker.list(new Set(['clover']))[8].state, 'unaccomplished')
  tracker.discoverPlantGrown('clover')
  assert.equal(tracker.list(new Set())[8].state, 'accomplished')
})

test('recent lists newest first with a limit', () => {
  const tracker = createAccomplishmentTracker(catalog())
  tracker.discoverAnimalStage('pig', 'appear')
  tracker.discoverAnimalStage('pig', 'visit')
  tracker.discoverPlantGrown('clover')
  assert.deepEqual(tracker.recent().map((def) => def.id), ['plant.clover.grown', 'animal.pig.visit', 'animal.pig.appear'])
  assert.equal(tracker.recent(1).length, 1)
})

test('rows filter by state and sort by points or name', () => {
  const tracker = createAccomplishmentTracker(catalog())
  tracker.discoverAnimalStage('pig', 'appear')
  const rows = tracker.list(new Set(['clover']))
  assert.equal(filterAccomplishmentRows(rows, 'accomplished').length, 1)
  assert.equal(filterAccomplishmentRows(rows, 'all').length, rows.length)
  const byPoints = sortAccomplishmentRows(rows, 'points')
  assert.equal(byPoints[0].def.points, ACCOMPLISHMENT_POINTS.breed)
  const byName = sortAccomplishmentRows(rows, 'name')
  const titles = byName.map((row) => row.def.title)
  assert.deepEqual(titles, [...titles].sort())
})

test('duplicate ids are rejected and reset clears everything', () => {
  assert.throws(() => buildAccomplishmentCatalog([...animals, animals[0]], plants), RangeError)
  const tracker = createAccomplishmentTracker(catalog())
  tracker.discoverAnimalStage('pig', 'appear')
  tracker.reset()
  assert.equal(tracker.isAccomplished('animal.pig.appear'), false)
  assert.equal(tracker.recent().length, 0)
  assert.equal(tracker.list(new Set()).find((row) => row.def.id === 'animal.pig.visit').state, 'hidden')
})
