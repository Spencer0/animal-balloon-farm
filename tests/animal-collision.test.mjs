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

// ---- Collision on the 15 Hz sim tick: no tunnelling, no jitter ----

const simModule = await (async () => {
  const { outputFiles: out } = await build({ entryPoints: ['src/game/animal-sim.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(out[0].text).toString('base64')}`)
})()
const wanderModule = await (async () => {
  const { outputFiles: out } = await build({ entryPoints: ['src/game/animal-wander.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(out[0].text).toString('base64')}`)
})()
const { seededRandom: seeded } = await (async () => {
  const { outputFiles: out } = await build({ entryPoints: ['src/game/seeded-random.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(out[0].text).toString('base64')}`)
})()

const TICK = 1 / 15

test('a body that travels farther in one tick than a thin wall is wide cannot tunnel through it', () => {
  const wall = { minX: 5, minZ: -5, maxX: 5.2, maxZ: 5 }
  // 3 m in one tick (a 45 m/s dash): the end point is on the far side, clear of the wall.
  const dash = { x: 8.5, z: 0, radius: 0.5, prevX: 5.5 - 3, prevZ: 0 }
  dash.x = 8.5
  resolveCollisions([dash], [wall])
  assert.ok(dash.x <= wall.minX - dash.radius + 1e-9, `got through to ${dash.x}`)
  // Without the sweep the end point alone would have been left on the far side.
  const blind = { x: 8.5, z: 0, radius: 0.5 }
  resolveCollisions([blind], [wall])
  assert.equal(blind.x, 8.5)
})

test('sweeping does not disturb a body that moved a normal step', () => {
  const stepped = { x: 2.1, z: 1, radius: 0.5, prevX: 2.0, prevZ: 1 }
  const plain = { x: 2.1, z: 1, radius: 0.5 }
  resolveCollisions([stepped], [barn])
  resolveCollisions([plain], [barn])
  assert.deepEqual([stepped.x, stepped.z], [plain.x, plain.z])
})

test('walking at a wall every tick settles flush against it with no jitter', () => {
  const body = { x: -3, z: 2, radius: 0.5 }
  const speed = 1.6
  const samples = []
  for (let tick = 0; tick < 200; tick += 1) {
    const prevX = body.x
    body.x += speed * TICK
    const probe = { x: body.x, z: body.z, radius: body.radius, prevX, prevZ: body.z }
    resolveCollisions([probe], [barn])
    body.x = probe.x
    body.z = probe.z
    samples.push(body.x)
  }
  const flush = barn.minX - body.radius
  const tail = samples.slice(-60)
  assert.ok(tail.every((x) => Math.abs(x - flush) < 1e-9), 'sits at the wall surface at the end of every tick')
  samples.forEach((x) => assert.ok(x <= flush + 1e-9, 'never ends a tick inside the wall'))
})

test('two animals walking into each other settle with no oscillation', () => {
  const left = { x: -2, z: 0, radius: 0.5 }
  const right = { x: 2, z: 0, radius: 0.5 }
  let previous = null
  let lastChange = Infinity
  for (let tick = 0; tick < 300; tick += 1) {
    left.x += 1.2 * TICK
    right.x -= 1.2 * TICK
    resolveCollisions([left, right], [])
    const gap = right.x - left.x
    if (previous !== null) lastChange = Math.abs(gap - previous)
    previous = gap
    assert.ok(gap >= 1 - 1e-9, 'never ends a tick overlapped')
  }
  assert.ok(Math.abs(right.x - left.x - 1) < 1e-9)
  assert.ok(lastChange < 1e-9, 'the gap stops changing')
  assert.ok(Math.abs(left.x + right.x) < 1e-9, 'a symmetric meeting stays symmetric')
})

test('a seeded wanderer among houses never ends a tick inside one, and never jumps more than a step plus a push', () => {
  const walls = [
    { minX: -1, minZ: -1, maxX: 1, maxZ: 1 },
    { minX: 4, minZ: -3, maxX: 4.2, maxZ: 3 },
    { minX: -6, minZ: 3, maxX: -4, maxZ: 5 },
  ]
  const ctx = { limitX: 9, limitZ: 7, carnival: false, alarmed: false, speed: 1.6, anchor: null, gardenBounds: { halfWidth: 12, halfDepth: 10, footprint: 'rect' } }
  const run = (seed) => {
    const record = simModule.createAnimalSimRecord({ x: 2.5, z: 0, motion: 'walk', radius: 0.55 })
    const rng = seeded(seed)
    wanderModule.chooseWanderTarget(record, ctx, rng)
    const trace = []
    let worstStep = 0
    for (let tick = 0; tick < 4000; tick += 1) {
      simModule.beginSimStep(record)
      wanderModule.stepWander(record, ctx, TICK, rng)
      const body = { x: record.x, z: record.z, radius: record.radius, prevX: record.prevX, prevZ: record.prevZ }
      resolveCollisions([body], walls)
      simModule.pushAnimalSim(record, body.x - record.x, body.z - record.z)
      for (const wall of walls) {
        const nearestX = Math.max(wall.minX, Math.min(record.x, wall.maxX))
        const nearestZ = Math.max(wall.minZ, Math.min(record.z, wall.maxZ))
        assert.ok(Math.hypot(record.x - nearestX, record.z - nearestZ) >= record.radius - 1e-9, `inside a wall at tick ${tick}`)
      }
      worstStep = Math.max(worstStep, Math.hypot(record.x - record.prevX, record.z - record.prevZ))
      trace.push([record.x, record.z])
    }
    return { trace, worstStep }
  }
  const a = run(77)
  assert.deepEqual(a.trace, run(77).trace, 'a seeded run replays exactly')
  assert.ok(a.worstStep <= 1.6 * TICK * 2 + 1e-9, `jumped ${a.worstStep} in one tick`)
})

test('a sprinting animal against a thin fence post is still stopped when the sweep knows where it came from', () => {
  const post = { minX: 3, minZ: -0.1, maxX: 3.2, maxZ: 0.1 }
  const sprinter = { x: 3.7, z: 0, radius: 0.3, prevX: 2.9 - 0.6, prevZ: 0 }
  resolveCollisions([sprinter], [post])
  assert.ok(sprinter.x < post.minX || sprinter.x > post.maxX, 'not left inside the post')
})
