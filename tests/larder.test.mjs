import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const load = async (entry) => {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const larder = await load('src/game/larder.ts')
const diet = await load('src/game/animal-diet.ts')
const { measureHarmony } = await load('src/game/harmony.ts')

const entry = (food, stock, capacity, supply, demand) => ({ food, stock, capacity, supply, demand })
const herd = (species, count) => Array.from({ length: count }, () => ({ species }))

test('a food is green while the farm grows what is eaten and amber when it does not', () => {
  const rows = larder.buildLarderRows(
    [entry('grass', 10, 20, 30, 20), entry('pondweed', 2, 6, 4, 9)],
    [...herd('cow', 3), ...herd('duck', 2)],
  )
  assert.equal(rows.find((row) => row.food === 'grass').status, 'ok')
  assert.equal(rows.find((row) => row.food === 'pondweed').status, 'short')
  assert.equal(rows.find((row) => row.food === 'feed').status, 'bought')
})

test('rows list who eats each food, only species that live here, with counts', () => {
  const rows = larder.buildLarderRows([entry('grass', 1, 1, 1, 1)], [...herd('cow', 4), ...herd('sheep', 1), ...herd('mouse', 2)], (id) => id.toUpperCase())
  const grass = rows.find((row) => row.food === 'grass')
  assert.deepEqual(grass.eaters.map((eater) => [eater.species, eater.count, eater.name]), [['cow', 4, 'COW'], ['sheep', 1, 'SHEEP']])
  const feed = rows.find((row) => row.food === 'feed')
  assert.equal(feed.eaters.length, 2, 'cows and sheep fall back on feed; mice do not')
  assert.equal(rows.some((row) => row.food === 'prey'), false)
})

test('foods nobody grows, stocks or eats are left off, but the pantry is always there', () => {
  const rows = larder.buildLarderRows([], [])
  assert.deepEqual(rows.map((row) => row.food), ['feed'])
  assert.equal(rows[0].capacity, diet.FEED_CAPACITY)
})

test('the stock bar is a clamped share of the larder', () => {
  const [row] = larder.buildLarderRows([entry('grass', 30, 20, 1, 0)], [])
  assert.equal(row.fill, 1)
})

test('the hint names the worst shortage, in plain numbers', () => {
  const rows = larder.buildLarderRows(
    [entry('grass', 5, 14, 18, 27), entry('pondweed', 2, 3, 4, 5)],
    [...herd('cow', 12), ...herd('duck', 3)],
  )
  assert.equal(larder.shortageHint(rows), 'Grass: 18 a day is grown, 27 is eaten. Grow lawn, thin the herd, or buy feed.')
})

test('the hint says so when nothing is grown, and skips buying feed for animals that cannot eat it', () => {
  const rows = larder.buildLarderRows([entry('worms', 0, 0, 0, 1.2)], herd('mole', 2))
  assert.equal(larder.shortageHint(rows), 'Worms: none is grown, 1.2 is eaten. Leave more bare dirt or thin the herd.')
})

test('no hint while every food keeps up', () => {
  const rows = larder.buildLarderRows([entry('grass', 5, 14, 18, 18)], herd('cow', 3))
  assert.equal(larder.shortageHint(rows), null)
})

test('numbers round to one decimal without a trailing zero', () => {
  assert.equal(larder.oneDecimal(18), '18')
  assert.equal(larder.oneDecimal(4.46), '4.5')
  assert.equal(larder.oneDecimal(0.04), '0')
  assert.equal(larder.oneDecimal(Number.NaN), '0')
})

test('harmony parts add up to the score and name a crowding species', () => {
  const residents = [...herd('cow', 6), ...herd('sheep', 1)].map((r) => ({ ...r, fullness: 1 }))
  const report = measureHarmony(residents)
  const parts = larder.harmonyParts(report, (id) => id[0].toUpperCase() + id.slice(1))
  assert.deepEqual(parts.map((part) => part.key), ['variety', 'balance', 'fed', 'links'])
  assert.ok(Math.abs(parts.reduce((sum, part) => sum + part.points, 0) - report.score) <= 2)
  assert.ok(parts[1].note.startsWith('Cows are over half the farm'), parts[1].note)
})

test('plurals cover the irregular species', () => {
  assert.equal(larder.pluralName('mouse', 'Mouse'), 'Mice')
  assert.equal(larder.pluralName('sheep', 'Sheep'), 'Sheep')
  assert.equal(larder.pluralName('cow', 'Cow'), 'Cows')
})

test('a feed sack costs more than the goods it keeps coming', () => {
  // A cow eats 1.5 meals a day and makes 1 milk (2 coins): a day of feed must cost more (pigs only tie: truffles are worth 3 a day).
  const feedCoinsPerMeal = diet.FEED_SACK_PRICE / diet.FEED_SACK_MEALS
  const cow = diet.DIETS.cow.appetite * feedCoinsPerMeal
  const milk = diet.PRODUCE.cow.perDay * diet.GOODS.milk.value
  assert.ok(cow > milk)
  for (const [species, produce] of Object.entries(diet.PRODUCE)) {
    const eaten = diet.DIETS[species].appetite * feedCoinsPerMeal
    assert.ok(eaten >= produce.perDay * diet.GOODS[produce.good].value, `${species} feed must never be cheaper than its goods`)
  }
})
