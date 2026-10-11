import type { BalloonAnimal } from '../animals/balloon-animal'
import type { AnimalLifeEvent } from '../game/animal-life'
import type { GardenBounds } from '../game/farm-expansion'
import { carnivalRing, clearOfFarmBounds, groundsEntryPoint, groundsExitPoint, packOffset, type AnimalPosition } from '../game/animal-travel'
import { GARDEN_LAWN_Y } from './fairground'

/**
 * How visitors come and go on the grounds.
 *
 * The sim only says that a visitor has arrived or is leaving. This module makes
 * it visible: an arrival steps onto the meadow at its far edge and walks in to
 * its usual spot, a pack walks in as a bunch behind its leader, and a leaving
 * visitor walks straight out again before the sim lets it go. Walking reuses the
 * model's pursuit steering, so none of it needs new animation.
 */

/** Brisk, so the long walk across the meadow takes seconds rather than minutes. */
const WALK_SPEED_SCALE = 1.8
const ARRIVED_RADIUS = 1.2
/** How far each species usual arrival spot is scattered, so repeat visits do not stack. */
const DESTINATION_SCATTER = 8

export interface ArrivalPlan {
  readonly entry: AnimalPosition
  readonly destination: AnimalPosition
}

export interface VisitorMotionDeps {
  readonly animalById: ReadonlyMap<string, BalloonAnimal>
  readonly activeGardenBounds: () => GardenBounds
  readonly carnivalSpawnFor: (species: string) => readonly [number, number]
  readonly random?: () => number
}

interface Walk {
  readonly kind: 'arrive' | 'depart'
  readonly x: number
  readonly z: number
}

export function createVisitorMotion(deps: VisitorMotionDeps) {
  const { animalById, activeGardenBounds, carnivalSpawnFor } = deps
  const random = deps.random ?? Math.random
  const walks = new Map<string, Walk>()
  /** The plan each pack leader arrived with this batch, so its followers can trail it. */
  const leaders = new Map<string, { plan: ArrivalPlan; followers: number }>()

  /** Call before handling a batch of life events: a pack always arrives within one. */
  function beginBatch(): void {
    leaders.clear()
  }

  function planArrival(event: AnimalLifeEvent): ArrivalPlan {
    const bounds = activeGardenBounds()
    const leader = event.leaderId ? leaders.get(event.leaderId) : undefined
    if (leader) {
      leader.followers += 1
      const offset = packOffset(leader.followers)
      return {
        entry: { x: leader.plan.entry.x + offset.x, z: leader.plan.entry.z + offset.z },
        destination: clearOfFarmBounds({ x: leader.plan.destination.x + offset.x, z: leader.plan.destination.z + offset.z }, bounds),
      }
    }
    const [spawnX, spawnZ] = carnivalSpawnFor(event.species)
    const entry = groundsEntryPoint({ x: spawnX, z: spawnZ }, carnivalRing(bounds), (random() - 0.5) * 16)
    const destination = clearOfFarmBounds({
      x: spawnX + (random() - 0.5) * DESTINATION_SCATTER,
      z: spawnZ + (random() - 0.5) * DESTINATION_SCATTER,
    }, bounds)
    const plan = { entry, destination }
    if (event.animalId) leaders.set(event.animalId, { plan, followers: 0 })
    return plan
  }

  function beginArrival(animal: BalloonAnimal, plan: ArrivalPlan): void {
    // A flier is placed by the predator sim, never walked.
    if (animal.isFlier) return
    animal.root.position.y = GARDEN_LAWN_Y
    animal.placeAt(plan.entry.x, plan.entry.z)
    animal.setPursuit({ x: plan.destination.x, z: plan.destination.z, speedScale: WALK_SPEED_SCALE })
    walks.set(animal.instanceId, { kind: 'arrive', x: plan.destination.x, z: plan.destination.z })
  }

  function beginDeparture(animal: BalloonAnimal): void {
    if (animal.isFlier || walks.get(animal.instanceId)?.kind === 'depart') return
    const exit = groundsExitPoint({ x: animal.currentPosition.x, z: animal.currentPosition.z }, carnivalRing(activeGardenBounds()))
    animal.setPursuit({ x: exit.x, z: exit.z, speedScale: WALK_SPEED_SCALE })
    walks.set(animal.instanceId, { kind: 'depart', x: exit.x, z: exit.z })
  }

  /** Hand the animal back to its own wandering, e.g. because it stepped into the farm. */
  function cancel(id: string): void {
    if (!walks.delete(id)) return
    animalById.get(id)?.setPursuit(null)
  }

  function step(): void {
    for (const [id, walk] of walks) {
      const animal = animalById.get(id)
      if (!animal || animal.isSold) {
        walks.delete(id)
        continue
      }
      if (walk.kind !== 'arrive') continue
      if (Math.hypot(animal.currentPosition.x - walk.x, animal.currentPosition.z - walk.z) <= ARRIVED_RADIUS) {
        walks.delete(id)
        animal.setPursuit(null)
      }
    }
  }

  return { beginBatch, planArrival, beginArrival, beginDeparture, cancel, step, isWalking: (id: string): boolean => walks.has(id) }
}

export type VisitorMotion = ReturnType<typeof createVisitorMotion>
