/**
 * The pure rules of the pipe spin (the vine's water chore): a little grid of
 * wooden irrigation troughs lies between a hand pump and the thirsty vine, every
 * one turned the wrong way. Tap a trough to spin it a quarter turn; the water
 * starts after a moment and runs from the pump, trough by trough, and the vine
 * drinks when it pours out of the far side by its roots.
 *
 * - A trough the water has run into is full and can't be spun any more.
 * - The water needs an open end on the side it arrives at. If the next trough
 *   has none (or is a rock, or the board's edge), it leaks: a heart. The water
 *   sloshes back out of the last trough it filled, so that one can be spun again,
 *   and tries again after a short grace.
 * - Once every trough from the water to the vine connects, the water rushes.
 * - Three boards, one drink each; each board is a longer run and a quicker flow.
 *
 * The board is a grid: columns run left to right from the pump (0..PIPES_COLS-1),
 * rows from the near edge to the far one (0..PIPES_ROWS-1). Sides are N (far),
 * E (right), S (near) and W (left), and a quarter turn spins a trough clockwise
 * seen from above (N to E). Pure: no Three.js and no DOM, tested in
 * `tests/care-game-pipes.test.mjs`.
 */

export const PIPES_COLS = 6
export const PIPES_ROWS = 4
/** Boards in a round: one drink each (the round's goal). */
export const PIPES_BOARDS = 3

/** Seconds before the water starts on each board. */
export const PIPES_FLOW_DELAY: readonly number[] = [6, 5, 4.5]
/** Seconds the water takes to run through one trough on each board. */
export const PIPES_CELL_SECONDS: readonly number[] = [1.3, 1.15, 1]
/** How much faster the water runs once the way to the vine is all connected. */
export const PIPES_RUSH = 4
/** Seconds the water waits after a leak before it tries again. */
export const PIPES_LEAK_GRACE = 1.6
/** Seconds the vine drinks before the next board is laid. */
export const PIPES_POUR_SECONDS = 1.4
/** The shortest and longest run from the pump to the vine on each board. */
export const PIPES_RUN_LENGTH: readonly (readonly [number, number])[] = [[6, 8], [8, 10], [9, 12]]

export type PipeSide = 0 | 1 | 2 | 3
export const PIPE_N: PipeSide = 0
export const PIPE_E: PipeSide = 1
export const PIPE_S: PipeSide = 2
export const PIPE_W: PipeSide = 3

export type PipeKind = 'straight' | 'elbow' | 'cross' | 'rock'

/** Each kind's open ends with no turn, as a bitmask of sides (1 << side). */
const BASE_OPENINGS: Readonly<Record<PipeKind, number>> = {
  straight: (1 << PIPE_E) | (1 << PIPE_W),
  elbow: (1 << PIPE_N) | (1 << PIPE_E),
  cross: 0b1111,
  rock: 0,
}

/** The open ends of a trough of `kind` turned `turn` quarter turns clockwise, as a bitmask. */
export function pipeOpenings(kind: PipeKind, turn: number): number {
  const base = BASE_OPENINGS[kind]
  const quarter = ((turn % 4) + 4) % 4
  return ((base << quarter) | (base >> (4 - quarter))) & 0b1111
}

export function oppositeSide(side: PipeSide): PipeSide {
  return ((side + 2) % 4) as PipeSide
}

/** Where water arriving at `entry` leaves a trough, or null if it has no open end there. */
export function pipeExit(kind: PipeKind, turn: number, entry: PipeSide): PipeSide | null {
  const open = pipeOpenings(kind, turn)
  if (!(open & (1 << entry))) return null
  // A straight or a cross carries it straight through; an elbow round its bend.
  if (kind === 'elbow') {
    const other = open & ~(1 << entry)
    return (Math.log2(other) | 0) as PipeSide
  }
  return oppositeSide(entry)
}

/** The column and row one step through `side`. */
export function pipeStep(col: number, row: number, side: PipeSide): { readonly col: number; readonly row: number } {
  return { col: col + (side === PIPE_E ? 1 : side === PIPE_W ? -1 : 0), row: row + (side === PIPE_N ? 1 : side === PIPE_S ? -1 : 0) }
}

export interface PipeCell {
  readonly col: number
  readonly row: number
  readonly kind: PipeKind
  /** Quarter turns clockwise, 0..3. */
  readonly turn: number
  /** Full of water: it can't be spun. */
  readonly locked: boolean
}

/** One trough of water in the run, in the order the water filled them. */
export interface PipeFill {
  readonly col: number
  readonly row: number
  readonly entry: PipeSide
  readonly exit: PipeSide
  /** How far through the trough the water has run, 0..1. */
  readonly amount: number
}

export interface PipesLayout {
  /** The row the pump feeds into, at column 0 from the W side. */
  readonly sourceRow: number
  /** The row the vine drinks from, out of the last column's E side. */
  readonly targetRow: number
  /** Every cell, row by row from the near edge (index = row * PIPES_COLS + col). */
  readonly cells: ReadonlyArray<{ readonly kind: PipeKind; readonly turn: number }>
  /** The run the board was built around, pump to vine: a way that always exists. */
  readonly solution: ReadonlyArray<{ readonly col: number; readonly row: number; readonly entry: PipeSide; readonly exit: PipeSide }>
}

const inBoard = (col: number, row: number): boolean => col >= 0 && col < PIPES_COLS && row >= 0 && row < PIPES_ROWS

/**
 * Lay one board: a winding run from the pump to the vine within the board's
 * length, built from the troughs that fit it, with the rest of the board filled
 * with odd troughs and a few rocks, and every trough turned at random (most of
 * the run wrong).
 */
export function layPipesBoard(level: number, random: () => number = Math.random): PipesLayout {
  const [shortest, longest] = PIPES_RUN_LENGTH[Math.min(level, PIPES_RUN_LENGTH.length - 1)]
  const pick = (count: number): number => Math.min(count - 1, Math.floor(random() * count))
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const sourceRow = pick(PIPES_ROWS)
    // The vine sits off a different row from the pump when it can, so the run has to turn.
    let targetRow = pick(PIPES_ROWS)
    if (level > 0 && targetRow === sourceRow) targetRow = (targetRow + 1 + pick(PIPES_ROWS - 1)) % PIPES_ROWS
    const path = randomRun(sourceRow, targetRow, shortest, longest, random)
    if (!path) continue
    const cells: Array<{ kind: PipeKind; turn: number }> = []
    const onPath = new Map(path.map((step) => [step.row * PIPES_COLS + step.col, step]))
    let rocks = 0
    for (let row = 0; row < PIPES_ROWS; row += 1) {
      for (let col = 0; col < PIPES_COLS; col += 1) {
        const step = onPath.get(row * PIPES_COLS + col)
        if (step) {
          cells.push({ kind: step.exit === oppositeSide(step.entry) ? 'straight' : 'elbow', turn: pick(4) })
          continue
        }
        const roll = random()
        const rockChance = 0.06 + level * 0.04
        if (roll < rockChance && rocks < 2 + level) {
          rocks += 1
          cells.push({ kind: 'rock', turn: pick(4) })
        } else {
          cells.push({ kind: roll < rockChance + 0.07 ? 'cross' : roll < 0.6 ? 'elbow' : 'straight', turn: pick(4) })
        }
      }
    }
    // Most of the run starts wrong: spin a few of the lucky ones off true.
    const right = (step: (typeof path)[number]): boolean => {
      const cell = cells[step.row * PIPES_COLS + step.col]
      return pipeExit(cell.kind, cell.turn, step.entry) === step.exit
    }
    for (const step of path) {
      if (right(step) && random() < 0.75) cells[step.row * PIPES_COLS + step.col].turn += 1 + pick(2)
    }
    for (const cell of cells) cell.turn %= 4
    const layout: PipesLayout = { sourceRow, targetRow, cells, solution: path }
    // Never hand over a board the water would already cross.
    if (connectedFrom(layout.cells, targetRow, -1, sourceRow, PIPE_E)) continue
    return layout
  }
  throw new Error('could not lay a pipes board')
}

/** A self-avoiding run from the pump's cell to the vine's, its length within bounds. */
function randomRun(sourceRow: number, targetRow: number, shortest: number, longest: number, random: () => number): PipesLayout['solution'] | null {
  const visited = new Set<number>()
  const steps: Array<{ col: number; row: number; entry: PipeSide; exit: PipeSide }> = []
  let budget = 3000
  const walk = (col: number, row: number, entry: PipeSide): boolean => {
    if (--budget < 0) return false
    visited.add(row * PIPES_COLS + col)
    const length = steps.length + 1
    if (col === PIPES_COLS - 1 && row === targetRow && length >= shortest) {
      steps.push({ col, row, entry, exit: PIPE_E })
      return true
    }
    if (length < longest) {
      // Wander: up, down and right in a random order, and left now and then.
      const sides: PipeSide[] = [PIPE_N, PIPE_S, PIPE_E, PIPE_E, PIPE_W]
      for (let index = sides.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1))
        ;[sides[index], sides[swap]] = [sides[swap], sides[index]]
      }
      for (const side of new Set(sides)) {
        if (side === entry) continue
        const next = pipeStep(col, row, side)
        if (!inBoard(next.col, next.row) || visited.has(next.row * PIPES_COLS + next.col)) continue
        // Leave enough columns to reach the vine in what is left of the run.
        const left = longest - length - 1
        if (Math.abs(PIPES_COLS - 1 - next.col) + Math.abs(targetRow - next.row) > left) continue
        steps.push({ col, row, entry, exit: side })
        if (walk(next.col, next.row, oppositeSide(side))) return true
        steps.pop()
      }
    }
    visited.delete(row * PIPES_COLS + col)
    return false
  }
  return walk(0, sourceRow, PIPE_W) ? steps : null
}

/** Whether water leaving (col, row) through `side` runs through connected troughs all the way to the vine. */
function connectedFrom(cells: PipesLayout['cells'], targetRow: number, col: number, row: number, side: PipeSide): boolean {
  const seen = new Set<number>()
  for (let guard = 0; guard < PIPES_COLS * PIPES_ROWS * 2 + 2; guard += 1) {
    if (col === PIPES_COLS - 1 && row === targetRow && side === PIPE_E) return true
    const next = pipeStep(col, row, side)
    if (!inBoard(next.col, next.row)) return false
    const entry = oppositeSide(side)
    const key = (next.row * PIPES_COLS + next.col) * 4 + entry
    if (seen.has(key)) return false
    seen.add(key)
    const cell = cells[next.row * PIPES_COLS + next.col]
    const exit = pipeExit(cell.kind, cell.turn, entry)
    if (exit === null) return false
    col = next.col
    row = next.row
    side = exit
  }
  return false
}

export type PipesPhase = 'waiting' | 'flowing' | 'leaking' | 'pouring' | 'done'

export type PipesEvent =
  | { readonly kind: 'spin'; readonly col: number; readonly row: number }
  /** The water left the pump. */
  | { readonly kind: 'flow' }
  | { readonly kind: 'enter'; readonly col: number; readonly row: number }
  /** The way to the vine is all connected: the water rushes. */
  | { readonly kind: 'rush' }
  /** The water spilled out of (col, row) through `side` (col -1 is the pump's spout). */
  | { readonly kind: 'leak'; readonly col: number; readonly row: number; readonly side: PipeSide }
  /** The water reached the vine. */
  | { readonly kind: 'drink'; readonly board: number }
  /** A new board was laid. */
  | { readonly kind: 'board'; readonly board: number }

export interface PipesRun {
  readonly board: number
  readonly boards: number
  readonly sourceRow: number
  readonly targetRow: number
  readonly cells: readonly PipeCell[]
  cell(col: number, row: number): PipeCell | null
  readonly phase: PipesPhase
  /** Seconds until the water starts (while waiting) or tries again (after a leak). */
  readonly countdown: number
  /** The water in the troughs, in the order it filled them; the last may be part full. */
  readonly fills: readonly PipeFill[]
  readonly rushing: boolean
  /** The cell the water runs into next and the side it arrives at, or null when it leaves for the vine. */
  readonly next: { readonly col: number; readonly row: number; readonly entry: PipeSide } | null
  /** Whether the next cell takes the water as it is turned now. */
  readonly nextOpen: boolean
  /** The run the board was built around (for a debug script). */
  readonly solution: PipesLayout['solution']
  /** Spin the trough at (col, row) a quarter turn clockwise, if it can be. */
  spin(col: number, row: number): PipesEvent[]
  step(deltaSeconds: number): PipesEvent[]
}

export function createPipesRun(random: () => number = Math.random, boards = PIPES_BOARDS): PipesRun {
  let board = 0
  let layout = layPipesBoard(0, random)
  let cells: Array<{ kind: PipeKind; turn: number; locked: boolean }> = []
  let phase: PipesPhase = 'waiting'
  let countdown = 0
  /** Troughs with water in them; `amount` 1 except the one the water is running through. */
  let fills: Array<{ col: number; row: number; entry: PipeSide; exit: PipeSide; amount: number }> = []
  let rushing = false

  function lay(index: number): void {
    board = index
    if (index > 0) layout = layPipesBoard(index, random)
    cells = layout.cells.map((cell) => ({ ...cell, locked: false }))
    fills = []
    rushing = false
    phase = 'waiting'
    countdown = PIPES_FLOW_DELAY[Math.min(index, PIPES_FLOW_DELAY.length - 1)]
  }
  lay(0)

  const cellAt = (col: number, row: number) => (inBoard(col, row) ? cells[row * PIPES_COLS + col] : null)

  /** Where the water goes next: out of the last full trough (or the pump's spout). */
  function head(): { col: number; row: number; side: PipeSide } {
    const last = fills[fills.length - 1]
    return last ? { col: last.col, row: last.row, side: last.exit } : { col: -1, row: layout.sourceRow, side: PIPE_E }
  }

  function nextCell(): { col: number; row: number; entry: PipeSide } | null {
    const from = head()
    if (from.col === PIPES_COLS - 1 && from.row === layout.targetRow && from.side === PIPE_E) return null
    const to = pipeStep(from.col, from.row, from.side)
    return { col: to.col, row: to.row, entry: oppositeSide(from.side) }
  }

  function cellSeconds(): number {
    return PIPES_CELL_SECONDS[Math.min(board, PIPES_CELL_SECONDS.length - 1)] / (rushing ? PIPES_RUSH : 1)
  }

  /** Whether the way from the water to the vine is all connected; the water rushes (or the pump starts early) if so. */
  function checkRush(events: PipesEvent[]): void {
    const from = head()
    const connected = connectedFrom(cells, layout.targetRow, from.col, from.row, from.side)
    if (connected && !rushing) events.push({ kind: 'rush' })
    rushing = connected
  }

  /** The water reaches the end of the run so far: into the next trough, to the vine, or out onto the dirt. */
  function advance(events: PipesEvent[]): void {
    const to = nextCell()
    if (!to) {
      phase = 'pouring'
      countdown = PIPES_POUR_SECONDS
      events.push({ kind: 'drink', board })
      return
    }
    const cell = cellAt(to.col, to.row)
    const exit = cell ? pipeExit(cell.kind, cell.turn, to.entry) : null
    if (!cell || exit === null) {
      const from = head()
      events.push({ kind: 'leak', col: from.col, row: from.row, side: from.side })
      // The water sloshes back out of the last trough it filled, so that one can be spun again.
      const last = fills.pop()
      if (last) {
        const lastCell = cellAt(last.col, last.row)
        if (lastCell) lastCell.locked = false
      }
      phase = 'leaking'
      countdown = PIPES_LEAK_GRACE
      rushing = false
      return
    }
    cell.locked = true
    fills.push({ col: to.col, row: to.row, entry: to.entry, exit, amount: 0 })
    events.push({ kind: 'enter', col: to.col, row: to.row })
  }

  function stepOnce(dt: number, events: PipesEvent[]): void {
    if (phase === 'done') return
    if (phase === 'waiting' || phase === 'leaking') {
      // A run already connected to the vine doesn't keep the pump waiting.
      countdown -= dt * (rushing ? PIPES_RUSH * 2 : 1)
      if (countdown > 0) return
      countdown = 0
      if (phase === 'waiting' && fills.length === 0) events.push({ kind: 'flow' })
      phase = 'flowing'
      advance(events)
      if (phase === 'flowing') checkRush(events)
      else rushing = false
      return
    }
    if (phase === 'pouring') {
      countdown -= dt
      if (countdown > 0) return
      if (board + 1 >= boards) {
        phase = 'done'
        return
      }
      lay(board + 1)
      events.push({ kind: 'board', board })
      return
    }
    // Flowing: fill the trough the water is running through, then move on.
    const running = fills[fills.length - 1]
    if (!running) {
      advance(events)
      return
    }
    running.amount = Math.min(1, running.amount + dt / cellSeconds())
    if (running.amount >= 1) {
      advance(events)
      if (phase === 'flowing') checkRush(events)
    }
  }

  return {
    get board() { return board },
    boards,
    get sourceRow() { return layout.sourceRow },
    get targetRow() { return layout.targetRow },
    get cells(): PipeCell[] {
      return cells.map((cell, index) => ({ col: index % PIPES_COLS, row: Math.floor(index / PIPES_COLS), kind: cell.kind, turn: cell.turn, locked: cell.locked }))
    },
    cell(col, row): PipeCell | null {
      const cell = cellAt(col, row)
      return cell ? { col, row, kind: cell.kind, turn: cell.turn, locked: cell.locked } : null
    },
    get phase() { return phase },
    get countdown() { return countdown },
    get fills(): PipeFill[] { return fills.map((fill) => ({ ...fill })) },
    get rushing() { return rushing },
    get next() { return phase === 'pouring' || phase === 'done' ? null : nextCell() },
    get nextOpen(): boolean {
      const to = nextCell()
      if (!to) return true
      const cell = cellAt(to.col, to.row)
      return Boolean(cell && pipeExit(cell.kind, cell.turn, to.entry) !== null)
    },
    get solution() { return layout.solution },
    spin(col, row): PipesEvent[] {
      const cell = cellAt(col, row)
      if (!cell || cell.locked || cell.kind === 'rock' || cell.kind === 'cross' || phase === 'pouring' || phase === 'done') return []
      cell.turn = (cell.turn + 1) % 4
      const events: PipesEvent[] = [{ kind: 'spin', col, row }]
      checkRush(events)
      return events
    },
    step(deltaSeconds): PipesEvent[] {
      const events: PipesEvent[] = []
      let remaining = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0
      while (remaining > 1e-9) {
        const dt = Math.min(1 / 120, remaining)
        remaining -= dt
        stepOnce(dt, events)
      }
      return events
    },
  }
}
