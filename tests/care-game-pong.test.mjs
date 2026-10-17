import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-pong.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const pong = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  PONG_FASTEST_FLIGHT, PONG_FIRST_FLIGHT, PONG_HIT_FROM, PONG_PAST, PONG_REGROW_SECONDS, PONG_SHOOTS_AT_ONCE, PONG_SHOOT_HALF,
  PONG_SMASH_REACH, PONG_SWEET, createPongRally, pongFlight, pongGrade, pongShootHit,
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

/** Step until the pea is incoming at or past `progress`. */
function stepTo(rally, progress) {
  for (let frame = 0; frame < 2000; frame += 1) {
    if (rally.ball.phase === 'incoming' && rally.ball.progress >= progress) return
    rally.step(1 / 240)
  }
  throw new Error('the pea never came')
}

test('a swing is graded by how close to the sweet spot it lands, and only inside the window', () => {
  assert.equal(pongGrade(PONG_HIT_FROM - 0.01), null)
  assert.equal(pongGrade(PONG_SWEET), 'perfect')
  assert.equal(pongGrade(PONG_SWEET - 0.07), 'good')
  assert.equal(pongGrade(PONG_HIT_FROM + 0.001), 'ok')
  assert.equal(pongGrade(PONG_PAST + 0.01), null)
})

test('each returned rally quickens the next pea, down to a floor', () => {
  assert.equal(pongFlight(0), PONG_FIRST_FLIGHT)
  assert.ok(pongFlight(4) < pongFlight(3))
  assert.equal(pongFlight(500), PONG_FASTEST_FLIGHT)
})

test('a perfect smash trims a wider strip than an ok return', () => {
  const shoots = [{ id: 1, x: 0.36 }]
  const wide = 0.36 + PONG_SHOOT_HALF + PONG_SMASH_REACH * 0.5
  assert.equal(pongShootHit(shoots, wide, 'ok'), null)
  assert.equal(pongShootHit(shoots, wide, 'perfect').id, 1)
  assert.equal(pongShootHit([{ id: 1, x: 0 }, { id: 2, x: 0.1 }], 0.08, 'good').id, 2, 'the nearest shoot is the one trimmed')
})

test('a timed swing aimed at a shoot trims it, and the shoot grows back elsewhere', () => {
  const rally = createPongRally(seeded(3))
  assert.equal(rally.shoots.length, PONG_SHOOTS_AT_ONCE)
  stepTo(rally, PONG_SWEET)
  const target = rally.shoots[0]
  const swing = rally.swing(target.x)
  assert.equal(swing[0].kind, 'swing')
  assert.equal(swing[0].grade, 'perfect')
  assert.equal(swing[0].toX, target.x, 'a perfect return goes exactly where it was aimed')
  const events = []
  for (let frame = 0; frame < 600 && !events.some((event) => event.kind === 'trim'); frame += 1) events.push(...rally.step(1 / 240))
  const trim = events.find((event) => event.kind === 'trim')
  assert.ok(trim, 'the shoot was trimmed')
  assert.equal(trim.shoot.id, target.id)
  assert.equal(rally.shoots.length, PONG_SHOOTS_AT_ONCE - 1)
  assert.ok(events.some((event) => event.kind === 'batted'), 'the leaves bat the pea straight back')
  const later = []
  for (let frame = 0; frame < Math.ceil(PONG_REGROW_SECONDS * 240) + 4; frame += 1) later.push(...rally.step(1 / 240))
  assert.ok(later.some((event) => event.kind === 'regrow'))
  assert.equal(rally.shoots.length, PONG_SHOOTS_AT_ONCE)
})

test('an early swing whiffs and the trowel needs a moment; a pea let past is a miss, then a new serve', () => {
  const rally = createPongRally(seeded(9))
  stepTo(rally, 0.3)
  assert.deepEqual(rally.swing(0), [{ kind: 'whiff' }])
  assert.deepEqual(rally.swing(0), [], 'still recovering')
  const events = []
  for (let frame = 0; frame < 2000 && !events.some((event) => event.kind === 'past'); frame += 1) events.push(...rally.step(1 / 240))
  assert.ok(events.some((event) => event.kind === 'past'))
  assert.equal(rally.ball.phase, 'past')
  const after = []
  for (let frame = 0; frame < 1000 && !after.some((event) => event.kind === 'serve'); frame += 1) after.push(...rally.step(1 / 240))
  assert.ok(after.some((event) => event.kind === 'serve'), 'the leaves serve again')
})

test('a steady player trims enough shoots well inside the round', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rally = createPongRally(seeded(seed))
    let trims = 0
    let seconds = 0
    while (seconds < CARE_GAME_RULES.pong.seconds && trims < CARE_GAME_RULES.pong.goal) {
      const ball = rally.ball
      // Good, not perfect: a little off the sweet spot, aimed at the first shoot standing.
      if (ball.phase === 'incoming' && ball.progress >= PONG_SWEET - 0.06 && rally.shoots.length > 0) rally.swing(rally.shoots[0].x)
      trims += rally.step(1 / 60).filter((event) => event.kind === 'trim').length
      seconds += 1 / 60
    }
    assert.ok(trims >= CARE_GAME_RULES.pong.goal, `seed ${seed}: ${trims} trims`)
    assert.ok(seconds < CARE_GAME_RULES.pong.seconds * 0.8, `seed ${seed}: took ${seconds.toFixed(1)} s`)
  }
})
