import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false,
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const sim = await load('src/game/animal-sim.ts')
const routes = await load('src/game/animal-routes.ts')
const wander = await load('src/game/animal-wander.ts')
const { seededRandom } = await load('src/game/seeded-random.ts')

const STEP = 1 / 15
const plot = { halfWidth: 12, halfDepth: 10, footprint: 'rect' }

function record(x, z, extra = {}) {
  return sim.createAnimalSimRecord({ x, z, motion: 'walk', ...extra })
}

function runHome(seed, scale, ticks, speed = 1.25) {
  const r = record(-6, 4)
  const rng = seededRandom(seed)
  r.home = { x: 5, z: -3, speedScale: scale }
  const path = []
  for (let tick = 0; tick < ticks; tick += 1) {
    sim.beginSimStep(r)
    routes.stepHomeTrip(r, speed, STEP)
    path.push([r.x, r.z, r.motion, r.atDoor])
  }
  void rng
  return { r, path }
}

test('a walk to the door arrives, stands still and flags atDoor', () => {
  const { r, path } = runHome(1, 1, 400)
  assert.equal(r.atDoor, true)
  assert.equal(r.motion, 'idle')
  assert.ok(Math.hypot(r.x - 5, r.z + 3) <= routes.HOME_ARRIVE_DISTANCE + 1e-9)
  const arrivedAt = path.findIndex((entry) => entry[3])
  assert.ok(arrivedAt > 0, 'it took time to get there')
  for (const entry of path.slice(arrivedAt)) assert.deepEqual([entry[0], entry[1]], [r.x, r.z], 'it stays put once there')
})

test('a home trip never moves farther in a tick than speed times scale times the step, and never overshoots', () => {
  for (const scale of [1, 2.6]) {
    const { path } = runHome(2, scale, 300)
    let previous = [-6, 4]
    for (const [x, z] of path) {
      assert.ok(Math.hypot(x - previous[0], z - previous[1]) <= 1.25 * scale * STEP + 1e-9)
      previous = [x, z]
    }
  }
})

test('a sprint home gets there sooner than a stroll, in the same direction', () => {
  const firstAtDoor = (scale) => runHome(3, scale, 600).path.findIndex((entry) => entry[3])
  assert.ok(firstAtDoor(3) < firstAtDoor(1) * 0.5)
  const stroll = runHome(3, 1, 2).r
  assert.ok(stroll.x > -6 && stroll.z < 4, 'heads for the door')
  assert.ok(Math.abs(stroll.heading - sim.headingOf(11, -7)) < 1e-9)
})

test('a seeded run that wanders, goes home, then wanders on replays exactly', () => {
  const ctx = { limitX: 10, limitZ: 8, carnival: false, alarmed: false, speed: 1.25, anchor: null, gardenBounds: plot }
  const run = (seed) => {
    const r = record(1, 1)
    const rng = seededRandom(seed)
    wander.chooseWanderTarget(r, ctx, rng)
    const path = []
    for (let tick = 0; tick < 900; tick += 1) {
      if (tick === 200) r.home = { x: 5, z: -3, speedScale: 1 }
      if (tick === 500) { r.home = null; r.atDoor = false }
      sim.beginSimStep(r)
      if (r.home) routes.stepHomeTrip(r, ctx.speed, STEP)
      else wander.stepWander(r, ctx, STEP, rng)
      path.push([r.x, r.z, r.motion, r.atDoor])
    }
    return path
  }
  assert.deepEqual(run(31), run(31))
  assert.notDeepEqual(run(31), run(32))
  const path = run(31)
  assert.equal(path[499][3], true, 'it reached the door while the trip was set')
  assert.equal(path[899][3], false)
})

function gateRun(seed, direction, start, stage = 2, ticks = 2000, speed = 1.1) {
  const r = record(start.x, start.z, { side: direction === 'enter' ? 'carnival' : 'farm' })
  const rng = seededRandom(seed)
  routes.beginGateTravel(r, direction, start, plot, false, stage, rng)
  const path = []
  let completedAt = -1
  for (let tick = 0; tick < ticks; tick += 1) {
    sim.beginSimStep(r)
    const done = routes.stepGateTravel(r, speed, STEP, stage, rng)
    path.push([r.x, r.z, r.motion])
    if (done && completedAt < 0) completedAt = tick
    if (completedAt >= 0) break
  }
  return { r, path, completedAt }
}

test('a visitor enters through the gate at walking pace and ends on the farm side, resting', () => {
  const { r, path, completedAt } = gateRun(4, 'enter', { x: -20, z: 3 })
  assert.ok(completedAt > 0)
  assert.equal(r.visit.side, 'farm')
  assert.equal(r.visit.route, null)
  assert.equal(r.visit.direction, null)
  assert.ok(r.visit.cooldown >= 16 && r.visit.cooldown <= 50, `cooldown ${r.visit.cooldown}`)
  assert.equal(r.motion, 'idle')
  assert.ok(Math.abs(r.x) < plot.halfWidth && Math.abs(r.z) < plot.halfDepth, 'finished inside the plot')
  let previous = [-20, 3]
  for (const [x, z] of path) {
    assert.ok(Math.hypot(x - previous[0], z - previous[1]) <= 1.1 * STEP + 1e-9)
    previous = [x, z]
  }
})

test('a gate walk replays exactly from a seed and the cooldown is seeded', () => {
  const a = gateRun(9, 'leave', { x: 2, z: 0 })
  const b = gateRun(9, 'leave', { x: 2, z: 0 })
  assert.deepEqual(a.path, b.path)
  assert.equal(a.r.visit.cooldown, b.r.visit.cooldown)
  assert.equal(a.r.visit.side, 'carnival')
  assert.notEqual(gateRun(10, 'leave', { x: 2, z: 0 }).r.visit.cooldown, a.r.visit.cooldown)
})

test('a settler finishing its walk in has no further visits to count down to', () => {
  const { r } = gateRun(5, 'enter', { x: -20, z: 3 }, 3)
  assert.equal(r.visit.side, 'farm')
  assert.equal(r.visit.cooldown, 0)
  const resident = record(0, 0, { side: 'farm' })
  resident.visit.cooldown = 0.1
  routes.tickVisitCooldown(resident, 0.05, plot, false, 4, seededRandom(1))
  assert.equal(resident.visit.cooldown, 0.1, 'only stage-two visitors count down')
  assert.ok(routes.visitCooldown(3, 'farm', seededRandom(1)) >= 28, 'a resident rests longer when it does')
})

test('the cooldown ends in a trip to the other side of the gate', () => {
  const r = record(0, 0, { side: 'farm' })
  r.visit.cooldown = 0.19
  const rng = seededRandom(3)
  routes.tickVisitCooldown(r, STEP, plot, false, 2, rng)
  assert.equal(r.visit.route, null)
  routes.tickVisitCooldown(r, STEP, plot, false, 2, rng)
  routes.tickVisitCooldown(r, STEP, plot, false, 2, rng)
  assert.equal(r.visit.direction, 'leave')
  assert.ok(r.visit.route)
  assert.equal(r.motion, 'walk')
})

test('a visitor already inside the plot when its visit comes is simply on the farm', () => {
  const r = record(0, 0, { side: 'carnival' })
  routes.beginGateTravel(r, 'enter', { x: 0, z: 0 }, plot, false, 2, seededRandom(1))
  assert.equal(r.visit.side, 'farm')
  assert.equal(r.visit.route, null)
  assert.ok(r.visit.cooldown > 0)
})

test('a flier crosses the fence by air: only its side changes', () => {
  const r = record(0, 0, { side: 'carnival' })
  routes.beginGateTravel(r, 'enter', { x: -30, z: 0 }, plot, true, 2, seededRandom(1))
  assert.equal(r.visit.side, 'farm')
  assert.equal(r.visit.route, null)
  assert.equal(r.visit.direction, null)
})
