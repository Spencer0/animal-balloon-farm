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
const residency = await load('src/game/animal-residency.ts')
const wander = await load('src/game/animal-wander.ts')
const { seededRandom } = await load('src/game/seeded-random.ts')

const STEP = 1 / 15
const plot = { halfWidth: 12, halfDepth: 10, footprint: 'rect' }
const CARNIVAL = { x: -26, z: 4 }
const INSIDE = { x: 1, z: 1 }

function animal(at, stage, side) {
  return sim.createAnimalSimRecord({ x: at.x, z: at.z, motion: 'idle', stage, side })
}
const drain = (record) => {
  const events = []
  sim.drainSimEvents(record, (event) => events.push(event))
  return events
}
const request = (record, next, rng = seededRandom(1), at = record) => residency.requestStage(record, next, at, plot, false, rng)

test('a promotion to visitor starts the walk through the gate and takes effect at once', () => {
  const r = animal(CARNIVAL, 1, 'carnival')
  request(r, 2)
  assert.equal(r.stage, 2)
  assert.deepEqual(drain(r), [{ type: 'stage-up', from: 1, to: 2 }])
  assert.equal(r.visit.direction, 'enter')
  assert.ok(r.visit.route)
  assert.deepEqual(drain(r), [], 'the queue is empty once drained')
})

test('asking for the rung it is on does nothing', () => {
  const r = animal(INSIDE, 2, 'farm')
  request(r, 2)
  assert.deepEqual(drain(r), [])
  assert.equal(r.pendingStage, null)
})

test('a settle out at the tents waits: the rung stays 2, a walk in starts, nothing is played yet', () => {
  const r = animal(CARNIVAL, 2, 'carnival')
  request(r, 3)
  assert.equal(r.stage, 2)
  assert.equal(r.pendingStage, 3)
  assert.deepEqual(drain(r), [])
  assert.equal(r.visit.direction, 'enter', 'it is sent in through the gate')
})

test('a settle inside the plot takes effect at once', () => {
  const r = animal(INSIDE, 2, 'farm')
  request(r, 3)
  assert.equal(r.stage, 3)
  assert.equal(r.pendingStage, null)
  assert.deepEqual(drain(r), [{ type: 'stage-up', from: 2, to: 3 }])
})

test('a settle takes effect after four seconds browsing the plot, not before, and only once', () => {
  const r = animal(CARNIVAL, 2, 'carnival')
  const rng = seededRandom(7)
  request(r, 3, rng)
  let enteredAt = -1
  let settledAt = -1
  const events = []
  for (let tick = 0; tick < 15 * 120 && settledAt < 0; tick += 1) {
    sim.beginSimStep(r)
    if (r.visit.route) routes.stepGateTravel(r, 1.2, STEP, r.stage, rng)
    else r.motion = 'idle'
    residency.tickResidency(r, STEP, r, plot, false, rng)
    if (enteredAt < 0 && residency.insideFarmPlot(r, r, plot)) enteredAt = tick
    sim.drainSimEvents(r, (event) => { events.push(event); settledAt = tick })
  }
  assert.ok(enteredAt > 0 && settledAt > enteredAt)
  const dwell = (settledAt - enteredAt) * STEP
  assert.ok(dwell >= residency.RESIDENT_DWELL_SECONDS - STEP && dwell <= residency.RESIDENT_DWELL_SECONDS + 2 * STEP, `dwelt ${dwell}`)
  assert.deepEqual(events, [{ type: 'stage-up', from: 2, to: 3 }])
  assert.equal(r.stage, 3)
  assert.equal(r.pendingStage, null)
  for (let tick = 0; tick < 100; tick += 1) residency.tickResidency(r, STEP, r, plot, false, rng)
  assert.deepEqual(drain(r), [], 'no second event')
})

test('stepping out of the plot starts the dwell count again', () => {
  const r = animal(INSIDE, 2, 'farm')
  r.pendingStage = 3
  const rng = seededRandom(1)
  const tickAt = (at, ticks) => { for (let t = 0; t < ticks; t += 1) residency.tickResidency(r, STEP, at, plot, false, rng) }
  tickAt(INSIDE, 45)
  assert.ok(r.dwell > 2.9 && r.stage === 2)
  tickAt({ x: 40, z: 0 }, 1)
  assert.equal(r.dwell, 0)
  tickAt(INSIDE, 45)
  assert.equal(r.stage, 2, 'the walk before did not count')
  tickAt(INSIDE, 30)
  assert.equal(r.stage, 3)
})

test('the margin matters: standing on the boundary is not inside', () => {
  const r = animal({ x: plot.halfWidth - 0.2, z: 0 }, 2, 'farm')
  request(r, 3)
  assert.equal(r.stage, 2)
  assert.equal(r.pendingStage, 3)
})

test('a demotion cancels a settle that was waiting, and a fall from resident puts it back on the farm', () => {
  const waiting = animal(CARNIVAL, 2, 'carnival')
  request(waiting, 3)
  request(waiting, 2)
  assert.equal(waiting.pendingStage, null)
  assert.equal(waiting.dwell, 0)
  const resident = animal(INSIDE, 3, 'farm')
  request(resident, 1)
  assert.equal(resident.stage, 1)
  assert.deepEqual(drain(resident), [{ type: 'stage-down', from: 3, to: 1 }])
  assert.equal(resident.visit.side, 'farm')
  assert.equal(resident.visit.route, null)
})

test('a fliers settle crosses by air: it changes side, not route', () => {
  const r = animal(CARNIVAL, 1, 'carnival')
  residency.requestStage(r, 2, r, plot, true, seededRandom(1))
  assert.equal(r.visit.route, null)
  assert.equal(r.visit.side, 'farm')
})

test('a seeded climb from the tents to resident replays exactly, events and all', () => {
  const run = (seed) => {
    const r = animal(CARNIVAL, 1, 'carnival')
    const rng = seededRandom(seed)
    const ctx = { limitX: 40, limitZ: 30, carnival: true, alarmed: false, speed: 1.1, anchor: null, gardenBounds: plot }
    wander.chooseWanderTarget(r, ctx, rng)
    const trace = []
    for (let tick = 0; tick < 15 * 150; tick += 1) {
      if (tick === 30) request(r, 2, rng)
      if (tick === 60) request(r, 3, rng)
      sim.beginSimStep(r)
      if (r.visit.route) routes.stepGateTravel(r, ctx.speed, STEP, r.stage, rng)
      else wander.stepWander(r, { ...ctx, carnival: r.visit.side === 'carnival' }, STEP, rng)
      residency.tickResidency(r, STEP, r, plot, false, rng)
      sim.drainSimEvents(r, (event) => trace.push([tick, event.type, event.from, event.to]))
    }
    return { trace, final: [r.x, r.z, r.stage, r.visit.side] }
  }
  const a = run(3)
  assert.deepEqual(a, run(3))
  assert.deepEqual(a.trace.map((entry) => entry.slice(1)), [['stage-up', 1, 2], ['stage-up', 2, 3]])
  assert.equal(a.final[2], 3)
  assert.equal(a.final[3], 'farm')
})
