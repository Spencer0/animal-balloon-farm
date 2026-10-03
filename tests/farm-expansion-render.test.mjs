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
const { createFarmExpansion } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('animation getters track bounds without allocating a full state snapshot', () => {
  const expansion = createFarmExpansion()
  const stateBounds = expansion.state.bounds
  const liveBounds = expansion.bounds
  assert.deepEqual(liveBounds, stateBounds)
  assert.notEqual(liveBounds, stateBounds)

  const previousSnapshot = expansion.state
  assert.equal(expansion.expand()?.level, 1)
  expansion.update(0.8)
  assert.equal(expansion.level, 1)
  assert.equal(expansion.isAnimating, true)
  assert.equal(expansion.progress, expansion.state.progress)
  assert.deepEqual(expansion.bounds, expansion.state.bounds)
  assert.deepEqual(previousSnapshot.bounds, stateBounds, 'previous snapshots stay immutable as the farm grows')

  liveBounds.halfWidth = -1
  assert.ok(expansion.bounds.halfWidth > 14, 'live bounds are still returned as an isolated value')
  expansion.update(10)
  assert.equal(expansion.isAnimating, false)
  assert.deepEqual(expansion.bounds, expansion.state.bounds)
})
