/**
 * Apex predators: the mountain lion, and how it wipes out a herd that bred out of hand.
 *
 * Pure, like `predator.ts` and `ground-hunt.ts` (no Three.js, no DOM). The scene
 * feeds in the lion's rung, the herd sizes, who is out on the farm and who is
 * hiding in which house; it gets back where to steer the lion and what
 * happened, and plays it. Everything that decides *what the lion does* lives
 * here, so a raid can be driven from a node test one simulated second at a time.
 *
 * Any species that grows past `CROWD_LIMIT` on the farm draws the lion down from
 * the hills. It catches the scent first (a short warning: sell down to the limit
 * and it loses interest), then comes over the fence and hunts that species to
 * the very last. It outruns anything in the open, crouches, leaps, swipes it
 * down, eats in a moment, and goes into the species' houses for whoever is
 * hiding there. A house is no refuge from it. When none are left it leaves the
 * way it came. There is no breeding floor and no dice: it is the reset button
 * for a runaway herd.
 *
 * Tamed (only on a farm of legend: see `SPECIES_CONDITIONS.cougar`), the lion
 * stays and guards instead. It trims a crowd back to the limit and no further.
 */

/** Species that are summoned by a crowd instead of coming by the carnival. */
export const APEX_SPECIES: readonly string[] = ['cougar']

/** A species with more than this many on the farm draws the lion. */
export const CROWD_LIMIT = 6

export function isApexSpecies(species: string): boolean {
  return APEX_SPECIES.includes(species)
}

/**
 * The biggest herd past the limit, or null when every herd is within it. Ties
 * go to the species first in alphabetical order, so a raid is reproducible.
 */
export function crowdedSpecies(herds: Readonly<Record<string, number>>, limit: number = CROWD_LIMIT): string | null {
  let best: string | null = null
  let bestCount = limit
  for (const species of Object.keys(herds).sort()) {
    if (isApexSpecies(species)) continue
    const count = herds[species] ?? 0
    if (count > bestCount) {
      best = species
      bestCount = count
    }
  }
  return best
}

/** The size of the biggest herd on the farm, the apex itself aside. */
export function largestHerd(herds: Readonly<Record<string, number>>): number {
  let most = 0
  for (const [species, count] of Object.entries(herds)) {
    if (!isApexSpecies(species) && count > most) most = count
  }
  return most
}

export type LionPhase =
  | 'away'    // up in the hills: not on the farm
  | 'scent'   // a herd has passed the limit; the lion is on its way (or, tamed, has noticed)
  | 'hunt'    // on the farm, choosing its next meal
  | 'chase'   // sprinting at one animal out in the open
  | 'pounce'  // close enough: the prey freezes, the lion crouches, leaps and swipes
  | 'feed'    // a moment over the catch
  | 'door'    // running to a house its quarry is hiding in
  | 'inside'  // in the house, eating everyone of its quarry
  | 'leave'   // done: back over the fence
  | 'guard'   // tamed: lazing about the farm until a herd crowds

export interface LionRaid {
  phase: LionPhase
  /** Seconds spent in the current phase. */
  timer: number
  /** Seconds since the lion came onto the farm (or, tamed, set off on a trim). */
  raidTimer: number
  /** The species being hunted, or null. */
  quarry: string | null
  /** The animal being chased, or null. */
  preyId: string | null
  /** The house being raided, or null. */
  houseId: string | null
  /** Seconds before another crowd can draw it. */
  cooldown: number
  /** Eaten on this raid, for the notice at the end. */
  eaten: number
}

export interface LionPreyView {
  readonly id: string
  readonly species: string
  readonly x: number
  readonly z: number
  /** False for an animal the lion cannot take right now: mid-reveal, or already walking in through a door. */
  readonly targetable: boolean
  /** Its body radius: the leap lands a paw's length off its edge, not its middle. */
  readonly radius?: number
}

export interface LionHouseView {
  readonly id: string
  readonly doorX: number
  readonly doorZ: number
  /** Everyone inside, any species. */
  readonly inside: readonly { readonly id: string; readonly species: string }[]
}

export interface LionWorld {
  /** The lion's rung: 0 up in the hills, 2 a wild raider on the farm, 3 or more tamed. */
  readonly stage: number
  /** Where the lion is now (ignored while it is away). */
  readonly x: number
  readonly z: number
  /** Its walking speed in units a second, which the pursuit's `speedScale` multiplies: it times the leap. */
  readonly speed: number
  /** How far ahead of its centre its mouth is. Distances to prey run from the mouth. */
  readonly reach?: number
  /** Residents per species, babies and animals indoors included: what "more than six" counts. */
  readonly herds: Readonly<Record<string, number>>
  /** Animals out on the farm, any species. The lion only takes its quarry. */
  readonly prey: readonly LionPreyView[]
  readonly houses: readonly LionHouseView[]
  /** Where it leaves to: a point beyond the fence. */
  readonly exit: { readonly x: number; readonly z: number }
  /** True while it cannot act (the paint reveal of a taming holds it still). */
  readonly busy?: boolean
}

export type LionEvent =
  /** A herd passed the limit. The lion is coming in `seconds` unless the herd is thinned first. */
  | { readonly kind: 'scent'; readonly species: string; readonly count: number; readonly seconds: number; readonly tame: boolean }
  /** The herd was thinned to the limit before the lion came. */
  | { readonly kind: 'lostScent'; readonly species: string; readonly tame: boolean }
  /** The scene should bring the lion onto the farm now. */
  | { readonly kind: 'arrive'; readonly species: string }
  | { readonly kind: 'chase'; readonly preyId: string }
  /** The prey is close: it freezes, and the lion crouches, leaps and swipes. The catch always lands. */
  | { readonly kind: 'pounce'; readonly preyId: string }
  /** The prey stopped being fair game (it went in, or was sold). */
  | { readonly kind: 'abandon'; readonly preyId: string }
  | { readonly kind: 'catch'; readonly preyId: string; readonly x: number; readonly z: number }
  /** The lion slipped into a house. It is not drawn until it comes out. */
  | { readonly kind: 'enter'; readonly houseId: string }
  /** Everyone of the quarry inside the house is eaten (a tame lion takes only the surplus). */
  | { readonly kind: 'devour'; readonly houseId: string; readonly preyIds: readonly string[] }
  | { readonly kind: 'emerge'; readonly houseId: string }
  /**
   * The raid is over: the quarry is gone (wild) or trimmed to the limit (tame). `left` is
   * how many it could not reach before it gave up (owls on the wing), usually 0.
   */
  | { readonly kind: 'cleared'; readonly species: string; readonly eaten: number; readonly left: number; readonly tame: boolean }
  /** Walking off the farm. */
  | { readonly kind: 'leave' }
  /** Off the farm and out of sight: the scene sends it back to the hills. */
  | { readonly kind: 'gone' }

/** Where the scene should steer the lion this tick, as a multiple of its walking speed. */
export interface LionPursuit {
  readonly x: number
  readonly z: number
  readonly speedScale: number
}

export interface LionStep {
  readonly events: readonly LionEvent[]
  /** Null while it wanders on its own (tamed and idle, or away). */
  readonly pursuit: LionPursuit | null
  /** True while it is inside a house: the scene hides it. */
  readonly hidden: boolean
  /** A point to turn and face while it stands (its prey, through the crouch and the swipe), or null. */
  readonly face?: { readonly x: number; readonly z: number } | null
}

/** Overtuned on purpose: it is the answer to a farm that bred out of hand. */
export const LION_TUNING = {
  /** Warning between the scent and the lion coming over the fence. */
  scentSeconds: 15,
  /** Running down prey, as a multiple of its walk. Far faster than a panicking chicken. */
  chaseSpeedScale: 4.5,
  /** From the mouth: close enough that the prey freezes and the lion strikes. */
  pounceDistance: 2.4,
  /**
   * The strike comes in three beats, and the `STRIKE` clip in art/blender/balloon_cougar.py is
   * keyed to them: a crouch on the spot, facing the prey...
   */
  coilSeconds: 0.2,
  /** ...a leap that lands with its mouth `strikeDistance` short of the prey's edge... */
  lungeSeconds: 0.3,
  /** ...and a forepaw swiped down across it, which lands this long after touching down: the catch (frame 17, 0.71 s). */
  swipeSeconds: 0.21,
  /** Mouth to the prey's edge where the leap lands: a paw's length off, so it swipes rather than rams. */
  strikeDistance: 0.35,
  /** Over a catch, then on to the next. */
  eatSeconds: 0.7,
  /** A chase that has not closed by now picks another target. */
  chaseGiveUpSeconds: 10,
  doorSpeedScale: 4,
  /** Close enough to the door to slip in. */
  doorDistance: 1,
  /** In the house: long enough to hear, short enough to be brutal. */
  insideSeconds: 2.2,
  leaveSpeedScale: 3.2,
  /** Out of sight by then even if something held it up on the way to the fence. */
  leaveSeconds: 12,
  /** A raid that has not finished by now gives up and leaves (nothing should take this long). */
  raidSeconds: 240,
  /** With nothing it can reach (owls on the wing, animals stuck on the way in), it waits this long, then gives up. */
  waitSeconds: 20,
  /** After a raid, before another crowd can draw it. */
  cooldownSeconds: 45,
  /** Its quarry runs from it within this distance (centre to centre); further off it only mills about in a panic. */
  fleeRadius: 11,
  /** Fleeing, as a multiple of the prey's own walk: a frantic scramble, still well short of the lion's sprint. */
  fleeSpeedScale: 2.6,
  /** How far ahead a fleeing animal aims each tick. */
  fleeLookahead: 3,
  /** The panicked weave either side of straight away, in radians, and how often it swings, per second. */
  fleeWeave: 0.6,
  fleeWeaveHz: 0.9,
  /** Fleeing stays this far inside the fence; cornered there, it scrambles along it. */
  fleeFenceInset: 1.4,
} as const

export interface FleeBounds {
  readonly halfWidth: number
  readonly halfDepth: number
}

/**
 * Where an animal of the quarry scrambles to: straight away from the lion, weaving from
 * side to side in a panic, and kept inside the fence (an ellipse inside the plot's bounds,
 * the way the lion's fence points are). Pinned against the fence it runs along it, the
 * way that takes it further from the lion. Null when the lion is far enough off to ignore.
 * `seconds` drives the weave and `phase` (any number per animal) keeps a flock out of step.
 */
export function fleePoint(
  prey: { readonly x: number; readonly z: number },
  lion: { readonly x: number; readonly z: number },
  bounds: FleeBounds | null,
  seconds: number,
  phase: number,
): { x: number; z: number } | null {
  const T = LION_TUNING
  let dx = prey.x - lion.x
  let dz = prey.z - lion.z
  const distance = Math.hypot(dx, dz)
  if (distance > T.fleeRadius) return null
  if (distance < 1e-6) {
    dx = Math.cos(phase)
    dz = Math.sin(phase)
  } else {
    dx /= distance
    dz /= distance
  }
  const weave = Math.sin(seconds * T.fleeWeaveHz * Math.PI * 2 + phase) * T.fleeWeave
  const cos = Math.cos(weave)
  const sin = Math.sin(weave)
  const away = { x: dx * cos - dz * sin, z: dx * sin + dz * cos }
  const target = { x: prey.x + away.x * T.fleeLookahead, z: prey.z + away.z * T.fleeLookahead }
  if (!bounds) return target
  const halfWidth = Math.max(1, bounds.halfWidth - T.fleeFenceInset)
  const halfDepth = Math.max(1, bounds.halfDepth - T.fleeFenceInset)
  const outside = (point: { readonly x: number; readonly z: number }): number => (point.x / halfWidth) ** 2 + (point.z / halfDepth) ** 2
  const inside = (point: { x: number; z: number }): { x: number; z: number } => {
    const reach = outside(point)
    if (reach <= 1) return point
    const scale = 1 / Math.sqrt(reach)
    return { x: point.x * scale, z: point.z * scale }
  }
  if (outside(target) <= 1) return target
  // Against the fence: run along it (the tangent of the ellipse here), whichever way leads off from the lion.
  const normal = { x: prey.x / (halfWidth * halfWidth), z: prey.z / (halfDepth * halfDepth) }
  const length = Math.hypot(normal.x, normal.z) || 1
  const tangent = { x: -normal.z / length, z: normal.x / length }
  const sign = tangent.x * dx + tangent.z * dz >= 0 ? 1 : -1
  return inside({ x: prey.x + tangent.x * sign * T.fleeLookahead, z: prey.z + tangent.z * sign * T.fleeLookahead })
}

export function createLionRaid(): LionRaid {
  return { phase: 'away', timer: 0, raidTimer: 0, quarry: null, preyId: null, houseId: null, cooldown: 0, eaten: 0 }
}

function enter(raid: LionRaid, phase: LionPhase): void {
  raid.phase = phase
  raid.timer = 0
}

/** True while a raid is on: the lion is on the farm (or about to be) with a quarry. */
export function isRaiding(raid: LionRaid): boolean {
  return raid.quarry !== null && raid.phase !== 'away' && raid.phase !== 'scent' && raid.phase !== 'guard'
}

/**
 * Advance the lion by `dt` seconds. The raid is mutated in place; the world is
 * read-only.
 */
export function stepLion(raid: LionRaid, world: LionWorld, deltaSeconds: number): LionStep {
  const dt = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.25)) : 0
  const events: LionEvent[] = []
  if (dt === 0) return { events, pursuit: null, hidden: raid.phase === 'inside' }
  const T = LION_TUNING
  raid.timer += dt
  raid.raidTimer += dt
  raid.cooldown = Math.max(0, raid.cooldown - dt)

  const tame = world.stage >= 3
  const onFarm = world.stage >= 2
  /** A wild lion eats the quarry to the last; a tame one only what is past the limit. */
  const floor = tame ? CROWD_LIMIT : 0
  const reach = Math.max(0, world.reach ?? 0)
  const mouthTo = (point: { readonly x: number; readonly z: number }): number => Math.max(0, Math.hypot(point.x - world.x, point.z - world.z) - reach)
  const stand: LionPursuit = { x: world.x, z: world.z, speedScale: 0 }

  const dropPrey = (): void => {
    if (raid.preyId) events.push({ kind: 'abandon', preyId: raid.preyId })
    raid.preyId = null
  }
  const goAway = (): void => {
    dropPrey()
    raid.quarry = null
    raid.houseId = null
    raid.eaten = 0
    raid.cooldown = T.cooldownSeconds
    enter(raid, tame ? 'guard' : 'away')
  }

  // Sent back to the hills from outside (sold, reset, a debug rung): forget the raid.
  if (!onFarm && raid.phase !== 'away' && raid.phase !== 'scent') {
    goAway()
    enter(raid, 'away')
  }
  // Tamed mid-raid, or loaded tame: it hunts no further than the limit from here on.
  if (tame && (raid.phase === 'away' || raid.phase === 'leave')) {
    dropPrey()
    raid.quarry = null
    enter(raid, 'guard')
  }
  if (world.busy) return { events, pursuit: onFarm && !tame ? stand : null, hidden: false }

  const left = (): number => (raid.quarry ? (world.herds[raid.quarry] ?? 0) - floor : 0)
  const outdoorQuarry = (): LionPreyView[] => world.prey.filter((entry) => entry.species === raid.quarry)

  switch (raid.phase) {
    case 'away': {
      if (onFarm) {
        // On the farm with no raid in mind: a loaded save, or a debug rung. Find the crowd, or go.
        raid.quarry = crowdedSpecies(world.herds)
        raid.raidTimer = 0
        raid.eaten = 0
        if (raid.quarry) enter(raid, 'hunt')
        else {
          enter(raid, 'leave')
          events.push({ kind: 'leave' })
        }
        break
      }
      if (raid.cooldown > 0) break
      const crowd = crowdedSpecies(world.herds)
      if (!crowd) break
      raid.quarry = crowd
      enter(raid, 'scent')
      events.push({ kind: 'scent', species: crowd, count: world.herds[crowd] ?? 0, seconds: T.scentSeconds, tame: false })
      break
    }
    case 'guard': {
      if (raid.cooldown > 0) return { events, pursuit: null, hidden: false }
      const crowd = crowdedSpecies(world.herds)
      if (!crowd) return { events, pursuit: null, hidden: false }
      raid.quarry = crowd
      enter(raid, 'scent')
      events.push({ kind: 'scent', species: crowd, count: world.herds[crowd] ?? 0, seconds: T.scentSeconds, tame: true })
      return { events, pursuit: null, hidden: false }
    }
    case 'scent': {
      const species = raid.quarry
      if (!species || (world.herds[species] ?? 0) <= CROWD_LIMIT) {
        if (species) events.push({ kind: 'lostScent', species, tame })
        raid.quarry = null
        enter(raid, tame ? 'guard' : 'away')
        break
      }
      if (raid.timer < T.scentSeconds && !(onFarm && !tame)) return { events, pursuit: null, hidden: false }
      raid.raidTimer = 0
      raid.eaten = 0
      if (!onFarm) events.push({ kind: 'arrive', species })
      enter(raid, 'hunt')
      break
    }
    case 'hunt': {
      const species = raid.quarry
      const prey = outdoorQuarry()
      /** The raid is over: tell the scene how it went, and leave (or, tamed, go back to lazing about). */
      const finish = (): LionStep => {
        if (species) events.push({ kind: 'cleared', species, eaten: raid.eaten, left: Math.max(0, left()), tame })
        if (tame) {
          goAway()
          return { events, pursuit: null, hidden: false }
        }
        raid.quarry = null
        enter(raid, 'leave')
        events.push({ kind: 'leave' })
        return { events, pursuit: { x: world.exit.x, z: world.exit.z, speedScale: T.leaveSpeedScale }, hidden: false }
      }
      const done = !species || (left() <= 0 && (tame || prey.length === 0))
      if (done || raid.raidTimer >= T.raidSeconds) return finish()
      let best: LionPreyView | null = null
      let bestDistance = Infinity
      for (const candidate of prey) {
        if (!candidate.targetable) continue
        const distance = mouthTo(candidate)
        if (distance < bestDistance) { best = candidate; bestDistance = distance }
      }
      if (best) {
        raid.preyId = best.id
        enter(raid, 'chase')
        events.push({ kind: 'chase', preyId: best.id })
        return { events, pursuit: { x: best.x, z: best.z, speedScale: T.chaseSpeedScale }, hidden: false }
      }
      let house: LionHouseView | null = null
      let houseDistance = Infinity
      for (const candidate of world.houses) {
        if (!candidate.inside.some((entry) => entry.species === species)) continue
        const distance = Math.hypot(candidate.doorX - world.x, candidate.doorZ - world.z)
        if (distance < houseDistance) { house = candidate; houseDistance = distance }
      }
      if (house) {
        raid.houseId = house.id
        enter(raid, 'door')
        return { events, pursuit: { x: house.doorX, z: house.doorZ, speedScale: T.doorSpeedScale }, hidden: false }
      }
      // Its quarry is all out of reach (on the way in through a door, or on the wing): wait a little.
      if (raid.timer >= T.waitSeconds) return finish()
      return { events, pursuit: stand, hidden: false }
    }
    case 'chase': {
      const target = world.prey.find((entry) => entry.id === raid.preyId)
      if (!target || !target.targetable || raid.timer >= T.chaseGiveUpSeconds) {
        dropPrey()
        enter(raid, 'hunt')
        return { events, pursuit: stand, hidden: false }
      }
      if (mouthTo(target) <= T.pounceDistance) {
        enter(raid, 'pounce')
        events.push({ kind: 'pounce', preyId: target.id })
        // It pulls up and crouches where it is: the leap comes after.
        return { events, pursuit: stand, hidden: false, face: { x: target.x, z: target.z } }
      }
      return { events, pursuit: { x: target.x, z: target.z, speedScale: T.chaseSpeedScale }, hidden: false }
    }
    case 'pounce': {
      const target = world.prey.find((entry) => entry.id === raid.preyId)
      if (!target) {
        dropPrey()
        enter(raid, 'hunt')
        return { events, pursuit: stand, hidden: false }
      }
      const face = { x: target.x, z: target.z }
      // The prey is frozen, so the swipe always lands, on the tick nearest the clip's blow.
      if (raid.timer + dt / 2 >= T.coilSeconds + T.lungeSeconds + T.swipeSeconds) {
        events.push({ kind: 'catch', preyId: target.id, x: target.x, z: target.z })
        raid.preyId = null
        raid.eaten += 1
        enter(raid, 'feed')
        return { events, pursuit: stand, hidden: false, face }
      }
      // A pursuit set now moves it on the next step, so it leaps while that step falls in the lunge.
      const landBy = T.coilSeconds + T.lungeSeconds
      const standOff = Math.max(0, target.radius ?? 0) + T.strikeDistance
      const gap = mouthTo(target) - standOff
      const distance = Math.hypot(target.x - world.x, target.z - world.z)
      if (raid.timer + dt > T.coilSeconds && raid.timer < landBy && gap > 0 && distance > 0) {
        // Paced to touch down on time: whatever is left of the gap over whatever is left of the leap.
        const speedScale = gap / Math.max(dt, landBy - raid.timer) / Math.max(0.1, world.speed)
        const short = reach + standOff
        const landing = { x: target.x - ((target.x - world.x) / distance) * short, z: target.z - ((target.z - world.z) / distance) * short }
        return { events, pursuit: { ...landing, speedScale }, hidden: false, face }
      }
      return { events, pursuit: stand, hidden: false, face }
    }
    case 'feed': {
      if (raid.timer >= T.eatSeconds) enter(raid, 'hunt')
      return { events, pursuit: stand, hidden: false }
    }
    case 'door': {
      const house = world.houses.find((entry) => entry.id === raid.houseId)
      if (!house || !house.inside.some((entry) => entry.species === raid.quarry)) {
        raid.houseId = null
        enter(raid, 'hunt')
        return { events, pursuit: stand, hidden: false }
      }
      const door = { x: house.doorX, z: house.doorZ }
      if (Math.hypot(door.x - world.x, door.z - world.z) <= T.doorDistance) {
        enter(raid, 'inside')
        events.push({ kind: 'enter', houseId: house.id })
        return { events, pursuit: { ...door, speedScale: 0 }, hidden: true }
      }
      return { events, pursuit: { ...door, speedScale: T.doorSpeedScale }, hidden: false }
    }
    case 'inside': {
      const house = world.houses.find((entry) => entry.id === raid.houseId)
      if (house && raid.timer < T.insideSeconds) return { events, pursuit: { x: house.doorX, z: house.doorZ, speedScale: 0 }, hidden: true }
      if (house) {
        const victims = house.inside.filter((entry) => entry.species === raid.quarry).map((entry) => entry.id)
        const take = tame ? victims.slice(0, Math.max(0, left())) : victims
        if (take.length > 0) {
          events.push({ kind: 'devour', houseId: house.id, preyIds: take })
          raid.eaten += take.length
        }
        events.push({ kind: 'emerge', houseId: house.id })
      }
      raid.houseId = null
      enter(raid, 'feed')
      return { events, pursuit: stand, hidden: false }
    }
    case 'leave': {
      const remaining = Math.hypot(world.exit.x - world.x, world.exit.z - world.z)
      if (remaining <= 1 || raid.timer >= T.leaveSeconds) {
        events.push({ kind: 'gone' })
        goAway()
        enter(raid, 'away')
        return { events, pursuit: null, hidden: false }
      }
      return { events, pursuit: { x: world.exit.x, z: world.exit.z, speedScale: T.leaveSpeedScale }, hidden: false }
    }
  }
  return { events, pursuit: onFarm && !tame ? stand : null, hidden: false }
}
