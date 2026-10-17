import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-barrel.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const barrel = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  BARREL_FIRST_SPAWN, BARREL_FLOORS, BARREL_LADDERS, BARREL_RADIUS, BARREL_TOP_FLOOR, barrelSteer, barrelTouches,
  createBarrelCourse, downhill, floorBeneath, floorSpans, floorY, ladderSpan, nearestFloor,
} = barrel
const rulesBuild = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from(rulesBuild.outputFiles[0].text).toString('base64')}`)

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

test('every plank leans down to an open end that drops onto the plank below', () => {
  for (const floor of BARREL_FLOORS.slice(1, BARREL_TOP_FLOOR)) {
    const end = downhill(floor) > 0 ? floor.x1 + 0.2 : floor.x0 - 0.2
    const below = BARREL_FLOORS[floor.index - 1]
    assert.ok(floorSpans(below, end), `floor ${floor.index} drops onto floor ${below.index}`)
    const high = downhill(floor) > 0 ? floor.x0 : floor.x1
    const low = downhill(floor) > 0 ? floor.x1 : floor.x0
    assert.ok(floorY(floor, low) < floorY(floor, high), `floor ${floor.index} leans toward its open end`)
  }
  assert.equal(BARREL_TOP_FLOOR, CARE_GAME_RULES.barrel.goal, 'one hit per floor, the ledge last')
})

test('ladders join floors that both span them, and every floor has a way up', () => {
  for (const ladder of BARREL_LADDERS) {
    assert.equal(ladder.top, ladder.bottom + 1)
    assert.ok(floorSpans(BARREL_FLOORS[ladder.bottom], ladder.x) && floorSpans(BARREL_FLOORS[ladder.top], ladder.x), `ladder ${ladder.id}`)
    const { bottomY, topY } = ladderSpan(ladder)
    assert.ok(topY - bottomY > 0.7, `ladder ${ladder.id} climbs`)
  }
  for (let floor = 0; floor < BARREL_TOP_FLOOR; floor += 1) {
    assert.ok(BARREL_LADDERS.some((ladder) => ladder.bottom === floor), `floor ${floor} has a ladder up`)
  }
  // Each ladder up stands at its floor's high end, so the climb is walked uphill into the barrels.
  for (const ladder of BARREL_LADDERS.filter((entry) => entry.top < BARREL_TOP_FLOOR && entry.bottom > 0)) {
    const floor = BARREL_FLOORS[ladder.bottom]
    const arrival = BARREL_LADDERS.find((entry) => entry.top === ladder.bottom)
    assert.ok(Math.abs(ladder.x - arrival.x) > 3, `floor ${floor.index} is walked end to end`)
    assert.ok(floorY(floor, ladder.x) > floorY(floor, arrival.x), `floor ${floor.index} is walked uphill`)
  }
  assert.equal(floorBeneath(0, 2.5).index, 2)
  assert.equal(floorBeneath(2.6, 1.5).index, 0, 'past an open end the floor below is underfoot')
})

test('the can walks, climbs a ladder to the next floor, and the floor is a hit', () => {
  const course = createBarrelCourse(seeded(1))
  course.stopBarrels()
  const ladder = BARREL_LADDERS.find((entry) => entry.bottom === 0)
  const events = []
  for (let frame = 0; frame < 60 * 10 && course.hero.best < 1; frame += 1) {
    course.setInput(barrelSteer(course.hero, ladder.x, 1.4))
    events.push(...course.step(1 / 60))
  }
  assert.equal(course.hero.floor, 1)
  assert.equal(course.hero.state, 'ground')
  assert.deepEqual(events.filter((event) => event.kind === 'floor').map((event) => event.floor), [1])
})

test('a jump leaves the plank and lands back on it', () => {
  const course = createBarrelCourse(seeded(1))
  course.stopBarrels()
  assert.equal(course.jump(), true)
  assert.equal(course.jump(), false, 'no double jump')
  let peak = 0
  const start = course.hero.y
  const events = []
  for (let frame = 0; frame < 120 && !events.some((event) => event.kind === 'hero-land'); frame += 1) {
    events.push(...course.step(1 / 60))
    peak = Math.max(peak, course.hero.y - start)
  }
  assert.ok(peak > BARREL_RADIUS * 2 + 0.08, `jumps clear of a barrel (${peak.toFixed(2)})`)
  assert.equal(course.hero.state, 'ground')
})

test('a barrel zig-zags down every plank and rolls out at the bottom', () => {
  // A generator that never takes a ladder.
  const course = createBarrelCourse(() => 0.99)
  const floors = new Set()
  const events = []
  // Park the can up on floor 1 out of the way: the barrel is what is watched here.
  for (let frame = 0; frame < 60 * 30 && !events.some((event) => event.kind === 'gone'); frame += 1) {
    events.push(...course.step(1 / 60))
    const first = course.barrels.find((entry) => entry.id === 0)
    if (first) floors.add(first.floor)
    if (events.some((event) => event.kind === 'bonk')) break
  }
  const spawn = events.find((event) => event.kind === 'spawn')
  assert.ok(spawn, 'the gopher rolls a barrel')
  assert.ok(events.findIndex((event) => event.kind === 'windup') < events.indexOf(spawn), 'he winds up first')
  assert.ok(events.some((event) => event.kind === 'gone' || event.kind === 'bonk'))
  if (events.some((event) => event.kind === 'gone')) assert.deepEqual([...floors].sort(), [0, 1, 2, 3, 4])
})

test('a barrel can take a ladder down', () => {
  const course = createBarrelCourse(() => 0)
  const events = []
  for (let frame = 0; frame < 60 * 8 && !events.some((event) => event.kind === 'down-ladder'); frame += 1) events.push(...course.step(1 / 60))
  assert.ok(events.some((event) => event.kind === 'down-ladder'))
})

test('touching a barrel is a bonk; the can then blinks through the next one', () => {
  assert.equal(barrelTouches(0, 0, 0, BARREL_RADIUS), true)
  assert.equal(barrelTouches(0, 0, 0.5, BARREL_RADIUS), false)
  const course = createBarrelCourse(() => 0.99)
  const events = []
  // Stand still at the start: the first barrel to reach the bottom plank rolls into the can.
  for (let frame = 0; frame < 60 * 40 && !events.some((event) => event.kind === 'bonk'); frame += 1) events.push(...course.step(1 / 60))
  assert.ok(events.some((event) => event.kind === 'bonk'))
  assert.ok(course.hero.blink > 0)
})

test('jumping a barrel that rolls under the can is a vault', () => {
  const course = createBarrelCourse(() => 0.99)
  const events = []
  for (let frame = 0; frame < 60 * 40; frame += 1) {
    const hero = course.hero
    const coming = course.barrels.find((entry) => entry.floor === hero.floor && entry.state === 'roll'
      && Math.sign(hero.x - entry.x) === entry.dir && Math.abs(hero.x - entry.x) < 0.5)
    if (coming) course.jump()
    events.push(...course.step(1 / 60))
    if (events.some((event) => event.kind === 'vault')) break
  }
  assert.ok(events.some((event) => event.kind === 'vault'))
  assert.ok(!events.some((event) => event.kind === 'bonk'))
})

test('a held finger is steered to the right ladder; a point is read as the floor it stands over', () => {
  assert.equal(nearestFloor(0, 0.3), 0)
  assert.equal(nearestFloor(0, 1.4), 1)
  assert.equal(nearestFloor(-0.5, 5.3), 5)
  const course = createBarrelCourse(seeded(1))
  const hero = course.hero
  const up = barrelSteer(hero, 0, 3.4)
  const ladder = BARREL_LADDERS.find((entry) => entry.bottom === 0)
  assert.equal(up.move, Math.sign(ladder.x - hero.x), 'walks to the nearest ladder up')
  assert.deepEqual(barrelSteer({ ...hero, x: ladder.x }, 0, 3.4), { move: 0, climb: 1 })
  assert.deepEqual(barrelSteer(hero, hero.x - 1, hero.y + 0.2), { move: -1, climb: 0 }, 'on its own floor it just walks')
})

test('a careful climber reaches the rain barrel well inside the round', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const course = createBarrelCourse(seeded(seed))
    let seconds = 0
    let bonks = 0
    let floors = 0
    while (floors < CARE_GAME_RULES.barrel.goal && seconds < CARE_GAME_RULES.barrel.seconds) {
      const hero = course.hero
      // Head for the next floor's ladder, and jump a barrel rolling at the can on its floor.
      const next = BARREL_LADDERS.filter((ladder) => ladder.bottom === hero.floor)
        .reduce((best, ladder) => (!best || Math.abs(ladder.x - hero.x) < Math.abs(best.x - hero.x) ? ladder : best), null)
      const target = next ? { x: next.x, y: ladderSpan(next).topY + 0.4 } : { x: hero.x, y: hero.y }
      course.setInput(barrelSteer(hero, target.x, target.y))
      // Walking into a barrel closes at about 2.8 m/s, so the jump goes about a body length and a half out.
      const threat = course.barrels.some((entry) => entry.floor === hero.floor && entry.state === 'roll' && hero.state === 'ground'
        && Math.sign(hero.x - entry.x) === entry.dir && Math.abs(hero.x - entry.x) < 0.8 && Math.abs(hero.x - entry.x) > 0.5)
      if (threat) course.jump()
      for (const event of course.step(1 / 60)) {
        if (event.kind === 'bonk') bonks += 1
        if (event.kind === 'floor') floors += 1
      }
      seconds += 1 / 60
    }
    assert.equal(floors, CARE_GAME_RULES.barrel.goal, `seed ${seed}: ${floors} floors in ${seconds.toFixed(1)} s`)
    assert.ok(bonks < CARE_GAME_RULES.barrel.hearts, `seed ${seed}: ${bonks} bonks`)
    assert.ok(seconds < CARE_GAME_RULES.barrel.seconds * 0.6, `seed ${seed}: took ${seconds.toFixed(1)} s`)
  }
})
