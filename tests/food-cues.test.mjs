import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const load = async (entry) => {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}
const cues = await load('src/game/food-cues.ts')
const { HOUSE_GOODS_CAPACITY } = await load('src/game/animal-diet.ts')

test('only hungry and starving animals wear a bubble', () => {
  assert.equal(cues.hungerBubbleKind('full'), null)
  assert.equal(cues.hungerBubbleKind('fed'), null)
  assert.equal(cues.hungerBubbleKind('hungry'), 'hunger')
  assert.equal(cues.hungerBubbleKind('starving'), 'starving')
})

test('an empty or missing goods map has no badge', () => {
  assert.equal(cues.goodsBadge(null), null)
  assert.equal(cues.goodsBadge({}), null)
  assert.equal(cues.goodsBadge({ milk: 0 }), null)
})

test('the badge shows the main good, its count and the total', () => {
  const badge = cues.goodsBadge({ egg: 2, 'duck-egg': 5 })
  assert.deepEqual(badge, { good: 'duck-egg', count: 5, total: 7, full: false })
})

test('a tie goes to the first good in the catalogue order', () => {
  assert.equal(cues.goodsBadge({ egg: 3, milk: 3 }).good, 'milk')
})

test('a house at capacity is full, one below it is not', () => {
  assert.equal(cues.goodsBadge({ milk: HOUSE_GOODS_CAPACITY }).full, true)
  assert.equal(cues.goodsBadge({ milk: HOUSE_GOODS_CAPACITY - 1 }).full, false)
  assert.equal(cues.goodsBadge({ milk: HOUSE_GOODS_CAPACITY - 4, wool: 4 }).full, true)
})

test('the badge key changes only when the picture would', () => {
  const a = cues.goodsBadge({ milk: 3 })
  assert.equal(cues.goodsBadgeKey(a), cues.goodsBadgeKey(cues.goodsBadge({ milk: 3 })))
  assert.notEqual(cues.goodsBadgeKey(a), cues.goodsBadgeKey(cues.goodsBadge({ milk: 4 })))
  assert.equal(cues.goodsBadgeKey(null), '')
})

test('count labels stay short', () => {
  assert.equal(cues.badgeCountLabel(7), '7')
  assert.equal(cues.badgeCountLabel(250), '99+')
})

test('the lawn shows nothing until the grass larder is half empty', () => {
  assert.equal(cues.grazedness(100, 100), 0)
  assert.equal(cues.grazedness(50, 100), 0)
  assert.ok(cues.grazedness(40, 100) > 0)
  assert.equal(cues.grazedness(0, 100), 1)
})

test('overgrazing rises monotonically as the larder empties', () => {
  let previous = -1
  for (let stock = 50; stock >= 0; stock -= 5) {
    const value = cues.grazedness(stock, 100)
    assert.ok(value >= previous, `stock ${stock}`)
    previous = value
  }
})

test('no grass supply or a bad number reads as lush, not dry', () => {
  assert.equal(cues.grazedness(0, 0), 0)
  assert.equal(cues.grazedness(Number.NaN, 10), 0)
})

test('easing never overshoots and lands exactly on its target', () => {
  let value = 0
  for (let i = 0; i < 2000; i += 1) {
    value = cues.easeToward(value, 1, 0.1, 0.05)
    assert.ok(value <= 1)
  }
  assert.equal(value, 1)
  assert.equal(cues.easeToward(0.3, 1, 0, 1), 0.3)
})

test('the straw multiplier is identity when lush and washed out by snow', () => {
  assert.deepEqual(cues.grazingMultiplier(0), [1, 1, 1])
  assert.deepEqual(cues.grazingMultiplier(1, 1), [1, 1, 1])
  const dry = cues.grazingMultiplier(1)
  assert.ok(dry[0] > 1 && dry[2] > 1)
})
