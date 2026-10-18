import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The mountain lion: any species past six on the farm draws it, and it eats that
 * species to the last, indoors too, then leaves. Tamed, it trims a crowd to six.
 */
const { outputFiles } = await build({
  stdin: {
    contents: [
      "export * from './src/game/apex-raid.ts'",
      "export { createLionSim } from './src/game/animal-hunt.ts'",
      "export { createAnimalSimRecord } from './src/game/animal-sim.ts'",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const m = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const WALK = 1.4
const DT = 1 / 30

/**
 * A tiny farm the lion can raid: prey stand still where they are put, a catch
 * removes one, a devour empties a house of its victims, and the herd counts follow.
 */
function farm({ stage = 2, outdoors = [], houses = [], extraHerds = {} } = {}) {
  const world = {
    stage,
    x: 0,
    z: 0,
    reach: 0.9,
    prey: outdoors.map((entry, index) => ({ id: entry.id ?? `out-${index}`, species: entry.species, x: entry.x, z: entry.z, targetable: entry.targetable ?? true })),
    houses: houses.map((house) => ({ id: house.id, doorX: house.doorX, doorZ: house.doorZ, inside: [...house.inside] })),
    exit: { x: 20, z: 0 },
    herds: {},
  }
  const recount = () => {
    const herds = { ...extraHerds }
    for (const prey of world.prey) herds[prey.species] = (herds[prey.species] ?? 0) + 1
    for (const house of world.houses) for (const entry of house.inside) herds[entry.species] = (herds[entry.species] ?? 0) + 1
    world.herds = herds
  }
  recount()
  const log = []
  const raid = m.createLionRaid()
  let hiddenSeen = false
  function run(seconds) {
    for (let t = 0; t < seconds; t += DT) {
      const step = m.stepLion(raid, world, DT)
      if (step.hidden) hiddenSeen = true
      for (const event of step.events) {
        log.push(event)
        if (event.kind === 'catch') world.prey = world.prey.filter((entry) => entry.id !== event.preyId)
        if (event.kind === 'devour') {
          for (const house of world.houses) house.inside = house.inside.filter((entry) => !event.preyIds.includes(entry.id))
        }
        if (event.kind === 'arrive') world.stage = 2
        if (event.kind === 'gone') world.stage = 0
      }
      if (step.pursuit) {
        const dx = step.pursuit.x - world.x
        const dz = step.pursuit.z - world.z
        const distance = Math.hypot(dx, dz)
        const travel = Math.min(distance, WALK * step.pursuit.speedScale * DT)
        if (distance > 1e-6) {
          world.x += (dx / distance) * travel
          world.z += (dz / distance) * travel
        }
      }
      recount()
    }
  }
  return { world, raid, log, run, kinds: () => log.map((event) => event.kind), hidden: () => hiddenSeen }
}

const chickens = (count, at = (index) => ({ x: -6 + index * 1.7, z: 3 })) => Array.from({ length: count }, (_, index) => ({ id: `hen-${index}`, species: 'chicken', ...at(index) }))
const coop = (count, id = 'coop-1') => ({ id, doorX: 5, doorZ: -4, inside: Array.from({ length: count }, (_, index) => ({ id: `${id}-hen-${index}`, species: 'chicken' })) })

test('the crowd limit is six, and the biggest herd past it is the one the lion wants', () => {
  assert.equal(m.CROWD_LIMIT, 6)
  assert.equal(m.crowdedSpecies({ chicken: 6, cow: 6 }), null)
  assert.equal(m.crowdedSpecies({ chicken: 7, cow: 6 }), 'chicken')
  assert.equal(m.crowdedSpecies({ chicken: 7, cow: 9 }), 'cow')
  // A tie is settled the same way every time.
  assert.equal(m.crowdedSpecies({ sheep: 8, cow: 8 }), 'cow')
  // The lion never counts itself.
  assert.equal(m.crowdedSpecies({ cougar: 9 }), null)
  assert.equal(m.largestHerd({ chicken: 3, cow: 8, cougar: 12 }), 8)
  assert.deepEqual(m.APEX_SPECIES, ['cougar'])
})

test('six of a species is safe: the lion stays in the hills', () => {
  const run = farm({ stage: 0, outdoors: chickens(5), houses: [coop(1)] })
  run.run(60)
  assert.deepEqual(run.kinds(), [])
  assert.equal(run.raid.phase, 'away')
})

test('a seventh catches its scent: a warning, then the lion comes over the fence', () => {
  const run = farm({ stage: 0, outdoors: chickens(5), houses: [coop(2)] })
  run.run(1)
  assert.equal(run.log[0].kind, 'scent')
  assert.equal(run.log[0].species, 'chicken')
  assert.equal(run.log[0].count, 7)
  assert.equal(run.log[0].seconds, m.LION_TUNING.scentSeconds)
  assert.ok(!run.kinds().includes('arrive'), 'no lion during the warning')
  run.run(m.LION_TUNING.scentSeconds)
  assert.ok(run.kinds().includes('arrive'))
})

test('thinning the herd back to six before it comes sends it off', () => {
  const run = farm({ stage: 0, outdoors: chickens(5), houses: [coop(2)] })
  run.run(2)
  run.world.prey.pop()
  run.run(m.LION_TUNING.scentSeconds)
  assert.deepEqual(run.kinds(), ['scent', 'lostScent'])
  assert.equal(run.raid.phase, 'away')
})

test('a wild lion eats every one of the crowded species, out in the open and inside the coop, then leaves', () => {
  const run = farm({ stage: 0, outdoors: [...chickens(4), { id: 'cow-1', species: 'cow', x: 2, z: 2 }], houses: [coop(5)] })
  run.run(m.LION_TUNING.scentSeconds + 30)
  const kinds = run.kinds()
  assert.equal(kinds.filter((kind) => kind === 'catch').length, 4, 'all four in the open are caught')
  const devour = run.log.find((event) => event.kind === 'devour')
  assert.ok(devour, 'it went into the coop')
  assert.equal(devour.preyIds.length, 5, 'and ate all five hiding in it')
  assert.ok(run.hidden(), 'it is out of sight while it is inside')
  const cleared = run.log.find((event) => event.kind === 'cleared')
  assert.equal(cleared.species, 'chicken')
  assert.equal(cleared.eaten, 9)
  assert.equal(cleared.left, 0)
  assert.equal(run.world.herds.chicken ?? 0, 0, 'extinct on this farm')
  assert.equal(run.world.herds.cow, 1, 'the cow was never its quarry')
  assert.ok(kinds.indexOf('leave') > kinds.indexOf('cleared'))
  assert.equal(kinds[kinds.length - 1], 'gone')
  assert.equal(run.raid.phase, 'away')
  assert.ok(run.raid.cooldown > 0, 'it rests before another crowd can draw it')
})

test('every catch is a pounce first: the prey freezes, and the catch always lands', () => {
  const run = farm({ stage: 2, outdoors: chickens(7) })
  run.run(60)
  const pounces = run.log.filter((event) => event.kind === 'pounce').map((event) => event.preyId)
  const catches = run.log.filter((event) => event.kind === 'catch').map((event) => event.preyId)
  assert.equal(catches.length, 7)
  assert.deepEqual(catches, pounces)
  assert.ok(!run.kinds().includes('abandon'))
})

test('it is quick: seven chickens across the farm are gone inside half a minute', () => {
  const run = farm({ stage: 2, outdoors: chickens(7, (index) => ({ x: index % 2 ? -9 : 9, z: -5 + index * 1.6 })) })
  run.run(30)
  assert.equal(run.log.filter((event) => event.kind === 'catch').length, 7)
})

test('animals it cannot reach (on the wing, mid-walk through a door) only hold it up so long', () => {
  const run = farm({ stage: 2, outdoors: chickens(7).map((entry) => ({ ...entry, targetable: false })) })
  run.run(m.LION_TUNING.waitSeconds + 15)
  const cleared = run.log.find((event) => event.kind === 'cleared')
  assert.ok(cleared)
  assert.equal(cleared.eaten, 0)
  assert.equal(cleared.left, 7)
  assert.ok(run.kinds().includes('gone'))
})

test('a lion found on the farm with no raid in mind (a loaded save) finds the crowd, or leaves', () => {
  const crowded = farm({ stage: 2, outdoors: chickens(7) })
  crowded.run(0.1)
  assert.equal(crowded.raid.quarry, 'chicken')
  const calm = farm({ stage: 2, outdoors: chickens(3) })
  calm.run(15)
  assert.deepEqual(calm.kinds(), ['leave', 'gone'])
})

test('a tame lion guards: it trims a crowd back to six and stays', () => {
  const run = farm({ stage: 3, outdoors: chickens(3), houses: [coop(6)] })
  run.run(1)
  assert.equal(run.log[0].kind, 'scent')
  assert.equal(run.log[0].tame, true)
  assert.ok(!run.kinds().includes('arrive'), 'it is already here')
  run.run(m.LION_TUNING.scentSeconds + 60)
  assert.equal(run.world.herds.chicken, 6)
  const cleared = run.log.find((event) => event.kind === 'cleared')
  assert.equal(cleared.eaten, 3)
  assert.equal(cleared.tame, true)
  assert.ok(!run.kinds().includes('leave'), 'a tame lion does not leave')
  assert.equal(run.raid.phase, 'guard')
})

test('a tame lion only takes the surplus out of a house', () => {
  const run = farm({ stage: 3, houses: [coop(9)] })
  run.run(m.LION_TUNING.scentSeconds + 40)
  const devour = run.log.find((event) => event.kind === 'devour')
  assert.equal(devour.preyIds.length, 3)
  assert.equal(run.world.herds.chicken, 6)
})

test('tamed in the middle of a raid, it stops at six', () => {
  const run = farm({ stage: 2, outdoors: chickens(10) })
  run.run(0.6)
  const eatenWild = run.log.filter((event) => event.kind === 'catch').length
  assert.ok(eatenWild >= 1 && eatenWild < 4, `ate ${eatenWild} before it was tamed`)
  run.world.stage = 3
  run.run(60)
  assert.equal(run.world.herds.chicken, 6)
  assert.ok(!run.kinds().includes('gone'))
})

test('sent back to the hills mid-raid (sold, reset), it forgets the raid and lets its prey go', () => {
  const run = farm({ stage: 2, outdoors: chickens(8, (index) => ({ x: 8 + index, z: 4 })) })
  run.run(DT * 1.5)
  assert.equal(run.raid.phase, 'chase')
  run.world.stage = 0
  run.run(0.1)
  assert.equal(run.raid.phase, 'away')
  assert.equal(run.kinds()[run.kinds().length - 1], 'abandon')
})

// ---- on the sim records --------------------------------------------------------

const record = (x, z) => m.createAnimalSimRecord({ x, z, motion: 'walk', side: 'farm', stage: 3 })

test('on the records: the lion is steered, the quarry panics, the one it pounces on freezes, and a catch pops', () => {
  const sim = m.createLionSim()
  const lion = record(0, 0)
  const hens = Array.from({ length: 7 }, (_, index) => ({ id: `hen-${index}`, species: 'chicken', record: record(3 + index, 0), targetable: true }))
  const cow = { id: 'cow-1', species: 'cow', record: record(-4, 0), targetable: true }
  const events = []
  const input = () => ({
    lion: { id: 'lion-1', stage: 2, record: lion, reach: 0.9, busy: false },
    prey: [...hens, cow],
    herds: { chicken: hens.length, cow: 1 },
    houses: [],
    exit: { x: 20, z: 0 },
  })
  sim.step(DT, input(), events)
  assert.equal(sim.report().quarry, 'chicken')
  assert.ok(hens.every((hen) => hen.record.alarmed), 'every hen panics')
  assert.equal(cow.record.alarmed, false, 'the cow is left alone')
  // The nearest hen is already within a pounce: the lion goes for her, lunges, and she freezes.
  sim.step(DT, input(), events)
  sim.step(DT, input(), events)
  assert.ok(lion.pursuit && lion.pursuit.speedScale > 1, 'the lion is sprinting')
  assert.ok(sim.huntedIds().has('hen-0'))
  assert.equal(hens[0].record.pursuit?.speedScale, 0)
  for (let index = 0; index < 30 && !events.some((event) => event.type === 'caught'); index += 1) sim.step(DT, input(), events)
  const caught = events.find((event) => event.type === 'caught')
  assert.equal(caught.hunter, 'cougar')
  assert.equal(caught.preyId, 'hen-0')
  assert.ok(events.some((event) => event.type === 'popped' && event.animalId === 'hen-0' && event.cause === 'caught'))
})

test('on the records: inside a house the lion is hidden, and the house raid comes out as a raid event', () => {
  const sim = m.createLionSim()
  const lion = record(5, -3.5)
  const events = []
  const house = coop(8)
  const input = () => ({
    lion: { id: 'lion-1', stage: 2, record: lion, reach: 0.9, busy: false },
    prey: [],
    herds: { chicken: house.inside.length },
    houses: [house],
    exit: { x: 20, z: 0 },
  })
  // On the farm, then off to the coop's door, then in through it.
  for (let index = 0; index < 3; index += 1) sim.step(DT, input(), events)
  assert.ok(sim.isHidden('lion-1'))
  for (let index = 0; index < 120; index += 1) {
    sim.step(DT, input(), events)
    for (const event of events) {
      if (event.type === 'raid' && event.event.kind === 'devour') house.inside = house.inside.filter((entry) => !event.event.preyIds.includes(entry.id))
    }
  }
  const devour = events.find((event) => event.type === 'raid' && event.event.kind === 'devour')
  assert.ok(devour)
  assert.equal(devour.event.preyIds.length, 8)
  assert.equal(devour.hunterId, 'lion-1')
  assert.equal(sim.isHidden('lion-1'), false)
})

test('on the records: with no lion at all, nothing is steered and nothing is left panicking', () => {
  const sim = m.createLionSim()
  const hen = { id: 'hen-0', species: 'chicken', record: record(2, 0), targetable: true }
  const events = []
  sim.step(DT, { lion: { id: 'lion-1', stage: 2, record: record(0, 0), reach: 0.9, busy: false }, prey: [hen], herds: { chicken: 7 }, houses: [], exit: { x: 20, z: 0 } }, events)
  assert.equal(hen.record.alarmed, true)
  sim.step(DT, { lion: null, prey: [hen], herds: { chicken: 7 }, houses: [], exit: { x: 20, z: 0 } }, events)
  assert.equal(hen.record.alarmed, false)
  assert.equal(sim.report().phase, 'away')
})
