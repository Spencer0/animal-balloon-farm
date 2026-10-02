import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/farm-progression.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const { createProgressLedger, PROGRESSION_CONFIG } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('successful actions award their configured points and unlock expansion levels', () => {
  const ledger = createProgressLedger()
  assert.equal(ledger.level, 0)
  ledger.award('residentSpecies')
  ledger.award('sellPlant', 5)
  assert.equal(ledger.points, 40)
  assert.equal(ledger.pointsToNextLevel, 10)
  ledger.award('growPlant', 2)
  assert.equal(ledger.level, 1)
  assert.equal(ledger.pointsToNextLevel, PROGRESSION_CONFIG.expansionInterval)
})

test('one-time discoveries and resident rewards cannot be farmed by repeated notifications', () => {
  const ledger = createProgressLedger()
  ledger.awardOnce('animal-1:visit', 'visitSpecies')
  ledger.awardOnce('animal-1:visit', 'visitSpecies')
  ledger.awardOnce('animal-1:resident', 'residentSpecies')
  assert.equal(ledger.points, 35)
})

test('expansion milestone thresholds continue indefinitely', () => {
  const ledger = createProgressLedger()
  assert.equal(ledger.pointsForNextExpansion(0), 50)
  assert.equal(ledger.pointsForNextExpansion(12), 650)
  ledger.award('sellAnimal', 2)
  assert.equal(ledger.level, 0)
  ledger.award('sellAnimal', 2)
  assert.equal(ledger.level, 0)
  ledger.award('sellAnimal', 1)
  assert.equal(ledger.level, 1)
  assert.equal(ledger.pointsToNextLevel, 40)
})
