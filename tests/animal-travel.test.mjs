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

test('settled residents stay on the farm while stage-two visitors may come and go', () => {
  assert.equal(travel.canAnimalLeaveFarm(0), false)
  assert.equal(travel.canAnimalLeaveFarm(1), false)
  assert.equal(travel.canAnimalLeaveFarm(2), true, 'visitors may wander outside')
  assert.equal(travel.canAnimalLeaveFarm(3), false, 'a settled animal is home')
  assert.equal(travel.canAnimalLeaveFarm(4), false, 'a breeding animal is home')
})

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

test('carnival points are nudged clear of a plot that grew over them', () => {
  const starter = { halfWidth: 14, halfDepth: 9.5 }
  // Authored carnival spawns already sit outside the starter plot, so they
  // must be left exactly where the catalog put them.
  for (const point of [{ x: -19.5, z: 12.5 }, { x: 18, z: -13 }, { x: 26, z: 4 }]) {
    assert.deepEqual(travel.clearOfFarmBounds(point, starter), { ...point })
  }
  // A point clear on one axis is already outside the rectangle.
  assert.deepEqual(travel.clearOfFarmBounds({ x: 40, z: 2 }, starter), { x: 40, z: 2 })

  // A grown plot swallows those same points; each comes back outside the walls
  // along whichever axis costs the least movement.
  const grown = { halfWidth: 30, halfDepth: 20.5 }
  assert.deepEqual(travel.clearOfFarmBounds({ x: 18, z: -13 }, grown), { x: 18, z: -22.3 })
  assert.deepEqual(travel.clearOfFarmBounds({ x: 21, z: 14 }, grown), { x: 21, z: 22.3 })
  const cleared = travel.clearOfFarmBounds({ x: 5, z: 2 }, grown)
  const outside = Math.abs(cleared.x) >= grown.halfWidth + 1.8 || Math.abs(cleared.z) >= grown.halfDepth + 1.8
  assert.ok(outside, `${JSON.stringify(cleared)} is outside the walls`)
  assert.deepEqual(travel.clearOfFarmBounds(cleared, grown), cleared, 'clearing is idempotent')
})

test('leaving the farm uses the same gate in reverse', () => {
  const start = { x: 4, z: -2 }
  const route = travel.createAnimalTravelRoute('leave', { halfWidth: 14, halfDepth: 9.5 }, start)
  assert.deepEqual(route.waypoints.map(({ x, z }) => [x, z]), [[4, -5.8], [4, -11.9]])
  const firstStep = travel.advanceAnimalTravel(start, route, 0.25)
  assert.ok(Math.hypot(firstStep.position.x - 4, firstStep.position.z + 2) <= 0.250001)
  assert.ok(firstStep.route)
})
