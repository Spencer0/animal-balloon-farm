import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-pong.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const pong = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  PONG_ANGLE, PONG_EARLY, PONG_FASTEST_FLIGHT, PONG_FIRST_FLIGHT, PONG_GOOD_WITHIN, PONG_LATE, PONG_REACH, PONG_REGROW_SECONDS,
  PONG_SHOOTS_AT_ONCE, PONG_SWEET_LEAD, createPongRally, pongAim, pongFlight, pongGrade, pongShootHit, pongSmackTarget,
} = pong
const rulesBuild = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from(rulesBuild.outputFiles[0].text).toString('base64')}`)

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Step until a pea is incoming and at most `until` seconds from the trowel. */
function stepTo(rally, until) {
  for (let frame = 0; frame < 4000; frame += 1) {
    if (rally.untilContact !== null && rally.untilContact <= until) return
    rally.step(1 / 480)
  }
  throw new Error('the pea never came')
}

/** Step until an event of this kind happens; return every event seen. */
function stepUntil(rally, kind, frames = 4000) {
  const events = []
  for (let frame = 0; frame < frames && !events.some((event) => event.kind === kind); frame += 1) events.push(...rally.step(1 / 240))
  return events
}

test('a smack is graded by how close to the sweet spot it lands, and only inside the window', () => {
  assert.equal(pongGrade(PONG_EARLY + 0.01), null)
  assert.equal(pongGrade(PONG_SWEET_LEAD), 'perfect')
  assert.equal(pongGrade(PONG_SWEET_LEAD + (PONG_GOOD_WITHIN - 0.01)), 'good')
  assert.equal(pongGrade(PONG_EARLY - 0.001), 'ok')
  assert.equal(pongGrade(-PONG_LATE + 0.001), 'good', 'a hair late still lands')
  assert.equal(pongGrade(-PONG_LATE - 0.01), null)
})

test('each smack quickens the next pea, down to a floor', () => {
  assert.equal(pongFlight(0), PONG_FIRST_FLIGHT)
  assert.ok(PONG_FIRST_FLIGHT < 1, 'the first pea is already quick')
  assert.ok(pongFlight(4) < pongFlight(3))
  assert.equal(pongFlight(500), PONG_FASTEST_FLIGHT)
})

test('the part of the trowel the pea meets angles the return, like a bat', () => {
  assert.equal(pongAim(0.2, 0.2), 0.2, 'off the middle it goes straight')
  assert.equal(pongAim(0, PONG_REACH), -PONG_ANGLE, 'off the left edge it goes left')
  assert.equal(pongAim(0, -PONG_REACH), PONG_ANGLE, 'off the right edge it goes right')
  assert.equal(pongAim(0.9, 0.9 - PONG_REACH), 1, 'never off the bench')
})

test('a better smack homes in on a shoot from farther off', () => {
  const shoots = [{ id: 1, x: 0.36 }, { id: 2, x: -0.72 }]
  assert.equal(pongSmackTarget(shoots, 0, 'perfect').id, 1)
  assert.equal(pongSmackTarget(shoots, 0, 'good'), null, 'a good smack needs a closer angle')
  assert.equal(pongSmackTarget(shoots, 0.1, 'good').id, 1)
  assert.equal(pongSmackTarget(shoots, 0.36, 'ok'), null, 'an ok smack goes where it goes')
  assert.equal(pongShootHit(shoots, 0.4).id, 1, 'a pea landing on a shoot trims it')
  assert.equal(pongShootHit([{ id: 1, x: 0 }, { id: 2, x: 0.1 }], 0.08).id, 2, 'the nearest shoot is the one trimmed')
})

test('a perfect smack with the trowel under the pea trims a shoot, and the shoot grows back', () => {
  const rally = createPongRally(seeded(3))
  assert.equal(rally.shoots.length, PONG_SHOOTS_AT_ONCE)
  stepTo(rally, PONG_SWEET_LEAD)
  rally.movePaddle(rally.ball.toX)
  const swing = rally.swing()
  assert.equal(swing[0].kind, 'smack')
  assert.equal(swing[0].grade, 'perfect')
  assert.ok(swing[0].target, 'a perfect smack finds a shoot')
  assert.equal(swing[0].toX, swing[0].target.x, 'and lands right on it')
  assert.ok(rally.ball.flightSeconds < PONG_FIRST_FLIGHT * 0.6, 'a smack flies back fast')
  const events = stepUntil(rally, 'trim')
  const trim = events.find((event) => event.kind === 'trim')
  assert.ok(trim, 'the shoot was trimmed')
  assert.equal(trim.shoot.id, swing[0].target.id)
  assert.equal(rally.shoots.length, PONG_SHOOTS_AT_ONCE - 1)
  assert.ok(events.some((event) => event.kind === 'batted'), 'the leaf bats the pea straight back')
  const later = []
  for (let frame = 0; frame < Math.ceil(PONG_REGROW_SECONDS * 240) + 4; frame += 1) later.push(...rally.step(1 / 240))
  assert.ok(later.some((event) => event.kind === 'regrow'))
  assert.equal(rally.shoots.length, PONG_SHOOTS_AT_ONCE)
})

test('a swing too early, or with the trowel away from the pea, whiffs, and the trowel needs a moment', () => {
  const rally = createPongRally(seeded(9))
  stepTo(rally, PONG_EARLY + 0.1)
  rally.movePaddle(rally.ball.toX)
  assert.deepEqual(rally.swing(), [{ kind: 'whiff', reason: 'early' }])
  assert.deepEqual(rally.swing(), [], 'still recovering')
  const wide = createPongRally(seeded(9))
  stepTo(wide, PONG_SWEET_LEAD)
  wide.movePaddle(wide.ball.toX > 0 ? -1 : 1)
  assert.deepEqual(wide.swing(), [{ kind: 'whiff', reason: 'wide' }])
})

test('a trowel left in the way blocks the pea back soft, and it trims nothing', () => {
  const rally = createPongRally(seeded(5))
  let blocks = 0
  let seconds = 0
  while (seconds < 20) {
    if (rally.ball.phase === 'incoming') rally.movePaddle(rally.ball.toX)
    const events = rally.step(1 / 60)
    assert.ok(!events.some((event) => event.kind === 'trim' || event.kind === 'past'), 'a block never trims, and the pea never gets past')
    blocks += events.filter((event) => event.kind === 'block').length
    seconds += 1 / 60
  }
  assert.ok(blocks >= 8, `${blocks} blocks`)
  assert.equal(rally.rallies, 0, 'blocks do not quicken the peas')
})

test('a pea the trowel is not under gets past, then the leaf serves again', () => {
  const rally = createPongRally(seeded(11))
  stepTo(rally, 0.3)
  rally.movePaddle(rally.ball.toX > 0 ? -1 : 1)
  const events = stepUntil(rally, 'past')
  assert.ok(events.some((event) => event.kind === 'past'))
  assert.equal(rally.ball.phase, 'past')
  assert.ok(stepUntil(rally, 'serve').some((event) => event.kind === 'serve'), 'the leaf serves again')
})

test('the leaf makes you move: it places the pea away from the trowel', () => {
  const rally = createPongRally(seeded(7))
  let far = 0
  let peas = 0
  for (let seconds = 0; seconds < 30; seconds += 1 / 60) {
    // Park the trowel on the left and block everything that comes to it.
    const events = rally.step(1 / 60)
    for (const event of events) {
      if (event.kind !== 'serve' && event.kind !== 'batted') continue
      peas += 1
      if (Math.abs(event.toX - rally.paddleX) > PONG_REACH) far += 1
    }
    rally.movePaddle(rally.ball.phase === 'incoming' && rally.untilContact < 0.2 ? rally.ball.toX : -0.5)
  }
  assert.ok(peas > 10)
  assert.ok(far / peas > 0.7, `${far} of ${peas} peas placed out of reach`)
})

test('a steady player with good, not perfect, timing trims enough shoots well inside the round', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rally = createPongRally(seeded(seed))
    let trims = 0
    let seconds = 0
    while (seconds < CARE_GAME_RULES.pong.seconds && trims < CARE_GAME_RULES.pong.goal) {
      const until = rally.untilContact
      if (until !== null) {
        // Under the pea, a little off its middle toward the nearest shoot, and a touch early.
        const toX = rally.ball.toX
        const nearest = rally.shoots.reduce((best, shoot) => (!best || Math.abs(shoot.x - toX) < Math.abs(best.x - toX) ? shoot : best), null)
        const lean = nearest ? Math.max(-0.5, Math.min(0.5, (nearest.x - toX) / PONG_ANGLE)) : 0
        rally.movePaddle(toX - lean * PONG_REACH)
        if (until <= PONG_SWEET_LEAD + 0.07) rally.swing()
      }
      trims += rally.step(1 / 60).filter((event) => event.kind === 'trim').length
      seconds += 1 / 60
    }
    assert.ok(trims >= CARE_GAME_RULES.pong.goal, `seed ${seed}: ${trims} trims`)
    assert.ok(seconds < CARE_GAME_RULES.pong.seconds * 0.8, `seed ${seed}: took ${seconds.toFixed(1)} s`)
  }
})
