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

test('the carnival ring is wide, never shrinks, and grows with the farm', () => {
  const start = travel.carnivalRing({ halfWidth: 10, halfDepth: 9 })
  assert.ok(start.x >= 50 && start.z >= 40, 'visitors can roam far beyond the old 30 unit pen')
  const grown = travel.carnivalRing({ halfWidth: 60, halfDepth: 50 })
  assert.ok(grown.x >= 60 + travel.CARNIVAL_RING_MARGIN.x)
  assert.ok(grown.z >= 50 + travel.CARNIVAL_RING_MARGIN.z)
  assert.deepEqual(travel.carnivalRing(), { x: travel.CARNIVAL_RING_FLOOR.x, z: travel.CARNIVAL_RING_FLOOR.z })
})

test('arrivals step on at the edge of the ring, in the direction of their usual spot', () => {
  const ring = { x: 56, z: 44 }
  const entry = travel.groundsEntryPoint({ x: 18, z: -13 }, ring)
  assert.ok(entry.x > 0 && entry.z < 0, 'same side of the farm as the spot')
  assert.ok(Math.abs(entry.x) <= ring.x && Math.abs(entry.z) <= ring.z)
  assert.ok(Math.max(Math.abs(entry.x) / ring.x, Math.abs(entry.z) / ring.z) > 0.9, 'out at the edge')
  const slid = travel.groundsEntryPoint({ x: 18, z: -13 }, ring, 6)
  assert.notDeepEqual(slid, entry)
  assert.ok(Math.abs(slid.x) <= ring.x && Math.abs(slid.z) <= ring.z, 'sliding never leaves the ring')
  const origin = travel.groundsEntryPoint({ x: 0, z: 0 }, ring)
  assert.ok(Number.isFinite(origin.x) && Number.isFinite(origin.z))
})

test('a leaving visitor walks straight out from the farm to the edge of the ring', () => {
  const ring = { x: 56, z: 44 }
  const exit = travel.groundsExitPoint({ x: 12, z: 6 }, ring)
  assert.ok(exit.x > 12 && exit.z > 6)
  assert.ok(Math.abs(exit.z / exit.x - 0.5) < 1e-6, 'along the same line from the middle')
  assert.ok(Math.max(Math.abs(exit.x) / ring.x, Math.abs(exit.z) / ring.z) > 0.9)
  assert.deepEqual(travel.groundsExitPoint({ x: 0, z: 0 }, ring).z, 0)
})

test('a pack spreads round its leader without piling members on top of each other', () => {
  assert.deepEqual(travel.packOffset(0), { x: 0, z: 0 })
  const spots = [1, 2, 3, 4].map((index) => travel.packOffset(index))
  for (const spot of spots) assert.ok(Math.hypot(spot.x, spot.z) > 1.2, 'clear of the leader')
  for (let a = 0; a < spots.length; a += 1) {
    for (let b = a + 1; b < spots.length; b += 1) assert.ok(Math.hypot(spots[a].x - spots[b].x, spots[a].z - spots[b].z) > 1, 'clear of each other')
  }
})
