/**
 * Ground predators: how a snake hunts mice and rats in the long grass.
 *
 * Pure, like `predator.ts` (no Three.js, no DOM). The scene feeds in where the
 * snake and its prey are, and gets back where the snake should be heading and
 * how fast; everything that decides *what the snake does* lives here, so the
 * hunt can be driven from a node test one simulated second at a time.
 *
 * A snake is slower than a mouse, so it cannot run one down. It stalks instead:
 * it creeps toward the nearest mouse or rat it can see while the prey has no
 * idea, and once it is close a die is rolled for the lunge (`STRIKE_DIE`).
 * Roll high and the prey freezes in fright and is swallowed (it pops). Roll
 * low and the snake strikes empty grass while the prey sprints home to its
 * house. The outcome is decided before the lunge starts, so each one gets its
 * own animation instead of hoping physics agrees with the dice. After a catch
 * the snake lies still to digest, so a meadow is thinned over a day.
 */

import { PREY_FLOOR, PREY_OF, type PreyView } from './predator'

export type GroundHuntPhase =
  | 'roam'    // wandering like any animal, watching for prey
  | 'stalk'   // creeping toward a chosen mouse or rat, unnoticed
  | 'strike'  // the dice said yes: lunging at prey frozen in fright
  | 'miss'    // the dice said no: lunging at the empty spot the prey just left
  | 'digest'  // lying still after a catch

export interface GroundHunter {
  phase: GroundHuntPhase
  /** Seconds spent in the current phase. */
  timer: number
  /** Seconds until the next hunt is allowed. */
  cooldown: number
  /** The prey being hunted, or null. */
  preyId: string | null
  /** Where a missed lunge is aimed: the spot the prey sprang from. */
  missX: number
  missZ: number
}

/** Prey as the snake sees it: a `PreyView` that also says what it is. */
export interface GroundPreyView extends PreyView {
  readonly species: string
}

export interface GroundHuntWorld {
  /** Where the snake is now. */
  readonly x: number
  readonly z: number
  /**
   * How far ahead of its centre the snake's mouth is. Distances to prey are
   * measured from the mouth, not the centre: the collision pass keeps two
   * animals' centres a body-width apart, so a catch measured centre to centre
   * could never land.
   */
  readonly reach?: number
  /** Whether this snake may hunt (a visitor or resident on the farm may; a carnival snake may not). */
  readonly huntAllowed: boolean
  readonly prey: readonly GroundPreyView[]
  /**
   * Adult residents per prey species, indoors or out. A species at or below
   * `PREY_FLOOR` is left alone so it can keep breeding.
   */
  readonly preyCounts: Readonly<Record<string, number>>
  /** A uniform random number in [0, 1), for the strike die. Defaults to `Math.random`. */
  readonly random?: () => number
}

export type GroundHuntEvent =
  | { readonly kind: 'stalk'; readonly preyId: string }
  /**
   * The die is rolled and the lunge starts. `caught`: the prey freezes and is
   * swallowed at the end of the lunge. Otherwise it escapes at once, and the
   * scene should send it sprinting home.
   */
  | { readonly kind: 'strike'; readonly preyId: string; readonly roll: number; readonly caught: boolean }
  /** The prey got away, or stopped being fair game. */
  | { readonly kind: 'abandon'; readonly preyId: string }
  | { readonly kind: 'catch'; readonly preyId: string; readonly x: number; readonly z: number }

/** Where the scene should steer the snake this frame, as a multiple of its own walking speed. */
export interface GroundPursuit {
  readonly x: number
  readonly z: number
  readonly speedScale: number
}

export interface GroundHuntStep {
  readonly events: readonly GroundHuntEvent[]
  /** Null while the snake wanders (or digests) on its own. */
  readonly pursuit: GroundPursuit | null
}

export const SNAKE_TUNING = {
  /** How far off a snake notices a mouse in the grass. */
  sightRadius: 7,
  /** Creeping pace, as a multiple of the snake's walking speed. Slower than a walking mouse. */
  stalkSpeedScale: 1.6,
  /** Close enough to lunge, from the mouth. */
  strikeDistance: 1.5,
  /** Longest a lunge at frozen prey can take; it always lands by then. */
  strikeSeconds: 0.8,
  /** How long a missed lunge carries on, then the snake gathers itself. */
  missSeconds: 1.6,
  /** The lunge, as a multiple of walking speed: faster than a panicking mouse, but only briefly. */
  strikeSpeedScale: 6.5,
  /** Mouth to prey at the catch. Well short of where the collision pass would hold them apart. */
  catchDistance: 0.35,
  /** A stalk that has not closed in by now is given up. */
  giveUpSeconds: 14,
  /** Seconds between hunts once a catch is made. */
  huntCooldown: 45,
  /** The first hunt comes sooner, so a new snake's arrival has a point. */
  firstHuntCooldown: 8,
  /** Lying still after a catch. */
  digestSeconds: 6,
} as const

export function createGroundHunter(): GroundHunter {
  return { phase: 'roam', timer: 0, cooldown: SNAKE_TUNING.firstHuntCooldown, preyId: null, missX: 0, missZ: 0 }
}

/**
 * The strike die: a d6, and the snake needs `catchOn` or better. Even odds, so
 * a meadow full of mice loses some and keeps some, and every lunge is a moment.
 */
export const STRIKE_DIE = { sides: 6, catchOn: 4 } as const

/** Roll the strike die from a uniform [0, 1) number. */
export function rollStrike(random: number): { readonly roll: number; readonly caught: boolean } {
  const unit = Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.999999) : 0
  const roll = 1 + Math.floor(unit * STRIKE_DIE.sides)
  return { roll, caught: roll >= STRIKE_DIE.catchOn }
}

/** Whether `hunter` eats `species` at all. */
export function huntsSpecies(hunter: string, species: string): boolean {
  return (PREY_OF[hunter] ?? []).includes(species)
}

/** Whether a prey species is plentiful enough to take from. */
export function canTake(species: string, preyCounts: Readonly<Record<string, number>>): boolean {
  return (preyCounts[species] ?? 0) > PREY_FLOOR
}

function enter(hunter: GroundHunter, phase: GroundHuntPhase): void {
  hunter.phase = phase
  hunter.timer = 0
}

function giveUp(hunter: GroundHunter, events: GroundHuntEvent[], cooldownScale: number): void {
  if (hunter.preyId) events.push({ kind: 'abandon', preyId: hunter.preyId })
  hunter.preyId = null
  hunter.cooldown = SNAKE_TUNING.huntCooldown * cooldownScale
  enter(hunter, 'roam')
}

/**
 * Advance one snake by `dt` seconds. The hunter is mutated in place; the world
 * is read-only. Every prey in `world.prey` is assumed to be one this snake eats.
 */
export function stepGroundHunter(hunter: GroundHunter, world: GroundHuntWorld, deltaSeconds: number): GroundHuntStep {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.25)) : 0
  const events: GroundHuntEvent[] = []
  if (dt === 0) return { events, pursuit: null }
  const T = SNAKE_TUNING
  hunter.timer += dt
  hunter.cooldown = Math.max(0, hunter.cooldown - dt)

  const target = hunter.preyId ? world.prey.find((entry) => entry.id === hunter.preyId) : undefined
  const reach = Math.max(0, world.reach ?? 0)
  /** Mouth to prey: the snake faces what it hunts, so its mouth is `reach` nearer than its centre. */
  const distanceTo = (prey: GroundPreyView): number => Math.max(0, Math.hypot(prey.x - world.x, prey.z - world.z) - reach)

  switch (hunter.phase) {
    case 'roam': {
      if (!world.huntAllowed || hunter.cooldown > 0) break
      let best: GroundPreyView | null = null
      let bestDistance: number = T.sightRadius
      for (const prey of world.prey) {
        if (!prey.targetable || !canTake(prey.species, world.preyCounts)) continue
        const distance = distanceTo(prey)
        if (distance <= bestDistance) { best = prey; bestDistance = distance }
      }
      if (best) {
        hunter.preyId = best.id
        enter(hunter, 'stalk')
        events.push({ kind: 'stalk', preyId: best.id })
        return { events, pursuit: { x: best.x, z: best.z, speedScale: T.stalkSpeedScale } }
      }
      break
    }
    case 'stalk': {
      if (!world.huntAllowed || !target || !target.targetable || !canTake(target.species, world.preyCounts)) {
        giveUp(hunter, events, 0.3)
        break
      }
      if (hunter.timer >= T.giveUpSeconds || distanceTo(target) > T.sightRadius * 1.5) {
        giveUp(hunter, events, 0.3)
        break
      }
      if (distanceTo(target) <= T.strikeDistance) {
        const { roll, caught } = rollStrike((world.random ?? Math.random)())
        events.push({ kind: 'strike', preyId: target.id, roll, caught })
        if (caught) {
          enter(hunter, 'strike')
          return { events, pursuit: { x: target.x, z: target.z, speedScale: T.strikeSpeedScale } }
        }
        // The prey is off; the snake lunges at where it was, and on past it.
        const dx = target.x - world.x
        const dz = target.z - world.z
        const length = Math.hypot(dx, dz) || 1
        const overshoot = reach + T.strikeDistance
        hunter.missX = target.x + (dx / length) * overshoot * 0.5
        hunter.missZ = target.z + (dz / length) * overshoot * 0.5
        hunter.preyId = null
        hunter.cooldown = T.huntCooldown * 0.5
        enter(hunter, 'miss')
        return { events, pursuit: { x: hunter.missX, z: hunter.missZ, speedScale: T.strikeSpeedScale } }
      }
      return { events, pursuit: { x: target.x, z: target.z, speedScale: T.stalkSpeedScale } }
    }
    case 'strike': {
      if (!target || !target.targetable) {
        giveUp(hunter, events, 0.3)
        break
      }
      // The die already said yes, and the prey is frozen: the lunge lands on
      // contact, or at the latest when it runs out (a nudge from a neighbour
      // must not undo the roll).
      if (distanceTo(target) <= T.catchDistance || hunter.timer >= T.strikeSeconds) {
        events.push({ kind: 'catch', preyId: target.id, x: target.x, z: target.z })
        hunter.preyId = null
        hunter.cooldown = T.huntCooldown
        enter(hunter, 'digest')
        break
      }
      return { events, pursuit: { x: target.x, z: target.z, speedScale: T.strikeSpeedScale } }
    }
    case 'miss': {
      if (hunter.timer >= T.missSeconds) {
        enter(hunter, 'roam')
        break
      }
      // A fast strike into empty grass, then a slow, sheepish coil where it landed.
      const lunging = hunter.timer < T.strikeSeconds
      return { events, pursuit: { x: hunter.missX, z: hunter.missZ, speedScale: lunging ? T.strikeSpeedScale : 0 } }
    }
    case 'digest': {
      if (hunter.timer >= T.digestSeconds) enter(hunter, 'roam')
      // Lying still: pursue its own spot.
      return { events, pursuit: { x: world.x, z: world.z, speedScale: 0 } }
    }
  }
  return { events, pursuit: null }
}
