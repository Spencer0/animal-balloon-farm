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
const { cameraPanStep, clampPanTarget } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

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

test('a pan target is held inside the meadow limits', () => {
  const down = { x: 0, y: 1, z: 0 }
  const limits = { x: 50, z: 40 }
  assert.deepEqual(clampPanTarget({ x: 900, y: 1.25, z: -900 }, down, 1.25, limits), { x: 50, y: 1.25, z: -40 })
  assert.deepEqual(clampPanTarget({ x: 3, y: 1.25, z: -4 }, down, 1.25, limits), { x: 3, y: 1.25, z: -4 })
})

test('a look-at lifted off the lawn slides back down its view ray', () => {
  // A 45 degree view: lifting the look-at 10 units is the same picture as a
  // look-at 10 units further along the ground, so the clamp sees the ground spot.
  const view = { x: 0, y: Math.SQRT1_2, z: Math.SQRT1_2 }
  const seated = clampPanTarget({ x: 0, y: 11, z: 0 }, view, 1, { x: 50, z: 40 })
  assert.ok(Math.abs(seated.y - 1) < 1e-9)
  assert.ok(Math.abs(seated.z + 10) < 1e-9)
  const runaway = clampPanTarget({ x: 0, y: 1e6, z: 0 }, view, 1, { x: 50, z: 40 })
  assert.deepEqual(runaway, { x: 0, y: 1, z: -40 })
})
