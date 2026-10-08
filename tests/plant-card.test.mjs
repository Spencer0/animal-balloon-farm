import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/plant-card.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const card = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { plantGrowthLevel, plantGrowthStage, plantStageChip, plantGrowthStatus, plantCareLine } = card

test('growth is clamped to 0..1 and bad values read as zero', () => {
  assert.equal(plantGrowthLevel(-1), 0)
  assert.equal(plantGrowthLevel(3), 1)
  assert.equal(plantGrowthLevel(Number.NaN), 0)
  assert.equal(plantGrowthLevel(0.4), 0.4)
})

test('a plant is a seedling, then growing, then mature', () => {
  assert.equal(plantGrowthStage(0.04), 'Seedling')
  assert.equal(plantGrowthStage(0.5), 'Growing')
  assert.equal(plantGrowthStage(0.99), 'Growing')
  assert.equal(plantGrowthStage(1), 'Mature')
})

test('chip and status words follow the stage', () => {
  assert.equal(plantStageChip(0.62), 'Growing · 62%')
  assert.equal(plantStageChip(1), 'Mature')
  assert.equal(plantGrowthStatus(0.2), '20% grown')
  assert.equal(plantGrowthStatus(1), 'fully grown')
})

test('the care line names what a plant wants, then settles', () => {
  assert.match(plantCareLine(0.3, 'water'), /drink/)
  assert.match(plantCareLine(0.5, 'prune'), /pinching/)
  assert.match(plantCareLine(0.5, null), /Growing happily/)
  assert.match(plantCareLine(1, null), /thriving/)
})
