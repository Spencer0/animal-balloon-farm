import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-skim.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { outputFiles: ruleFiles } = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from(ruleFiles[0].text).toString('base64')}`)
const skim = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const { SKIM_TUNING, scrollSpeed, hazardGap, stepDragon, dragonTilt, dewPatterns, dewShape, DEW_PATTERN_TIMES, hazardKind, fishLift, cattailHeight, cattailRise, touchesCircle, touchesCattail } = skim

test('the dragonfly climbs while held and sinks when let go, and never leaves the sky or the water', () => {
  let state = { y: 0.5, vy: 0 }
  for (let frame = 0; frame < 60; frame += 1) state = stepDragon(state, true, 1 / 60)
  assert.ok(state.y > 0.5, 'holding climbs')
  assert.ok(state.vy <= SKIM_TUNING.maxRise + 1e-9, 'climb speed is capped')
  for (let frame = 0; frame < 600; frame += 1) state = stepDragon(state, true, 1 / 60)
  assert.ok(state.y <= SKIM_TUNING.ceilingY + 1e-9, 'the sky is a wall')
  assert.equal(state.y, SKIM_TUNING.ceilingY)
  for (let frame = 0; frame < 600; frame += 1) state = stepDragon(state, false, 1 / 60)
  assert.ok(state.y >= SKIM_TUNING.floorY - 1e-9, 'the water is a wall')
  assert.ok(state.vy >= -SKIM_TUNING.maxSink - 1e-9, 'sink speed is capped')
})

test('the climb ramps up smoothly rather than snapping to full speed', () => {
  const first = stepDragon({ y: 0.5, vy: 0 }, true, 1 / 60)
  const second = stepDragon(first, true, 1 / 60)
  assert.ok(first.vy > 0 && first.vy < SKIM_TUNING.maxRise / 4, 'one frame gives a gentle start')
  assert.ok(second.vy - first.vy <= SKIM_TUNING.thrust / 60 + 1e-9, 'acceleration is bounded')
  assert.deepEqual(stepDragon({ y: 0.5, vy: 0.2 }, true, 0), { y: 0.5, vy: 0.2 }, 'no time, no motion')
})

test('the tilt follows the vertical speed, nose up for a climb', () => {
  assert.ok(dragonTilt(1) > 0)
  assert.ok(dragonTilt(-1) < 0)
  assert.ok(dragonTilt(100) <= 0.5 && dragonTilt(-100) >= -0.45)
})

test('the scroll speeds up over the round, and the first three seconds are hazard-free', () => {
  assert.equal(scrollSpeed(0), SKIM_TUNING.scrollStart)
  assert.equal(scrollSpeed(SKIM_TUNING.rampSeconds + 5), SKIM_TUNING.scrollEnd)
  assert.ok(scrollSpeed(10) > scrollSpeed(2))
  assert.ok(hazardGap(SKIM_TUNING.hazardGrace) > hazardGap(SKIM_TUNING.rampSeconds), 'hazards come quicker late on')
  assert.equal(SKIM_TUNING.hazardGrace, 3)
})

test('dew comes in four patterns that together hold more drops than the goal, so a few can be missed', () => {
  const patterns = dewPatterns(() => 0.5)
  assert.equal(patterns.length, DEW_PATTERN_TIMES.length)
  assert.deepEqual(patterns.map((pattern) => pattern.shape), ['line', 'wave', 'arc', 'wave'])
  const drops = patterns.reduce((total, pattern) => total + pattern.drops.length, 0)
  assert.ok(drops >= CARE_GAME_RULES.skim.goal + 5, `${drops} drops for a goal of ${CARE_GAME_RULES.skim.goal}`)
  for (const pattern of patterns) {
    assert.equal(pattern.drops[0].dx, 0, 'a pattern enters from its x')
    for (const drop of pattern.drops) assert.ok(drop.y > 0.2 && drop.y < SKIM_TUNING.ceilingY, 'every drop is reachable')
  }
  assert.ok(DEW_PATTERN_TIMES.every((at, index) => index === 0 || at > DEW_PATTERN_TIMES[index - 1] + 2), 'patterns are spread out')
})

test('dew shapes read as lines, waves and arcs', () => {
  const line = dewShape('line', 0.7)
  assert.ok(line.every((drop) => drop.y === 0.7), 'a line is level')
  const wave = dewShape('wave', 0.7)
  assert.ok(Math.max(...wave.map((drop) => drop.y)) > 0.7 && Math.min(...wave.map((drop) => drop.y)) < 0.7, 'a wave swings both ways')
  const arc = dewShape('arc', 0.7)
  assert.ok(arc[2].y > arc[0].y && arc[2].y > arc[5].y, 'an arc peaks in the middle')
})

test('hazards come in three kinds, chosen from one roll', () => {
  assert.equal(hazardKind(0), 'cattail')
  assert.equal(hazardKind(0.5), 'fish')
  assert.equal(hazardKind(0.99), 'fluff')
})

test('a fish leap rises and falls back to the water, and a cattail rises out of it', () => {
  assert.equal(fishLift(0), 0)
  assert.equal(fishLift(1), 0)
  assert.ok(Math.abs(fishLift(0.5) - SKIM_TUNING.fishPeak) < 1e-9, 'the peak is in the middle')
  assert.equal(cattailHeight(0), 0, 'a cattail is hidden at first')
  assert.equal(cattailHeight(1), SKIM_TUNING.cattailTop)
  assert.equal(cattailRise(0.15, 0.3), 0.5)
  assert.equal(cattailRise(9, 0.3), 1)
})

test('hits: a dew drop within reach, a bonk inside a fluff clump, and a cattail reed', () => {
  const reach = SKIM_TUNING.pickupReach - SKIM_TUNING.dewRadius
  assert.ok(touchesCircle(0, 0.5, reach, 0.1, 0.5, SKIM_TUNING.dewRadius), 'a drop right on the dragonfly is caught')
  assert.ok(!touchesCircle(0, 0.5, reach, 0.4, 0.5, SKIM_TUNING.dewRadius), 'a drop far off is not')
  assert.ok(touchesCircle(0, 0.5, SKIM_TUNING.dragonRadius, 0.1, 0.5, SKIM_TUNING.fluffRadius), 'fluff bonks')
  assert.ok(touchesCattail(0, 0.5, SKIM_TUNING.dragonRadius, 0.02, SKIM_TUNING.cattailTop), 'a reed bonks a dragonfly flying through it')
  assert.ok(!touchesCattail(0, 0.9, SKIM_TUNING.dragonRadius, 0.0, SKIM_TUNING.cattailTop), 'a dragonfly above a reed is safe')
  assert.ok(!touchesCattail(0, 0.2, SKIM_TUNING.dragonRadius, 0.0, 0), 'a reed still under the water cannot be hit')
})

test('the skim rules are the ones the card advertises: eighteen dew, three hearts, twenty-two seconds', () => {
  assert.deepEqual(CARE_GAME_RULES.skim, { goal: 18, hearts: 3, misses: 0, seconds: 22 })
})

