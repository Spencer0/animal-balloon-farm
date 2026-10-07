import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The weekly carnival rules stay pure (no Three.js, no DOM), so the schedule
 * and the placement rule can be checked here instead of only by eye.
 */
const load = async (entry) => {
  const { outputFiles } = await build({ entryPoints: ['src/game/' + entry + '.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const { weekdayOf, weekdayName, isCarnivalOpen, createCarnivalSchedule, placeOutsideFarm, SETUP_SWEEP_SECONDS } = await load('carnival-schedule')
const { farmBoundsAtLevel, GARDEN_MAX_BOUNDS } = await load('farm-expansion')
const { farmEdgeDistance } = await load('farm-footprint')

test('the epoch day is a Saturday, so the first Sunday is day two', () => {
  assert.equal(weekdayName(0), 'Saturday')
  assert.equal(weekdayName(1), 'Sunday')
  assert.equal(weekdayName(2), 'Monday')
  assert.equal(weekdayOf(8), 0)
  assert.equal(weekdayOf(7.9), 6)
  assert.equal(weekdayOf(-3), 6)
  assert.equal(weekdayOf(Number.NaN), 6)
})

test('the carnival is open only on Sundays', () => {
  assert.equal(isCarnivalOpen(0), false)
  assert.equal(isCarnivalOpen(1), true)
  assert.equal(isCarnivalOpen(2), false)
  assert.equal(isCarnivalOpen(8), true)
  assert.equal(isCarnivalOpen(15), true)
  assert.equal(isCarnivalOpen(7), false)
})

test('the schedule starts packed on the Saturday epoch and set up on Sundays', () => {
  assert.equal(createCarnivalSchedule(3, 0).amount, 0)
  assert.equal(createCarnivalSchedule(3, 1).amount, 1)
  assert.deepEqual(createCarnivalSchedule(3, 0).packProgress(), [1, 1, 1])
  assert.deepEqual(createCarnivalSchedule(3, 1).packProgress(), [0, 0, 0])
})

test('packing away takes one sweep and every prop ends fully packed', () => {
  const schedule = createCarnivalSchedule(4, 1)
  schedule.update(SETUP_SWEEP_SECONDS / 2, 2)
  assert.ok(schedule.amount > 0.4 && schedule.amount < 0.6, 'halfway through the sweep')
  schedule.update(SETUP_SWEEP_SECONDS, 2)
  assert.equal(schedule.amount, 0)
  assert.ok(schedule.packProgress().every((progress) => progress === 1))
})

test('unpacking plays the pack sweep in reverse', () => {
  // Props are listed in pack order: index 0 packs first, index 3 packs last.
  const schedule = createCarnivalSchedule(4, 2)
  schedule.update(SETUP_SWEEP_SECONDS, 8)
  assert.equal(schedule.amount, 1)
  assert.ok(schedule.packProgress().every((progress) => progress === 0))

  // Partway through unpacking, the last prop in pack order rises first.
  const partial = createCarnivalSchedule(4, 2)
  partial.update(SETUP_SWEEP_SECONDS * 0.2, 8)
  const progress = partial.packProgress()
  assert.ok(progress[3] < progress[0], 'last-packed prop rises before the first-packed prop')
  assert.ok(progress[0] > 0.9, 'first-packed prop is still folded while the last one rises')
})

test('packing away starts with the first prop in pack order', () => {
  const schedule = createCarnivalSchedule(4, 1)
  schedule.update(SETUP_SWEEP_SECONDS * 0.1, 2)
  const progress = schedule.packProgress()
  assert.ok(progress[0] > progress[3], 'first-packed prop folds first')
  assert.equal(progress[3], 0)
})

test('bad time steps and empty sets are ignored or safe', () => {
  const schedule = createCarnivalSchedule(0, 1)
  schedule.update(Number.NaN, 1)
  schedule.update(-1, 1)
  assert.equal(schedule.amount, 1)
  assert.deepEqual(schedule.packProgress(), [])
  assert.throws(() => createCarnivalSchedule(-1), RangeError)
})

test('placeOutsideFarm leaves props that already clear the farm alone', () => {
  const far = { x: 40, z: 0 }
  assert.deepEqual(placeOutsideFarm(far.x, far.z, 3, GARDEN_MAX_BOUNDS), far)
})

test('placeOutsideFarm pushes props clear of the largest farm footprint', () => {
  const samples = [[0, -17], [7, -17], [20, -4], [-20, 8], [-9, -17], [-24, -14], [0, 0.1], [14, 18]]
  for (const [x, z] of samples) {
    const radius = 4
    const placed = placeOutsideFarm(x, z, radius, GARDEN_MAX_BOUNDS)
    assert.ok(farmEdgeDistance(placed.x, placed.z, GARDEN_MAX_BOUNDS) >= radius, `(${x}, ${z}) clears the outer ring`)
  }
})

test('the largest footprint is the outer ring the carnival now sits beyond', () => {
  assert.deepEqual(GARDEN_MAX_BOUNDS, farmBoundsAtLevel(15))
  assert.ok(GARDEN_MAX_BOUNDS.halfWidth > 30)
})
