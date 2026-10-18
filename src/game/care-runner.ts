/**
 * The pure rules of the runner steer (the vine's prune chore): the vine has sent
 * a runner sprawling across its bed, and you steer its growing tip, one cell at a
 * time, onto garden pegs that pin it down. Every peg it reaches pins it, and it
 * grows a cell longer and creeps a little quicker.
 *
 * - The tip keeps creeping the way it points; the arrow keys, a swipe or a tap
 *   toward where it should go turn it. Two turns can wait in line, so a quick
 *   left-then-up lands on consecutive cells.
 * - Creeping into the bed's edge or into the runner itself tangles it (a heart).
 *   The runner stops for a beat and doesn't move into the knot; then it carries
 *   on the way you point it, or, if that is still blocked, along the way with the
 *   most room (turning round on itself if it is boxed in).
 *
 * The bed is a grid: columns run left to right (0..RUNNER_COLS-1), rows from the
 * near edge to the far one (0..RUNNER_ROWS-1); headings use the pipes' sides
 * (N is far, E is right). Pure: no Three.js and no DOM, tested in
 * `tests/care-game-runner.test.mjs`.
 */

export const RUNNER_COLS = 13
export const RUNNER_ROWS = 9
export const RUNNER_START_LENGTH = 4
/** Seconds the tip takes to creep one cell, at first and at its quickest. */
export const RUNNER_STEP_SECONDS = 0.26
export const RUNNER_FASTEST_STEP = 0.17
export const RUNNER_STEP_PER_PEG = 0.012
/** Seconds the runner stops after a tangle. */
export const RUNNER_BONK_SECONDS = 0.7
/** A new peg lands at least this far (in cells, along the grid) from the tip. */
export const RUNNER_PEG_DISTANCE = 4

export type RunnerHeading = 0 | 1 | 2 | 3
export const RUNNER_N: RunnerHeading = 0
export const RUNNER_E: RunnerHeading = 1
export const RUNNER_S: RunnerHeading = 2
export const RUNNER_W: RunnerHeading = 3

export interface RunnerCell {
  readonly col: number
  readonly row: number
}

const DELTA: Readonly<Record<RunnerHeading, RunnerCell>> = {
  0: { col: 0, row: 1 },
  1: { col: 1, row: 0 },
  2: { col: 0, row: -1 },
  3: { col: -1, row: 0 },
}

export function runnerStep(cell: RunnerCell, heading: RunnerHeading): RunnerCell {
  return { col: cell.col + DELTA[heading].col, row: cell.row + DELTA[heading].row }
}

const opposite = (heading: RunnerHeading): RunnerHeading => ((heading + 2) % 4) as RunnerHeading

export function runnerStepSeconds(pegs: number): number {
  return Math.max(RUNNER_FASTEST_STEP, RUNNER_STEP_SECONDS - pegs * RUNNER_STEP_PER_PEG)
}

/**
 * The turn a tap asks for: (dx, dy) runs from the tip to the tap, in cells (dy
 * toward the far edge). A tip creeping across turns toward the tap's side of it
 * (up or down); one creeping up or down turns left or right. A tap straight
 * along its line asks nothing.
 */
export function runnerTurnToward(heading: RunnerHeading, dx: number, dy: number): RunnerHeading | null {
  const across = heading === RUNNER_E || heading === RUNNER_W
  const lean = across ? dy : dx
  if (Math.abs(lean) < 0.35) return null
  if (across) return lean > 0 ? RUNNER_N : RUNNER_S
  return lean > 0 ? RUNNER_E : RUNNER_W
}

export type RunnerEvent =
  | { readonly kind: 'creep' }
  | { readonly kind: 'peg'; readonly col: number; readonly row: number; readonly length: number }
  | { readonly kind: 'tangle'; readonly col: number; readonly row: number; readonly into: 'edge' | 'runner' }
  /** After a tangle the runner set off a way you didn't point it (or turned round). */
  | { readonly kind: 'unknot'; readonly heading: RunnerHeading; readonly reversed: boolean }

export interface RunnerBed {
  /** The runner, tip first. */
  readonly cells: readonly RunnerCell[]
  /** Where each cell was before the last creep (the same cell for one that didn't move). */
  readonly from: readonly RunnerCell[]
  /** How far through its creep the runner is, 0..1, for drawing it between cells. */
  readonly progress: number
  readonly heading: RunnerHeading
  readonly peg: RunnerCell | null
  readonly pegs: number
  /** Seconds left of a tangle's stop (0 while creeping). */
  readonly bonk: number
  /** Ask for a turn; it waits in line behind any other. Returns false if ignored. */
  turn(heading: RunnerHeading): boolean
  step(deltaSeconds: number): RunnerEvent[]
}

/** Where the runner starts: tip first, and the way it creeps. Along the middle row, heading right, by default. */
export interface RunnerStart {
  readonly cells: readonly RunnerCell[]
  readonly heading: RunnerHeading
}

export function createRunnerBed(random: () => number = Math.random, start?: RunnerStart): RunnerBed {
  const row = Math.floor(RUNNER_ROWS / 2)
  let cells: RunnerCell[] = start ? start.cells.map((cell) => ({ ...cell })) : Array.from({ length: RUNNER_START_LENGTH }, (_, index) => ({ col: RUNNER_START_LENGTH - 1 - index, row }))
  let from: RunnerCell[] = cells.map((cell) => (start ? { ...cell } : { ...cell, col: cell.col - 1 }))
  let heading: RunnerHeading = start?.heading ?? RUNNER_E
  const queue: RunnerHeading[] = []
  let grow = 0
  let pegs = 0
  let clock = 0
  let bonk = 0
  let peg: RunnerCell | null = null

  const inBed = (cell: RunnerCell): boolean => cell.col >= 0 && cell.col < RUNNER_COLS && cell.row >= 0 && cell.row < RUNNER_ROWS
  /** Whether the runner covers a cell after this creep (its tail moves away unless it is growing). */
  const onRunner = (cell: RunnerCell): boolean => {
    const reach = grow > 0 ? cells.length : cells.length - 1
    for (let index = 0; index < reach; index += 1) if (cells[index].col === cell.col && cells[index].row === cell.row) return true
    return false
  }
  const free = (cell: RunnerCell): boolean => inBed(cell) && !onRunner(cell)

  function placePeg(): void {
    const options: RunnerCell[] = []
    const head = cells[0]
    for (let r = 0; r < RUNNER_ROWS; r += 1) {
      for (let c = 0; c < RUNNER_COLS; c += 1) {
        if (cells.some((cell) => cell.col === c && cell.row === r)) continue
        if (Math.abs(c - head.col) + Math.abs(r - head.row) < RUNNER_PEG_DISTANCE) continue
        options.push({ col: c, row: r })
      }
    }
    peg = options.length > 0 ? options[Math.floor(random() * options.length) % options.length] : null
  }
  placePeg()

  /** How many free cells a flood from `cell` reaches (capped), to pick the roomiest way out of a knot. */
  function room(cell: RunnerCell): number {
    if (!free(cell)) return -1
    const seen = new Set([cell.row * RUNNER_COLS + cell.col])
    const queue = [cell]
    while (queue.length > 0 && seen.size < 40) {
      const at = queue.shift()!
      for (const way of [0, 1, 2, 3] as const) {
        const next = runnerStep(at, way)
        const key = next.row * RUNNER_COLS + next.col
        if (seen.has(key) || !free(next)) continue
        seen.add(key)
        queue.push(next)
      }
    }
    return seen.size
  }

  /** After a tangle: the way you point it, else straight on, else the roomiest side; turn round if boxed in. */
  function unknot(events: RunnerEvent[]): void {
    const wanted = queue.shift()
    queue.length = 0
    for (const way of [wanted, heading]) {
      if (way !== undefined && way !== opposite(heading) && free(runnerStep(cells[0], way))) {
        heading = way
        return
      }
    }
    const sides = [((heading + 1) % 4) as RunnerHeading, ((heading + 3) % 4) as RunnerHeading]
    const best = sides.map((way) => ({ way, room: room(runnerStep(cells[0], way)) })).sort((a, b) => b.room - a.room)[0]
    if (best.room > 0) {
      heading = best.way
      events.push({ kind: 'unknot', heading, reversed: false })
      return
    }
    // Boxed in: the tail end leads now.
    cells = [...cells].reverse()
    from = cells.map((cell) => ({ ...cell }))
    const [tip, neck] = cells
    heading = tip.col > neck.col ? RUNNER_E : tip.col < neck.col ? RUNNER_W : tip.row > neck.row ? RUNNER_N : RUNNER_S
    if (!free(runnerStep(tip, heading))) {
      const way = ([0, 1, 2, 3] as const).find((option) => free(runnerStep(tip, option)))
      if (way !== undefined) heading = way
    }
    events.push({ kind: 'unknot', heading, reversed: true })
  }

  function creep(events: RunnerEvent[]): void {
    const next = queue.shift()
    if (next !== undefined) heading = next
    const head = cells[0]
    const to = runnerStep(head, heading)
    if (!free(to)) {
      events.push({ kind: 'tangle', col: head.col, row: head.row, into: inBed(to) ? 'runner' : 'edge' })
      bonk = RUNNER_BONK_SECONDS
      queue.length = 0
      from = cells.map((cell) => ({ ...cell }))
      return
    }
    const old = cells
    cells = [to, ...(grow > 0 ? old : old.slice(0, -1))]
    from = [head, ...(grow > 0 ? [...old.slice(1), old[old.length - 1]] : old.slice(1))]
    if (grow > 0) grow -= 1
    events.push({ kind: 'creep' })
    if (peg && to.col === peg.col && to.row === peg.row) {
      pegs += 1
      grow += 1
      events.push({ kind: 'peg', col: to.col, row: to.row, length: cells.length + grow })
      placePeg()
    }
  }

  function stepOnce(dt: number, events: RunnerEvent[]): void {
    if (bonk > 0) {
      bonk = Math.max(0, bonk - dt)
      if (bonk === 0) {
        unknot(events)
        // Set straight off again rather than wait out a whole creep.
        clock = runnerStepSeconds(pegs)
      }
      return
    }
    clock += dt
    const seconds = runnerStepSeconds(pegs)
    if (clock >= seconds) {
      clock -= seconds
      creep(events)
    }
  }

  return {
    get cells() { return cells.map((cell) => ({ ...cell })) },
    get from() { return from.map((cell) => ({ ...cell })) },
    get progress() { return bonk > 0 ? 1 : Math.min(1, clock / runnerStepSeconds(pegs)) },
    get heading() { return heading },
    get peg() { return peg ? { ...peg } : null },
    get pegs() { return pegs },
    get bonk() { return bonk },
    turn(way): boolean {
      // Measured against the last turn in line (or the way it creeps): never straight back on itself.
      const last = queue.length > 0 ? queue[queue.length - 1] : heading
      if (way === last || way === opposite(last) || queue.length >= 2) {
        // While stopped in a knot, any way is a wish for where to go next.
        if (bonk > 0 && way !== opposite(heading)) {
          queue.length = 0
          queue.push(way)
          return true
        }
        return false
      }
      queue.push(way)
      return true
    },
    step(deltaSeconds): RunnerEvent[] {
      const events: RunnerEvent[] = []
      let remaining = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0
      while (remaining > 1e-9) {
        const dt = Math.min(1 / 240, remaining)
        remaining -= dt
        stepOnce(dt, events)
      }
      return events
    },
  }
}
