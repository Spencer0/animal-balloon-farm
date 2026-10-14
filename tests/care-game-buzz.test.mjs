import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-buzz.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const buzz = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { BUZZ, buzzGap, chimePitch, createBuzzRun, flapBee, flapTilt, stemContact, stepBuzz, stepBee } = buzz
const { createCareRound, CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from((await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })).outputFiles[0].text).toString('base64')}`)

/** A seeded generator, so every run of the bot is the same course. */
function seeded(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

// Screen views on the z = 0 plane: a 16:9 desktop and a 390x844 phone (world units, from the stage camera).
const DESKTOP = { left: -1.67, width: 3.34, top: 1.44 }
const PHONE = { left: -0.74, width: 1.48, top: 2.1 }

/**
 * A simple bot that reads the course, not the screen: it flaps when the bee, falling,
 * will be below the next gap's centre minus a margin after its reaction time. It is
 * no oracle, just a player with steady taps, so passing it proves a reasonable player
 * can clear the course.
 */
function play(view, seed, { seconds = 40, dt = 1 / 120, lazy = false } = {}) {
  const random = seeded(seed)
  const run = createBuzzRun()
  const events = { bonkTimes: [], clearTimes: [] }
  const pending = []
  const reactionSeconds = 0.2
  let time = 0
  while (time < seconds && run.cleared < CARE_GAME_RULES.buzz.goal && run.bonks < CARE_GAME_RULES.buzz.hearts) {
    const beeX = view.left + view.width * BUZZ.beeAtWidth
    // Track the stem until the bee's hitbox has cleared it, not just its centre.
    const next = run.stems.find((stem) => !stem.touched && stem.x + BUZZ.stemHalfWidth + BUZZ.beeRadius > beeX)
    const target = next ? next.gap.centre : BUZZ.level
    // Flap on where the bee will be after a fifth of a second of reaction time, as a player who has learned the rhythm would.
    const predicted = run.bee.y + run.bee.vy * reactionSeconds - 0.5 * BUZZ.gravity * reactionSeconds * reactionSeconds
    // The tap lands after the reaction time, so one tap is pending at a time.
    if (!lazy && pending.length === 0 && run.bee.vy <= 0 && predicted <= target - 0.12) pending.push(time + reactionSeconds)
    const flap = pending.length > 0 && pending[0] <= time + 1e-9
    if (flap) pending.shift()
    const result = stepBuzz(run, dt, view, flap, random)
    time += dt
    if (result.bonk) events.bonkTimes.push(time)
    if (result.cleared.length) events.clearTimes.push(time)
  }
  return { run, time, ...events }
}

test('a flap sets the upward speed at once, it does not add to it', () => {
  const falling = { y: 0.6, vy: -2 }
  assert.equal(flapBee(falling).vy, BUZZ.flapSpeed)
  assert.equal(flapBee({ y: 0.6, vy: 1.4 }).vy, BUZZ.flapSpeed)
})

test('gravity is strong, the fall speed is capped, and a bee at rest falls', () => {
  let bee = { y: 1, vy: 0 }
  for (let frame = 0; frame < 120; frame += 1) bee = stepBee(bee, 1 / 120)
  assert.ok(bee.y < 1 && bee.vy < 0)
  assert.equal(bee.vy, -BUZZ.maxFall)
  const first = stepBee({ y: 1, vy: 0 }, 1 / 60)
  assert.ok(first.vy < -0.07 && first.vy > -0.09, `strong gravity: ${first.vy}`)
})

test('a tap rises a fixed height, and that height fits the narrowest gap', () => {
  const apex = BUZZ.flapSpeed ** 2 / (2 * BUZZ.gravity)
  let bee = flapBee({ y: 0.5, vy: 0 })
  let top = bee.y
  for (let frame = 0; frame < 600; frame += 1) {
    bee = stepBee(bee, 1 / 600)
    top = Math.max(top, bee.y)
  }
  assert.ok(Math.abs(top - 0.5 - apex) < 0.01, `apex ${top - 0.5} vs ${apex}`)
  assert.ok(apex < BUZZ.narrowestGap - 2 * BUZZ.beeRadius, 'a single tap is smaller than the gap a bee must hold between')
})

test('the first two gaps are wide and level; later gaps narrow and wander within reach', () => {
  const random = seeded(7)
  const gaps = []
  let previous = BUZZ.level
  for (let index = 0; index < CARE_GAME_RULES.buzz.goal; index += 1) {
    const gap = buzzGap(index, previous, random)
    gaps.push(gap)
    previous = gap.centre
  }
  assert.equal(gaps[0].size, BUZZ.wideGap)
  assert.equal(gaps[1].size, BUZZ.wideGap)
  assert.equal(gaps[0].centre, BUZZ.level)
  assert.equal(gaps[1].centre, BUZZ.level)
  for (let index = 1; index < gaps.length; index += 1) {
    assert.ok(gaps[index].size <= gaps[index - 1].size + 1e-9, `gap ${index} narrows`)
    assert.ok(gaps[index].size >= BUZZ.narrowestGap - 1e-9)
    assert.ok(Math.abs(gaps[index].centre - gaps[index - 1].centre) <= BUZZ.maxStep + 1e-9, `gap ${index} reachable`)
    assert.ok(gaps[index].centre >= BUZZ.lowestCentre - 1e-9 && gaps[index].centre <= BUZZ.highestCentre + 1e-9)
    assert.ok(Math.abs(gaps[index].top - gaps[index].bottom - gaps[index].size) < 1e-9)
  }
})

test('the bee hitbox is forgiving: inside the gap is clear, and a silhouette grazing a stem is not a hit', () => {
  const gap = buzzGap(4, BUZZ.level, () => 0.5)
  const stem = { x: 0, gap }
  assert.equal(stemContact({ x: 0, y: gap.centre }, stem), null)
  // The bee's drawn body reaches about 0.12 from its centre; the hitbox only 0.07.
  assert.equal(stemContact({ x: 0.12 + BUZZ.stemHalfWidth, y: gap.centre }, stem), null, 'a wingtip clip is not a bonk')
  assert.equal(stemContact({ x: 0, y: gap.bottom - 0.01 }, stem), 'low')
  assert.equal(stemContact({ x: 0, y: gap.top + 0.01 }, stem), 'high')
  assert.equal(stemContact({ x: 0.5, y: gap.bottom - 0.5 }, stem), null, 'far to the side is clear')
})

test('a steady bot clears the whole course on a desktop and on a phone, without a bonk', () => {
  for (const view of [DESKTOP, PHONE]) {
    for (const seed of [1, 2, 3]) {
      const { run, time, bonkTimes } = play(view, seed)
      assert.equal(run.cleared, CARE_GAME_RULES.buzz.goal, `cleared on seed ${seed}`)
      assert.equal(bonkTimes.length, 0, `no bonk on seed ${seed}`)
      assert.ok(time < CARE_GAME_RULES.buzz.seconds, `inside the round (${time.toFixed(1)} s)`)
      assert.ok(time > 12, `the course takes a real run (${time.toFixed(1)} s)`)
    }
  }
})

test('nobody dies in the first three seconds: the bot is clear of every bonk until then', () => {
  const { bonkTimes } = play(DESKTOP, 5, { seconds: 3 })
  assert.deepEqual(bonkTimes, [])
})

test('a bee that never flaps bonks the lawn and loses its hearts', () => {
  const { run, bonkTimes } = play(DESKTOP, 9, { lazy: true, seconds: 8 })
  assert.ok(run.bonks >= CARE_GAME_RULES.buzz.hearts, 'enough bonks to lose')
  assert.ok(bonkTimes[0] < 2, `the lawn catches it quickly (${bonkTimes[0]?.toFixed(2)} s)`)
  const round = createCareRound('buzz')
  for (let bonk = 0; bonk < CARE_GAME_RULES.buzz.hearts; bonk += 1) round.harm()
  assert.equal(round.snapshot.lossReason, 'hearts')
})

test('a bonk blinks the bee for a second, and nothing counts inside that second', () => {
  const view = DESKTOP
  const run = createBuzzRun()
  const random = seeded(3)
  // Put the bee straight into a stem's lower half.
  stepBuzz(run, 0.001, view, false, random)
  const beeAt = view.left + view.width * BUZZ.beeAtWidth
  run.stems.push({ index: 9, x: beeAt, gap: buzzGap(5, BUZZ.level, () => 0.5), touched: false, cleared: false })
  run.bee = { y: run.stems[run.stems.length - 1].gap.bottom - 0.02, vy: 0 }
  const first = stepBuzz(run, 0.01, view, false, random)
  assert.equal(first.bonk, 'stem')
  assert.equal(run.bonks, 1)
  assert.ok(Math.abs(run.invulnerable - BUZZ.blinkSeconds) < 0.02)
  // A second bonk inside the blink does not count.
  run.stems.push({ index: 10, x: beeAt, gap: buzzGap(5, BUZZ.level, () => 0.5), touched: false, cleared: false })
  run.bee = { y: run.stems[run.stems.length - 1].gap.bottom - 0.02, vy: 0 }
  const second = stepBuzz(run, 0.01, view, false, random)
  assert.equal(second.bonk, null)
  assert.equal(run.bonks, 1)
})

test('a stem the bee has touched is not scored, even when the bee flies on past it', () => {
  const view = DESKTOP
  const run = createBuzzRun()
  const random = seeded(4)
  const beeAt = view.left + view.width * BUZZ.beeAtWidth
  const gap = buzzGap(5, BUZZ.level, () => 0.5)
  run.stems.push({ index: 6, x: beeAt + 0.02, gap, touched: false, cleared: false })
  run.bee = { y: gap.bottom - 0.02, vy: 0 }
  const step = stepBuzz(run, 0.02, view, false, random)
  assert.equal(step.bonk, 'stem')
  assert.equal(run.cleared, 0)
  for (let frame = 0; frame < 60; frame += 1) stepBuzz(run, 0.02, view, false, random)
  assert.equal(run.cleared, 0, 'passing a touched stem scores nothing')
})

test('chimes rise with the streak and stop climbing at the ninth clear', () => {
  assert.equal(chimePitch(1), 1)
  assert.ok(chimePitch(2) > chimePitch(1) && chimePitch(5) > chimePitch(4))
  assert.equal(chimePitch(9), chimePitch(30))
  assert.ok(Math.abs(chimePitch(7) - 2 ** (12 / 12)) < 1e-9, 'twelve semitones over six steps is an octave')
})

test('the tilt noses up on a flap and down as the bee falls, within limits', () => {
  assert.ok(flapTilt(BUZZ.flapSpeed) > 0)
  assert.ok(flapTilt(-BUZZ.maxFall) < 0)
  assert.ok(flapTilt(100) <= 0.5 && flapTilt(-100) >= -0.95)
})
