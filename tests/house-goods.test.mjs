import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/house-goods.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const goods = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('goodsValue sums coin values and ignores gems', () => {
  assert.equal(goods.goodsValue({ milk: 3, egg: 2 }), 3 * 2 + 2 * 1)
  assert.equal(goods.goodsValue({ gem: 5 }), 0)
  assert.equal(goods.goodsValue({}), 0)
  assert.equal(goods.goodsValue([{ good: 'wool', count: 2 }, { good: 'truffle', count: 1 }]), 2 * 3 + 6)
})

test('goodsRows lists only goods present, richest row first, with singular and plural names', () => {
  const rows = goods.goodsRows({ egg: 1, milk: 3, wool: 0, truffle: 1 })
  assert.deepEqual(rows.map((row) => row.good), ['milk', 'truffle', 'egg'])
  assert.equal(rows[0].name, 'Milk')
  assert.equal(rows[0].value, 6)
  assert.equal(rows[2].name, 'Egg')
  assert.equal(goods.goodsRows({ egg: 2 })[0].name, 'Eggs')
  assert.deepEqual(goods.goodsRows({}), [])
})

test('the meter fills and the house reports full at capacity', () => {
  assert.equal(goods.goodsTotal({ milk: 7, egg: 5 }), 12)
  assert.equal(goods.goodsFull({ milk: 7, egg: 5 }), true)
  assert.equal(goods.goodsFull({ milk: 7, egg: 4 }), false)
  assert.equal(goods.goodsFill({ milk: 6 }, 12), 0.5)
  assert.equal(goods.goodsFill({ milk: 99 }, 12), 1)
})

test('the signature changes only when the drawn block would', () => {
  assert.equal(goods.goodsSignature({ milk: 2 }), goods.goodsSignature({ milk: 2, egg: 0 }))
  assert.notEqual(goods.goodsSignature({ milk: 2 }), goods.goodsSignature({ milk: 3 }))
})

test('formatCollected reads as a sentence', () => {
  assert.equal(goods.formatCollected([{ good: 'milk', count: 3 }], 6), 'Collected 3 milk · +6 coins')
  assert.equal(goods.formatCollected([{ good: 'egg', count: 1 }], 1), 'Collected 1 egg · +1 coin')
  assert.equal(
    goods.formatCollected([{ good: 'milk', count: 3 }, { good: 'egg', count: 2 }, { good: 'wool', count: 1 }], 11),
    'Collected 3 milk, 2 eggs and 1 wool · +11 coins',
  )
  assert.equal(goods.formatCollected([], 0), 'Nothing to collect yet')
})

test('makesHint names what fed residents make, skipping gems and non-producers', () => {
  assert.equal(goods.makesHint([{ id: 'cow', plural: 'Cows' }]), 'Fed cows make milk here.')
  assert.equal(
    goods.makesHint([{ id: 'chicken', plural: 'Chickens' }, { id: 'duck', plural: 'Ducks' }]),
    'Fed chickens make eggs and ducks make duck eggs here.',
  )
  assert.equal(goods.makesHint([{ id: 'owl', plural: 'Owls' }]), null)
  assert.equal(goods.makesHint([{ id: 'starhorn', plural: 'Starhorns' }]), null)
})
