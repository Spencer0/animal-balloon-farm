import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/sales.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const sales = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('wallet starts at a safe non-negative balance and accepts only valid credits', () => {
  const wallet = sales.createWallet(-10)
  assert.equal(wallet.balance, 0)
  assert.equal(wallet.credit(12), 12)
  assert.equal(wallet.credit(3.8), 15)
  assert.throws(() => wallet.credit(-1), RangeError)
  assert.throws(() => wallet.credit(Number.NaN), RangeError)
})

test('each animal gets a randomly ordered unique friendly name for the session', () => {
  const forward = sales.generateAnimalNames(8, () => 0.999)
  const reverse = sales.generateAnimalNames(8, () => 0)
  assert.equal(new Set(forward).size, forward.length)
  assert.equal(new Set(reverse).size, reverse.length)
  assert.notDeepEqual(forward, reverse)
})

test('sale values reflect both species and maturity/progression', () => {
  assert.equal(sales.plantSaleValue('clover', 0), 3)
  assert.equal(sales.plantSaleValue('poppy', 0.5), 7)
  assert.equal(sales.plantSaleValue('water-lily', 1), 14)
  assert.equal(sales.plantSaleValue('clover', 10), 8)
  assert.equal(sales.animalSaleValue('cow', 0), 24)
  assert.equal(sales.animalSaleValue('cow', 2), 36)
  assert.equal(sales.animalSaleValue('cow', 4), 48)
  assert.equal(sales.animalSaleValue('goose', 99), 36)
})

test('only settled, standard residents can be sold — never wild or in-flourish animals', () => {
  const resident = { sold: false, captured: true, capturing: false, stage: 3, appearance: 'standard' }
  assert.equal(sales.canSellAnimal(resident), true)
  assert.equal(sales.canSellAnimal({ ...resident, appearance: 'wild' }), false)
  assert.equal(sales.canSellAnimal({ ...resident, captured: false }), false)
  assert.equal(sales.canSellAnimal({ ...resident, stage: 2 }), false)
  assert.equal(sales.canSellAnimal({ ...resident, capturing: true }), false)
  assert.equal(sales.canSellAnimal({ ...resident, sold: true }), false)
})

test('sale prices are fixed by plant and animal species', () => {
  assert.deepEqual(sales.PLANT_SALE_PRICES, { clover: 5, poppy: 7, 'water-lily': 9 })
  assert.deepEqual(sales.ANIMAL_SALE_PRICES, {
    goose: 18,
    cow: 24,
    sheep: 20,
    duck: 14,
    chicken: 12,
    pig: 16,
    frog: 15,
    owl: 30,
  })
})
