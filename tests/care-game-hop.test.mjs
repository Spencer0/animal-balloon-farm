import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-hop.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const hop = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { createHopRun, hopLift, hopObstacles, hopContact, HOP_PATTERN, HOP_BEAT_UNITS, HOP_JUMP_AIR_SECONDS, HOP_JUMP_APEX } = hop

/** Run the ideal player: one tap on the beat before every harm, then the run to its end. */
function playIdeal({ tapBeats, seconds = 22, step = 1 / 60 }) {
  const run = createHopRun()
  const taps = [...tapBeats].sort((a, b) => a - b)
  let eats = 0
  let harms = 0
  let elapsed = 0
  while (elapsed < seconds && eats < 12) {
    while (taps.length && run.beats >= taps[0]) {
      taps.shift()
      run.jump()
    }
    for (const event of run.step(step)) {
      if (event.kind === 'eat') eats += 1
      if (event.kind === 'harm') harms += 1
    }
    elapsed += step
  }
  return { eats, harms, seconds: elapsed, beats: run.beats }
}

test('the jump is a fixed-height arc that lasts two beats at the opening tempo', () => {
  assert.equal(hopLift(0), 0)
  assert.equal(hopLift(HOP_JUMP_AIR_SECONDS), 0)
  assert.ok(Math.abs(hopLift(HOP_JUMP_AIR_SECONDS / 2) - HOP_JUMP_APEX) < 1e-9, 'apex at the middle')
  assert.equal(HOP_JUMP_AIR_SECONDS, 2 * (60 / 120), 'air time is two beats at 120 BPM')
  const run = createHopRun([])
  assert.equal(run.jump(), true)
  assert.equal(run.jump(), false, 'no jump while in the air')
})

test('the first four beats are empty, and every obstacle is on the beat grid', () => {
  const obstacles = hopObstacles()
  assert.ok(HOP_PATTERN.every((entry) => entry.beat >= 5), 'nothing before beat 5')
  for (const obstacle of obstacles) assert.equal(obstacle.x, obstacle.beat * HOP_BEAT_UNITS)
  const ids = obstacles.map((obstacle) => obstacle.id)
  assert.deepEqual(ids, ids.map((_, index) => index), 'stable ids in run order')
})

test('the pattern has 14 aphid hits, enough for the goal of 12 with two spare', () => {
  const aphids = hopObstacles().filter((obstacle) => obstacle.kind === 'aphid' || obstacle.kind === 'arc')
  assert.equal(aphids.length, 14)
})

test('the ideal player (one tap on the beat before each harm) wins with no harm', () => {
  const harmBeats = HOP_PATTERN.filter((entry) => entry.kind === 'thorn' || entry.kind === 'burr' || entry.kind === 'arc').map((entry) => entry.beat - 1)
  const result = playIdeal({ tapBeats: harmBeats })
  assert.equal(result.harms, 0)
  assert.ok(result.eats >= 12, `eats ${result.eats}`)
  assert.ok(result.seconds < 22, `wins in ${result.seconds.toFixed(1)} s`)
})

test('a player who never jumps runs into the thorns and burrs: two harms lose the round', () => {
  const result = playIdeal({ tapBeats: [] })
  assert.ok(result.harms >= 2, `harms ${result.harms}`)
})

test('a tap a beat late lands on the thorn; a tap on the beat before clears it', () => {
  const thorn = hopObstacles().find((obstacle) => obstacle.kind === 'thorn')
  const onBeat = playIdeal({ tapBeats: [thorn.beat - 1], seconds: 3 })
  assert.equal(onBeat.harms, 0)
  const late = playIdeal({ tapBeats: [thorn.beat - 0.2], seconds: 3 })
  assert.equal(late.harms, 1)
  const early = playIdeal({ tapBeats: [thorn.beat - 1.8], seconds: 3 })
  assert.equal(early.harms, 1)
})

test('a harm blinks the runner: the next burr in the blink is passed, and each burr hurts once', () => {
  const run = createHopRun([
    { id: 0, kind: 'thorn', beat: 0, x: 0, half: 0.1, height: 0.42, points: [] },
    { id: 1, kind: 'thorn', beat: 0, x: 0, half: 0.1, height: 0.42, points: [] },
  ])
  const events = run.step(1 / 60)
  assert.equal(events.filter((event) => event.kind === 'harm').length, 1, 'both overlap, one harm')
  assert.ok(run.blink > 0)
})

test('contact: aphids are eaten at ground level and at the top of an arc; burrs hurt below their height', () => {
  const aphid = hopObstacles().find((obstacle) => obstacle.kind === 'aphid')
  assert.equal(hopContact(aphid, aphid.x, 0), 'eat')
  assert.equal(hopContact(aphid, aphid.x, 0.6), null, 'a jump over an aphid does not eat it')
  const burr = hopObstacles().find((obstacle) => obstacle.kind === 'burr')
  assert.equal(hopContact(burr, burr.x, 0), 'harm')
  assert.equal(hopContact(burr, burr.x, 0.5), null)
  assert.equal(hopContact(burr, burr.x + 1, 0), null, 'far away is no contact')
  const arc = hopObstacles().find((obstacle) => obstacle.kind === 'arc')
  assert.equal(hopContact(arc, arc.x, 0.9), 'eat', 'the top of the arc')
  assert.equal(hopContact(arc, arc.x, 0), null)
})

test('the run speeds up mid-round, but the beat grid still holds', () => {
  const run = createHopRun([])
  let seconds = 0
  while (run.beats < 30) {
    run.step(1 / 60)
    seconds += 1 / 60
  }
  // 24 beats at 120 BPM (12 s), then 6 beats at 128 BPM: about 0.47 s each.
  assert.ok(seconds < 12 + 6 * (60 / 128) + 0.1 && seconds > 12 + 6 * (60 / 128) - 0.1, `took ${seconds.toFixed(2)} s`)
})

test('a held finger jumps again on every landing; a tap does not', () => {
  const held = createHopRun([])
  held.jump()
  held.setHolding(true)
  let takeoffs = 0
  for (let index = 0; index < 150; index += 1) {
    for (const event of held.step(1 / 60)) if (event.kind === 'takeoff') takeoffs += 1
  }
  assert.ok(takeoffs >= 2, `held: ${takeoffs} repeat jumps in 2.5 s`)
  const tapped = createHopRun([])
  tapped.jump()
  let tappedTakeoffs = 0
  for (let index = 0; index < 150; index += 1) {
    for (const event of tapped.step(1 / 60)) if (event.kind === 'takeoff') tappedTakeoffs += 1
  }
  assert.equal(tappedTakeoffs, 0, 'a tap is a single jump')
})
