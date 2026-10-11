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
const hunt = await load('src/game/animal-hunt.ts')
const groundHunt = await load('src/game/ground-hunt.ts')
const predator = await load('src/game/predator.ts')
const { seededRandom } = await load('src/game/seeded-random.ts')

const STEP = 1 / 15
const plot = { halfWidth: 14, halfDepth: 10, footprint: 'rect' }
const wanderContext = (alarmed, speed) => ({ limitX: 12, limitZ: 8, carnival: false, alarmed, speed, anchor: null, gardenBounds: plot })

/**
 * A little world run the way main.ts runs one sim tick: every animal walks (pursuit
 * first, then wander), then the hunt decides against where they ended up, then
 * the events are played (a caught animal leaves the farm).
 */
function createWorld(seed) {
  const animals = new Map()
  const rngs = new Map()
  let counter = 0
  return {
    animals,
    add(species, x, z, speed) {
      counter += 1
      const id = `${species}-${counter}`
      const record = sim.createAnimalSimRecord({ x, z, motion: 'idle', radius: 0.5 })
      const rng = seededRandom(seed * 1000 + counter)
      wander.chooseWanderTarget(record, wanderContext(false, speed), rng)
      animals.set(id, { id, species, record, speed })
      rngs.set(id, rng)
      return id
    },
    /** Walk every animal one tick. */
    walk() {
      for (const animal of animals.values()) {
        sim.beginSimStep(animal.record)
        if (animal.record.pursuit) routes.stepPursuit(animal.record, animal.speed, STEP)
        else if (animal.species !== 'snake' && animal.species !== 'owl') {
          wander.stepWander(animal.record, wanderContext(animal.record.alarmed, animal.speed), STEP, rngs.get(animal.id))
        } else animal.record.motion = 'idle'
      }
    },
    remove(id) { animals.delete(id) },
  }
}

// ------------------------------------------------------------- pursuit ----

test('a pursuit walks at speed times scale, never overshoots, and zero holds still', () => {
  const record = sim.createAnimalSimRecord({ x: 0, z: 0, motion: 'idle' })
  sim.setSimPursuit(record, { x: 10, z: 0, speedScale: 2 })
  let previous = 0
  for (let tick = 0; tick < 400; tick += 1) {
    sim.beginSimStep(record)
    routes.stepPursuit(record, 1.5, STEP)
    assert.ok(record.x - previous <= 1.5 * 2 * STEP + 1e-9)
    assert.ok(record.x <= 10 + 1e-9, 'never past the point')
    previous = record.x
  }
  assert.ok(Math.abs(record.x - 10) < 0.06)
  assert.equal(record.motion, 'idle', 'it stands at the point')
  sim.setSimPursuit(record, { x: 0, z: 5, speedScale: 0 })
  sim.beginSimStep(record)
  routes.stepPursuit(record, 1.5, STEP)
  assert.equal(record.motion, 'idle')
  assert.equal(record.z, 0, 'a zero scale holds it still')
})

test('ending a pursuit sends the animal back to wandering with a fresh spot to pick', () => {
  const record = sim.createAnimalSimRecord({ x: 0, z: 0, motion: 'idle' })
  record.paused = 3
  record.nextDecision = 2
  sim.setSimPursuit(record, { x: 4, z: 4, speedScale: 1 })
  assert.equal(record.paused, 3, 'starting one leaves the timers alone')
  sim.setSimPursuit(record, null)
  assert.equal(record.pursuit, null)
  assert.equal(record.paused, 0)
  assert.equal(record.nextDecision, 0)
})

test('a panic cuts short standing about, and calming it does not', () => {
  const record = sim.createAnimalSimRecord({ x: 0, z: 0, motion: 'idle' })
  record.paused = 3
  sim.setSimAlarmed(record, true)
  assert.equal(record.alarmed, true)
  assert.equal(record.paused, 0)
  record.paused = 2
  sim.setSimAlarmed(record, true)
  assert.equal(record.paused, 2, 'already alarmed: no change')
  sim.setSimAlarmed(record, false)
  assert.equal(record.alarmed, false)
  assert.equal(record.paused, 2)
})

// -------------------------------------------------------------- snakes ----

function runSnakeHunt(seed, seconds = 140, { mice = 3, keepHunting = true } = {}) {
  const world = createWorld(seed)
  const snakeId = world.add('snake', -6, 0, 0.75)
  const mouseIds = Array.from({ length: mice }, (_, index) => world.add('mouse', -2 + index * 1.5, 1 + index, 1.5))
  const snakes = hunt.createSnakeSim(0x5a4e)
  const log = []
  const frozenBeforeCatch = []
  let worstSnakeStep = 0
  const phases = new Set()
  for (let tick = 0; tick < seconds * 15; tick += 1) {
    world.walk()
    const snake = world.animals.get(snakeId)
    const before = [snake.record.prevX, snake.record.prevZ]
    worstSnakeStep = Math.max(worstSnakeStep, Math.hypot(snake.record.x - before[0], snake.record.z - before[1]))
    const preyInput = [...world.animals.values()].filter((a) => a.species === 'mouse').map((a) => ({
      id: a.id, species: 'mouse', record: a.record, targetable: true,
    }))
    const events = []
    const heldBefore = new Map([...world.animals.values()].map((a) => [a.id, a.record.pursuit ? a.record.pursuit.speedScale : null]))
    snakes.step(STEP, {
      snakes: [{ id: snakeId, record: snake.record, huntAllowed: keepHunting, reach: 0.9 }],
      prey: preyInput,
      preyCounts: { mouse: 6 },
    }, events)
    for (const report of snakes.report().snakes) phases.add(report.phase)
    for (const event of events) {
      log.push({ tick, ...event })
      if (event.type === 'caught') {
        frozenBeforeCatch.push(heldBefore.get(event.preyId))
      }
      if (event.type === 'popped') world.remove(event.animalId)
    }
  }
  return {
    log, frozenBeforeCatch, worstSnakeStep, phases, snakes, world, mouseIds,
    final: [...world.animals.values()].map((a) => [a.id, a.record.x, a.record.z, a.record.alarmed, a.record.pursuit]),
  }
}

test('a seeded snake hunt replays exactly: same events, same rolls, same positions', () => {
  const a = runSnakeHunt(21)
  const b = runSnakeHunt(21)
  assert.ok(a.log.length > 0, 'something happened in 140 s')
  assert.deepEqual(a.log, b.log)
  assert.deepEqual(a.final, b.final)
})

test('the strike die comes from the seed: over a handful of seeds the snake both catches and misses', () => {
  const outcomes = new Set()
  const rolls = new Set()
  for (let seed = 1; seed <= 14; seed += 1) {
    for (const event of runSnakeHunt(seed, 100).log) {
      if (event.type === 'caught' || event.type === 'escaped') { outcomes.add(event.type); rolls.add(event.roll) }
    }
  }
  assert.ok(outcomes.has('caught') && outcomes.has('escaped'), `got ${[...outcomes]}`)
  for (const roll of rolls) assert.ok(Number.isInteger(roll) && roll >= 1 && roll <= 6)
  assert.ok(rolls.size > 2, 'the die varies')
})

test('a catch is a caught event then a popped event for the same mouse, on a winning roll, with the mouse frozen', () => {
  let checked = 0
  for (let seed = 1; seed <= 14 && checked < 3; seed += 1) {
    const run = runSnakeHunt(seed, 100)
    run.log.forEach((event, index) => {
      if (event.type !== 'caught') return
      checked += 1
      assert.equal(event.hunter, 'snake')
      assert.ok(event.roll >= groundHunt.STRIKE_DIE.catchOn, `rolled ${event.roll}`)
      const next = run.log[index + 1]
      assert.deepEqual([next.type, next.animalId, next.cause], ['popped', event.preyId, 'caught'])
    })
    for (const frozen of run.frozenBeforeCatch) assert.equal(frozen, 0, 'the prey is held still, speed scale zero, when the lunge lands')
  }
  assert.ok(checked >= 1, 'saw at least one catch')
})

test('a miss lets the mouse go: escaped event on a losing roll, the mouse calmed and free to wander', () => {
  let seen = 0
  for (let seed = 1; seed <= 14 && seen < 2; seed += 1) {
    const run = runSnakeHunt(seed, 100)
    for (const event of run.log) {
      if (event.type !== 'escaped') continue
      seen += 1
      assert.ok(event.roll < groundHunt.STRIKE_DIE.catchOn)
      assert.ok(run.mouseIds.includes(event.preyId))
    }
  }
  assert.ok(seen >= 1)
})

test('a snake never steers faster than its lunge speed and walks no faster in a stalk', () => {
  const run = runSnakeHunt(5, 120)
  assert.ok(run.worstSnakeStep <= 0.75 * groundHunt.SNAKE_TUNING.strikeSpeedScale * STEP + 1e-9, `stepped ${run.worstSnakeStep}`)
  assert.ok(run.phases.has('stalk') && (run.phases.has('strike') || run.phases.has('miss')))
})

test('a snake that may not hunt never stalks, and the farm reset releases a snake and its prey', () => {
  const quiet = runSnakeHunt(3, 60, { keepHunting: false })
  assert.deepEqual(quiet.log, [])
  assert.deepEqual([...quiet.phases], ['roam'])
  const run = runSnakeHunt(4, 12)
  run.snakes.reset()
  assert.deepEqual(run.snakes.report().snakes, [])
  assert.equal(run.snakes.huntedIds().size, 0)
})

test('a snake that goes away releases the mouse it was stalking', () => {
  const world = createWorld(8)
  const snakeId = world.add('snake', 0, 0, 0.75)
  const mouseId = world.add('mouse', 2, 0, 1.5)
  const snakes = hunt.createSnakeSim(1)
  const mouse = world.animals.get(mouseId)
  const snake = world.animals.get(snakeId)
  const input = (present) => ({
    snakes: present ? [{ id: snakeId, record: snake.record, huntAllowed: true, reach: 0.9 }] : [],
    prey: [{ id: mouseId, species: 'mouse', record: mouse.record, targetable: true }],
    preyCounts: { mouse: 6 },
  })
  for (let tick = 0; tick < 15 * 12; tick += 1) {
    // Keep the mouse where it is so the snake finds it quickly.
    sim.beginSimStep(mouse.record)
    sim.beginSimStep(snake.record)
    if (snake.record.pursuit) routes.stepPursuit(snake.record, 0.75, STEP)
    snakes.step(STEP, input(true), [])
    if (snakes.huntedIds().has(mouseId)) break
  }
  assert.ok(snakes.huntedIds().has(mouseId), 'it began to stalk')
  assert.ok(snake.record.pursuit, 'and steers toward it')
  snakes.step(STEP, input(false), [])
  assert.equal(snakes.huntedIds().has(mouseId), false)
  assert.equal(snake.record.pursuit, null)
})

// --------------------------------------------------------------- owls -----

const ROOST = { x: -6, y: 4.5, z: 3 }

function runOwlHunt(seed, seconds, { stranded = false, roost = ROOST, flock = 5, night = true } = {}) {
  const world = createWorld(seed)
  const owlId = world.add('owl', 0, 0, 3)
  const chickens = Array.from({ length: flock }, (_, index) => world.add('chicken', 1 + index * 1.4, -1 + index * 0.6, 1))
  const owls = hunt.createOwlSim()
  const log = []
  const trace = []
  const alarmedWhileStalked = []
  for (let tick = 0; tick < seconds * 15; tick += 1) {
    world.walk()
    const events = []
    owls.step(STEP, {
      night,
      owls: [{ id: owlId, carnivalSpawn: [-20, 6], stage: 3, roost, stranded, sold: false }],
      prey: [...world.animals.values()].filter((a) => a.species === 'chicken').map((a) => ({ id: a.id, species: 'chicken', record: a.record, targetable: true })),
      farm: { halfWidth: 14, halfDepth: 10 },
    }, events)
    const track = owls.track(owlId)
    trace.push([track.flight.phase, +track.flight.x.toFixed(6), +track.flight.y.toFixed(6), +track.flight.z.toFixed(6), +track.flight.helium.toFixed(6)])
    for (const id of owls.huntedIds()) alarmedWhileStalked.push(world.animals.get(id)?.record.alarmed)
    for (const event of events) {
      log.push({ tick, ...event })
      if (event.type === 'popped' && event.cause === 'caught') world.remove(event.animalId)
    }
  }
  return { log, trace, owls, owlId, chickens, alarmedWhileStalked, world }
}

test('a seeded owl night replays exactly: the same events at the same ticks and the same flight', () => {
  const a = runOwlHunt(11, 100)
  const b = runOwlHunt(11, 100)
  assert.deepEqual(a.log, b.log)
  assert.deepEqual(a.trace, b.trace)
  assert.notDeepEqual(runOwlHunt(12, 100).trace, a.trace, 'the chickens wander differently, so the owl flies differently')
})

test('an owl takes a chicken: caught then popped, the chicken panicked while stalked, the flock thinned', () => {
  const run = runOwlHunt(11, 100)
  const caught = run.log.filter((event) => event.type === 'caught')
  assert.ok(caught.length >= 1, 'it hunted within 100 s of night')
  caught.forEach((event) => {
    assert.deepEqual([event.hunter, event.hunterId], ['owl', run.owlId])
    assert.equal(event.roll, undefined, 'an owl does not roll')
    const next = run.log[run.log.indexOf(event) + 1]
    assert.deepEqual([next.type, next.animalId, next.cause], ['popped', event.preyId, 'caught'])
  })
  assert.ok(run.alarmedWhileStalked.length > 0 && run.alarmedWhileStalked.every(Boolean), 'the hunted chicken panics')
  assert.equal([...run.world.animals.values()].filter((a) => a.species === 'chicken').length, 5 - caught.length)
  const phases = new Set(run.trace.map((entry) => entry[0]))
  for (const phase of ['patrol', 'stalk', 'dive', 'strike', 'recover']) assert.ok(phases.has(phase), `flew through ${phase}`)
})

test('an owl does not hunt a flock down to its breeding floor and leaves the farm in daylight', () => {
  const small = runOwlHunt(3, 100, { flock: predator.PREY_FLOOR })
  assert.deepEqual(small.log, [])
  const day = runOwlHunt(3, 60, { night: false })
  assert.deepEqual(day.log, [])
})

test('the owl blends smoothly: last tick is the snapshot, and no tick moves it farther than its fastest speed', () => {
  const owls = hunt.createOwlSim()
  const world = createWorld(2)
  const owlId = world.add('owl', 0, 0, 3)
  const chickens = [world.add('chicken', 2, 0, 1), world.add('chicken', 3, 1, 1), world.add('chicken', 4, -1, 1)]
  const fastest = predator.OWL_TUNING.diveSpeed * STEP + 1e-6
  let previous = null
  let blendedFromAway = 0
  for (let tick = 0; tick < 15 * 90; tick += 1) {
    world.walk()
    owls.step(STEP, {
      night: true,
      owls: [{ id: owlId, carnivalSpawn: [-20, 6], stage: 3, roost: ROOST, stranded: false, sold: false }],
      prey: chickens.filter((id) => world.animals.has(id)).map((id) => ({ id, species: 'chicken', record: world.animals.get(id).record, targetable: true })),
      farm: { halfWidth: 14, halfDepth: 10 },
    }, [])
    const { flight, prev } = owls.track(owlId)
    if (previous) {
      assert.deepEqual([prev.x, prev.y, prev.z], previous, 'prev is where the last tick ended')
      const stepLength = Math.hypot(flight.x - prev.x, flight.y - prev.y, flight.z - prev.z)
      // Appearing at dusk or going home to roost is a placement, not a flight.
      if (prev.visible && flight.phase !== 'roost' && flight.phase !== 'away') assert.ok(stepLength <= fastest, `moved ${stepLength} in ${flight.phase}`)
      if (!prev.visible && predator.owlVisible(flight)) blendedFromAway += 1
    }
    previous = [flight.x, flight.y, flight.z]
  }
  assert.ok(blendedFromAway <= 1, 'it appears once')
})

test('a stranded owl loses helium, pops with a deflated event exactly once, and a perch keeps it topped up', () => {
  const run = runOwlHunt(6, 150, { stranded: true, roost: null, flock: 0 })
  const popped = run.log.filter((event) => event.type === 'popped')
  assert.equal(popped.length, 1)
  assert.deepEqual([popped[0].animalId, popped[0].cause], [run.owlId, 'deflated'])
  assert.ok(popped[0].tick >= predator.HELIUM_SECONDS * 15 - 30 && popped[0].tick <= predator.HELIUM_SECONDS * 15 + 30, `popped at tick ${popped[0].tick}`)
  const perched = runOwlHunt(6, 150, { stranded: false, flock: 0 })
  assert.deepEqual(perched.log, [])
})

test('debug hooks: hurry makes an owl hunt sooner, setHelium sets the tank, reset forgets the flights', () => {
  const world = createWorld(11)
  const owlId = world.add('owl', 0, 0, 3)
  world.add('chicken', 1, 0, 1)
  world.add('chicken', 2, 0, 1)
  world.add('chicken', 3, 0, 1)
  const owls = hunt.createOwlSim()
  const input = () => ({
    night: true,
    owls: [{ id: owlId, carnivalSpawn: [-20, 6], stage: 3, roost: ROOST, stranded: false, sold: false }],
    prey: [...world.animals.values()].filter((a) => a.species === 'chicken').map((a) => ({ id: a.id, species: 'chicken', record: a.record, targetable: true })),
    farm: { halfWidth: 14, halfDepth: 10 },
  })
  owls.step(STEP, input(), [])
  owls.setHelium(0.4)
  assert.equal(owls.track(owlId).flight.helium, 0.4)
  owls.hurry()
  assert.equal(owls.track(owlId).flight.cooldown, 0)
  assert.equal(owls.report().owls.length, 1)
  owls.reset()
  assert.equal(owls.track(owlId), undefined)
  assert.deepEqual(owls.report().owls, [])
})

test('the hunt feels the same at 15 Hz as it did per frame: the first catch lands within a second of a 60 Hz run', () => {
  const firstCatchAt = (dt) => {
    const flight = predator.createOwlFlight()
    const chickens = Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, x: 2 + index * 1.4, z: -1 + index * 0.6, targetable: true }))
    for (let t = 0; t < 90; t += dt) {
      const events = predator.stepOwl(flight, {
        night: true, roost: ROOST, center: { x: 0, z: 0 }, radius: { x: 9, z: 6 }, huntAllowed: true, prey: chickens, present: true,
      }, dt)
      if (events.some((event) => event.kind === 'catch')) return t
    }
    return Infinity
  }
  const at60 = firstCatchAt(1 / 60)
  assert.ok(Number.isFinite(at60))
  for (const dt of [1 / 30, 1 / 15]) assert.ok(Math.abs(firstCatchAt(dt) - at60) < 1, `${dt}: ${firstCatchAt(dt)} vs ${at60}`)
})

test('a snake lunge lands in about the same time at 15 Hz as at 60 Hz', () => {
  const lungeSeconds = (dt) => {
    const hunter = groundHunt.createGroundHunter()
    hunter.cooldown = 0
    const snake = { x: 0, z: 0 }
    const mouse = { id: 'm', species: 'mouse', x: 5, z: 0, targetable: true }
    let struck = null
    for (let t = 0; t < 40; t += dt) {
      const step = groundHunt.stepGroundHunter(hunter, {
        x: snake.x, z: snake.z, huntAllowed: true, reach: 0.9, prey: [mouse], preyCounts: { mouse: 6 }, random: () => 0.9,
      }, dt)
      if (step.events.some((event) => event.kind === 'strike')) struck = t
      if (step.events.some((event) => event.kind === 'catch')) return t - struck
      if (step.pursuit) {
        const dx = step.pursuit.x - snake.x
        const dz = step.pursuit.z - snake.z
        const distance = Math.hypot(dx, dz)
        const travel = Math.min(0.75 * step.pursuit.speedScale * dt, distance)
        if (distance > 0.05) { snake.x += (dx / distance) * travel; snake.z += (dz / distance) * travel }
      }
    }
    return Infinity
  }
  const at60 = lungeSeconds(1 / 60)
  assert.ok(Number.isFinite(at60))
  assert.ok(Math.abs(lungeSeconds(1 / 15) - at60) < 0.25, `${lungeSeconds(1 / 15)} vs ${at60}`)
})
