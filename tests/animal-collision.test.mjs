import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/animal-collision.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const { pushOutOfBox, resolveCollisions } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const barn = { minX: 0, minZ: 0, maxX: 4, maxZ: 4 }

test('an animal touching a house wall is pushed back out to its radius', () => {
  const cow = { x: 4.2, z: 2, radius: 0.6 }
  assert.equal(pushOutOfBox(cow, barn), true)
  assert.ok(Math.abs(cow.x - 4.6) < 1e-9)
  assert.equal(cow.z, 2)
  const clear = { x: 6, z: 2, radius: 0.6 }
  assert.equal(pushOutOfBox(clear, barn), false)
})

test('an animal that ends up inside a house leaves by the nearest side', () => {
  const cow = { x: 3.5, z: 2, radius: 0.5 }
  pushOutOfBox(cow, barn)
  assert.equal(cow.x, 4.5)
  assert.equal(cow.z, 2)
})

test('overlapping animals split apart; a fixed one does not move', () => {
  const a = { x: 0, z: 0, radius: 0.5 }
  const b = { x: 0.6, z: 0, radius: 0.5 }
  resolveCollisions([a, b], [])
  assert.ok(Math.abs(b.x - a.x - 1) < 1e-9, 'exactly touching afterwards')
  assert.ok(Math.abs(a.x + 0.2) < 1e-9 && Math.abs(b.x - 0.8) < 1e-9, 'each moved half')
  const sleeper = { x: 0, z: 0, radius: 0.5, fixed: true }
  const walker = { x: 0.6, z: 0, radius: 0.5 }
  resolveCollisions([sleeper, walker], [])
  assert.equal(sleeper.x, 0)
  assert.ok(Math.abs(walker.x - 1) < 1e-9)
})

test('even a fixed animal, e.g. mid-capture, is pushed out of a house', () => {
  const capturing = { x: 3.5, z: 2, radius: 0.5, fixed: true }
  resolveCollisions([capturing], [barn])
  assert.equal(capturing.x, 4.5)
})

test('an animal on its way through a door walks through house walls', () => {
  const goingIn = { x: 3.8, z: 2, radius: 0.5, ghost: true }
  resolveCollisions([goingIn], [barn])
  assert.equal(goingIn.x, 3.8)
})

test('distant animals in other grid cells are never paired', () => {
  const herd = Array.from({ length: 40 }, (_, index) => ({ x: index * 3, z: 0, radius: 0.6 }))
  resolveCollisions(herd, [])
  herd.forEach((body, index) => assert.equal(body.x, index * 3))
})
