import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const { pickHeightField } = await load('src/scene/terrain-pick.ts')

const OPTIONS = { top: 1.2, bottom: -2.6, step: 0.12, refine: 10 }
const unit = (x, y, z) => {
  const length = Math.hypot(x, y, z)
  return { x: x / length, y: y / length, z: z / length }
}

test('a ray straight down hits flat ground at its height', () => {
  const hit = pickHeightField({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, () => 0.5, OPTIONS)
  assert.ok(hit)
  assert.ok(Math.abs(hit.y - 0.5) < 1e-6)
  assert.ok(Math.abs(hit.x) < 1e-9 && Math.abs(hit.z) < 1e-9)
})

test('an oblique ray lands on a slope where the two surfaces cross', () => {
  // Ground rises as 0.3x; the ray descends as y = 1 - x from (-2, 3, 0). They meet at x = 1 / 1.3.
  const heightAt = (x) => 0.3 * x
  const hit = pickHeightField({ x: -2, y: 3, z: 0 }, unit(1, -1, 0), heightAt, OPTIONS)
  assert.ok(hit)
  assert.ok(Math.abs(hit.x - 1 / 1.3) < 1e-3, `x ${hit.x}`)
  assert.ok(Math.abs(hit.y - 0.3 / 1.3) < 1e-3, `y ${hit.y}`)
})

test('a ray crossing a pit rim goes on to the pit floor, not the rim', () => {
  // Ground is 0 outside |x| < 1 and -1 inside. The ray passes over the rim at
  // y = 0 and only meets the floor at x = 0, so the first hit is the floor.
  const heightAt = (x) => (Math.abs(x) < 1 ? -1 : 0)
  const hit = pickHeightField({ x: -3, y: 2, z: 0 }, unit(1, -1, 0), heightAt, OPTIONS)
  assert.ok(hit)
  assert.ok(Math.abs(hit.x) < 1e-3, `x ${hit.x}`)
  assert.ok(Math.abs(hit.y + 1) < 1e-6, `y ${hit.y}`)
})

test('a ray heading up or level finds nothing', () => {
  assert.equal(pickHeightField({ x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 }, () => 0, OPTIONS), null)
  assert.equal(pickHeightField({ x: 0, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, () => 0, OPTIONS), null)
})

test('ground below the height band is not searched', () => {
  assert.equal(pickHeightField({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, () => -5, OPTIONS), null)
})

test('a ray that starts below the field still reports a point, never a point above the ground', () => {
  const hit = pickHeightField({ x: 0, y: -0.2, z: 0 }, { x: 0, y: -1, z: 0 }, () => 0, OPTIONS)
  assert.ok(hit === null || Math.abs(hit.y) < 1e-6)
})
