import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/** Bundle-then-import, matching the other suites, so the pure TS is tested as shipped. */
async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const conditions = await load('src/game/animal-conditions.ts')
const progress = await load('src/game/animal-progress.ts')
const farmState = await load('src/game/farm-state.ts')
const farmProps = await load('src/game/farm-props.ts')
const housing = await load('src/game/animal-housing.ts')
const sleep = await load('src/game/sleep.ts')
const unlocks = await load('src/game/tool-unlocks.ts')

const emptyState = { tallGrassArea: 0, waterArea: 0, flatGrassArea: 0, plantCounts: {} }
const farmWith = (extra = {}, night = false) => ({ night, state: { ...emptyState, ...extra }, residentSpecies: new Set() })
const met = (requirement, extra) => progress.requirementMet(requirement, farmWith(extra))

// ---------------------------------------------------------------- meadow --

/** A square of blades on a regular grid, `spacing` apart, all at one height. */
function field(size, height, spacing = 0.1, x0 = 0, z0 = 0) {
  const blades = []
  for (let x = 0; x < size; x += spacing) {
    for (let z = 0; z < size; z += spacing) blades.push({ x: x0 + x, z: z0 + z, height })
  }
  return blades
}

test('tall meadow is measured in square meters, and a short lawn never counts', () => {
  const meadow = farmState.measureMeadow(field(4.06, 0.9))
  assert.ok(meadow > 14 && meadow < 19, `about 16 m² of meadow, got ${meadow}`)
  assert.equal(farmState.measureMeadow(field(4.06, farmState.MEADOW_MIN_HEIGHT - 0.01)), 0)
  // The lawn pack's tallest blade is well under the meadow bar.
  assert.ok(unlocks.SHORT_GRASS_MAX_HEIGHT < farmState.MEADOW_MIN_HEIGHT)
  assert.ok(unlocks.TALL_GRASS_MAX_HEIGHT > farmState.MEADOW_MIN_HEIGHT)
})

test('a stray tall blade at the edge of a stroke is not a meadow', () => {
  assert.equal(farmState.measureMeadow([{ x: 1, z: 1, height: 0.9 }, { x: 5, z: 5, height: 0.9 }]), 0)
})

test('mown blades (height 0) left in the batch do not count', () => {
  assert.equal(farmState.measureMeadow(field(2, 0)), 0)
})

test('meadow is its own condition kind, separate from grown grass', () => {
  const requirement = { kind: 'meadowArea', amount: 10 }
  assert.equal(met(requirement, { tallGrassArea: 50 }), false, 'a big lawn is not meadow')
  assert.equal(met(requirement, { meadowArea: 10 }), true)
  assert.equal(farmState.farmMetric({ ...emptyState }, 'meadowArea'), 0, 'a farm with no measurement reads as none')
  assert.equal(conditions.conditionMetricLabel(requirement), 'Tall meadow grass')
  assert.equal(conditions.conditionMetricUnit(requirement), ' m²')
})

// --------------------------------------------------------------- ladders --

test('the mouse is a day animal lured by a little meadow', () => {
  assert.equal(conditions.isNightOnly('mouse'), false)
  assert.deepEqual(
    { kind: conditions.DISCOVERY.mouse.kind, amount: conditions.DISCOVERY.mouse.amount },
    { kind: 'meadowArea', amount: 4 },
  )
  const rungs = conditions.getSpeciesConditions('mouse')
  assert.equal(rungs.length, 4)
  assert.equal(met(rungs[1].requirement, { meadowArea: 5.9 }), false)
  assert.equal(met(rungs[1].requirement, { meadowArea: 6 }), true)
  assert.equal(met(rungs[2].requirement, { meadowArea: 15 }), false, 'wants dandelions too')
  assert.equal(met(rungs[2].requirement, { meadowArea: 15, plantCounts: { dandelion: 2 } }), true)
  assert.equal(met(rungs[3].requirement, { meadowArea: 20 }), false, 'breeding needs its house')
  assert.equal(met(rungs[3].requirement, { meadowArea: 20, propCounts: { 'hollow-log': 1 } }), true)
})

test('the rat follows a resident mouse in at night and settles by a garbage can', () => {
  assert.equal(conditions.isNightOnly('rat'), true)
  assert.equal(conditions.DISCOVERY.rat.kind, 'residentCount')
  assert.equal(conditions.DISCOVERY.rat.species, 'mouse')
  const rungs = conditions.getSpeciesConditions('rat')
  assert.equal(met(rungs[1].requirement, { meadowArea: 10 }), true)
  assert.equal(met(rungs[2].requirement, { meadowArea: 15 }), false)
  assert.equal(met(rungs[2].requirement, { propCounts: { 'garbage-can': 1 } }), false, 'and long grass')
  assert.equal(met(rungs[2].requirement, { meadowArea: 15, propCounts: { 'garbage-can': 1 } }), true)
  assert.equal(met(rungs[3].requirement, { propCounts: { 'hollow-log': 1 } }), false)
  assert.equal(met(rungs[3].requirement, { propCounts: { 'hollow-log': 1, 'garbage-can': 1 } }), true)
})

test('the snake comes for the mice, stays once it has eaten some, and breeds in a rock pile', () => {
  assert.equal(conditions.isNightOnly('snake'), false)
  assert.equal(conditions.DISCOVERY.snake.kind, 'residentCount')
  assert.equal(conditions.DISCOVERY.snake.species, 'mouse')
  assert.equal(conditions.DISCOVERY.snake.amount, 2)
  const rungs = conditions.getSpeciesConditions('snake')
  assert.equal(met(rungs[1].requirement, { meadowArea: 15 }), true)
  assert.equal(met(rungs[2].requirement, { meadowArea: 25, preyEaten: { mouse: 1 } }), false)
  assert.equal(met(rungs[2].requirement, { meadowArea: 20, preyEaten: { mouse: 2 } }), false)
  assert.equal(met(rungs[2].requirement, { meadowArea: 25, preyEaten: { mouse: 2 } }), true)
  assert.equal(conditions.conditionMetricLabel(rungs[2].requirement), 'Mice eaten')
  assert.equal(met(rungs[3].requirement, { meadowArea: 30, propCounts: { 'rock-pile': 1 } }), false)
  assert.equal(met(rungs[3].requirement, { meadowArea: 30, propCounts: { 'rock-pile': 1 }, residentCounts: { mouse: 3 } }), true)
})

// ------------------------------------------------------------------ hunt --

const hunt = await load('src/game/ground-hunt.ts')
const predator = await load('src/game/predator.ts')

/** Step a snake at `snake` against `prey` for `seconds`, moving the snake as the sim asks. */
function runHunt(hunter, snake, prey, preyCounts, seconds, speed = 0.75) {
  const events = []
  for (let t = 0; t < seconds; t += 0.05) {
    const step = hunt.stepGroundHunter(hunter, { x: snake.x, z: snake.z, huntAllowed: true, prey, preyCounts }, 0.05)
    events.push(...step.events)
    if (step.pursuit) {
      const dx = step.pursuit.x - snake.x
      const dz = step.pursuit.z - snake.z
      const distance = Math.hypot(dx, dz)
      const move = Math.min(distance, speed * step.pursuit.speedScale * 0.05)
      if (distance > 1e-6) { snake.x += (dx / distance) * move; snake.z += (dz / distance) * move }
    }
  }
  return events
}

test('snakes eat mice and rats, nothing else', () => {
  assert.deepEqual([...predator.PREY_OF.snake].sort(), ['mouse', 'rat'])
  assert.equal(hunt.huntsSpecies('snake', 'mouse'), true)
  assert.equal(hunt.huntsSpecies('snake', 'rat'), true)
  assert.equal(hunt.huntsSpecies('snake', 'chicken'), false)
})

test('a snake stalks a still mouse, lunges and catches it, then digests', () => {
  const hunter = hunt.createGroundHunter()
  hunter.cooldown = 0
  const snake = { x: 0, z: 0 }
  const mouse = { id: 'm1', species: 'mouse', x: 4, z: 0, targetable: true }
  const events = runHunt(hunter, snake, [mouse], { mouse: 4 }, 10)
  assert.deepEqual(events.map((event) => event.kind), ['stalk', 'strike', 'catch'])
  assert.equal(hunter.phase === 'digest' || hunter.phase === 'roam', true)
  assert.equal(hunter.cooldown > 30, true)
})

test('a lunge lands even though the collision pass keeps the snake and mouse a body-width apart', async () => {
  // The bug this guards: catches were measured centre to centre, closer than
  // the collision pass ever lets two animals stand, so every lunge stalled.
  const collision = await load('src/game/animal-collision.ts')
  const hunter = hunt.createGroundHunter()
  hunter.cooldown = 0
  const snake = { x: 0, z: 0, radius: 2.8 * 0.24 }
  const mouse = { id: 'm1', species: 'mouse', x: 4, z: 0, targetable: true, radius: 1.6 * 0.24 }
  const events = []
  for (let t = 0; t < 10 && !events.some((event) => event.kind === 'catch'); t += 0.05) {
    const step = hunt.stepGroundHunter(hunter, { x: snake.x, z: snake.z, reach: 2.8 * 0.42, huntAllowed: true, prey: [mouse], preyCounts: { mouse: 4 } }, 0.05)
    events.push(...step.events)
    if (step.pursuit) {
      const dx = step.pursuit.x - snake.x
      const distance = Math.abs(dx)
      if (distance > 1e-6) snake.x += Math.sign(dx) * Math.min(distance, 0.75 * step.pursuit.speedScale * 0.05)
    }
    const bodies = [snake, mouse]
    collision.resolveCollisions(bodies, [])
  }
  assert.deepEqual(events.map((event) => event.kind), ['stalk', 'strike', 'catch'])
})

test('a snake leaves the last breeding pair alone, and ignores prey out of sight', () => {
  const hunter = hunt.createGroundHunter()
  hunter.cooldown = 0
  const near = { id: 'r1', species: 'rat', x: 2, z: 0, targetable: true }
  assert.deepEqual(runHunt(hunter, { x: 0, z: 0 }, [near], { rat: predator.PREY_FLOOR }, 5), [])
  const far = { id: 'm1', species: 'mouse', x: 20, z: 0, targetable: true }
  assert.deepEqual(runHunt(hunter, { x: 0, z: 0 }, [far], { mouse: 6 }, 5), [])
})

test('a lunge at a mouse that bolts away misses, and the snake waits before trying again', () => {
  const hunter = hunt.createGroundHunter()
  hunter.cooldown = 0
  const snake = { x: 0, z: 0 }
  const mouse = { id: 'm1', species: 'mouse', x: 1.4, z: 0, targetable: true }
  const events = []
  for (let t = 0; t < 2; t += 0.05) {
    const step = hunt.stepGroundHunter(hunter, { x: snake.x, z: snake.z, huntAllowed: true, prey: [mouse], preyCounts: { mouse: 5 } }, 0.05)
    events.push(...step.events)
    // A panicking mouse outruns the lunge.
    if (events.some((event) => event.kind === 'strike')) mouse.x += 6 * 0.05
    if (step.pursuit) snake.x += Math.min(Math.abs(step.pursuit.x - snake.x), 0.75 * step.pursuit.speedScale * 0.05)
  }
  assert.deepEqual(events.map((event) => event.kind), ['stalk', 'strike', 'abandon'])
  assert.equal(hunter.phase, 'roam')
  assert.equal(hunter.cooldown > 0, true)
})

// ------------------------------------------------------- houses and props --

test('mice and rats share the hollow log; snakes live in the rock pile', () => {
  assert.equal(housing.houseFor('mouse'), 'hollow-log')
  assert.equal(housing.houseFor('rat'), 'hollow-log')
  assert.equal(housing.houseFor('snake'), 'rock-pile')
})

test('both houses are blocking shop props, stocked by the time their animals need them', () => {
  for (const id of ['hollow-log', 'rock-pile']) {
    const prop = farmProps.PROP_CATALOG[id]
    assert.equal(prop.blocking, true)
    assert.equal(prop.rotatable, true)
    assert.equal(prop.modelUrl, `assets/props/${id}.glb`)
    assert.equal(farmProps.PROP_ORDER.includes(id), true)
    assert.equal(farmProps.propCardChip(id), 'Shelter')
    assert.ok(unlocks.propUnlockLevel(id) <= 3)
  }
  assert.deepEqual(farmProps.PROP_CATALOG['hollow-log'].footprint, { width: 2, depth: 1 })
  assert.equal(conditions.conditionMetricLabel({ kind: 'propCount', species: 'hollow-log', amount: 1 }), 'Hollow logs on the farm')
})

test('a rat sleeps by day beside the hollow log, else the garbage can', () => {
  assert.equal(sleep.shouldSleep('rat', false), true)
  assert.equal(sleep.shouldSleep('rat', true), false)
  assert.deepEqual(sleep.SLEEP_PROPS.rat.map((entry) => entry.prop), ['hollow-log', 'garbage-can'])
  assert.equal(sleep.shouldSleep('mouse', false), false)
  assert.equal(sleep.shouldSleep('snake', false), false)
})
