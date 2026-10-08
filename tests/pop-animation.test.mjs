import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/pop-animation.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const pop = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('the animal swells before it pops, then is gone', () => {
  assert.equal(pop.popFrame(0).animalVisible, true)
  assert.ok(pop.popFrame(pop.POP_SWELL_SECONDS * 0.9).swell > 1.25)
  const gone = pop.popFrame(pop.POP_SWELL_SECONDS + 0.001)
  assert.equal(gone.animalVisible, false)
  assert.equal(gone.swell, 1)
  assert.ok(gone.burstAge !== null && gone.burstAge < 0.01)
})

test('the effect finishes, and not before every part has faded', () => {
  assert.equal(pop.popFrame(pop.POP_TOTAL_SECONDS - 0.05).finished, false)
  assert.equal(pop.popFrame(pop.POP_TOTAL_SECONDS + 0.01).finished, true)
})

test('bad times are treated as the start', () => {
  assert.equal(pop.popFrame(Number.NaN).swell >= 1, true)
  assert.equal(pop.popFrame(-5).animalVisible, true)
})

test('the shock ring grows and fades out', () => {
  const start = pop.ringState(0)
  const end = pop.ringState(0.5)
  assert.ok(end.scale > start.scale * 5)
  assert.ok(start.alpha > 0.8)
  assert.equal(end.alpha, 0)
})

test('shards fly out from the balloon, fall under gravity and never sink through the ground', () => {
  for (let index = 0; index < pop.POP_SHARD_COUNT; index += 1) {
    const early = pop.shardState(index, 0.1)
    const late = pop.shardState(index, 1.0)
    assert.ok(Math.hypot(late.x, late.z) > Math.hypot(early.x, early.z))
    for (let age = 0; age <= 1.4; age += 0.05) assert.ok(pop.shardState(index, age).y >= 0.02)
    assert.equal(pop.shardState(index, 1.3).scale, 0, 'a spent shard is hidden')
  }
})

test('shards leave in every direction, not one', () => {
  const headings = new Set()
  for (let index = 0; index < pop.POP_SHARD_COUNT; index += 1) {
    const s = pop.shardState(index, 0.3)
    headings.add(Math.round(Math.atan2(s.z, s.x) * 2))
  }
  assert.ok(headings.size >= 8, `only ${headings.size} headings`)
})

test('feathers puff out, then drift down and fade by the end', () => {
  const burst = pop.featherState(0, 0.4)
  const settled = pop.featherState(0, 1.7)
  assert.ok(settled.y < burst.y)
  assert.equal(pop.featherState(0, 2.0).alpha, 0)
  assert.ok(pop.featherState(0, 0.2).alpha > 0.9)
})

test('the scrap flutters down, lies flat, and is shrunk to nothing by the end', () => {
  const mid = pop.scrapState(0.4)
  const down = pop.scrapState(1.2)
  assert.ok(down.y < mid.y)
  assert.ok(down.y <= 0.05)
  assert.ok(down.flat > 0.99)
  assert.equal(down.scale, 1)
  assert.equal(pop.scrapState(pop.POP_BURST_SECONDS).scale, 0)
  for (let age = 0; age <= pop.POP_BURST_SECONDS; age += 0.05) assert.ok(pop.scrapState(age).y >= 0.04)
})

test('everything is cleaned away when the effect reports finished', () => {
  const age = pop.POP_BURST_SECONDS
  assert.equal(pop.scrapState(age).scale, 0)
  assert.equal(pop.featherState(pop.POP_FEATHER_COUNT - 1, age).alpha, 0)
  for (let index = 0; index < pop.POP_SHARD_COUNT; index += 1) assert.equal(pop.shardState(index, age).alpha, 0)
})
