import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/camera-rig.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const { cameraPanStep } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const right = { x: 1, y: 0, z: 0 }
const up = { x: 0, y: 1, z: 0 }
const length = (step) => Math.hypot(step.x, step.y, step.z)

test('a pan step depends only on its own pointer move', () => {
  // The old bug re-applied every earlier move; equal moves must stay equal.
  const first = cameraPanStep(right, up, 12, 0, 0.02)
  const second = cameraPanStep(right, up, 12, 0, 0.02)
  const third = cameraPanStep(right, up, 12, 0, 0.02)
  assert.deepEqual(first, second)
  assert.deepEqual(second, third)
  assert.ok(Math.abs(length(first) - 12 * 0.02) < 1e-12)
})

test('dragging right and down moves the look-at along the screen axes', () => {
  const rightward = cameraPanStep(right, up, 30, 0, 0.02)
  assert.ok(Math.abs(rightward.x + 0.6) < 1e-12, 'dragging right moves the target left along the camera right axis')
  assert.equal(rightward.y, 0)
  const downward = cameraPanStep(right, up, 0, 30, 0.02)
  assert.ok(Math.abs(downward.y - 0.6) < 1e-12, 'dragging down lifts the look-at along the camera up axis')
  const zero = cameraPanStep(right, up, 0, 0, 0.02)
  assert.deepEqual(zero, { x: 0, y: 0, z: 0 })
})

test('pan distance scales with zoom, not with the number of moves', () => {
  const single = cameraPanStep(right, up, 100, 0, 0.05)
  const split = cameraPanStep(right, up, 50, 0, 0.05)
  assert.ok(Math.abs(length(single) - 5) < 1e-12)
  assert.ok(Math.abs(length(single) - 2 * length(split)) < 1e-12)
})

test('panning follows the camera axes when the view is rotated', () => {
  const turnedRight = { x: 0, y: 0, z: 1 }
  const step = cameraPanStep(turnedRight, up, 10, 0, 0.1)
  assert.deepEqual(step, { x: 0, y: 0, z: -1 })
})
