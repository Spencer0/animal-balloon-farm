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
const wander = await load('src/game/animal-wander.ts')
const { seededRandom } = await load('src/game/seeded-random.ts')
const { createSimClock } = await load('src/game/sim-clock.ts')

const STEP = 1 / 15
const plot = { halfWidth: 12, halfDepth: 10, footprint: 'rect' }

function fencedContext(overrides = {}) {
  return {
    limitX: 10, limitZ: 8, carnival: false, alarmed: false, speed: 1.6, anchor: null, gardenBounds: plot,
    ...overrides,
  }
}

function run(seed, ticks, ctx = fencedContext()) {
  const record = sim.createAnimalSimRecord({ x: 1, z: -1, motion: 'walk' })
  const rng = seededRandom(seed)
  wander.chooseWanderTarget(record, ctx, rng)
  const path = []
  for (let tick = 0; tick < ticks; tick += 1) {
    sim.beginSimStep(record)
    wander.stepWander(record, ctx, STEP, rng)
    path.push([record.x, record.z, record.motion])
  }
  return { record, path }
}

test('a seeded wander replays exactly', () => {
  const a = run(1234, 600)
  const b = run(1234, 600)
  assert.deepEqual(a.path, b.path)
  assert.notDeepEqual(a.path, run(99, 600).path)
})

test('a fenced wanderer walks, stops and walks again, and stays inside the plot', () => {
  const { path } = run(7, 1500)
  const motions = new Set(path.map((entry) => entry[2]))
  assert.ok(motions.has('walk') && motions.has('idle'))
  for (const [x, z] of path) {
    assert.ok(Math.abs(x) <= 10 + 1e-9 && Math.abs(z) <= 8 + 1e-9, `left the leash at ${x}, ${z}`)
    assert.ok(Math.abs(x) <= plot.halfWidth - 1.2 + 1e-9 && Math.abs(z) <= plot.halfDepth - 1.2 + 1e-9, `left the plot at ${x}, ${z}`)
  }
})

test('a walk never moves farther in a tick than speed times the step', () => {
  const ctx = fencedContext()
  const { path } = run(42, 900, ctx)
  let previous = [1, -1]
  for (const [x, z] of path) {
    assert.ok(Math.hypot(x - previous[0], z - previous[1]) <= ctx.speed * STEP + 1e-9)
    previous = [x, z]
  }
})

test('an alarmed animal runs 2.2 times faster', () => {
  const calm = run(5, 40)
  const alarmed = run(5, 40, fencedContext({ alarmed: true }))
  assert.equal(wander.ALARM_SPEED_SCALE, 2.2)
  const stepLength = (path) => {
    let longest = 0
    let previous = [1, -1]
    for (const [x, z] of path) {
      longest = Math.max(longest, Math.hypot(x - previous[0], z - previous[1]))
      previous = [x, z]
    }
    return longest
  }
  assert.ok(stepLength(alarmed.path) <= 1.6 * 2.2 * STEP + 1e-9)
  assert.ok(stepLength(calm.path) <= 1.6 * STEP + 1e-9)
})

test('a carnival wanderer is kept outside the fence', () => {
  const ctx = fencedContext({ carnival: true, limitX: 50, limitZ: 40 })
  const { path } = run(11, 2000, ctx)
  for (const [x, z] of path) {
    const inside = Math.abs(x) < plot.halfWidth && Math.abs(z) < plot.halfDepth
    assert.ok(!inside, `walked into the fence at ${x}, ${z}`)
  }
})

test('a held animal (infinite pause) stays put until released', () => {
  const record = sim.createAnimalSimRecord({ x: 2, z: 2, motion: 'idle' })
  record.paused = Number.POSITIVE_INFINITY
  record.nextDecision = Number.POSITIVE_INFINITY
  const rng = seededRandom(3)
  for (let tick = 0; tick < 200; tick += 1) {
    sim.beginSimStep(record)
    wander.stepWander(record, fencedContext(), STEP, rng)
  }
  assert.equal(record.x, 2)
  assert.equal(record.z, 2)
})

test('heading faces the direction of travel for a +X-forward model', () => {
  assert.ok(Math.abs(sim.headingOf(1, 0)) < 1e-12)
  assert.ok(Math.abs(sim.headingOf(0, 1) - -Math.PI / 2) < 1e-12)
  assert.ok(Math.abs(sim.headingOf(0, -1) - Math.PI / 2) < 1e-12)
  const record = sim.createAnimalSimRecord({ x: 0, z: 0, motion: 'walk' })
  record.targetX = 0
  record.targetZ = 5
  record.nextDecision = 10
  wander.stepWander(record, fencedContext(), STEP, seededRandom(1))
  assert.ok(Math.abs(record.heading - -Math.PI / 2) < 1e-12)
  assert.ok(record.z > 0)
})

test('interpolation blends previous to current and clamps alpha', () => {
  const record = sim.createAnimalSimRecord({ x: 0, z: 0, motion: 'walk' })
  record.x = 4
  record.z = -2
  const out = { x: 0, z: 0 }
  sim.interpolateAnimalSim(record, 0, out)
  assert.deepEqual(out, { x: 0, z: 0 })
  sim.interpolateAnimalSim(record, 0.25, out)
  assert.deepEqual(out, { x: 1, z: -0.5 })
  sim.interpolateAnimalSim(record, 1, out)
  assert.deepEqual(out, { x: 4, z: -2 })
  sim.interpolateAnimalSim(record, 7, out)
  assert.deepEqual(out, { x: 4, z: -2 })
  sim.interpolateAnimalSim(record, -3, out)
  assert.deepEqual(out, { x: 0, z: 0 })
})

test('beginSimStep, shift and snap keep the blend continuous', () => {
  const record = sim.createAnimalSimRecord({ x: 0, z: 0, motion: 'walk' })
  record.x = 1
  sim.beginSimStep(record)
  assert.equal(record.prevX, 1)
  record.x = 2
  const out = { x: 0, z: 0 }
  const before = sim.interpolateAnimalSim(record, 0.5, out).x
  sim.shiftAnimalSim(record, 0.3, 0)
  assert.ok(Math.abs(sim.interpolateAnimalSim(record, 0.5, out).x - (before + 0.3)) < 1e-12)
  sim.snapAnimalSim(record, 9, 9)
  assert.equal(sim.interpolateAnimalSim(record, 0.5, out).x, 9)
})

test('a 60 Hz display shows a 15 Hz walk with no jumps bigger than a frame of travel', () => {
  const ctx = fencedContext()
  const record = sim.createAnimalSimRecord({ x: 1, z: -1, motion: 'walk' })
  const rng = seededRandom(21)
  wander.chooseWanderTarget(record, ctx, rng)
  const clock = createSimClock()
  const out = { x: 0, z: 0 }
  let last = null
  let biggest = 0
  let ticks = 0
  for (let frame = 0; frame < 900; frame += 1) {
    const steps = clock.advance(1 / 60)
    for (let step = 0; step < steps; step += 1) {
      sim.beginSimStep(record)
      wander.stepWander(record, ctx, clock.stepSeconds, rng)
      ticks += 1
    }
    sim.interpolateAnimalSim(record, clock.alpha, out)
    if (last) biggest = Math.max(biggest, Math.hypot(out.x - last.x, out.z - last.z))
    last = { x: out.x, z: out.z }
  }
  assert.ok(ticks > 200)
  // Blended motion advances about speed/60 per frame, never a whole tick's worth at once.
  assert.ok(biggest <= ctx.speed * STEP + 1e-9, `largest frame step ${biggest}`)
  assert.ok(biggest <= (ctx.speed / 60) * 2 + 1e-9, `blend stepped by ${biggest}`)
})

test('the clock reports alpha between steps', () => {
  const clock = createSimClock()
  assert.equal(clock.alpha, 0)
  clock.advance(STEP / 4)
  assert.ok(Math.abs(clock.alpha - 0.25) < 1e-9)
  clock.advance(STEP)
  assert.ok(Math.abs(clock.alpha - 0.25) < 1e-9)
  clock.advance(10)
  assert.ok(clock.alpha <= 1)
})
