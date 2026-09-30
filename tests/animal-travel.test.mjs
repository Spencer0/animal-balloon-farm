import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const { outputFiles } = await build({
  entryPoints: ['src/game/animal-travel.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const travel = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('entering the farm walks through the nearest gate without position snapping', () => {
  const start = { x: 24, z: 8 }
  const route = travel.createAnimalTravelRoute('enter', { halfWidth: 14, halfDepth: 9.5 }, start)
  const outside = route.waypoints[0]
  assert.deepEqual(outside, { x: 16.4, z: 5.8 })
  const approach = travel.advanceAnimalTravel(start, route, 0.5)
  assert.ok(Math.hypot(approach.position.x - 24, approach.position.z - 8) <= 0.500001)
  assert.ok(approach.route, 'route remains active after a short walking step')

  let position = start
  let active = route
  let steps = 0
  while (active && steps < 1000) {
    const result = travel.advanceAnimalTravel(position, active, 0.08)
    position = result.position
    active = result.route
    steps += 1
  }
  assert.equal(active, null, 'route eventually completes')
  assert.ok(Math.abs(position.x) < 14 && Math.abs(position.z) < 9.5, 'animal finishes inside the farm boundary')
  assert.equal(position.x, 10.3, 'the animal reaches its routed entry point at the plot edge')
})

test('leaving the farm uses the same gate in reverse', () => {
  const start = { x: 4, z: -2 }
  const route = travel.createAnimalTravelRoute('leave', { halfWidth: 14, halfDepth: 9.5 }, start)
  assert.deepEqual(route.waypoints.map(({ x, z }) => [x, z]), [[4, -5.8], [4, -11.9]])
  const firstStep = travel.advanceAnimalTravel(start, route, 0.25)
  assert.ok(Math.hypot(firstStep.position.x - 4, firstStep.position.z + 2) <= 0.250001)
  assert.ok(firstStep.route)
})
