import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-breakout.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const breakout = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  BREAKOUT_AUTO_LAUNCH, BREAKOUT_BALL_RADIUS, BREAKOUT_DEPTH, BREAKOUT_HALF_WIDTH, BREAKOUT_PADDLE_HALF, BREAKOUT_START_SPEED,
  BREAKOUT_TOP_SPEED, breakoutBounce, breakoutBugs, breakoutSpeed, createBreakoutField,
} = breakout
const rulesBuild = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from(rulesBuild.outputFiles[0].text).toString('base64')}`)

test('the bed holds exactly the round goal of bugs, inside the field and not overlapping', () => {
  const bugs = breakoutBugs()
  assert.equal(bugs.length, CARE_GAME_RULES.breakout.goal)
  for (const bug of bugs) {
    assert.ok(Math.abs(bug.x) + bug.halfWidth < BREAKOUT_HALF_WIDTH, `bug ${bug.id} across`)
    assert.ok(bug.y + bug.halfHeight < BREAKOUT_DEPTH && bug.y - bug.halfHeight > 1, `bug ${bug.id} up the bed`)
    assert.equal(bug.toughness, bug.kind === 'shell' ? 2 : 1)
  }
  for (const a of bugs) {
    for (const b of bugs) {
      if (a.id >= b.id) continue
      const apart = Math.abs(a.x - b.x) >= a.halfWidth + b.halfWidth || Math.abs(a.y - b.y) >= a.halfHeight + b.halfHeight
      assert.ok(apart, `bugs ${a.id} and ${b.id} overlap`)
    }
  }
})

test('the hoe sends the pebble straight from its middle and wide from its ends', () => {
  const middle = breakoutBounce(0)
  assert.equal(middle.x, 0)
  assert.equal(middle.y, 1)
  const right = breakoutBounce(1)
  const left = breakoutBounce(-1)
  assert.ok(right.x > 0.8 && right.y > 0.4, 'still climbs the bed')
  assert.ok(Math.abs(left.x + right.x) < 1e-9)
  assert.ok(breakoutSpeed(5) > BREAKOUT_START_SPEED)
  assert.equal(breakoutSpeed(500), BREAKOUT_TOP_SPEED)
})

test('a docked pebble rides the hoe and launches by itself', () => {
  const field = createBreakoutField()
  field.setPaddleTarget(0.8)
  field.step(0.05)
  assert.ok(field.docked)
  assert.equal(field.ball.x, field.paddleX)
  const events = []
  for (let frame = 0; frame < Math.ceil(BREAKOUT_AUTO_LAUNCH * 60) + 2; frame += 1) events.push(...field.step(1 / 60))
  assert.ok(events.some((event) => event.kind === 'launch'))
  assert.equal(field.docked, false)
  assert.ok(field.ball.vy > 0)
})

test('a pebble that misses the hoe is lost and a new one docks', () => {
  const field = createBreakoutField([])
  field.launch()
  // Run the hoe to the far side of wherever the pebble comes down.
  const events = []
  for (let frame = 0; frame < 60 * 8 && !events.some((event) => event.kind === 'lost'); frame += 1) {
    field.setPaddleTarget(field.ball.x > 0 ? -BREAKOUT_HALF_WIDTH : BREAKOUT_HALF_WIDTH)
    events.push(...field.step(1 / 60))
  }
  assert.ok(events.some((event) => event.kind === 'lost'))
  assert.ok(field.docked)
})

test('a shelled beetle cracks on the first hit and squashes on the second', () => {
  const shell = { id: 0, kind: 'shell', x: 0, y: 1.5, halfWidth: 0.2, halfHeight: 0.12, toughness: 2 }
  const field = createBreakoutField([shell])
  field.setPaddleTarget(0)
  field.step(0.01)
  const events = []
  for (let frame = 0; frame < 60 * 12 && field.hitsLeft(shell) > 0; frame += 1) {
    if (field.docked) field.launch()
    // Meet the pebble with the part of the hoe that sends it back toward the beetle.
    const ball = field.ball
    field.setPaddleTarget(ball.x - Math.max(-0.7, Math.min(0.7, (shell.x - ball.x) * 0.8)) * 0.3)
    events.push(...field.step(1 / 60))
  }
  const kinds = events.filter((event) => event.kind === 'crack' || event.kind === 'squash').map((event) => event.kind)
  assert.deepEqual(kinds, ['crack', 'squash'])
  assert.equal(field.squashed, 1)
})

test('a steady player clears the bed well inside the round', () => {
  const field = createBreakoutField()
  let seconds = 0
  let lost = 0
  while (field.squashed < field.bugs.length && seconds < CARE_GAME_RULES.breakout.seconds) {
    const ball = field.ball
    if (field.docked) field.launch()
    // Aim: meet the pebble with the part of the hoe that sends it toward the nearest bug left.
    const left = field.bugs.filter((bug) => field.hitsLeft(bug) > 0)
    const target = left.reduce((best, bug) => (Math.abs(bug.x - ball.x) < Math.abs(best.x - ball.x) ? bug : best), left[0])
    const lean = Math.max(-0.7, Math.min(0.7, (target.x - ball.x) * 0.8))
    field.setPaddleTarget(ball.x - lean * BREAKOUT_PADDLE_HALF)
    lost += field.step(1 / 60).filter((event) => event.kind === 'lost').length
    seconds += 1 / 60
  }
  assert.equal(field.squashed, field.bugs.length, `${field.squashed} squashed in ${seconds.toFixed(1)} s`)
  assert.ok(seconds < CARE_GAME_RULES.breakout.seconds * 0.85, `took ${seconds.toFixed(1)} s`)
  assert.ok(lost < CARE_GAME_RULES.breakout.hearts, `${lost} pebbles lost`)
})

test('the pebble never leaves the field', () => {
  const field = createBreakoutField()
  field.launch()
  for (let frame = 0; frame < 60 * 20; frame += 1) {
    field.setPaddleTarget(field.ball.x)
    field.step(1 / 60)
    const ball = field.ball
    assert.ok(Math.abs(ball.x) <= BREAKOUT_HALF_WIDTH - BREAKOUT_BALL_RADIUS + 1e-9)
    assert.ok(ball.y <= BREAKOUT_DEPTH - BREAKOUT_BALL_RADIUS + 1e-9)
  }
})
