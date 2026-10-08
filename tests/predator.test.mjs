import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const predator = await load('src/game/predator.ts')
const conditions = await load('src/game/animal-conditions.ts')
const lifeModule = await load('src/game/animal-life.ts')
const progressModule = await load('src/game/animal-progress.ts')
const farmState = await load('src/game/farm-state.ts')
const {
  createOwlFlight, stepOwl, stepHelium, HELIUM_SECONDS, createPredationLedger, isNightTime, canHunt, OWL_TUNING, PREY_FLOOR, PREY_OF, owlVisible,
} = predator

const ROOST = { x: -6, y: 4.5, z: 3 }
const flock = (count, extra = {}) => Array.from({ length: count }, (_, index) => ({
  id: `chicken-${index}`, x: 2 + index * 1.4, z: -1 + index * 0.6, targetable: true, ...extra,
}))
const world = (overrides = {}) => ({
  night: true, roost: ROOST, center: { x: 0, z: 0 }, radius: { x: 9, z: 6 },
  huntAllowed: true, prey: flock(5), present: true, ...overrides,
})

function run(flight, w, seconds, step = 1 / 30) {
  const events = []
  for (let t = 0; t < seconds; t += step) events.push(...stepOwl(flight, typeof w === 'function' ? w(flight) : w, step))
  return events
}

test('night is the sky\'s night phase, not merely the dark half of the clock', () => {
  assert.equal(isNightTime(0), true)
  assert.equal(isNightTime(0.5), false)
  assert.equal(isNightTime(0.23), false)
  assert.equal(isNightTime(0.8), true)
})

test('owls prey on chickens and nothing else', () => {
  assert.deepEqual([...PREY_OF.owl], ['chicken'])
  assert.equal(PREY_OF.cow, undefined)
})

test('the ledger tallies prey by species', () => {
  const ledger = createPredationLedger()
  assert.equal(ledger.eaten('chicken'), 0)
  ledger.record('chicken'); ledger.record('chicken')
  assert.equal(ledger.eaten('chicken'), 2)
  assert.deepEqual(ledger.totals, { chicken: 2 })
  ledger.clear()
  assert.equal(ledger.eaten('chicken'), 0)
})

test('an owl is not in the world by day when it has no roost', () => {
  const flight = createOwlFlight()
  run(flight, world({ night: false, roost: null }), 5)
  assert.equal(flight.phase, 'away')
  assert.equal(owlVisible(flight), false)
})

test('by day a resident with an oak is asleep on the branch', () => {
  const flight = createOwlFlight()
  run(flight, world({ night: false }), 1)
  assert.equal(flight.phase, 'roost')
  assert.deepEqual([flight.x, flight.y, flight.z], [ROOST.x, ROOST.y, ROOST.z])
  assert.equal(flight.flap, 0)
  assert.equal(owlVisible(flight), true)
})

test('at dusk a roosting owl takes off and patrols at cruise height', () => {
  const flight = createOwlFlight()
  run(flight, world({ night: false }), 1)
  run(flight, world({ night: true, huntAllowed: false }), 8)
  assert.equal(flight.phase, 'patrol')
  assert.ok(Math.abs(flight.y - OWL_TUNING.cruiseHeight) < 1.2, `y=${flight.y}`)
})

test('a balloon owl barely flaps while it patrols', () => {
  const flight = createOwlFlight()
  run(flight, world({ huntAllowed: false }), 10)
  assert.equal(flight.phase, 'patrol')
  assert.ok(flight.flap > 0 && flight.flap <= 0.4)
})

test('a visitor with nothing to hunt at carnival never stalks', () => {
  const flight = createOwlFlight()
  const events = run(flight, world({ huntAllowed: false }), 60)
  assert.equal(events.length, 0)
  assert.equal(flight.phase, 'patrol')
})

test('a full hunt: stalk, dive, catch, recover, and then a cooldown', () => {
  const flight = createOwlFlight()
  const events = run(flight, world(), 20)
  const kinds = events.map((event) => event.kind)
  assert.deepEqual(kinds.slice(0, 2), ['stalk', 'catch'])
  const catchEvent = events.find((event) => event.kind === 'catch')
  assert.ok(catchEvent.preyId.startsWith('chicken-'))
  // After the catch the owl is back on patrol, with the cooldown running.
  assert.ok(['recover', 'patrol', 'strike'].includes(flight.phase), flight.phase)
  assert.ok(flight.cooldown > 0)
})

test('the owl dives at the chicken\'s own position and catches it there', () => {
  const flight = createOwlFlight()
  const events = run(flight, world(), 40)
  const catchEvent = events.find((event) => event.kind === 'catch')
  const prey = flock(5).find((entry) => entry.id === catchEvent.preyId)
  assert.ok(Math.hypot(catchEvent.x - prey.x, catchEvent.z - prey.z) < 1e-9)
})

test('hunts are spaced by the cooldown, so a flock is thinned over a night', () => {
  const flight = createOwlFlight()
  const catches = run(flight, world({ prey: flock(9) }), OWL_TUNING.huntCooldown * 2.4).filter((event) => event.kind === 'catch')
  assert.ok(catches.length >= 2 && catches.length <= 3, `catches=${catches.length}`)
})

test('the owl never takes the last of the flock', () => {
  assert.equal(PREY_FLOOR, 2)
  assert.equal(canHunt(PREY_FLOOR), false)
  assert.equal(canHunt(PREY_FLOOR + 1), true)
  const flight = createOwlFlight()
  const events = run(flight, world({ prey: flock(PREY_FLOOR) }), 90)
  assert.equal(events.filter((event) => event.kind === 'catch').length, 0)
})

test('prey that cannot be targeted right now is left alone', () => {
  const flight = createOwlFlight()
  const events = run(flight, world({ prey: flock(5, { targetable: false }) }), 60)
  assert.equal(events.filter((event) => event.kind === 'stalk').length, 0)
})

test('a chicken that vanishes mid-stalk is abandoned, not eaten', () => {
  const flight = createOwlFlight()
  let hunted = null
  const events = run(flight, () => {
    const prey = flock(5).filter((entry) => entry.id !== hunted)
    return world({ prey })
  }, 12)
  assert.ok(events.some((event) => event.kind === 'stalk'))
  const stalk = events.find((event) => event.kind === 'stalk')
  hunted = stalk.preyId
  const flight2 = createOwlFlight()
  flight2.phase = 'stalk'
  flight2.preyId = hunted
  const later = run(flight2, world({ prey: flock(5).filter((entry) => entry.id !== hunted) }), 2)
  assert.deepEqual(later.map((event) => event.kind), ['abandon'])
  assert.equal(flight2.preyId, null)
  assert.equal(flight2.phase, 'patrol')
})

test('at first light an owl heads home to its oak and lands', () => {
  const flight = createOwlFlight()
  run(flight, world({ huntAllowed: false }), 12)
  run(flight, world({ night: false, huntAllowed: false }), 30)
  assert.equal(flight.phase, 'roost')
  assert.deepEqual([flight.x, flight.y, flight.z], [ROOST.x, ROOST.y, ROOST.z])
})

test('without an oak the owl leaves the world at first light', () => {
  const flight = createOwlFlight()
  run(flight, world({ roost: null, huntAllowed: false }), 12)
  run(flight, world({ roost: null, night: false, huntAllowed: false }), 40)
  assert.equal(flight.phase, 'away')
})

test('the owl turns up at dusk beyond the patrol loop and flies in', () => {
  const flight = createOwlFlight()
  stepOwl(flight, world({ roost: null, huntAllowed: false }), 1 / 30)
  assert.equal(flight.phase, 'patrol')
  assert.ok(Math.hypot(flight.x, flight.z) > 9)
})

test('a step with a bad delta changes nothing', () => {
  const flight = createOwlFlight()
  const before = { ...flight }
  assert.deepEqual(stepOwl(flight, world(), Number.NaN), [])
  assert.deepEqual(flight, before)
})

// ------------------------------------------------------ the owl's ladder --

const emptyState = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }
const farmWith = (extra = {}, night = true) => ({ night, state: { ...emptyState, ...extra }, residentSpecies: new Set(['chicken']) })

test('the owl\'s ladder is the one the design calls for', () => {
  const rungs = conditions.getSpeciesConditions('owl')
  assert.equal(rungs.length, 4)
  assert.deepEqual(conditions.DISCOVERY.owl, { kind: 'residentCount', species: 'chicken', amount: 1, description: conditions.DISCOVERY.owl.description })
  assert.deepEqual(rungs[1].requirement, { kind: 'residentCount', species: 'chicken', amount: 3 })
  assert.equal(rungs[2].requirement.kind, 'preyEaten')
  assert.equal(rungs[2].requirement.amount, 5)
  assert.deepEqual(rungs[2].requirement.and, [{ kind: 'propCount', species: 'oak', amount: 1 }])
  assert.equal(conditions.NIGHT_ONLY_SPECIES.includes('owl'), true)
})

test('staying needs five chickens eaten AND an oak, not either one alone', () => {
  const stay = conditions.getSpeciesConditions('owl')[2].requirement
  const met = (extra) => progressModule.requirementMet(stay, farmWith(extra))
  assert.equal(met({ preyEaten: { chicken: 5 } }), false)
  assert.equal(met({ propCounts: { oak: 1 } }), false)
  assert.equal(met({ preyEaten: { chicken: 4 }, propCounts: { oak: 1 } }), false)
  assert.equal(met({ preyEaten: { chicken: 5 }, propCounts: { oak: 1 } }), true)
})

test('count conditions read the farm state and print as whole numbers', () => {
  const state = { ...emptyState, residentCounts: { chicken: 3 }, preyEaten: { chicken: 2 }, propCounts: { oak: 1 } }
  assert.equal(farmState.farmMetric(state, 'residentCount', 'chicken'), 3)
  assert.equal(farmState.farmMetric(state, 'preyEaten', 'chicken'), 2)
  assert.equal(farmState.farmMetric(state, 'propCount', 'oak'), 1)
  assert.equal(farmState.farmMetric(emptyState, 'preyEaten', 'chicken'), 0)
  const stay = conditions.getSpeciesConditions('owl')[2].requirement
  assert.equal(conditions.conditionMetricLabel(stay), 'Chickens eaten')
  assert.equal(conditions.conditionMetricUnit(stay), '')
  assert.equal(conditions.formatConditionMetric(stay, 4), '4')
})

const owlLife = (config = {}, species = ['owl']) => lifeModule.createAnimalLife(species, {
  config: { visitDelaySeconds: 0, enterFarmSeconds: 0, arrivalIntervalSeconds: 0, baseResidentCapacity: 20, ...config },
  random: () => 0.99,
})
const tickFor = (life, farm, seconds) => {
  const events = []
  for (let i = 0; i < seconds * 4; i += 1) events.push(...life.tick({ farm, expansionLevel: 0 }, 0.25))
  return events
}
const owlOf = (life) => life.all().find((animal) => animal.species === 'owl')

test('the owl does not appear until a resident chicken is on the farm', () => {
  const life = owlLife()
  tickFor(life, { ...farmWith({ residentCounts: { chicken: 0 } }), residentSpecies: new Set() }, 5)
  assert.equal(owlOf(life).stage, 0)
  tickFor(life, farmWith({ residentCounts: { chicken: 1 } }), 5)
  assert.ok(owlOf(life).stage >= 1)
})

test('the owl only turns up after dark', () => {
  const life = owlLife()
  tickFor(life, farmWith({ residentCounts: { chicken: 1 } }, false), 10)
  assert.equal(owlOf(life).stage, 0)
  tickFor(life, farmWith({ residentCounts: { chicken: 1 } }, true), 5)
  assert.ok(owlOf(life).stage >= 1)
})

test('a night-only visitor does not hold up the rest of the queue by day', () => {
  // The owl is discovered by the resident chicken, but dawn keeps it waiting;
  // the sheep, a carnival starter, still gets its turn.
  const life = owlLife({}, ['owl', 'sheep'])
  tickFor(life, farmWith({ residentCounts: { chicken: 1 } }, false), 5)
  assert.ok(life.all().find((animal) => animal.species === 'sheep').stage >= 1)
  assert.equal(owlOf(life).stage, 0)
})

test('the owl visits the farm only with three resident chickens', () => {
  const life = owlLife()
  tickFor(life, farmWith({ residentCounts: { chicken: 1 } }), 10)
  assert.equal(owlOf(life).stage, 1)
  tickFor(life, farmWith({ residentCounts: { chicken: 2 } }), 10)
  assert.equal(owlOf(life).stage, 1)
  tickFor(life, farmWith({ residentCounts: { chicken: 3 } }), 2)
  assert.equal(owlOf(life).stage, 2)
})

test('the owl settles after five chickens eaten and an oak, and not before', () => {
  const life = owlLife()
  const three = { residentCounts: { chicken: 3 } }
  tickFor(life, farmWith(three), 20)
  assert.equal(owlOf(life).stage, 2)
  tickFor(life, farmWith({ ...three, preyEaten: { chicken: 5 } }), 5)
  assert.equal(owlOf(life).stage, 2)
  tickFor(life, farmWith({ ...three, propCounts: { oak: 1 } }), 5)
  assert.equal(owlOf(life).stage, 2)
  const events = tickFor(life, farmWith({ ...three, preyEaten: { chicken: 5 }, propCounts: { oak: 1 } }), 2)
  assert.equal(owlOf(life).stage, 3)
  assert.ok(events.some((event) => event.kind === 'settle' && event.species === 'owl'))
})

test('a visit that stays at stage two by day is not undone by daylight', () => {
  const life = owlLife()
  tickFor(life, farmWith({ residentCounts: { chicken: 3 } }), 20)
  assert.equal(owlOf(life).stage, 2)
  tickFor(life, farmWith({ residentCounts: { chicken: 3 } }, false), 20)
  assert.equal(owlOf(life).stage, 2)
})

test('the night shift is paced apart from the day visitors', () => {
  // The sheep arrives first and is stuck at stage two with no pasture. It must not keep the owl waiting.
  const life = owlLife({}, ['sheep', 'owl'])
  tickFor(life, farmWith({ residentCounts: { chicken: 1 } }), 10)
  assert.equal(life.all().find((animal) => animal.species === 'sheep').stage, 2)
  assert.ok(owlOf(life).stage >= 1)
})

test('helium drains only while stranded, and refills quickly when there is a perch', () => {
  assert.equal(stepHelium(1, false, 10), 1)
  assert.ok(Math.abs(stepHelium(1, true, HELIUM_SECONDS / 2) - 0.5) < 1e-9)
  assert.equal(stepHelium(0.1, true, HELIUM_SECONDS), 0)
  assert.ok(stepHelium(0.5, false, HELIUM_SECONDS / 6 / 2) > 0.74)
  assert.equal(stepHelium(Number.NaN > 0 ? 1 : 0.5, true, Number.NaN), 0.5)
})

test('a resident whose oak is taken keeps flying by day instead of vanishing', () => {
  const flight = createOwlFlight()
  run(flight, world({ night: false }), 1)
  assert.equal(flight.phase, 'roost')
  run(flight, world({ night: false, roost: null, stranded: true, huntAllowed: false }), 8)
  assert.ok(['takeoff', 'patrol'].includes(flight.phase), flight.phase)
  assert.ok(owlVisible(flight))
})

test('a stranded owl deflates, pops at empty, and a returning oak refills it', () => {
  const flight = createOwlFlight()
  const stranded = world({ roost: null, stranded: true, huntAllowed: false })
  run(flight, stranded, HELIUM_SECONDS * 0.5)
  assert.ok(flight.helium < 0.55 && flight.helium > 0.45, `helium=${flight.helium}`)
  run(flight, world({ stranded: true, huntAllowed: false }), 12)
  assert.ok(flight.helium > 0.9, `helium=${flight.helium}`)
  flight.helium = 0.02
  const events = run(flight, stranded, 4)
  assert.deepEqual(events.map((event) => event.kind), ['deflated'])
})

test('a perched owl never loses helium', () => {
  const flight = createOwlFlight()
  run(flight, world(), 200)
  assert.equal(flight.helium, 1)
})

test('the owl faces the way it is actually flying', () => {
  const flight = createOwlFlight()
  const moves = []
  for (let t = 0; t < 40; t += 1 / 30) {
    const before = { x: flight.x, z: flight.z }
    stepOwl(flight, world({ huntAllowed: false }), 1 / 30)
    const dx = flight.x - before.x, dz = flight.z - before.z
    if (t > 6 && Math.hypot(dx, dz) > 0.02) {
      // forward is (cos h, -sin h) in x/z for this model
      const dot = (Math.cos(flight.heading) * dx - Math.sin(flight.heading) * dz) / Math.hypot(dx, dz)
      moves.push(dot)
    }
  }
  const sideways = moves.filter((dot) => dot < 0.8).length / moves.length
  assert.ok(sideways < 0.05, `${(sideways * 100).toFixed(1)}% of steps were off-axis`)
})

test('a stranded owl by day does not hunt: the night shift is the night shift', () => {
  const flight = createOwlFlight()
  const events = run(flight, world({ night: false, roost: null, stranded: true }), 60)
  assert.equal(events.filter((event) => event.kind === 'stalk').length, 0)
})
