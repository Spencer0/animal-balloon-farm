import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-paddle.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const paddle = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  PADDLE_HOP_SECONDS, PADDLE_REACH, PADDLE_FIRST_BEAT_SECONDS, buildPaddleCourse, paddleAirborne, paddleContactTime,
  paddleDistance, paddleLaneX, paddleOutcome, paddleSpeed, paddleStepLane,
} = paddle
const rulesBuild = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from(rulesBuild.outputFiles[0].text).toString('base64')}`)

/** A seeded generator, so the course is the same on every run. */
function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

test('lanes step left and right, and stop at the edges', () => {
  assert.equal(paddleStepLane(0, 1), 1)
  assert.equal(paddleStepLane(0, -1), -1)
  assert.equal(paddleStepLane(1, 1), 1)
  assert.equal(paddleStepLane(-1, -1), -1)
  assert.equal(paddleLaneX(0), 0)
  assert.ok(paddleLaneX(1) > 0 && paddleLaneX(-1) < 0)
})

test('the stream speeds up as the round goes on, and its distance is the integral of its speed', () => {
  assert.ok(paddleSpeed(20) > paddleSpeed(3))
  const dt = 0.0005
  let distance = 0
  for (let t = 0; t < 10; t += dt) distance += paddleSpeed(t) * dt
  assert.ok(Math.abs(distance - paddleDistance(10)) < 0.01, `${distance} vs ${paddleDistance(10)}`)
})

test('a mosquito is decided when it comes within the tongue reach, a snag or log when it reaches the frog', () => {
  const mosquito = { kind: 'mosquito', at: 8, lanes: [1] }
  const snag = { kind: 'snag', at: 8, lanes: [1] }
  assert.ok(paddleContactTime(mosquito) < mosquito.at)
  assert.ok(Math.abs(paddleDistance(mosquito.at) - paddleDistance(paddleContactTime(mosquito)) - PADDLE_REACH) < 0.05)
  assert.equal(paddleContactTime(snag), 8)
})

test('the frog eats only the mosquito in its own lane, and a snag in its lane is a harm', () => {
  const mosquito = { kind: 'mosquito', at: 5, lanes: [-1] }
  assert.equal(paddleOutcome(mosquito, -1, false), 'eat')
  assert.equal(paddleOutcome(mosquito, 0, false), 'pass')
  const snag = { kind: 'snag', at: 5, lanes: [0] }
  assert.equal(paddleOutcome(snag, 0, false), 'harm')
  assert.equal(paddleOutcome(snag, 0, true), 'harm', 'a hop does not clear a snag')
  assert.equal(paddleOutcome(snag, 1, false), 'pass')
})

test('a log is hopped over or dodged: airborne in its lane is a pass, grounded is a harm', () => {
  const log = { kind: 'log', at: 5, lanes: [-1, 0] }
  assert.equal(paddleOutcome(log, 0, false), 'harm')
  assert.equal(paddleOutcome(log, 0, true), 'pass')
  assert.equal(paddleOutcome(log, 1, false), 'pass', 'the free lane is safe')
})

test('a hop keeps the frog in the air for its own length of time', () => {
  assert.equal(paddleAirborne(null, 5), false)
  assert.equal(paddleAirborne(5, 4.9), false)
  assert.equal(paddleAirborne(5, 5), true)
  assert.equal(paddleAirborne(5, 5 + PADDLE_HOP_SECONDS - 0.001), true)
  assert.equal(paddleAirborne(5, 5 + PADDLE_HOP_SECONDS), false)
})

test('the first seconds are clear, and the course ends before the round does', () => {
  for (const seed of [1, 7, 42, 99, 2026]) {
    const course = buildPaddleCourse(seeded(seed), 22)
    assert.ok(course.length > 0)
    assert.ok(course[0].at >= PADDLE_FIRST_BEAT_SECONDS, `seed ${seed}: first beat at ${course[0].at}`)
    assert.ok(course.at(-1).at < 22 - 1.5 + 1e-9, `seed ${seed}: last beat at ${course.at(-1).at}`)
  }
})

test('the course is ordered, deterministic for a seed, and gives plenty of mosquitoes to snap', () => {
  const first = buildPaddleCourse(seeded(3), 22)
  const again = buildPaddleCourse(seeded(3), 22)
  assert.deepEqual(first, again)
  for (let index = 1; index < first.length; index += 1) assert.ok(first[index].at >= first[index - 1].at)
  for (const seed of [1, 7, 42, 99, 2026]) {
    const mosquitoes = buildPaddleCourse(seeded(seed), 22).filter((beat) => beat.kind === 'mosquito').length
    // A round needs spares over the goal, or one wrong lane ends it.
    assert.ok(mosquitoes >= CARE_GAME_RULES.paddle.goal + 2, `seed ${seed}: ${mosquitoes} mosquitoes`)
  }
})

test('every snag and log leaves a lane open, and each beat sits in a real lane', () => {
  for (const seed of [1, 7, 42, 99, 2026]) {
    const course = buildPaddleCourse(seeded(seed), 22)
    for (const beat of course) {
      assert.ok(beat.lanes.length >= 1 && beat.lanes.every((lane) => [-1, 0, 1].includes(lane)), JSON.stringify(beat))
      if (beat.kind !== 'mosquito') {
        const open = [-1, 0, 1].filter((lane) => !beat.lanes.includes(lane))
        assert.ok(open.length >= 1, JSON.stringify(beat))
      }
    }
    // Obstacles that arrive together must leave one lane open between them.
    const coincident = course.filter((beat) => beat.kind !== 'mosquito')
    for (const beat of coincident) {
      const same = coincident.filter((other) => other.at === beat.at).flatMap((other) => other.lanes)
      assert.ok(new Set(same).size < 3, `seed ${seed}: all lanes blocked at ${beat.at}`)
    }
  }
})

test('the stream glides down to the lily at the end, and the course leaves the glide clear', () => {
  const end = 22
  const { PADDLE_GLIDE_SECONDS, PADDLE_ARRIVAL_SPEED } = paddle
  assert.ok(Math.abs(paddleSpeed(end, end) - PADDLE_ARRIVAL_SPEED) < 1e-9)
  assert.ok(paddleSpeed(end - 0.5, end) < paddleSpeed(end - PADDLE_GLIDE_SECONDS, end))
  // The glide is still the integral of the speed.
  let distance = 0
  const dt = 0.0005
  for (let t = 0; t < end; t += dt) distance += paddleSpeed(t + dt / 2, end) * dt
  assert.ok(Math.abs(distance - paddleDistance(end, end)) < 0.02, `${distance} vs ${paddleDistance(end, end)}`)
  // Before the glide nothing changes, so every beat sits where it always did.
  assert.equal(paddleDistance(10, end), paddleDistance(10))
  for (const seed of [1, 7, 42]) {
    for (const beat of buildPaddleCourse(seeded(seed), end)) assert.ok(beat.at < end - PADDLE_GLIDE_SECONDS, `seed ${seed}: beat at ${beat.at}`)
  }
})

test('a course always carries spare mosquitoes over the goal', () => {
  const { paddleCourseFor, PADDLE_SPARE_MOSQUITOES } = paddle
  const { goal, seconds } = CARE_GAME_RULES.paddle
  for (let seed = 1; seed <= 60; seed += 1) {
    const mosquitoes = paddleCourseFor(seeded(seed), seconds, goal).filter((beat) => beat.kind === 'mosquito').length
    assert.ok(mosquitoes >= goal + PADDLE_SPARE_MOSQUITOES, `seed ${seed}: ${mosquitoes} mosquitoes`)
  }
})
