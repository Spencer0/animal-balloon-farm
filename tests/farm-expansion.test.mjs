import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/farm-expansion.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const expansionModule = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createFarmExpansion, farmBoundsAtLevel, GARDEN_MAX_BOUNDS, FARM_EXPANSION_CONFIG } = expansionModule

const oneStepConfig = {
  startBounds: { halfWidth: 10, halfDepth: 6 },
  durationSeconds: 2,
  maximumLevel: 2,
  steps: [{ name: 'Test Orchard', width: 2, depth: 1 }],
}

test('default farm parcels repeat through level 15 with linearly growing bounds', () => {
  const expansion = createFarmExpansion()
  assert.deepEqual(expansion.state.bounds, { halfWidth: 14, halfDepth: 9.5 })
  assert.equal(expansion.state.level, 0)
  assert.equal(expansion.state.totalLevels, 15)
  assert.equal(expansion.state.nextStep.name, 'Clover Patch')
  assert.equal(FARM_EXPANSION_CONFIG.steps.length, 5)
  assert.deepEqual(GARDEN_MAX_BOUNDS, farmBoundsAtLevel(15))
  assert.deepEqual(GARDEN_MAX_BOUNDS, { halfWidth: 38, halfDepth: 26 })
  assert.deepEqual(farmBoundsAtLevel(99), { halfWidth: 172.4, halfDepth: 118.4 })
  assert.notDeepEqual(GARDEN_MAX_BOUNDS, farmBoundsAtLevel(5))
  const farBounds = farmBoundsAtLevel(99)
  assert.ok(Math.abs(farBounds.halfWidth - 172.4) < 0.001)
  assert.ok(Math.abs(farBounds.halfDepth - 118.4) < 0.001)
  assert.deepEqual(farmBoundsAtLevel(Number.NaN), FARM_START_BOUNDS)
})

const FARM_START_BOUNDS = { halfWidth: 14, halfDepth: 9.5 }

test('expansion is irreversible, eased, monotonic, and cannot overlap an active animation', () => {
  const expansion = createFarmExpansion(oneStepConfig)
  const started = expansion.expand()
  assert.equal(started.step.name, 'Test Orchard')
  assert.deepEqual(started.fromBounds, oneStepConfig.startBounds)
  assert.deepEqual(started.targetBounds, { halfWidth: 12, halfDepth: 7 })
  assert.equal(expansion.state.isAnimating, true)
  assert.equal(expansion.state.progress, 0)
  assert.equal(expansion.expand(), null)

  let previousWidth = expansion.state.bounds.halfWidth
  for (let index = 0; index < 8; index += 1) {
    expansion.update(0.125)
    const { bounds, progress } = expansion.state
    assert.ok(progress >= 0 && progress <= 1)
    assert.ok(bounds.halfWidth >= previousWidth)
    assert.ok(bounds.halfWidth <= started.targetBounds.halfWidth)
    assert.ok(bounds.halfDepth >= 6)
    assert.ok(bounds.halfDepth <= started.targetBounds.halfDepth)
    previousWidth = bounds.halfWidth
  }
  assert.ok(expansion.state.isAnimating)
  expansion.update(-10)
  expansion.update(Number.NaN)
  assert.ok(expansion.state.isAnimating)
  expansion.update(10)
  assert.equal(expansion.state.isAnimating, false)
  assert.equal(expansion.state.progress, 1)
  assert.deepEqual(expansion.state.bounds, started.targetBounds)
  assert.equal(expansion.state.lastStep.name, 'Test Orchard')
  assert.equal(expansion.state.nextStep.name, 'Test Orchard 2')
  assert.ok(expansion.expand())
})

test('state and start results do not expose mutable internal progression data', () => {
  const mutableConfig = {
    startBounds: { ...oneStepConfig.startBounds },
    durationSeconds: oneStepConfig.durationSeconds,
    maximumLevel: oneStepConfig.maximumLevel,
    steps: oneStepConfig.steps.map((step) => ({ ...step })),
  }
  const expansion = createFarmExpansion(mutableConfig)
  mutableConfig.startBounds.halfWidth = 100
  mutableConfig.steps[0].width = 200
  const start = expansion.expand()
  start.step.name = 'Changed outside'
  start.targetBounds.halfWidth = 900
  const state = expansion.state
  state.bounds.halfWidth = 800
  if (state.lastStep) state.lastStep.name = 'Also changed'
  assert.equal(expansion.state.lastStep.name, 'Test Orchard')
  assert.equal(expansion.state.targetBounds.halfWidth, 12)
  assert.equal(expansion.state.bounds.halfWidth, 10)
  expansion.update(2)
  assert.deepEqual(expansion.state.bounds, { halfWidth: 12, halfDepth: 7 })
})

test('expansion repeats decorative parcel styles but stops at the configured cap', () => {
  const expansion = createFarmExpansion()
  for (let level = 1; level <= 15; level += 1) {
    const started = expansion.expand()
    assert.equal(started.level, level)
    const baseStep = FARM_EXPANSION_CONFIG.steps[(level - 1) % FARM_EXPANSION_CONFIG.steps.length]
    const cycle = Math.floor((level - 1) / FARM_EXPANSION_CONFIG.steps.length)
    assert.equal(started.step.name, cycle === 0 ? baseStep.name : `${baseStep.name} ${cycle + 1}`)
    expansion.update(10)
  }
  assert.equal(expansion.state.level, 15)
  assert.equal(expansion.state.nextStep, null)
  assert.equal(expansion.expand(), null)
})

test('zero parcels form a valid non-expandable starter plot', () => {
  const expansion = createFarmExpansion({ ...oneStepConfig, steps: [] })
  assert.equal(expansion.state.nextStep, null)
  assert.equal(expansion.expand(), null)
  expansion.update(100)
  assert.equal(expansion.state.level, 0)
  assert.equal(expansion.state.isAnimating, false)
})

test('invalid bounds, duration, and parcel increments are rejected', () => {
  assert.throws(() => createFarmExpansion({ ...oneStepConfig, startBounds: { halfWidth: 0, halfDepth: 6 } }), RangeError)
  assert.throws(() => createFarmExpansion({ ...oneStepConfig, durationSeconds: Number.POSITIVE_INFINITY }), RangeError)
  assert.throws(() => createFarmExpansion({ ...oneStepConfig, maximumLevel: 1.5 }), RangeError)
  assert.throws(() => createFarmExpansion({ ...oneStepConfig, maximumLevel: -1 }), RangeError)
  assert.throws(() => createFarmExpansion({ ...oneStepConfig, steps: [{ name: '', width: 1, depth: 1 }] }), RangeError)
  assert.throws(() => createFarmExpansion({ ...oneStepConfig, steps: [{ name: 'Broken', width: 1, depth: Number.NaN }] }), RangeError)
  assert.throws(() => createFarmExpansion({ ...oneStepConfig, steps: [
    { name: 'Giant', width: Number.MAX_VALUE, depth: 1 },
    { name: 'Overflow', width: Number.MAX_VALUE, depth: 1 },
  ] }), RangeError)
})
