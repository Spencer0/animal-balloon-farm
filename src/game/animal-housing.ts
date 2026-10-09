/**
 * Animal houses: who is indoors, and who is out on the farm right now.
 *
 * Pure, like `animal-conditions.ts`: no Three.js, no DOM, no timers. Every house
 * has room for a fixed number of animals, shared by the species it takes in
 * (the coop takes chickens and ducks, the barn cows and sheep). Nobody owns a
 * bed: an animal that walks in takes a space, and one that walks out frees it.
 * A species needs a house with room to raise young, so houses are what grow
 * the herd.
 *
 * Rendering a hundred balloon animals at once is not affordable, so only a few
 * of each species are out on the farm at any moment and the rest are indoors.
 * `chooseOutdoorRoster` decides which, and rotates them so the whole herd gets
 * time outside.
 */

import { isNightOnly } from './animal-conditions'

/** Prop id of each house, and the species it takes in. A species has exactly one house. */
export const HOUSE_SPECIES: Readonly<Record<string, readonly string[]>> = {
  coop: ['chicken', 'duck'],
  barn: ['cow', 'sheep'],
  'goose-house': ['goose'],
  sty: ['pig'],
  'frog-house': ['frog'],
  'owl-box': ['owl'],
  dumpster: ['raccoon'],
  'hollow-log': ['mouse', 'rat'],
  'rock-pile': ['snake'],
}

/** Animals each house holds. */
export const HOUSE_CAPACITY = 10

export interface OutdoorLimits {
  /** At most this many of one species are out on the farm at once. */
  readonly perSpecies: number
  /** At most this many animals are out across the whole farm. */
  readonly total: number
  /** Seconds between rotations: each rotation swaps one animal of a species in for another. */
  readonly rotationSeconds: number
}

export const OUTDOOR_LIMITS: OutdoorLimits = {
  perSpecies: 5,
  total: 40,
  rotationSeconds: 45,
}

/** True for a prop id that is an animal house. */
export function isHouse(prop: string): boolean {
  return prop in HOUSE_SPECIES
}

/** The prop id of the house a species lives in, or null for a species with none. */
export function houseFor(species: string): string | null {
  for (const [prop, residents] of Object.entries(HOUSE_SPECIES)) {
    if (residents.includes(species)) return prop
  }
  return null
}

/** Whether a house of this prop takes in this species. */
export function houseAccepts(prop: string, species: string): boolean {
  return HOUSE_SPECIES[prop]?.includes(species) ?? false
}

/** A house standing on the farm. `id` is stable for as long as the house stays put. */
export interface HouseSite {
  readonly id: string
  readonly prop: string
  readonly x: number
  readonly z: number
}

export interface HousedAnimal {
  readonly id: string
  readonly species: string
  /** The house it is inside right now, or null when it is out on the farm. */
  readonly insideId: string | null
}

/** How many animals are inside each house. `extra` counts animals already on their way in. */
export function occupantsByHouse(
  animals: readonly HousedAnimal[],
  extra: ReadonlyMap<string, number> = new Map(),
): ReadonlyMap<string, number> {
  const used = new Map(extra)
  for (const animal of animals) {
    if (animal.insideId) used.set(animal.insideId, (used.get(animal.insideId) ?? 0) + 1)
  }
  return used
}

/**
 * A house with room for a species, or null when every one is full. Nearest to
 * `from` when given, otherwise the emptiest.
 */
export function houseWithRoom<House extends HouseSite>(
  species: string,
  houses: readonly House[],
  used: ReadonlyMap<string, number>,
  capacity: number = HOUSE_CAPACITY,
  from?: { readonly x: number; readonly z: number },
): House | null {
  let best: House | null = null
  let bestScore = Infinity
  for (const house of houses) {
    if (!houseAccepts(house.prop, species)) continue
    const taken = used.get(house.id) ?? 0
    if (taken >= capacity) continue
    const score = from ? Math.hypot(house.x - from.x, house.z - from.z) : taken
    if (score < bestScore) {
      best = house
      bestScore = score
    }
  }
  return best
}

/** Free space for a species across every house that takes it in. */
export function freeRoomFor(
  species: string,
  houses: readonly HouseSite[],
  used: ReadonlyMap<string, number>,
  capacity: number = HOUSE_CAPACITY,
): number {
  let free = 0
  for (const house of houses) {
    if (houseAccepts(house.prop, species)) free += Math.max(0, capacity - (used.get(house.id) ?? 0))
  }
  return free
}

export interface RosterAnimal {
  readonly id: string
  readonly species: string
  /** A resident with a house of its kind on the farm: it can be sent indoors. */
  readonly canGoIndoors: boolean
  /** Must stay in view: selected, being captured, just born, hunting or hunted. */
  readonly pinned: boolean
}

export interface RosterInput {
  readonly animals: readonly RosterAnimal[]
  readonly night: boolean
  readonly timeSeconds: number
  readonly limits?: OutdoorLimits
}

/**
 * Whether a housed animal of this species wants to be out. A night animal sleeps
 * indoors by day. Day animals stay out after dark: chickens out at night are
 * what the owl hunts, and its ladder depends on that.
 */
export function isAwake(species: string, night: boolean): boolean {
  return !isNightOnly(species) || night
}

function stableOrder(a: { id: string }, b: { id: string }): number {
  return a.id.length - b.id.length || a.id.localeCompare(b.id)
}

/**
 * Which animals should be out on the farm. Everyone else goes indoors, if a
 * house has room for them.
 *
 * Pinned animals come first, then animals that cannot go indoors (visitors, or
 * a species with no house), then the rest, taken in a window that slides by one
 * every `rotationSeconds` so the whole herd gets time outside. A night animal
 * goes in to sleep by day. The limits are never exceeded here; an animal that
 * cannot fit indoors either is the caller's to leave outside.
 */
export function chooseOutdoorRoster(input: RosterInput): ReadonlySet<string> {
  const limits = input.limits ?? OUTDOOR_LIMITS
  const perSpecies = Math.max(0, Math.floor(limits.perSpecies))
  const total = Math.max(0, Math.floor(limits.total))
  const slot = Math.max(0, Math.floor(input.timeSeconds / Math.max(1, limits.rotationSeconds)))
  const outside = new Set<string>()
  const countBySpecies = new Map<string, number>()
  const admit = (animal: RosterAnimal): boolean => {
    const count = countBySpecies.get(animal.species) ?? 0
    if (outside.size >= total || count >= perSpecies || outside.has(animal.id)) return false
    outside.add(animal.id)
    countBySpecies.set(animal.species, count + 1)
    return true
  }
  const sorted = [...input.animals].sort(stableOrder)
  for (const animal of sorted) if (animal.pinned) admit(animal)
  for (const animal of sorted) if (!animal.canGoIndoors) admit(animal)

  const bySpecies = new Map<string, RosterAnimal[]>()
  for (const animal of sorted) {
    if (!animal.canGoIndoors || animal.pinned || !isAwake(animal.species, input.night)) continue
    const list = bySpecies.get(animal.species) ?? []
    list.push(animal)
    bySpecies.set(animal.species, list)
  }
  // Species take turns for the shared total so one big herd cannot crowd out the rest.
  const queues = [...bySpecies.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, list]) => {
      const offset = slot % list.length
      return [...list.slice(offset), ...list.slice(0, offset)]
    })
  let admitted = true
  while (admitted && outside.size < total) {
    admitted = false
    for (const queue of queues) {
      while (queue.length > 0) {
        const next = queue.shift()!
        if (admit(next)) {
          admitted = true
          break
        }
        if ((countBySpecies.get(next.species) ?? 0) >= perSpecies) {
          queue.length = 0
          break
        }
      }
    }
  }
  return outside
}

export interface HouseOccupancy {
  readonly capacity: number
  readonly used: number
  /** How many of each species the house takes in are inside it right now. */
  readonly species: readonly { readonly species: string; readonly inside: number }[]
}

/** What the house info card shows: space in use and who is inside, by species. */
export function houseOccupancy(
  houseId: string,
  prop: string,
  animals: readonly HousedAnimal[],
  capacity: number = HOUSE_CAPACITY,
): HouseOccupancy {
  const rows = new Map<string, number>()
  for (const species of HOUSE_SPECIES[prop] ?? []) rows.set(species, 0)
  let used = 0
  for (const animal of animals) {
    if (animal.insideId !== houseId) continue
    used += 1
    rows.set(animal.species, (rows.get(animal.species) ?? 0) + 1)
  }
  return { capacity, used, species: [...rows.entries()].map(([species, inside]) => ({ species, inside })) }
}
