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
 * idea, and once it is close it lunges. The lunge is the only moment the prey
 * notices; a mouse that bolts the right way gets clean away. After a catch the
 * snake lies still to digest, so a meadow is thinned over a day, not a minute.
 */

import { PREY_FLOOR, PREY_OF, type PreyView } from './predator'

export type GroundHuntPhase =
  | 'roam'    // wandering like any animal, watching for prey
  | 'stalk'   // creeping toward a chosen mouse or rat, unnoticed
  | 'strike'  // the lunge: the prey has noticed and bolts
  | 'digest'  // lying still after a catch

export interface GroundHunter {
  phase: GroundHuntPhase
  /** Seconds spent in the current phase. */
  timer: number
  /** Seconds until the next hunt is allowed. */
  cooldown: number
  /** The prey being hunted, or null. */
  preyId: string | null
}

/** Prey as the snake sees it: a `PreyView` that also says what it is. */
export interface GroundPreyView extends PreyView {
  readonly species: string
}

export interface GroundHuntWorld {
  /** Where the snake is now. */
  readonly x: number
  readonly z: number
  /** Whether this snake may hunt (a visitor or resident on the farm may; a carnival snake may not). */
  readonly huntAllowed: boolean
  readonly prey: readonly GroundPreyView[]
  /**
   * Adult residents per prey species, indoors or out. A species at or below
   * `PREY_FLOOR` is left alone so it can keep breeding.
   */
  readonly preyCounts: Readonly<Record<string, number>>
}

export type GroundHuntEvent =
  | { readonly kind: 'stalk'; readonly preyId: string }
  /** The lunge starts: the prey notices and should panic. */
  | { readonly kind: 'strike'; readonly preyId: string }
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
  /** Close enough to lunge. */
  strikeDistance: 1.5,
  /** The lunge, as a multiple of walking speed: faster than a panicking mouse, but only briefly. */
  strikeSpeedScale: 6.5,
  /** A lunge that has not landed by now has missed. */
  strikeSeconds: 0.8,
  catchDistance: 0.6,
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
  return { phase: 'roam', timer: 0, cooldown: SNAKE_TUNING.firstHuntCooldown, preyId: null }
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
  const distanceTo = (prey: GroundPreyView): number => Math.hypot(prey.x - world.x, prey.z - world.z)

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
        enter(hunter, 'strike')
        events.push({ kind: 'strike', preyId: target.id })
        return { events, pursuit: { x: target.x, z: target.z, speedScale: T.strikeSpeedScale } }
      }
      return { events, pursuit: { x: target.x, z: target.z, speedScale: T.stalkSpeedScale } }
    }
    case 'strike': {
      if (!target || !target.targetable) {
        giveUp(hunter, events, 0.3)
        break
      }
      if (distanceTo(target) <= T.catchDistance) {
        events.push({ kind: 'catch', preyId: target.id, x: target.x, z: target.z })
        hunter.preyId = null
        hunter.cooldown = T.huntCooldown
        enter(hunter, 'digest')
        break
      }
      if (hunter.timer >= T.strikeSeconds) {
        // Missed: the mouse is away through the grass.
        giveUp(hunter, events, 0.5)
        break
      }
      return { events, pursuit: { x: target.x, z: target.z, speedScale: T.strikeSpeedScale } }
    }
    case 'digest': {
      if (hunter.timer >= T.digestSeconds) enter(hunter, 'roam')
      // Lying still: pursue its own spot.
      return { events, pursuit: { x: world.x, z: world.z, speedScale: 0 } }
    }
  }
  return { events, pursuit: null }
}
