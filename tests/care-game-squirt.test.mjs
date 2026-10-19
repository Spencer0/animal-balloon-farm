import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-squirt.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const squirt = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  SQUIRT_COLS, SQUIRT_LEAF_HITS, SQUIRT_LEAVES, SQUIRT_ROWS, SQUIRT_SEGMENTS, SQUIRT_STEP_SECONDS, SQUIRT_SUDS_SECONDS,
  createSquirtField, squirtLeaves,
} = squirt
const rulesBuild = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from(rulesBuild.outputFiles[0].text).toString('base64')}`)

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Hold the bottle's fire, so nothing gets squirted. */
function park(field) {
  field.setSquirting(false)
}

/** The cell the head is crawling into, read near the end of its step. */
function headCell(field) {
  const head = field.chains[0].segments[0]
  return [Math.round(head.x), Math.round(head.y)]
}

function stepFor(field, seconds) {
  const events = []
  for (let frame = 0; frame < Math.round(seconds * 240); frame += 1) events.push(...field.step(1 / 240))
  return events
}

test('the caterpillar is the round goal of bits long, and the leaves sit apart on the middle wires', () => {
  assert.equal(SQUIRT_SEGMENTS, CARE_GAME_RULES.squirt.goal)
  for (let seed = 1; seed <= 40; seed += 1) {
    const leaves = squirtLeaves(seeded(seed))
    assert.equal(leaves.length, SQUIRT_LEAVES)
    for (const leaf of leaves) {
      assert.ok(leaf.col >= 0 && leaf.col < SQUIRT_COLS)
      assert.ok(leaf.row >= 2 && leaf.row <= SQUIRT_ROWS - 3, `row ${leaf.row}`)
      assert.ok(!leaves.some((other) => other !== leaf && other.row === leaf.row && Math.abs(other.col - leaf.col) <= 1), 'never side by side')
    }
  }
  const field = createSquirtField(seeded(1))
  assert.equal(field.left, SQUIRT_SEGMENTS)
  assert.equal(field.chains.length, 1)
})

test('it crawls along the top wire, then drops a wire and turns at the side or a leaf', () => {
  const field = createSquirtField(seeded(2), { segments: 3, leaves: [{ col: 2, row: SQUIRT_ROWS - 2 }], enterCol: 8, enterDir: 1 })
  park(field)
  // Two cells right along the top wire, then the side: down a wire, now crawling left.
  stepFor(field, SQUIRT_STEP_SECONDS * 2.9)
  assert.deepEqual(headCell(field), [10, SQUIRT_ROWS - 1])
  stepFor(field, SQUIRT_STEP_SECONDS)
  assert.deepEqual(headCell(field), [10, SQUIRT_ROWS - 2])
  // Left along the second wire until the leaf at column 2: it stops at 3 and drops.
  stepFor(field, SQUIRT_STEP_SECONDS * 7)
  assert.deepEqual(headCell(field), [3, SQUIRT_ROWS - 2])
  stepFor(field, SQUIRT_STEP_SECONDS)
  assert.deepEqual(headCell(field), [3, SQUIRT_ROWS - 3])
})

test('a squirt bubbles a bit away, leaves suds, and the bits behind carry on as their own caterpillar', () => {
  const field = createSquirtField(seeded(3), { segments: 5, leaves: [], enterCol: 0, enterDir: 1 })
  park(field)
  // Let it file onto the top wire, then stand under the middle of it.
  stepFor(field, SQUIRT_STEP_SECONDS * 6 + 0.01)
  const middle = field.chains[0].segments[2]
  field.setSprayerTarget(Math.round(middle.x))
  field.setSquirting(true)
  const events = []
  for (let frame = 0; frame < 240 * 2 && !events.some((event) => event.kind === 'pop'); frame += 1) events.push(...field.step(1 / 240))
  const pop = events.find((event) => event.kind === 'pop')
  assert.ok(pop, 'a bit was squirted')
  assert.equal(field.popped, 1)
  assert.equal(field.left, 4)
  assert.ok(field.blocks.some((block) => block.kind === 'suds'), 'suds where it was')
  assert.ok(field.chains.length === 2 || field.chains.length === 1, 'split in two (or the head or tail went)')
  assert.ok(field.chains.every((chain) => chain.segments[0].head))
})

test('a caterpillar that crawls off the bottom wire drops on the vine and climbs back to the top', () => {
  const field = createSquirtField(seeded(4), { segments: 2, leaves: [] })
  park(field)
  let nibble = null
  for (let frame = 0; frame < 240 * 60 && !nibble; frame += 1) nibble = field.step(1 / 240).find((event) => event.kind === 'nibble') ?? null
  assert.ok(nibble, 'it reached the vine')
  assert.equal(nibble.length, 2)
  assert.equal(field.left, 2, 'none of it is lost')
  // It climbs in from above the trellis onto the top wire.
  assert.ok(field.chains[0].segments[0].y > SQUIRT_ROWS - 1)
  stepFor(field, SQUIRT_STEP_SECONDS * 0.9)
  assert.equal(headCell(field)[1], SQUIRT_ROWS - 1, 'back on the top wire')
})

test('a leaf takes three squirts; a blob of suds washes off with one and dries up on its own', () => {
  const field = createSquirtField(seeded(5), { segments: 1, leaves: [{ col: 0, row: 4 }, { col: 4, row: 6 }], enterCol: 10, enterDir: 1 })
  field.setSprayerTarget(4)
  const events = stepFor(field, 2)
  const leafHits = events.filter((event) => event.kind === 'leaf')
  assert.equal(leafHits.length, SQUIRT_LEAF_HITS)
  assert.equal(leafHits.at(-1).hits, 0)
  assert.ok(!field.blocks.some((block) => block.col === 4 && block.row === 6), 'knocked off')
  assert.ok(field.blocks.some((block) => block.col === 0 && block.row === 4), 'the other leaf is untouched')

  const sudsy = createSquirtField(seeded(6), { segments: 3, leaves: [], enterCol: 5, enterDir: 1 })
  park(sudsy)
  stepFor(sudsy, SQUIRT_STEP_SECONDS * 3 + 0.01)
  sudsy.setSprayerTarget(Math.round(sudsy.chains[0].segments[0].x))
  sudsy.setSquirting(true)
  let popped = false
  for (let frame = 0; frame < 480 && !popped; frame += 1) popped = sudsy.step(1 / 240).some((event) => event.kind === 'pop')
  park(sudsy)
  sudsy.setSprayerTarget(-1)
  assert.ok(sudsy.blocks.some((block) => block.kind === 'suds'))
  const dried = stepFor(sudsy, SQUIRT_SUDS_SECONDS + 0.2).filter((event) => event.kind === 'dry')
  assert.ok(dried.length >= 1, 'the suds dried up')
})

test('only one squirt flies at a time', () => {
  const field = createSquirtField(seeded(7), { leaves: [] })
  field.setSprayerTarget(0)
  const squirts = stepFor(field, 1).filter((event) => event.kind === 'squirt')
  // A squirt crosses the trellis in a little over half a second, and the next waits for it.
  assert.ok(squirts.length >= 1 && squirts.length <= 3, `${squirts.length} squirts in a second`)
})

test('a steady player squirts the whole caterpillar well inside the round', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const field = createSquirtField(seeded(seed))
    let seconds = 0
    let nibbles = 0
    while (field.left > 0 && seconds < CARE_GAME_RULES.squirt.seconds) {
      // Stand under the lowest bit on the trellis, a little ahead of it.
      const bits = field.chains.flatMap((chain) => chain.segments).filter((bit) => bit.y < SQUIRT_ROWS - 0.5)
      if (bits.length > 0) {
        const low = bits.reduce((best, bit) => (bit.y < best.y ? bit : best), bits[0])
        field.setSprayerTarget(low.x + low.heading * 0.5)
      }
      nibbles += field.step(1 / 60).filter((event) => event.kind === 'nibble').length
      seconds += 1 / 60
    }
    assert.equal(field.left, 0, `seed ${seed}: ${field.left} bits left after ${seconds.toFixed(1)} s`)
    assert.equal(field.popped, SQUIRT_SEGMENTS)
    assert.ok(nibbles < CARE_GAME_RULES.squirt.hearts, `seed ${seed}: ${nibbles} nibbles`)
    assert.ok(seconds < CARE_GAME_RULES.squirt.seconds * 0.75, `seed ${seed}: took ${seconds.toFixed(1)} s`)
  }
})
