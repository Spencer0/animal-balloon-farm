/**
 * Owl and snake hunts as simulation systems.
 *
 * The decisions already lived in pure state machines (`predator.ts` for the
 * owl's flight, `ground-hunt.ts` for the snake). This module steps them on the
 * fixed sim tick against `AnimalSimRecord`s instead of drawn animals, writes the
 * steering back to the records (`pursuit`, `alarmed`), and reports what happened
 * as plain events the scene plays: a `caught` and a `popped` for a strike that
 * lands, an `escaped` for a snake's miss.
 *
 * Nothing here draws or touches the DOM. Every random draw (the snake's strike
 * die) comes from a seeded stream per snake, so a seeded run replays exactly.
 */
import { seededRandom } from './seeded-random'
import { setSimAlarmed, setSimPursuit, type AnimalSimRecord } from './animal-sim'
import { createGroundHunter, stepGroundHunter, type GroundHunter, type GroundHuntPhase, type GroundPreyView } from './ground-hunt'
import {
  createOwlFlight,
  owlVisible,
  stepOwl,
  type OwlFlight,
  type OwlWorld,
  type Point3,
  type PreyView,
  type OwlPhase,
} from './predator'

export type HuntEvent =
  /** A strike landed: the hunter has the prey. `roll` is the snake's die, absent for an owl. */
  | { readonly type: 'caught'; readonly hunter: 'owl' | 'snake'; readonly hunterId: string; readonly preyId: string; readonly roll?: number }
  /** The snake's die let the prey off; it should run for home. */
  | { readonly type: 'escaped'; readonly hunterId: string; readonly preyId: string; readonly roll: number }
  /** An animal is gone from the farm: eaten, or an owl out of helium. */
  | { readonly type: 'popped'; readonly animalId: string; readonly cause: 'caught' | 'deflated' }

/** A stable number from a string, to seed per-animal streams from instance ids. */
export function hashString(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// ------------------------------------------------------------------- snakes --

export interface SnakeInput {
  readonly id: string
  readonly record: AnimalSimRecord
  /** Visitors and residents on the farm hunt; a snake out at the carnival does not. */
  readonly huntAllowed: boolean
  /** How far ahead of its centre its mouth is, in metres. */
  readonly reach: number
}

export interface PreyInput {
  readonly id: string
  readonly species: string
  readonly record: AnimalSimRecord
  readonly targetable: boolean
}

export interface SnakeStepInput {
  readonly snakes: readonly SnakeInput[]
  /** Adult mice and rats out on the farm, targetable or not. */
  readonly prey: readonly PreyInput[]
  /** Adult residents per prey species, indoors or out, for the breeding floor. */
  readonly preyCounts: Readonly<Record<string, number>>
}

export interface SnakeSimReport {
  readonly snakes: readonly { readonly id: string; readonly phase: GroundHuntPhase; readonly preyId: string | null; readonly cooldown: number }[]
}

export interface SnakeSim {
  /** Advance every snake by one sim tick, after the animals have moved. */
  step(dt: number, input: SnakeStepInput, events: HuntEvent[]): void
  /** Prey a snake is after right now; the scene keeps these in full detail. */
  huntedIds(): ReadonlySet<string>
  /** Debug: make every snake hunt as soon as it can. */
  hurry(): void
  /** Forget every snake's hunt and calm every mouse, as when the farm is reset. */
  reset(): void
  report(): SnakeSimReport
}

export function createSnakeSim(seed: number): SnakeSim {
  const hunters = new Map<string, GroundHunter>()
  const dice = new Map<string, () => number>()
  const steered = new Map<string, AnimalSimRecord>()
  /** Prey frozen in fright by a winning roll, held still until the lunge lands. */
  const frozen = new Map<string, AnimalSimRecord>()
  const rolls = new Map<string, number>()
  const hunted = new Set<string>()

  function calm(preyId: string): void {
    const record = frozen.get(preyId)
    if (record) setSimPursuit(record, null)
    frozen.delete(preyId)
    rolls.delete(preyId)
    hunted.delete(preyId)
  }

  function release(snakeId: string): void {
    const record = steered.get(snakeId)
    if (record) setSimPursuit(record, null)
    steered.delete(snakeId)
  }

  return {
    step(dt, input, events) {
      const views: GroundPreyView[] = input.prey.map((entry) => ({
        id: entry.id,
        species: entry.species,
        x: entry.record.x,
        z: entry.record.z,
        targetable: entry.targetable,
      }))
      const preyById = new Map(input.prey.map((entry) => [entry.id, entry]))
      const present = new Set<string>()

      for (const snake of input.snakes) {
        const id = snake.id
        present.add(id)
        let hunter = hunters.get(id)
        if (!hunter) {
          hunter = createGroundHunter()
          hunters.set(id, hunter)
          dice.set(id, seededRandom(seed ^ hashString(id)))
        }
        const step = stepGroundHunter(hunter, {
          x: snake.record.x,
          z: snake.record.z,
          huntAllowed: snake.huntAllowed,
          reach: snake.reach,
          prey: views,
          preyCounts: input.preyCounts,
          random: dice.get(id),
        }, dt)
        for (const event of step.events) {
          if (event.kind === 'stalk') {
            hunted.add(event.preyId)
          } else if (event.kind === 'strike') {
            const prey = preyById.get(event.preyId)
            if (!prey) continue
            if (event.caught) {
              // Frozen to the spot, the way a mouse goes still when it is too late.
              setSimPursuit(prey.record, { x: prey.record.x, z: prey.record.z, speedScale: 0 })
              frozen.set(event.preyId, prey.record)
              rolls.set(event.preyId, event.roll)
            } else {
              calm(event.preyId)
              events.push({ type: 'escaped', hunterId: id, preyId: event.preyId, roll: event.roll })
            }
          } else if (event.kind === 'abandon') {
            calm(event.preyId)
          } else if (event.kind === 'catch') {
            const prey = preyById.get(event.preyId)
            const roll = rolls.get(event.preyId) ?? 0
            calm(event.preyId)
            if (prey) {
              events.push({ type: 'caught', hunter: 'snake', hunterId: id, preyId: event.preyId, roll })
              events.push({ type: 'popped', animalId: event.preyId, cause: 'caught' })
            }
          }
        }
        if (step.pursuit) {
          setSimPursuit(snake.record, step.pursuit)
          steered.set(id, snake.record)
        } else if (steered.has(id)) {
          release(id)
        }
      }

      // Forget snakes that have gone (sold, popped, indoors), and release their prey.
      for (const [id, hunter] of hunters) {
        if (present.has(id)) continue
        if (hunter.preyId) calm(hunter.preyId)
        release(id)
        hunters.delete(id)
        dice.delete(id)
      }
      for (const id of [...frozen.keys()]) if (!preyById.has(id)) calm(id)
      for (const id of [...hunted]) if (!preyById.has(id)) hunted.delete(id)
    },
    huntedIds: () => hunted,
    hurry() {
      for (const hunter of hunters.values()) hunter.cooldown = 0
    },
    reset() {
      for (const id of [...frozen.keys()]) calm(id)
      hunted.clear()
      for (const id of [...steered.keys()]) release(id)
      hunters.clear()
      dice.clear()
    },
    report() {
      return {
        snakes: [...hunters.entries()].map(([id, hunter]) => ({ id, phase: hunter.phase, preyId: hunter.preyId, cooldown: hunter.cooldown })),
      }
    },
  }
}

// -------------------------------------------------------------------- owls --

export interface OwlInput {
  readonly id: string
  /** Where the owl first turns up, out at the tents. */
  readonly carnivalSpawn: readonly [number, number]
  readonly stage: number
  /** The perch assigned to this owl, if the farm has an oak. */
  readonly roost: Point3 | null
  /** A resident with no oak to roost on: it stays aloft and slowly loses helium. */
  readonly stranded: boolean
  readonly sold: boolean
  /** False for a fed resident: it patrols but leaves the flock be (see `animal-diet.ts`). Absent reads hungry. */
  readonly hungry?: boolean
}

export interface OwlStepInput {
  readonly night: boolean
  readonly owls: readonly OwlInput[]
  /** Adult resident chickens: the whole flock, targetable or not. */
  readonly prey: readonly PreyInput[]
  /** Half-extents of the farm plot, which the patrol loop stays inside. */
  readonly farm: { readonly halfWidth: number; readonly halfDepth: number }
}

/** What an owl's flight looked like one tick ago, for the view to blend from. */
export interface OwlSnapshot {
  x: number
  y: number
  z: number
  heading: number
  pitch: number
  helium: number
  /** Whether it was in the world then; a blend never runs from "away" into view. */
  visible: boolean
}

/** An owl in the world: its flight, and the tick before it. */
export interface OwlTrack {
  readonly flight: OwlFlight
  readonly prev: OwlSnapshot
}

export interface OwlSimReport {
  readonly owls: readonly { readonly id: string; readonly phase: OwlPhase; readonly x: number; readonly y: number; readonly z: number; readonly preyId: string | null; readonly cooldown: number; readonly helium: number; readonly visible: boolean }[]
}

export interface OwlSim {
  /** Advance every owl by one sim tick, after the animals have moved. */
  step(dt: number, input: OwlStepInput, events: HuntEvent[]): void
  /** The flight (and last tick's snapshot) of an owl, once it has been stepped. */
  track(id: string): OwlTrack | undefined
  /** Chickens an owl is stalking right now; the scene keeps these in full detail. */
  huntedIds(): ReadonlySet<string>
  /** Debug: make an owl hunt as soon as it can. */
  hurry(): void
  /** Debug: set every owl's helium (0..1). */
  setHelium(level: number): void
  /** Forget every owl's flight and calm every chicken, as when the farm is reset. */
  reset(): void
  report(): OwlSimReport
}

function snapshot(into: OwlSnapshot, flight: OwlFlight): void {
  into.x = flight.x
  into.y = flight.y
  into.z = flight.z
  into.heading = flight.heading
  into.pitch = flight.pitch
  into.helium = flight.helium
  into.visible = owlVisible(flight)
}

export function createOwlSim(): OwlSim {
  const tracks = new Map<string, { flight: OwlFlight; prev: OwlSnapshot }>()
  const alarmed = new Map<string, AnimalSimRecord>()
  const hunted = new Set<string>()
  /** Debug: helium handed to any owl whose flight has not started yet. */
  let startingHelium: number | null = null

  function trackFor(id: string): { flight: OwlFlight; prev: OwlSnapshot } {
    let track = tracks.get(id)
    if (!track) {
      const flight = createOwlFlight()
      // Start the loop somewhere different for each owl so a pair never overlap.
      flight.orbit = tracks.size * 2.4
      if (startingHelium !== null) flight.helium = startingHelium
      track = { flight, prev: { x: flight.x, y: flight.y, z: flight.z, heading: flight.heading, pitch: flight.pitch, helium: flight.helium, visible: owlVisible(flight) } }
      tracks.set(id, track)
    }
    return track
  }

  function calm(preyId: string): void {
    const record = alarmed.get(preyId)
    if (record) setSimAlarmed(record, false)
    alarmed.delete(preyId)
    hunted.delete(preyId)
  }

  return {
    step(dt, input, events) {
      const preyViews: PreyView[] = input.prey.map((entry) => ({ id: entry.id, x: entry.record.x, z: entry.record.z, targetable: entry.targetable }))
      const preyById = new Map(input.prey.map((entry) => [entry.id, entry]))

      for (const owl of input.owls) {
        const track = trackFor(owl.id)
        const flight = track.flight
        snapshot(track.prev, flight)
        const visitor = owl.stage <= 1
        const center = visitor
          ? { x: owl.carnivalSpawn[0], z: owl.carnivalSpawn[1] }
          : { x: 0, z: 0 }
        const radius = visitor
          ? { x: 7, z: 5 }
          : { x: Math.max(4, input.farm.halfWidth * 0.62), z: Math.max(3, input.farm.halfDepth * 0.62) }
        const world: OwlWorld = {
          night: input.night,
          // Only a resident has a perch of its own; a visitor leaves at dawn.
          roost: owl.stage >= 3 && owl.roost ? { x: owl.roost.x, y: owl.roost.y, z: owl.roost.z } : null,
          center,
          radius,
          huntAllowed: owl.stage >= 2 && owl.hungry !== false,
          prey: preyViews,
          present: owl.stage > 0 && !owl.sold,
          stranded: owl.stranded,
        }
        for (const event of stepOwl(flight, world, dt)) {
          if (event.kind === 'stalk') {
            const prey = preyById.get(event.preyId)
            if (prey) {
              setSimAlarmed(prey.record, true)
              alarmed.set(event.preyId, prey.record)
              hunted.add(event.preyId)
            }
          } else if (event.kind === 'deflated') {
            events.push({ type: 'popped', animalId: owl.id, cause: 'deflated' })
          } else if (event.kind === 'abandon') {
            calm(event.preyId)
          } else if (event.kind === 'catch') {
            const prey = preyById.get(event.preyId)
            calm(event.preyId)
            if (prey) {
              events.push({ type: 'caught', hunter: 'owl', hunterId: owl.id, preyId: event.preyId })
              events.push({ type: 'popped', animalId: event.preyId, cause: 'caught' })
            }
          }
        }
      }

      // Release any chicken whose hunter has gone (sold, or no longer present).
      for (const id of [...alarmed.keys()]) if (!preyById.has(id)) calm(id)
    },
    track: (id) => tracks.get(id),
    huntedIds: () => hunted,
    hurry() {
      for (const track of tracks.values()) track.flight.cooldown = 0
    },
    setHelium(level) {
      startingHelium = Math.min(1, Math.max(0, level))
      for (const track of tracks.values()) track.flight.helium = startingHelium
    },
    reset() {
      for (const id of [...alarmed.keys()]) calm(id)
      tracks.clear()
      startingHelium = null
    },
    report() {
      return {
        owls: [...tracks.entries()].map(([id, { flight }]) => ({
          id, phase: flight.phase, x: flight.x, y: flight.y, z: flight.z, preyId: flight.preyId, cooldown: flight.cooldown, helium: flight.helium, visible: owlVisible(flight),
        })),
      }
    },
  }
}
