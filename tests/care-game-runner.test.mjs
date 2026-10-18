import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-runner.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const runner = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  RUNNER_BONK_SECONDS, RUNNER_COLS, RUNNER_E, RUNNER_FASTEST_STEP, RUNNER_N, RUNNER_PEG_DISTANCE, RUNNER_ROWS, RUNNER_S,
  RUNNER_START_LENGTH, RUNNER_STEP_SECONDS, RUNNER_W, createRunnerBed, runnerStep, runnerStepSeconds, runnerTurnToward,
} = runner
const rulesBuild = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from(rulesBuild.outputFiles[0].text).toString('base64')}`)

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Step until `count` creeps (or tangles) have happened; return every event. */
function creeps(bed, count) {
  const events = []
  for (let frame = 0; frame < 240 * 20; frame += 1) {
    events.push(...bed.step(1 / 240))
    if (events.filter((event) => event.kind === 'creep' || event.kind === 'tangle').length >= count) break
  }
  return events
}

const tip = (bed) => [bed.cells[0].col, bed.cells[0].row]

test('a tap turns the tip toward its side of the runner; a tap along its line asks nothing', () => {
  assert.equal(runnerTurnToward(RUNNER_E, 3, 2), RUNNER_N)
  assert.equal(runnerTurnToward(RUNNER_W, -1, -2), RUNNER_S)
  assert.equal(runnerTurnToward(RUNNER_N, 2, 5), RUNNER_E)
  assert.equal(runnerTurnToward(RUNNER_S, -1, -1), RUNNER_W)
  assert.equal(runnerTurnToward(RUNNER_E, 5, 0.1), null)
  assert.equal(runnerStepSeconds(0), RUNNER_STEP_SECONDS)
  assert.ok(runnerStepSeconds(3) < RUNNER_STEP_SECONDS)
  assert.equal(runnerStepSeconds(500), RUNNER_FASTEST_STEP)
})

test('the runner creeps a cell at a time along the middle row; turns wait in line and never double back', () => {
  const bed = createRunnerBed(seeded(1))
  assert.equal(bed.cells.length, RUNNER_START_LENGTH)
  assert.equal(bed.heading, RUNNER_E)
  const row = bed.cells[0].row
  creeps(bed, 1)
  assert.deepEqual(tip(bed), [RUNNER_START_LENGTH, row])
  assert.equal(bed.turn(RUNNER_W), false, 'not straight back on itself')
  assert.equal(bed.turn(RUNNER_E), false, 'already going that way')
  assert.equal(bed.turn(RUNNER_N), true)
  assert.equal(bed.turn(RUNNER_W), true, 'left, once it is going up')
  assert.equal(bed.turn(RUNNER_S), false, 'two in line at most')
  creeps(bed, 2)
  assert.deepEqual(tip(bed), [RUNNER_START_LENGTH - 1, row + 1])
  assert.equal(bed.heading, RUNNER_W)
  assert.equal(bed.cells.length, RUNNER_START_LENGTH, 'it only grows on a peg')
})

test('a peg grows the runner by a cell, quickens it and lands the next peg away from the tip', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const bed = createRunnerBed(seeded(seed))
    const peg = bed.peg
    assert.ok(peg)
    const [col, row] = tip(bed)
    assert.ok(Math.abs(peg.col - col) + Math.abs(peg.row - row) >= RUNNER_PEG_DISTANCE)
  }
  // Steer onto the first peg by hand: across to its column, then up or down to it.
  const bed = createRunnerBed(seeded(7))
  const events = []
  for (let frame = 0; frame < 240 * 20 && bed.pegs === 0; frame += 1) {
    const peg = bed.peg
    const head = bed.cells[0]
    if (head.col === peg.col && bed.heading !== (peg.row > head.row ? RUNNER_N : RUNNER_S)) bed.turn(peg.row > head.row ? RUNNER_N : RUNNER_S)
    if (head.row === peg.row && bed.heading !== (peg.col > head.col ? RUNNER_E : RUNNER_W)) bed.turn(peg.col > head.col ? RUNNER_E : RUNNER_W)
    events.push(...bed.step(1 / 240))
  }
  const pegged = events.find((event) => event.kind === 'peg')
  assert.ok(pegged, 'reached the peg')
  assert.equal(pegged.length, RUNNER_START_LENGTH + 1)
  creeps(bed, 1)
  assert.equal(bed.cells.length, RUNNER_START_LENGTH + 1, 'one cell longer after the next creep')
  assert.ok(bed.peg && !(bed.peg.col === pegged.col && bed.peg.row === pegged.row), 'a new peg')
})

test('creeping into the edge tangles it: it stops a beat, then sets off along the roomier side', () => {
  const bed = createRunnerBed(seeded(2))
  const row = bed.cells[0].row
  const events = []
  for (let frame = 0; frame < 240 * 10 && !events.some((event) => event.kind === 'tangle'); frame += 1) events.push(...bed.step(1 / 240))
  const tangle = events.find((event) => event.kind === 'tangle')
  assert.deepEqual([tangle.col, tangle.row, tangle.into], [RUNNER_COLS - 1, row, 'edge'])
  assert.ok(Math.abs(bed.bonk - RUNNER_BONK_SECONDS) < 0.01)
  assert.deepEqual(tip(bed), [RUNNER_COLS - 1, row], 'it did not move into the knot')
  const after = []
  for (let frame = 0; frame < Math.ceil((RUNNER_BONK_SECONDS + 0.05) * 240); frame += 1) after.push(...bed.step(1 / 240))
  assert.ok(after.some((event) => event.kind === 'unknot'))
  assert.ok(bed.heading === RUNNER_N || bed.heading === RUNNER_S)
  assert.ok(!after.some((event) => event.kind === 'tangle'), 'no second knot straight away')
})

test('a way chosen during the stop is the way it goes', () => {
  const bed = createRunnerBed(seeded(2))
  for (let frame = 0; frame < 240 * 10 && bed.bonk === 0; frame += 1) bed.step(1 / 240)
  assert.ok(bed.bonk > 0)
  assert.equal(bed.turn(RUNNER_S), true)
  creeps(bed, 1)
  assert.equal(bed.heading, RUNNER_S)
})

test('boxed in by its own runner and the edge, it turns round and the tail leads', () => {
  const cells = [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }, { col: 0, row: 1 }, { col: 0, row: 2 }]
  const bed = createRunnerBed(seeded(3), { cells, heading: RUNNER_W })
  const events = []
  for (let frame = 0; frame < 240 * 3 && !events.some((event) => event.kind === 'unknot'); frame += 1) events.push(...bed.step(1 / 240))
  const unknot = events.find((event) => event.kind === 'unknot')
  assert.ok(unknot && unknot.reversed)
  assert.deepEqual(tip(bed), [0, 2])
  assert.equal(bed.heading, RUNNER_N)
})

test('a steady player steering around the runner pins all eight pegs well inside the round, without a knot', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const bed = createRunnerBed(seeded(seed))
    let seconds = 0
    let tangles = 0
    while (bed.pegs < CARE_GAME_RULES.runner.goal && seconds < CARE_GAME_RULES.runner.seconds) {
      // Breadth-first to the peg around the runner; turn onto the first step of the way.
      const head = bed.cells[0]
      const body = new Set(bed.cells.slice(0, -1).map((cell) => cell.row * RUNNER_COLS + cell.col))
      const first = new Map()
      const queue = []
      for (const way of [RUNNER_N, RUNNER_E, RUNNER_S, RUNNER_W]) {
        const next = runnerStep(head, way)
        const key = next.row * RUNNER_COLS + next.col
        if (next.col < 0 || next.col >= RUNNER_COLS || next.row < 0 || next.row >= RUNNER_ROWS || body.has(key) || (way + 2) % 4 === bed.heading) continue
        first.set(key, way)
        queue.push(next)
      }
      let choice = null
      while (queue.length > 0) {
        const at = queue.shift()
        const key = at.row * RUNNER_COLS + at.col
        if (bed.peg && at.col === bed.peg.col && at.row === bed.peg.row) {
          choice = first.get(key)
          break
        }
        for (const way of [RUNNER_N, RUNNER_E, RUNNER_S, RUNNER_W]) {
          const next = runnerStep(at, way)
          const nextKey = next.row * RUNNER_COLS + next.col
          if (next.col < 0 || next.col >= RUNNER_COLS || next.row < 0 || next.row >= RUNNER_ROWS || body.has(nextKey) || first.has(nextKey)) continue
          first.set(nextKey, first.get(key))
          queue.push(next)
        }
      }
      if (choice !== null && choice !== bed.heading) bed.turn(choice)
      tangles += bed.step(1 / 60).filter((event) => event.kind === 'tangle').length
      seconds += 1 / 60
    }
    assert.equal(bed.pegs, CARE_GAME_RULES.runner.goal, `seed ${seed}: ${bed.pegs} pegs in ${seconds.toFixed(1)} s`)
    assert.equal(tangles, 0, `seed ${seed}`)
    assert.ok(seconds < CARE_GAME_RULES.runner.seconds * 0.6, `seed ${seed}: took ${seconds.toFixed(1)} s`)
  }
})
