import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/sim-clock.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const { createSimClock, SIM_HZ, SIM_MAX_STEPS_PER_FRAME } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const STEP = 1 / 15

test('the step length follows the rate', () => {
  assert.equal(SIM_HZ, 15)
  assert.equal(createSimClock().stepSeconds, STEP)
  assert.equal(createSimClock({ hz: 30 }).stepSeconds, 1 / 30)
})

test('a 60 Hz display runs the sim 15 times a second, always with 0 or 1 step a frame', () => {
  const clock = createSimClock()
  let total = 0
  const frames = 600
  for (let frame = 0; frame < frames; frame += 1) {
    const steps = clock.advance(1 / 60)
    assert.ok(steps === 0 || steps === 1, `frame ${frame} ran ${steps} steps`)
    total += steps
  }
  // Ten seconds of frames is ten seconds of sim time, to within one step.
  assert.ok(Math.abs(total - 150) <= 1, `expected ~150 steps, got ${total}`)
})

test('leftover time carries over instead of being lost', () => {
  const clock = createSimClock()
  // Half a step per frame: every second frame must produce one step.
  const first = clock.advance(STEP / 2)
  const second = clock.advance(STEP / 2)
  assert.equal(first, 0)
  assert.equal(second, 1)
})

test('a long stall runs at most the step cap and drops the backlog', () => {
  const clock = createSimClock()
  assert.equal(clock.advance(1.0), SIM_MAX_STEPS_PER_FRAME)
  // The backlog is gone: a normal frame afterwards runs at most one step.
  assert.ok(clock.advance(1 / 60) <= 1)
})

test('zero, negative and reset time run nothing', () => {
  const clock = createSimClock()
  assert.equal(clock.advance(0), 0)
  assert.equal(clock.advance(-1), 0)
  clock.advance(STEP * 0.9)
  clock.reset()
  assert.equal(clock.advance(STEP * 0.2), 0)
})

test('invalid options are refused', () => {
  assert.throws(() => createSimClock({ hz: 0 }))
  assert.throws(() => createSimClock({ maxStepsPerFrame: 0 }))
})
