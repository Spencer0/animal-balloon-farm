import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-rope.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const rope = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  createRopeFrog, createRopeSweep, hopHeight, ropeBaseSpeed, ropeLength, ropeShortness, wrapAngle,
  ROPE_CLEAR_HEIGHT, ROPE_FROG_RADIUS, ROPE_HOP_HEIGHT, ROPE_HOP_SECONDS, ROPE_KNOCK_SECONDS, ROPE_LAND_SECONDS, ROPE_MAX_LENGTH, ROPE_MIN_LENGTH,
} = rope

const GOAL = 10
const TAU = Math.PI * 2

test('angles wrap into (-PI, PI]', () => {
  assert.ok(Math.abs(wrapAngle(TAU + 0.5) - 0.5) < 1e-9)
  assert.ok(Math.abs(wrapAngle(-TAU - 0.5) + 0.5) < 1e-9)
  const wrapped = wrapAngle(Math.PI)
  assert.ok(wrapped > -Math.PI && wrapped <= Math.PI)
})

test('the runner is full at the start, shortest at the last hit, and always reaches past the frog', () => {
  assert.equal(ropeLength(GOAL, GOAL), ROPE_MAX_LENGTH)
  assert.equal(ropeLength(0, GOAL), ROPE_MIN_LENGTH)
  for (let remaining = GOAL; remaining > 0; remaining -= 1) {
    assert.ok(ropeLength(remaining, GOAL) > ropeLength(remaining - 1, GOAL))
  }
  assert.ok(ROPE_MIN_LENGTH > ROPE_FROG_RADIUS + 0.1, 'the shortest runner still sweeps past the frog')
})

test('a shorter runner sweeps faster, and every turn is faster than the last', () => {
  assert.equal(ropeShortness(ROPE_MAX_LENGTH), 1)
  assert.ok(ropeShortness(ROPE_MIN_LENGTH) > 1.1)
  for (let pass = 1; pass < GOAL; pass += 1) assert.ok(ropeBaseSpeed(pass) > ropeBaseSpeed(pass - 1))
})

test('a hop is a fixed arc: flat at both ends, peaking at the middle', () => {
  assert.equal(hopHeight(0), 0)
  assert.equal(hopHeight(ROPE_HOP_SECONDS), 0)
  assert.equal(hopHeight(-1), 0)
  assert.ok(Math.abs(hopHeight(ROPE_HOP_SECONDS / 2) - ROPE_HOP_HEIGHT) < 1e-9)
  assert.ok(hopHeight(ROPE_HOP_SECONDS * 0.2) > ROPE_CLEAR_HEIGHT)
})

test('the frog cannot re-hop mid-air, can hop again once it lands, and is out of reach while knocked out', () => {
  const frog = createRopeFrog()
  assert.equal(frog.hop(1), true)
  assert.equal(frog.hop(1 + ROPE_HOP_SECONDS / 2), false, 'no re-hop in the air')
  assert.equal(frog.hop(1 + ROPE_HOP_SECONDS + 0.1), false, 'a landing squat first')
  assert.equal(frog.hop(1 + ROPE_HOP_SECONDS + ROPE_LAND_SECONDS + 0.01), true, 'hops again once recovered')
  frog.knock(10)
  assert.equal(frog.onPad(10.5), false)
  assert.equal(frog.hop(10.5), false, 'no hop while knocked out')
  assert.equal(frog.onPad(10 + ROPE_KNOCK_SECONDS + 0.01), true)
})

test('a pass only clears when the frog is high enough as the runner crosses', () => {
  const frog = createRopeFrog()
  frog.hop(5)
  assert.ok(frog.heightAt(5 + 0.3) >= ROPE_CLEAR_HEIGHT, 'airborne across the middle')
  assert.ok(frog.heightAt(5 + 0.02) < ROPE_CLEAR_HEIGHT, 'still on the pad at takeoff')
  assert.equal(frog.heightAt(5 + ROPE_HOP_SECONDS + 0.1), 0, 'back on the pad after landing')
})

test('the sweep starts behind the frog and reaches it after a few seconds of play', () => {
  const sweep = createRopeSweep()
  assert.ok(sweep.ahead > 2 && sweep.ahead < Math.PI, 'starts behind the frog, not across it')
  const crossings = []
  for (let frame = 0; frame < 60 * 4 && crossings.length === 0; frame += 1) crossings.push(...sweep.step(1 / 60, GOAL, GOAL))
  assert.equal(crossings.length, 1)
  assert.equal(crossings[0].pass, 0)
  assert.ok(crossings[0].time > 0.6 && crossings[0].time < 1.6, `first pass at ${crossings[0].time.toFixed(2)}s`)
})

test('the sweep is frame-rate independent: a slow frame gives the same passes', () => {
  const fine = createRopeSweep()
  const coarse = createRopeSweep()
  const fineTimes = []
  for (let frame = 0; frame < 60 * 6; frame += 1) fineTimes.push(...fine.step(1 / 60, GOAL, GOAL).map((c) => c.time))
  const coarseTimes = []
  for (let frame = 0; frame < 6; frame += 1) coarseTimes.push(...coarse.step(1, GOAL, GOAL).map((c) => c.time))
  assert.equal(coarseTimes.length, fineTimes.length)
  coarseTimes.forEach((time, index) => assert.ok(Math.abs(time - fineTimes[index]) < 1e-6))
})

/**
 * A reactive player: sees a pass coming and hops `lead` seconds before it.
 * Returns what happened, so the rules can be checked against real timing.
 */
function play({ lead = 0.2, fake = false, seconds = 60 } = {}) {
  const sweep = createRopeSweep()
  const frog = createRopeFrog()
  let remaining = GOAL
  let hits = 0
  let harms = 0
  let lastPassTime = 0
  const passes = []
  const dt = 1 / 60
  for (let frame = 0; frame < seconds * 60 && remaining > 0 && harms < 2; frame += 1) {
    // The player only knows the runner's distance and speed, which is how it looks on screen.
    const eta = sweep.ahead / Math.max(0.01, sweep.speed)
    if (sweep.ahead > 0 && eta <= lead + dt && frog.onPad(sweep.clock)) frog.hop(sweep.clock)
    for (const crossing of sweep.step(dt, remaining, GOAL)) {
      passes.push(crossing)
      lastPassTime = crossing.time
      if (!frog.onPad(crossing.time)) continue
      if (frog.heightAt(crossing.time) >= ROPE_CLEAR_HEIGHT) {
        hits += 1
        remaining -= 1
      } else {
        harms += 1
        frog.knock(crossing.time)
      }
    }
  }
  return { hits, harms, passes, lastPassTime, remaining, fake }
}

test('a reactive player clears every pass, doubles included, and wins in well under the time limit', () => {
  const result = play()
  assert.equal(result.harms, 0)
  assert.equal(result.hits, GOAL, 'all ten hits')
  assert.equal(result.remaining, 0)
  assert.ok(result.lastPassTime < 18, `won by ${result.lastPassTime.toFixed(1)}s, inside the 22s round`)
  const returns = result.passes.filter((pass) => pass.returning)
  assert.equal(returns.length, 2, 'two double passes')
  for (const back of returns) {
    const before = result.passes.find((pass) => pass.pass === back.pass - 1)
    const gap = back.time - before.time
    assert.ok(gap > 0.2 && gap < 0.5, `double pass ${gap.toFixed(2)}s apart`)
  }
})

test('tapping as fast as possible does not win: the frog cannot chain hops through the passes', () => {
  const sweep = createRopeSweep()
  const frog = createRopeFrog()
  let remaining = GOAL
  let hits = 0
  let harms = 0
  for (let frame = 0; frame < 60 * 30 && remaining > 0 && harms < 2; frame += 1) {
    // Spam: a tap on every frame, whenever the frog can take off at all.
    frog.hop(sweep.clock)
    for (const crossing of sweep.step(1 / 60, remaining, GOAL)) {
      if (!frog.onPad(crossing.time)) continue
      if (frog.heightAt(crossing.time) >= ROPE_CLEAR_HEIGHT) {
        hits += 1
        remaining -= 1
      } else {
        harms += 1
        frog.knock(crossing.time)
      }
    }
  }
  assert.ok(hits < GOAL, `spam cleared ${hits} of ${GOAL}`)
  assert.ok(harms >= 2, 'spam gets knocked out')
})

test('a player who hops late gets caught, and the caught pass still counts as a pass', () => {
  const sweep = createRopeSweep()
  const frog = createRopeFrog()
  let harms = 0
  for (let frame = 0; frame < 60 * 4; frame += 1) {
    const eta = sweep.ahead / Math.max(0.01, sweep.speed)
    if (sweep.ahead > 0 && eta <= 0.01 && frog.onPad(sweep.clock)) frog.hop(sweep.clock)
    for (const crossing of sweep.step(1 / 60, GOAL, GOAL)) {
      if (frog.heightAt(crossing.time) < ROPE_CLEAR_HEIGHT) {
        harms += 1
        frog.knock(crossing.time)
      }
    }
  }
  assert.ok(harms >= 1)
  assert.ok(sweep.passes >= 1, 'the runner keeps sweeping after a catch')
})

test('the fake slow-down is slow to approach, then whips', () => {
  const sweep = createRopeSweep()
  // Run until the fake pass is the next one, then compare speeds far and near.
  let far = 0
  let near = 0
  for (let frame = 0; frame < 60 * 60; frame += 1) {
    if (sweep.passes === rope.ROPE_FAKE_PASS && !sweep.flicking) {
      if (sweep.ahead > rope.ROPE_FAKE_RADIANS + 0.4 && far === 0) far = sweep.speed
      if (sweep.ahead < rope.ROPE_FAKE_RADIANS - 0.2 && sweep.ahead > 0 && near === 0) near = sweep.speed
    }
    sweep.step(1 / 60, GOAL - sweep.passes, GOAL)
    if (sweep.passes > rope.ROPE_FAKE_PASS) break
  }
  assert.ok(far > 0 && near > far * 2, `fake crawls (${far.toFixed(2)}) then whips (${near.toFixed(2)})`)
})
