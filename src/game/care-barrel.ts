/**
 * The pure rules of the barrel climb (the root vegetable's water chore): a
 * gopher has stolen the farm's rain barrel and holed up at the top of a stack
 * of sloping planks, rolling barrels down at anyone who comes for it. A little
 * watering can climbs from the vegetable at the bottom, up the ladders, to the
 * rain barrel on its ledge, and brings the water down.
 *
 * - Floors are sloping planks, each open at one end, so a barrel rolls downhill
 *   along one, drops off its open end onto the next, and reverses. On the
 *   bottom plank it rolls out into the compost heap. Sometimes a barrel takes a
 *   ladder down instead.
 * - Each floor has one ladder up, at its high end, so the can walks every plank
 *   uphill into the oncoming barrels.
 * - The can walks, jumps and climbs. Jumping a barrel is safe; touching one is a
 *   harm (a heart), and the can blinks for a moment after.
 * - Every new floor the can reaches is a hit; the rain barrel's ledge is the
 *   last, so reaching it wins.
 *
 * Side view: x runs across (-HALF_WIDTH..HALF_WIDTH), y up. Pure: no Three.js
 * and no DOM, tested in `tests/care-game-barrel.test.mjs`.
 */

export const BARREL_HALF_WIDTH = 2.9

/** One plank: `y = base + slope * x` between `x0` and `x1`. */
export interface BarrelFloor {
  readonly index: number
  readonly x0: number
  readonly x1: number
  readonly base: number
  readonly slope: number
}

/** A ladder from one floor up to the next, at a place across. */
export interface BarrelLadder {
  readonly id: number
  readonly x: number
  readonly bottom: number
  readonly top: number
}

/**
 * The stack, bottom to top. Each plank leans down toward its open end, so
 * barrels zig-zag: the gopher rolls them left along the top plank, they drop
 * at its left end, roll right along the next, and so on, out into the compost
 * heap at the bottom left. The last floor is the rain barrel's ledge, under
 * which the barrels pass.
 */
export const BARREL_FLOORS: readonly BarrelFloor[] = [
  { index: 0, x0: -BARREL_HALF_WIDTH, x1: BARREL_HALF_WIDTH, base: 0, slope: 0.03 },
  { index: 1, x0: -BARREL_HALF_WIDTH, x1: 2.3, base: 1, slope: -0.05 },
  { index: 2, x0: -2.3, x1: BARREL_HALF_WIDTH, base: 2, slope: 0.05 },
  { index: 3, x0: -BARREL_HALF_WIDTH, x1: 2.3, base: 3, slope: -0.05 },
  { index: 4, x0: -2.3, x1: BARREL_HALF_WIDTH, base: 4, slope: 0.035 },
  { index: 5, x0: -0.95, x1: 0.85, base: 4.98, slope: 0 },
]
export const BARREL_TOP_FLOOR = BARREL_FLOORS.length - 1

/**
 * One ladder up from each floor, at the floor's high end, alternating sides.
 * The can arrives on a floor at its low end and walks uphill to the next
 * ladder, into the barrels rolling down at it, the way the old arcade climb goes.
 */
export const BARREL_LADDERS: readonly BarrelLadder[] = [
  { id: 0, x: 1.75, bottom: 0, top: 1 },
  { id: 1, x: -1.75, bottom: 1, top: 2 },
  { id: 2, x: 1.75, bottom: 2, top: 3 },
  { id: 3, x: -1.75, bottom: 3, top: 4 },
  { id: 4, x: 0.6, bottom: 4, top: 5 },
]

/** Where the can starts (bottom left, by the compost heap) and where the gopher rolls from. */
export const BARREL_START_X = -2.2
export const BARREL_GOPHER_X = 2.45
export const BARREL_SPAWN_X = 2.15
/** The rain barrel on the ledge. */
export const BARREL_RAIN_X = -0.35

/** The can: half its width and its height, and how it moves. */
export const BARREL_HERO_HALF = 0.11
export const BARREL_HERO_HEIGHT = 0.34
export const BARREL_WALK_SPEED = 1.35
export const BARREL_CLIMB_SPEED = 1.05
export const BARREL_GRAVITY = 9
export const BARREL_JUMP_APEX = 0.44
export const BARREL_JUMP_SPEED = Math.sqrt(2 * BARREL_GRAVITY * BARREL_JUMP_APEX)
/** How near a ladder's foot (or head) the can must be to take it. */
export const BARREL_LADDER_REACH = 0.17
/** Seconds the can blinks after a bonk, when barrels pass through it. */
export const BARREL_BLINK_SECONDS = 1.5

/** A rolling barrel's radius and speeds. */
export const BARREL_RADIUS = 0.14
export const BARREL_ROLL_SPEED = 1.45
export const BARREL_LADDER_SPEED = 1.5
/** The chance a barrel rolling over a ladder's head takes it down. */
export const BARREL_LADDER_CHANCE = 0.28
/** The first barrel comes after a moment; then they come faster, to the quickest gap. */
export const BARREL_FIRST_SPAWN = 1.3
export const BARREL_SPAWN_GAP = 2.7
export const BARREL_SPAWN_QUICKEST = 1.7
export const BARREL_SPAWN_QUICKENS = 0.08
export const BARREL_MAX_BARRELS = 7

/** The height of a floor at a place across it. */
export function floorY(floor: BarrelFloor, x: number): number {
  return floor.base + floor.slope * x
}

export function floorSpans(floor: BarrelFloor, x: number): boolean {
  return x >= floor.x0 && x <= floor.x1
}

/** The way a barrel rolls on a floor: downhill, toward its open end. */
export function downhill(floor: BarrelFloor): -1 | 1 {
  return floor.slope > 0 ? -1 : 1
}

/** A ladder's foot and head heights. */
export function ladderSpan(ladder: BarrelLadder): { readonly bottomY: number; readonly topY: number } {
  return { bottomY: floorY(BARREL_FLOORS[ladder.bottom], ladder.x), topY: floorY(BARREL_FLOORS[ladder.top], ladder.x) }
}

/** The floor a point stands on: the highest floor under it that spans it, or null. */
export function floorBeneath(x: number, y: number, floors: readonly BarrelFloor[] = BARREL_FLOORS): BarrelFloor | null {
  let best: BarrelFloor | null = null
  for (const floor of floors) {
    if (!floorSpans(floor, x)) continue
    const top = floorY(floor, x)
    if (top <= y + 1e-6 && (!best || top > floorY(best, x))) best = floor
  }
  return best
}

/** Whether a barrel touches the can (a little forgiving: the barrel counts a hair smaller than it looks). */
export function barrelTouches(heroX: number, heroY: number, barrelX: number, barrelY: number): boolean {
  const radius = BARREL_RADIUS - 0.035
  const nearestX = Math.max(heroX - BARREL_HERO_HALF, Math.min(heroX + BARREL_HERO_HALF, barrelX))
  const nearestY = Math.max(heroY, Math.min(heroY + BARREL_HERO_HEIGHT, barrelY))
  return (barrelX - nearestX) ** 2 + (barrelY - nearestY) ** 2 < radius * radius
}

export type BarrelHeroState = 'ground' | 'air' | 'ladder'

export interface BarrelHero {
  readonly x: number
  /** The can's feet. */
  readonly y: number
  readonly state: BarrelHeroState
  /** The floor it stands on (or last stood on, while in the air or on a ladder). */
  readonly floor: number
  readonly ladder: BarrelLadder | null
  /** Which way it faces: -1 left, 1 right. */
  readonly facing: -1 | 1
  readonly blink: number
  /** The highest floor it has reached. */
  readonly best: number
}

export interface Barrel {
  readonly id: number
  readonly x: number
  /** The barrel's centre. */
  readonly y: number
  readonly state: 'roll' | 'fall' | 'ladder'
  readonly floor: number
  readonly dir: -1 | 1
  /** How far it has rolled, for its spin. */
  readonly rolled: number
}

export type BarrelEvent =
  | { readonly kind: 'windup' }
  | { readonly kind: 'spawn'; readonly barrel: Barrel }
  | { readonly kind: 'land'; readonly barrel: Barrel }
  | { readonly kind: 'down-ladder'; readonly barrel: Barrel }
  | { readonly kind: 'gone'; readonly barrel: Barrel }
  | { readonly kind: 'hero-land' }
  | { readonly kind: 'vault'; readonly barrel: Barrel }
  | { readonly kind: 'bonk'; readonly barrel: Barrel }
  | { readonly kind: 'floor'; readonly floor: number }

export interface BarrelInput {
  /** -1 left, 0 still, 1 right. */
  readonly move: number
  /** 1 up a ladder, -1 down one, 0 neither. */
  readonly climb: number
}

export interface BarrelCourse {
  readonly hero: BarrelHero
  readonly barrels: readonly Barrel[]
  /** Seconds until the gopher rolls the next barrel. */
  readonly nextSpawn: number
  setInput(input: BarrelInput): void
  /** Jump, if the can is on its feet. Returns whether it jumped. */
  jump(): boolean
  /** Stop the gopher (the round is over). */
  stopBarrels(): void
  step(deltaSeconds: number): BarrelEvent[]
}

interface MutableBarrel {
  id: number
  x: number
  y: number
  state: 'roll' | 'fall' | 'ladder'
  floor: number
  dir: -1 | 1
  vy: number
  rolled: number
  ladder: BarrelLadder | null
  tried: Set<number>
  vaulted: boolean
}

const SUBSTEP = 1 / 120
const WINDUP_SECONDS = 0.45

/**
 * Steering toward a point (a held finger): walk toward it on its own floor, or
 * to the nearest ladder that leads toward its floor and climb. Pure, so the
 * pointer controls are tested without a browser.
 */
export function barrelSteer(hero: BarrelHero, targetX: number, targetY: number): BarrelInput {
  const targetFloor = nearestFloor(targetX, targetY)
  if (hero.state === 'ladder' && hero.ladder) {
    if (targetFloor >= hero.ladder.top) return { move: 0, climb: 1 }
    if (targetFloor <= hero.ladder.bottom) return { move: 0, climb: -1 }
    return { move: 0, climb: 0 }
  }
  if (hero.state !== 'ground' || targetFloor === hero.floor) {
    const dx = targetX - hero.x
    return { move: Math.abs(dx) < 0.06 ? 0 : Math.sign(dx), climb: 0 }
  }
  const up = targetFloor > hero.floor
  const ladders = BARREL_LADDERS.filter((ladder) => (up ? ladder.bottom === hero.floor : ladder.top === hero.floor))
  if (ladders.length === 0) return { move: 0, climb: 0 }
  // The ladder nearest the can; ties go to the one nearer the finger.
  const ladder = ladders.reduce((best, next) => {
    const a = Math.abs(best.x - hero.x) + Math.abs(best.x - targetX) * 0.25
    const b = Math.abs(next.x - hero.x) + Math.abs(next.x - targetX) * 0.25
    return b < a ? next : best
  })
  const dx = ladder.x - hero.x
  if (Math.abs(dx) <= BARREL_LADDER_REACH * 0.6) return { move: 0, climb: up ? 1 : -1 }
  return { move: Math.sign(dx), climb: 0 }
}

/** The floor nearest a point: of the floors spanning it, the one whose plank is closest below or just above it. */
export function nearestFloor(x: number, y: number): number {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (const floor of BARREL_FLOORS) {
    const clampedX = Math.max(floor.x0, Math.min(floor.x1, x))
    // Standing room above a plank counts as that floor; being below it does not.
    const above = y - floorY(floor, clampedX)
    const distance = (above >= -0.15 ? Math.abs(above - 0.4) : 10 - above) + Math.abs(clampedX - x)
    if (distance < bestDistance) {
      bestDistance = distance
      best = floor.index
    }
  }
  return best
}

export function createBarrelCourse(random: () => number = Math.random): BarrelCourse {
  const startFloor = BARREL_FLOORS[0]
  const hero = {
    x: BARREL_START_X,
    y: floorY(startFloor, BARREL_START_X),
    vx: 0,
    vy: 0,
    state: 'ground' as BarrelHeroState,
    floor: 0,
    ladder: null as BarrelLadder | null,
    facing: 1 as -1 | 1,
    blink: 0,
    best: 0,
  }
  let input: BarrelInput = { move: 0, climb: 0 }
  const barrels: MutableBarrel[] = []
  let nextId = 0
  let spawnClock = BARREL_FIRST_SPAWN
  let spawned = 0
  let windupSent = false
  let stopped = false

  function snapshotBarrel(barrel: MutableBarrel): Barrel {
    return { id: barrel.id, x: barrel.x, y: barrel.y, state: barrel.state, floor: barrel.floor, dir: barrel.dir, rolled: barrel.rolled }
  }

  function reach(floor: number, events: BarrelEvent[]): void {
    hero.floor = floor
    if (floor > hero.best) {
      hero.best = floor
      events.push({ kind: 'floor', floor })
    }
  }

  function stepHero(dt: number, events: BarrelEvent[]): void {
    hero.blink = Math.max(0, hero.blink - dt)
    const move = Math.sign(input.move)
    if (move !== 0) hero.facing = move as -1 | 1
    if (hero.state === 'ladder' && hero.ladder) {
      const ladder = hero.ladder
      const { bottomY, topY } = ladderSpan(ladder)
      hero.y += Math.sign(input.climb) * BARREL_CLIMB_SPEED * dt
      if (hero.y >= topY) {
        hero.y = topY
        hero.state = 'ground'
        hero.ladder = null
        reach(ladder.top, events)
      } else if (hero.y <= bottomY) {
        hero.y = bottomY
        hero.state = 'ground'
        hero.ladder = null
        reach(ladder.bottom, events)
      }
      return
    }
    if (hero.state === 'ground') {
      // Take a ladder up from its foot, or down from its head.
      if (input.climb !== 0) {
        const ladder = BARREL_LADDERS.find((entry) =>
          (input.climb > 0 ? entry.bottom === hero.floor : entry.top === hero.floor) && Math.abs(entry.x - hero.x) <= BARREL_LADDER_REACH)
        if (ladder) {
          hero.state = 'ladder'
          hero.ladder = ladder
          hero.x = ladder.x
          return
        }
      }
      hero.x = Math.max(-BARREL_HALF_WIDTH + BARREL_HERO_HALF, Math.min(BARREL_HALF_WIDTH - BARREL_HERO_HALF, hero.x + move * BARREL_WALK_SPEED * dt))
      const floor = BARREL_FLOORS[hero.floor]
      if (floorSpans(floor, hero.x)) {
        hero.y = floorY(floor, hero.x)
      } else {
        // Walked off an open end: drop to the plank below.
        hero.state = 'air'
        hero.vx = move * BARREL_WALK_SPEED * 0.5
        hero.vy = 0
      }
      return
    }
    // In the air.
    const previousY = hero.y
    hero.vy -= BARREL_GRAVITY * dt
    hero.x = Math.max(-BARREL_HALF_WIDTH + BARREL_HERO_HALF, Math.min(BARREL_HALF_WIDTH - BARREL_HERO_HALF, hero.x + hero.vx * dt))
    hero.y += hero.vy * dt
    if (hero.vy <= 0) {
      let landing: BarrelFloor | null = null
      for (const floor of BARREL_FLOORS) {
        if (!floorSpans(floor, hero.x)) continue
        const top = floorY(floor, hero.x)
        if (previousY >= top - 1e-4 && hero.y <= top && (!landing || top > floorY(landing, hero.x))) landing = floor
      }
      if (landing) {
        hero.y = floorY(landing, hero.x)
        hero.state = 'ground'
        hero.vx = 0
        hero.vy = 0
        events.push({ kind: 'hero-land' })
        reach(landing.index, events)
      } else if (hero.y < -2) {
        // Off the bottom of the world: back to the start, a little shaken.
        hero.x = BARREL_START_X
        hero.y = floorY(startFloor, BARREL_START_X)
        hero.state = 'ground'
        hero.floor = 0
      }
    }
  }

  function spawnBarrel(events: BarrelEvent[]): void {
    const top = BARREL_FLOORS[BARREL_TOP_FLOOR - 1]
    const barrel: MutableBarrel = {
      id: nextId++,
      x: BARREL_SPAWN_X,
      y: floorY(top, BARREL_SPAWN_X) + BARREL_RADIUS,
      state: 'roll',
      floor: top.index,
      dir: downhill(top),
      vy: 0,
      rolled: 0,
      ladder: null,
      tried: new Set(),
      vaulted: false,
    }
    barrels.push(barrel)
    spawned += 1
    events.push({ kind: 'spawn', barrel: snapshotBarrel(barrel) })
  }

  function stepBarrels(dt: number, events: BarrelEvent[]): void {
    for (let index = barrels.length - 1; index >= 0; index -= 1) {
      const barrel = barrels[index]
      if (barrel.state === 'roll') {
        const floor = BARREL_FLOORS[barrel.floor]
        const previousX = barrel.x
        barrel.x += barrel.dir * BARREL_ROLL_SPEED * dt
        barrel.rolled += BARREL_ROLL_SPEED * dt
        // Over a ladder's head: sometimes it takes the ladder down.
        for (const ladder of BARREL_LADDERS) {
          if (ladder.top !== barrel.floor || barrel.tried.has(ladder.id)) continue
          if ((previousX - ladder.x) * (barrel.x - ladder.x) > 0) continue
          barrel.tried.add(ladder.id)
          if (random() < BARREL_LADDER_CHANCE) {
            barrel.state = 'ladder'
            barrel.ladder = ladder
            barrel.x = ladder.x
            events.push({ kind: 'down-ladder', barrel: snapshotBarrel(barrel) })
            break
          }
        }
        if (barrel.state !== 'roll') continue
        if (floorSpans(floor, barrel.x)) {
          barrel.y = floorY(floor, barrel.x) + BARREL_RADIUS
        } else if (barrel.floor === 0) {
          barrels.splice(index, 1)
          events.push({ kind: 'gone', barrel: snapshotBarrel(barrel) })
        } else {
          barrel.state = 'fall'
          barrel.vy = 0
        }
      } else if (barrel.state === 'fall') {
        const previousBottom = barrel.y - BARREL_RADIUS
        barrel.vy -= BARREL_GRAVITY * dt
        barrel.x += barrel.dir * BARREL_ROLL_SPEED * 0.35 * dt
        barrel.y += barrel.vy * dt
        const bottom = barrel.y - BARREL_RADIUS
        const landing = BARREL_FLOORS.find((floor) => floor.index < barrel.floor && floorSpans(floor, barrel.x)
          && previousBottom >= floorY(floor, barrel.x) - 1e-4 && bottom <= floorY(floor, barrel.x))
        if (landing) {
          barrel.floor = landing.index
          barrel.state = 'roll'
          barrel.dir = downhill(landing)
          barrel.vy = 0
          barrel.y = floorY(landing, barrel.x) + BARREL_RADIUS
          events.push({ kind: 'land', barrel: snapshotBarrel(barrel) })
        } else if (barrel.y < -2) {
          barrels.splice(index, 1)
          events.push({ kind: 'gone', barrel: snapshotBarrel(barrel) })
        }
      } else if (barrel.ladder) {
        const below = BARREL_FLOORS[barrel.ladder.bottom]
        barrel.y -= BARREL_LADDER_SPEED * dt
        if (barrel.y - BARREL_RADIUS <= floorY(below, barrel.x)) {
          barrel.floor = below.index
          barrel.state = 'roll'
          barrel.dir = downhill(below)
          barrel.ladder = null
          barrel.y = floorY(below, barrel.x) + BARREL_RADIUS
          events.push({ kind: 'land', barrel: snapshotBarrel(barrel) })
        }
      }
    }
  }

  function collide(events: BarrelEvent[]): void {
    for (let index = barrels.length - 1; index >= 0; index -= 1) {
      const barrel = barrels[index]
      if (hero.blink <= 0 && barrelTouches(hero.x, hero.y, barrel.x, barrel.y)) {
        // The barrel bursts on the can; the can blinks.
        barrels.splice(index, 1)
        hero.blink = BARREL_BLINK_SECONDS
        events.push({ kind: 'bonk', barrel: snapshotBarrel(barrel) })
        continue
      }
      // A barrel passing under a jumping can is vaulted, once.
      if (!barrel.vaulted && hero.state === 'air' && Math.abs(barrel.x - hero.x) < 0.16
        && hero.y > barrel.y + BARREL_RADIUS - 0.04 && hero.y - barrel.y < 0.9) {
        barrel.vaulted = true
        events.push({ kind: 'vault', barrel: snapshotBarrel(barrel) })
      }
    }
  }

  return {
    get hero(): BarrelHero {
      return { x: hero.x, y: hero.y, state: hero.state, floor: hero.floor, ladder: hero.ladder, facing: hero.facing, blink: hero.blink, best: hero.best }
    },
    get barrels() { return barrels.map(snapshotBarrel) },
    get nextSpawn() { return spawnClock },
    setInput(next): void {
      input = { move: Number.isFinite(next.move) ? next.move : 0, climb: Number.isFinite(next.climb) ? next.climb : 0 }
    },
    jump(): boolean {
      if (hero.state !== 'ground') return false
      hero.state = 'air'
      hero.vy = BARREL_JUMP_SPEED
      hero.vx = Math.sign(input.move) * BARREL_WALK_SPEED
      return true
    },
    stopBarrels(): void {
      stopped = true
    },
    step(deltaSeconds): BarrelEvent[] {
      const events: BarrelEvent[] = []
      let remaining = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(0.1, deltaSeconds)) : 0
      while (remaining > 1e-9) {
        const dt = Math.min(SUBSTEP, remaining)
        remaining -= dt
        if (!stopped) {
          spawnClock -= dt
          if (!windupSent && spawnClock <= WINDUP_SECONDS && barrels.length < BARREL_MAX_BARRELS) {
            windupSent = true
            events.push({ kind: 'windup' })
          }
          if (spawnClock <= 0) {
            if (barrels.length < BARREL_MAX_BARRELS) spawnBarrel(events)
            spawnClock = Math.max(BARREL_SPAWN_QUICKEST, BARREL_SPAWN_GAP - spawned * BARREL_SPAWN_QUICKENS)
            windupSent = false
          }
        }
        stepHero(dt, events)
        stepBarrels(dt, events)
        collide(events)
      }
      return events
    },
  }
}
