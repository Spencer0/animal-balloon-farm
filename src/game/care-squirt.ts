/**
 * The pure rules of the caterpillar squirt (the vine's pest chore): a long
 * caterpillar crawls along the wires of the vine's trellis, row by row, down
 * toward the vine at its foot. Slide the spray bottle along the ground under it;
 * the bottle squirts soapy water straight up by itself, one squirt at a time.
 *
 * - The caterpillar crawls along a wire until it meets a leaf, a blob of suds or
 *   the trellis's side, then drops to the wire below and turns round.
 * - A squirt that hits a bit of the caterpillar bubbles it away (a hit) and
 *   leaves a blob of suds on the wire, which the caterpillar won't crawl
 *   through. The bits behind it carry on as a caterpillar of their own.
 * - A squirt that hits a leaf knocks it about; three knock it off. A squirt
 *   washes a blob of suds away, and suds dry up on their own after a while.
 * - A caterpillar that crawls off the bottom wire drops onto the vine (a heart)
 *   and climbs back to the top to try again.
 *
 * The trellis is a grid: columns run left to right (0..SQUIRT_COLS-1) and rows
 * from the bottom wire up (0..SQUIRT_ROWS-1); positions are in cell units, a
 * cell's centre on whole numbers. The bottle runs along y = SQUIRT_SPRAYER_Y,
 * under the bottom wire. Pure: no Three.js and no DOM, tested in
 * `tests/care-game-squirt.test.mjs`.
 */

export const SQUIRT_COLS = 11
export const SQUIRT_ROWS = 14
/** Bits in the caterpillar: the round's goal. */
export const SQUIRT_SEGMENTS = 12
export const SQUIRT_LEAVES = 11
export const SQUIRT_LEAF_HITS = 3
/** Seconds a blob of suds lasts before it dries up. */
export const SQUIRT_SUDS_SECONDS = 9
/** Seconds the caterpillar takes to crawl one cell, at first and at its quickest. */
export const SQUIRT_STEP_SECONDS = 0.18
export const SQUIRT_FASTEST_STEP = 0.13
/** A squirt's speed, in cells per second, and the shortest gap between two. */
export const SQUIRT_SHOT_SPEED = 34
export const SQUIRT_RELOAD = 0.1
/** How fast the bottle slides toward the pointer, and under the arrow keys, in cells per second. */
export const SQUIRT_SPRAYER_SPEED = 24
export const SQUIRT_KEY_SPEED = 10
export const SQUIRT_SPRAYER_Y = -1.2
/** How close (in cells) a squirt must pass a bit of caterpillar to hit it. */
export const SQUIRT_HIT_RADIUS = 0.48

export interface SquirtSegment {
  readonly x: number
  readonly y: number
  readonly head: boolean
  /** Which way it is crawling: -1 left, 1 right, 0 dropping a wire. */
  readonly heading: number
}

export interface SquirtChain {
  readonly id: number
  readonly segments: readonly SquirtSegment[]
}

export interface SquirtBlock {
  readonly col: number
  readonly row: number
  readonly kind: 'leaf' | 'suds'
  /** Squirts it takes yet. */
  readonly hits: number
  /** Suds only: seconds until it dries up. */
  readonly ttl: number
}

export type SquirtEvent =
  | { readonly kind: 'squirt'; readonly x: number }
  | { readonly kind: 'pop'; readonly x: number; readonly y: number; readonly head: boolean }
  | { readonly kind: 'leaf'; readonly col: number; readonly row: number; readonly hits: number }
  | { readonly kind: 'wash'; readonly col: number; readonly row: number }
  | { readonly kind: 'dry'; readonly col: number; readonly row: number }
  | { readonly kind: 'nibble'; readonly x: number; readonly length: number }
  | { readonly kind: 'miss'; readonly x: number }

export interface SquirtField {
  readonly chains: readonly SquirtChain[]
  readonly blocks: readonly SquirtBlock[]
  /** The squirt in flight, or null. */
  readonly shot: { readonly x: number; readonly y: number } | null
  readonly sprayerX: number
  /** Bits squirted so far. */
  readonly popped: number
  /** Bits still crawling. */
  readonly left: number
  /** Slide the bottle toward a place across the trellis (clamped). */
  setSprayerTarget(x: number): void
  /** Hold a key: -1 left, 1 right, 0 none. The keys win over the pointer while held. */
  setKeyDirection(direction: number): void
  /** The bottle squirts by itself while this is on (it starts on). */
  setSquirting(on: boolean): void
  step(deltaSeconds: number): SquirtEvent[]
}

interface Cell {
  col: number
  row: number
}

interface MutableChain {
  readonly id: number
  /** Each bit's cell now and the cell it is crawling from. */
  cells: Cell[]
  from: Cell[]
  /** Which way the head crawls along a wire. */
  dir: number
}

const key = (col: number, row: number): number => row * 64 + col

/** The leaves' places: scattered on the middle wires, never two side by side. */
export function squirtLeaves(random: () => number, count = SQUIRT_LEAVES): Cell[] {
  const leaves: Cell[] = []
  const taken = new Set<number>()
  for (let attempt = 0; attempt < 500 && leaves.length < count; attempt += 1) {
    const col = Math.floor(random() * SQUIRT_COLS) % SQUIRT_COLS
    const row = 2 + (Math.floor(random() * (SQUIRT_ROWS - 4)) % (SQUIRT_ROWS - 4))
    if (taken.has(key(col, row)) || taken.has(key(col - 1, row)) || taken.has(key(col + 1, row))) continue
    taken.add(key(col, row))
    leaves.push({ col, row })
  }
  return leaves
}

export function squirtStepSeconds(popped: number): number {
  return Math.max(SQUIRT_FASTEST_STEP, SQUIRT_STEP_SECONDS - popped * 0.004)
}

export interface SquirtSetup {
  readonly segments?: number
  /** Where the leaves sit; scattered at random when unset. */
  readonly leaves?: readonly Cell[]
  /** The column the caterpillar files down at and the way it first crawls; random when unset. */
  readonly enterCol?: number
  readonly enterDir?: number
}

export function createSquirtField(random: () => number = Math.random, setup: SquirtSetup = {}): SquirtField {
  const segments = setup.segments ?? SQUIRT_SEGMENTS
  const blocks = new Map<number, { col: number; row: number; kind: 'leaf' | 'suds'; hits: number; ttl: number }>()
  for (const leaf of setup.leaves ?? squirtLeaves(random)) blocks.set(key(leaf.col, leaf.row), { ...leaf, kind: 'leaf', hits: SQUIRT_LEAF_HITS, ttl: Infinity })
  const chains: MutableChain[] = []
  let nextChainId = 1
  let popped = 0
  let stepClock = 0
  let sprayerX = (SQUIRT_COLS - 1) / 2
  let sprayerTarget = sprayerX
  let keyDirection = 0
  let shot: { x: number; y: number } | null = null
  let reload = 0.6
  let squirting = true

  /** A caterpillar of `length` bits filing down onto the top wire at a column, crawling `dir`. */
  function enter(length: number, col: number, dir: number): void {
    const cells = Array.from({ length }, (_, index) => ({ col, row: SQUIRT_ROWS - 1 + index }))
    chains.push({ id: nextChainId++, cells, from: cells.map((cell) => ({ ...cell, row: cell.row + 1 })), dir })
  }
  enter(segments, setup.enterCol ?? Math.floor(SQUIRT_COLS / 2), setup.enterDir ?? (random() < 0.5 ? -1 : 1))

  const blocked = (col: number, row: number): boolean => col < 0 || col >= SQUIRT_COLS || blocks.has(key(col, row))

  /** Every caterpillar crawls one cell: each head along its wire or down, each bit into the cell ahead of it. */
  function crawl(events: SquirtEvent[]): void {
    for (const chain of [...chains]) {
      const head = chain.cells[0]
      let next: Cell
      // Above the trellis (still filing in), the head comes straight down.
      if (head.row >= SQUIRT_ROWS) next = { col: head.col, row: head.row - 1 }
      else if (!blocked(head.col + chain.dir, head.row)) next = { col: head.col + chain.dir, row: head.row }
      else {
        chain.dir = -chain.dir
        next = { col: head.col, row: head.row - 1 }
      }
      if (next.row < 0) {
        // Off the bottom wire: it drops onto the vine and climbs back up to the top.
        chains.splice(chains.indexOf(chain), 1)
        events.push({ kind: 'nibble', x: head.col, length: chain.cells.length })
        enter(chain.cells.length, Math.floor(random() * SQUIRT_COLS) % SQUIRT_COLS, random() < 0.5 ? -1 : 1)
        continue
      }
      chain.from = chain.cells.map((cell) => ({ ...cell }))
      chain.cells = [next, ...chain.cells.slice(0, -1).map((cell) => ({ ...cell }))]
    }
  }

  /** Where a bit is drawn, part way from its last cell to its current one. */
  function place(chain: MutableChain, index: number, t: number): { x: number; y: number } {
    const to = chain.cells[index]
    const from = chain.from[index]
    return { x: from.col + (to.col - from.col) * t, y: from.row + (to.row - from.row) * t }
  }

  function popSegment(chain: MutableChain, index: number, at: { x: number; y: number }, events: SquirtEvent[]): void {
    const cell = chain.cells[index]
    const head = index === 0
    events.push({ kind: 'pop', x: at.x, y: at.y, head })
    popped += 1
    // Suds where it was (on the trellis only, and not over a leaf).
    if (cell.row >= 0 && cell.row < SQUIRT_ROWS && !blocks.has(key(cell.col, cell.row))) {
      blocks.set(key(cell.col, cell.row), { col: cell.col, row: cell.row, kind: 'suds', hits: 1, ttl: SQUIRT_SUDS_SECONDS })
    }
    // The bits behind carry on as a caterpillar of their own, its head where the next bit was,
    // crawling the way the caterpillar went along that wire: the head has turned once per wire it dropped since.
    const rest = chain.cells.slice(index + 1)
    const restFrom = chain.from.slice(index + 1)
    if (rest.length > 0) {
      const moving = rest[0].col - restFrom[0].col
      const drops = Math.max(0, Math.min(rest[0].row, SQUIRT_ROWS - 1) - chain.cells[0].row)
      const dir = moving !== 0 ? Math.sign(moving) : chain.dir * (drops % 2 === 0 ? 1 : -1)
      chains.push({ id: nextChainId++, cells: rest, from: restFrom, dir })
    }
    chain.cells = chain.cells.slice(0, index)
    chain.from = chain.from.slice(0, index)
    if (chain.cells.length === 0) chains.splice(chains.indexOf(chain), 1)
  }

  function moveShot(dt: number, t: number, events: SquirtEvent[]): void {
    if (!shot) {
      reload -= dt
      if (reload > 0 || chains.length === 0 || !squirting) return
      shot = { x: sprayerX, y: SQUIRT_SPRAYER_Y + 0.4 }
      events.push({ kind: 'squirt', x: sprayerX })
    }
    const fromY = shot.y
    shot.y += SQUIRT_SHOT_SPEED * dt
    // The nearest thing the squirt passed this step: a bit of caterpillar, a leaf or suds.
    let best: { y: number; hit: () => void } | null = null
    for (const chain of chains) {
      chain.cells.forEach((_, index) => {
        const at = place(chain, index, t)
        // Bits still filing down from above the trellis are out of reach.
        if (at.y > SQUIRT_ROWS - 0.5) return
        if (Math.abs(at.x - shot!.x) > SQUIRT_HIT_RADIUS || at.y < fromY - SQUIRT_HIT_RADIUS || at.y > shot!.y + SQUIRT_HIT_RADIUS) return
        if (!best || at.y < best.y) best = { y: at.y, hit: () => popSegment(chain, index, at, events) }
      })
    }
    const col = Math.round(shot.x)
    for (const block of blocks.values()) {
      if (block.col !== col || block.row < fromY - 0.5 || block.row > shot.y + 0.5) continue
      if (!best || block.row < best.y) {
        best = {
          y: block.row,
          hit: () => {
            block.hits -= 1
            if (block.kind === 'suds' || block.hits <= 0) blocks.delete(key(block.col, block.row))
            if (block.kind === 'suds') events.push({ kind: 'wash', col: block.col, row: block.row })
            else events.push({ kind: 'leaf', col: block.col, row: block.row, hits: block.hits })
          },
        }
      }
    }
    const found = best as { y: number; hit: () => void } | null
    if (found) {
      found.hit()
      shot = null
      reload = SQUIRT_RELOAD
    } else if (shot.y > SQUIRT_ROWS + 0.5) {
      events.push({ kind: 'miss', x: shot.x })
      shot = null
      reload = SQUIRT_RELOAD
    }
  }

  function stepOnce(dt: number, events: SquirtEvent[]): void {
    if (keyDirection !== 0) sprayerTarget = sprayerX + keyDirection * SQUIRT_KEY_SPEED * dt
    sprayerTarget = Math.max(0, Math.min(SQUIRT_COLS - 1, sprayerTarget))
    const reach = (keyDirection !== 0 ? SQUIRT_KEY_SPEED : SQUIRT_SPRAYER_SPEED) * dt
    sprayerX += Math.max(-reach, Math.min(reach, sprayerTarget - sprayerX))
    for (const block of [...blocks.values()]) {
      if (block.kind !== 'suds') continue
      block.ttl -= dt
      if (block.ttl <= 0) {
        blocks.delete(key(block.col, block.row))
        events.push({ kind: 'dry', col: block.col, row: block.row })
      }
    }
    const seconds = squirtStepSeconds(popped)
    stepClock += dt
    if (stepClock >= seconds) {
      stepClock -= seconds
      crawl(events)
    }
    moveShot(dt, Math.min(1, stepClock / seconds), events)
  }

  return {
    get chains(): SquirtChain[] {
      const t = Math.min(1, stepClock / squirtStepSeconds(popped))
      return chains.map((chain) => ({
        id: chain.id,
        segments: chain.cells.map((cell, index) => {
          const from = chain.from[index]
          return { ...place(chain, index, t), head: index === 0, heading: cell.row !== from.row ? 0 : Math.sign(cell.col - from.col) }
        }),
      }))
    },
    get blocks(): SquirtBlock[] {
      return [...blocks.values()].map((block) => ({ ...block }))
    },
    get shot() { return shot ? { ...shot } : null },
    get sprayerX() { return sprayerX },
    get popped() { return popped },
    get left() { return chains.reduce((sum, chain) => sum + chain.cells.length, 0) },
    setSprayerTarget(x): void {
      if (Number.isFinite(x)) sprayerTarget = Math.max(0, Math.min(SQUIRT_COLS - 1, x))
    },
    setKeyDirection(direction): void {
      keyDirection = Math.sign(direction)
    },
    setSquirting(on): void {
      squirting = on
    },
    step(deltaSeconds): SquirtEvent[] {
      const events: SquirtEvent[] = []
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
