import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/game/care-pipes.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const pipes = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const {
  PIPES_BOARDS, PIPES_COLS, PIPES_FLOW_DELAY, PIPES_LEAK_GRACE, PIPES_POUR_SECONDS, PIPES_ROWS, PIPES_RUN_LENGTH,
  PIPE_E, PIPE_N, PIPE_S, PIPE_W, createPipesRun, layPipesBoard, oppositeSide, pipeExit, pipeOpenings, pipeStep,
} = pipes
const rulesBuild = await build({ entryPoints: ['src/game/care-minigames.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { CARE_GAME_RULES } = await import(`data:text/javascript;base64,${Buffer.from(rulesBuild.outputFiles[0].text).toString('base64')}`)

function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Step in small frames until an event of this kind happens; return every event seen. */
function stepUntil(game, kind, seconds = 30) {
  const events = []
  for (let frame = 0; frame < seconds * 60 && !events.some((event) => event.kind === kind); frame += 1) events.push(...game.step(1 / 60))
  return events
}

/** Whether the water from the pump would run all the way to the vine through these cells as turned. */
function connected(layout) {
  let col = -1
  let row = layout.sourceRow
  let side = PIPE_E
  for (let guard = 0; guard < 60; guard += 1) {
    if (col === PIPES_COLS - 1 && row === layout.targetRow && side === PIPE_E) return true
    const next = pipeStep(col, row, side)
    if (next.col < 0 || next.col >= PIPES_COLS || next.row < 0 || next.row >= PIPES_ROWS) return false
    const cell = layout.cells[next.row * PIPES_COLS + next.col]
    const exit = pipeExit(cell.kind, cell.turn, oppositeSide(side))
    if (exit === null) return false
    col = next.col
    row = next.row
    side = exit
  }
  return false
}

/** Spin every trough of the board's own run until it carries the water the right way. */
function solve(game) {
  for (const step of game.solution) {
    for (let turn = 0; turn < 4; turn += 1) {
      const cell = game.cell(step.col, step.row)
      if (pipeExit(cell.kind, cell.turn, step.entry) === step.exit) break
      game.spin(step.col, step.row)
    }
  }
}

test('a quarter turn spins a trough clockwise, and the water follows its bend', () => {
  assert.equal(pipeOpenings('straight', 0), (1 << PIPE_E) | (1 << PIPE_W))
  assert.equal(pipeOpenings('straight', 1), (1 << PIPE_N) | (1 << PIPE_S))
  assert.equal(pipeOpenings('elbow', 0), (1 << PIPE_N) | (1 << PIPE_E))
  assert.equal(pipeOpenings('elbow', 1), (1 << PIPE_E) | (1 << PIPE_S))
  assert.equal(pipeOpenings('elbow', 3), (1 << PIPE_W) | (1 << PIPE_N))
  assert.equal(pipeOpenings('rock', 2), 0)
  assert.equal(pipeExit('straight', 0, PIPE_W), PIPE_E)
  assert.equal(pipeExit('straight', 1, PIPE_W), null)
  assert.equal(pipeExit('elbow', 0, PIPE_N), PIPE_E)
  assert.equal(pipeExit('elbow', 0, PIPE_E), PIPE_N)
  assert.equal(pipeExit('elbow', 2, PIPE_W), PIPE_S)
  assert.equal(pipeExit('cross', 0, PIPE_S), PIPE_N, 'a cross carries it straight over')
  assert.equal(pipeExit('rock', 0, PIPE_W), null)
  assert.deepEqual(pipeStep(2, 1, PIPE_N), { col: 2, row: 2 })
  assert.equal(oppositeSide(PIPE_E), PIPE_W)
})

test('every board has a run from the pump to the vine, inside its length, that starts out broken', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const random = seeded(seed)
    for (let level = 0; level < PIPES_BOARDS; level += 1) {
      const layout = layPipesBoard(level, random)
      const run = layout.solution
      const [shortest, longest] = PIPES_RUN_LENGTH[level]
      assert.ok(run.length >= shortest && run.length <= longest, `seed ${seed} board ${level}: run of ${run.length}`)
      assert.deepEqual([run[0].col, run[0].row, run[0].entry], [0, layout.sourceRow, PIPE_W])
      const last = run[run.length - 1]
      assert.deepEqual([last.col, last.row, last.exit], [PIPES_COLS - 1, layout.targetRow, PIPE_E])
      if (level > 0) assert.notEqual(layout.sourceRow, layout.targetRow, 'later boards make the run turn')
      for (let index = 1; index < run.length; index += 1) {
        const to = pipeStep(run[index - 1].col, run[index - 1].row, run[index - 1].exit)
        assert.deepEqual([to.col, to.row], [run[index].col, run[index].row], `seed ${seed} board ${level}: run is joined`)
        assert.equal(run[index].entry, oppositeSide(run[index - 1].exit))
      }
      assert.equal(new Set(run.map((step) => step.row * PIPES_COLS + step.col)).size, run.length, 'the run never crosses itself')
      for (const step of run) {
        const cell = layout.cells[step.row * PIPES_COLS + step.col]
        assert.ok(cell.kind === 'straight' || cell.kind === 'elbow', `seed ${seed}: a ${cell.kind} on the run`)
        assert.ok([0, 1, 2, 3].some((turn) => pipeExit(cell.kind, turn, step.entry) === step.exit), `seed ${seed}: the trough can be turned to fit`)
      }
      assert.equal(layout.cells.length, PIPES_COLS * PIPES_ROWS)
      assert.equal(connected(layout), false, `seed ${seed} board ${level}: already connected`)
    }
  }
})

test('left alone, the water leaks out of the pump, costs a heart each time, and tries again after a grace', () => {
  const game = createPipesRun(seeded(3))
  assert.equal(game.phase, 'waiting')
  assert.ok(Math.abs(game.countdown - PIPES_FLOW_DELAY[0]) < 1e-9)
  // Turn the first trough so it can't take the water.
  const first = game.cell(0, game.sourceRow)
  while (pipeExit(first.kind, game.cell(0, game.sourceRow).turn, PIPE_W) !== null) game.spin(0, game.sourceRow)
  const events = stepUntil(game, 'leak', PIPES_FLOW_DELAY[0] + 1)
  assert.ok(events.some((event) => event.kind === 'flow'))
  const leak = events.find((event) => event.kind === 'leak')
  assert.deepEqual([leak.col, leak.row, leak.side], [-1, game.sourceRow, PIPE_E])
  assert.equal(game.phase, 'leaking')
  const again = stepUntil(game, 'leak', PIPES_LEAK_GRACE + 0.5)
  assert.equal(again.filter((event) => event.kind === 'leak').length, 1, 'one more leak once the grace is over')
})

test('a full trough cannot be spun; a leak sloshes the water back out of the last one so it can', () => {
  const game = createPipesRun(seeded(11))
  solve(game)
  // Break the run two troughs in, after the water has filled the first.
  const [first, second] = game.solution
  stepUntil(game, 'enter', 10)
  assert.ok(game.cell(first.col, first.row).locked)
  assert.deepEqual(game.spin(first.col, first.row), [], 'a full trough stays put')
  game.spin(second.col, second.row)
  if (pipeExit(game.cell(second.col, second.row).kind, game.cell(second.col, second.row).turn, second.entry) !== null) game.spin(second.col, second.row)
  if (pipeExit(game.cell(second.col, second.row).kind, game.cell(second.col, second.row).turn, second.entry) !== null) game.spin(second.col, second.row)
  const events = stepUntil(game, 'leak', 5)
  const leak = events.find((event) => event.kind === 'leak')
  assert.ok(leak, 'the broken trough leaks')
  assert.deepEqual([leak.col, leak.row, leak.side], [first.col, first.row, first.exit])
  assert.equal(game.cell(first.col, first.row).locked, false, 'the water backed out of the first trough')
  assert.equal(game.fills.length, 0)
})

test('a connected run starts the pump early, rushes to the vine, and the next board follows the drink', () => {
  const game = createPipesRun(seeded(5))
  const events = []
  solve(game)
  assert.ok(game.rushing, 'the run is connected before the water starts')
  let seconds = 0
  while (!events.some((event) => event.kind === 'drink') && seconds < 20) {
    events.push(...game.step(1 / 60))
    seconds += 1 / 60
  }
  assert.ok(events.some((event) => event.kind === 'drink'))
  assert.ok(seconds < PIPES_FLOW_DELAY[0], `drank after ${seconds.toFixed(2)} s, before the pump's own start`)
  assert.equal(game.phase, 'pouring')
  const next = stepUntil(game, 'board', PIPES_POUR_SECONDS + 0.2)
  assert.deepEqual(next.find((event) => event.kind === 'board'), { kind: 'board', board: 1 })
  assert.equal(game.fills.length, 0)
  assert.ok(game.cells.every((cell) => !cell.locked))
})

test('after the last drink the game is done', () => {
  const game = createPipesRun(seeded(8))
  for (let board = 0; board < PIPES_BOARDS; board += 1) {
    solve(game)
    stepUntil(game, 'drink', 30)
    assert.equal(game.board, board)
    stepUntil(game, 'board', PIPES_POUR_SECONDS + 0.2)
  }
  assert.equal(game.phase, 'done')
  assert.deepEqual(game.step(1), [])
})

test('a player spinning one trough every 0.35 s drinks three times well inside the round, without a leak', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const game = createPipesRun(seeded(seed))
    let seconds = 0
    let drinks = 0
    let leaks = 0
    let thinking = 0
    while (drinks < PIPES_BOARDS && seconds < CARE_GAME_RULES.pipes.seconds) {
      thinking += 1 / 60
      if (thinking >= 0.35) {
        // The first trough along the run, from the pump, that is turned wrong.
        const wrong = game.solution.find((step) => {
          const cell = game.cell(step.col, step.row)
          return !cell.locked && pipeExit(cell.kind, cell.turn, step.entry) !== step.exit
        })
        if (wrong) {
          game.spin(wrong.col, wrong.row)
          thinking = 0
        }
      }
      for (const event of game.step(1 / 60)) {
        if (event.kind === 'drink') drinks += 1
        if (event.kind === 'leak') leaks += 1
      }
      seconds += 1 / 60
    }
    assert.equal(drinks, PIPES_BOARDS, `seed ${seed}: ${drinks} drinks in ${seconds.toFixed(1)} s`)
    assert.equal(leaks, 0, `seed ${seed}`)
    assert.ok(seconds < CARE_GAME_RULES.pipes.seconds * 0.7, `seed ${seed}: took ${seconds.toFixed(1)} s`)
  }
})
