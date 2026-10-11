import { clampToFarm, containsFarmPoint, farmEdgePoint } from './farm-footprint'

/**
 * Shared entry-gate routes for animals travelling between the carnival and farm.
 * Pure numeric helpers keep the travel arc deterministic and easy to regression-test.
 */

export interface AnimalPosition {
  readonly x: number
  readonly z: number
}

export interface AnimalTravelBounds {
  readonly halfWidth: number
  readonly halfDepth: number
  readonly footprint?: 'organic'
}

export interface AnimalTravelRoute {
  readonly waypoints: readonly AnimalPosition[]
  readonly nextWaypoint: number
}

export interface AnimalTravelStep {
  readonly position: AnimalPosition
  readonly route: AnimalTravelRoute | null
  readonly completed: boolean
}

const GATE_CLEARANCE = 3.7
const APPROACH_CLEARANCE = 2.4

/** Meadow kept between a carnival animal and the garden wall. */
export const FARM_WALL_CLEARANCE = 1.8

/**
 * The open meadow around the plot that visitors roam. It is a rectangle around
 * the middle of the farm that never shrinks below the floor and keeps a margin
 * beyond the wall as the plot grows, so a grown farm cannot swallow the midway.
 */
export const CARNIVAL_RING_FLOOR = { x: 50, z: 40 } as const
export const CARNIVAL_RING_MARGIN = { x: 26, z: 24 } as const

export function carnivalRing(bounds?: { readonly halfWidth: number; readonly halfDepth: number }): { readonly x: number; readonly z: number } {
  return {
    x: Math.max(CARNIVAL_RING_FLOOR.x, (bounds?.halfWidth ?? 0) + CARNIVAL_RING_MARGIN.x),
    z: Math.max(CARNIVAL_RING_FLOOR.z, (bounds?.halfDepth ?? 0) + CARNIVAL_RING_MARGIN.z),
  }
}

/** How far in from the edge of the ring a visitor steps onto the grounds, as a fraction of the ring. */
const RING_EDGE_INSET = 0.94

/**
 * Where a visitor first comes into view: the species usual spot pushed straight
 * out to the edge of the ring, then slid `lateral` units along the edge so that
 * two arrivals of one species do not use the same footprints.
 */
export function groundsEntryPoint(
  spawn: AnimalPosition,
  ring: { readonly x: number; readonly z: number },
  lateral = 0,
): AnimalPosition {
  const rx = ring.x * RING_EDGE_INSET
  const rz = ring.z * RING_EDGE_INSET
  const ax = Math.abs(spawn.x) / rx
  const az = Math.abs(spawn.z) / rz
  const scale = Math.max(ax, az)
  const edge = scale > 1e-6 ? { x: spawn.x / scale, z: spawn.z / scale } : { x: rx, z: 0 }
  const alongX = az >= ax
  return {
    x: clamp(edge.x + (alongX ? lateral : 0), -rx, rx),
    z: clamp(edge.z + (alongX ? 0 : lateral), -rz, rz),
  }
}

/** The spot at the edge of the ring a leaving visitor walks to: straight out from the farm. */
export function groundsExitPoint(
  from: AnimalPosition,
  ring: { readonly x: number; readonly z: number },
): AnimalPosition {
  const rx = ring.x * RING_EDGE_INSET
  const rz = ring.z * RING_EDGE_INSET
  const scale = Math.max(Math.abs(from.x) / rx, Math.abs(from.z) / rz)
  if (scale < 1e-3) return { x: rx, z: 0 }
  return { x: from.x / scale, z: from.z / scale }
}

/**
 * Where member `index` of a pack stands relative to its leader (index 0). Members
 * are spread round the leader at slightly different distances so a pack reads
 * as a loose bunch rather than a ring.
 */
export function packOffset(index: number, spacing = 2.4): AnimalPosition {
  if (index <= 0) return { x: 0, z: 0 }
  const angle = index * 2.4 + 0.6
  const distance = spacing * (0.85 + 0.15 * ((index * 7) % 5))
  return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance * 0.8 }
}

/** Stage 2 is a visitor; settled/breedable residents stay on the farm. */
export function canAnimalLeaveFarm(stage: number): boolean {
  return stage === 2
}

/**
 * Nudge a carnival point clear of the garden footprint.
 *
 * Fairground props slide outward by the same rule as the plot grows, so a spawn
 * or a walk target authored beside a tent stays beside that tent instead of
 * ending up inside the fence. The cheaper axis wins, which keeps the point near
 * where it was authored rather than flinging it diagonally across the meadow.
 */
export function clearOfFarmBounds(
  position: AnimalPosition,
  bounds: AnimalTravelBounds,
  clearance = FARM_WALL_CLEARANCE,
): AnimalPosition {
  if (bounds.footprint === 'organic') {
    if (!containsFarmPoint(position.x, position.z, bounds, -clearance)) return { ...position }
    const angle = Math.atan2(position.z / bounds.halfDepth, position.x / bounds.halfWidth)
    return farmEdgePoint(angle, bounds, clearance + .1)
  }
  const requiredX = Math.max(0, bounds.halfWidth + clearance - Math.abs(position.x))
  const requiredZ = Math.max(0, bounds.halfDepth + clearance - Math.abs(position.z))
  if (requiredX <= 0 || requiredZ <= 0) return { ...position }
  return requiredX <= requiredZ
    ? { x: position.x + Math.sign(position.x || 1) * requiredX, z: position.z }
    : { x: position.x, z: position.z + Math.sign(position.z || 1) * requiredZ }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function nearestSide(position: AnimalPosition, bounds: AnimalTravelBounds): 'west' | 'east' | 'north' | 'south' {
  const distances = [
    { side: 'west' as const, distance: Math.hypot(position.x + bounds.halfWidth, position.z - clamp(position.z, -bounds.halfDepth, bounds.halfDepth)) },
    { side: 'east' as const, distance: Math.hypot(position.x - bounds.halfWidth, position.z - clamp(position.z, -bounds.halfDepth, bounds.halfDepth)) },
    { side: 'north' as const, distance: Math.hypot(position.z - bounds.halfDepth, position.x - clamp(position.x, -bounds.halfWidth, bounds.halfWidth)) },
    { side: 'south' as const, distance: Math.hypot(position.z + bounds.halfDepth, position.x - clamp(position.x, -bounds.halfWidth, bounds.halfWidth)) },
  ]
  return distances.reduce((nearest, candidate) => candidate.distance < nearest.distance ? candidate : nearest).side
}

/** Create a route through the nearest edge; the approach stays outside the fence. */
export function createAnimalTravelRoute(
  direction: 'enter' | 'leave',
  bounds: AnimalTravelBounds,
  start: AnimalPosition,
): AnimalTravelRoute {
  if (bounds.footprint === 'organic') {
    const isInside = containsFarmPoint(start.x, start.z, bounds)
    const angle = Math.atan2(start.z / bounds.halfDepth, start.x / bounds.halfWidth)
    const outer = farmEdgePoint(angle, bounds, APPROACH_CLEARANCE)
    const edge = farmEdgePoint(angle, bounds, -GATE_CLEARANCE)
    const inner = clampToFarm(edge.x, edge.z, bounds, GATE_CLEARANCE)
    return { waypoints: direction === 'enter' ? isInside ? [inner] : [outer, inner] : isInside ? [inner, outer] : [outer], nextWaypoint: 0 }
  }
  const isInside = Math.abs(start.x) < bounds.halfWidth && Math.abs(start.z) < bounds.halfDepth
  const side = nearestSide(start, bounds)
  const gateX = clamp(start.x, -bounds.halfWidth + GATE_CLEARANCE, bounds.halfWidth - GATE_CLEARANCE)
  const gateZ = clamp(start.z, -bounds.halfDepth + GATE_CLEARANCE, bounds.halfDepth - GATE_CLEARANCE)
  let inner: AnimalPosition
  let outer: AnimalPosition
  let approach: AnimalPosition | null = null
  switch (side) {
    case 'west':
      inner = { x: -bounds.halfWidth + GATE_CLEARANCE, z: gateZ }
      outer = { x: -bounds.halfWidth - APPROACH_CLEARANCE, z: gateZ }
      if (direction === 'enter' && !isInside) approach = { x: outer.x, z: gateZ }
      break
    case 'east':
      inner = { x: bounds.halfWidth - GATE_CLEARANCE, z: gateZ }
      outer = { x: bounds.halfWidth + APPROACH_CLEARANCE, z: gateZ }
      if (direction === 'enter' && !isInside) approach = { x: outer.x, z: gateZ }
      break
    case 'north':
      inner = { x: gateX, z: bounds.halfDepth - GATE_CLEARANCE }
      outer = { x: gateX, z: bounds.halfDepth + APPROACH_CLEARANCE }
      if (direction === 'enter' && !isInside) approach = { x: gateX, z: outer.z }
      break
    case 'south':
      inner = { x: gateX, z: -bounds.halfDepth + GATE_CLEARANCE }
      outer = { x: gateX, z: -bounds.halfDepth - APPROACH_CLEARANCE }
      if (direction === 'enter' && !isInside) approach = { x: gateX, z: outer.z }
      break
  }

  const waypoints = direction === 'enter'
    ? isInside ? [inner] : [approach ?? outer, outer, inner]
    : isInside ? [inner, outer] : [outer]
  return { waypoints, nextWaypoint: 0 }
}

/** Move at a constant walking speed, consuming any spare distance at a waypoint. */
export function advanceAnimalTravel(
  position: AnimalPosition,
  route: AnimalTravelRoute,
  distance: number,
): AnimalTravelStep {
  let x = position.x
  let z = position.z
  let remaining = Math.max(0, distance)
  let nextWaypoint = route.nextWaypoint

  while (nextWaypoint < route.waypoints.length) {
    const waypoint = route.waypoints[nextWaypoint]
    const dx = waypoint.x - x
    const dz = waypoint.z - z
    const remainingToWaypoint = Math.hypot(dx, dz)
    if (remainingToWaypoint <= 1e-6) {
      nextWaypoint += 1
      continue
    }
    if (remaining < remainingToWaypoint) {
      const fraction = remaining / remainingToWaypoint
      x += dx * fraction
      z += dz * fraction
      remaining = 0
      break
    }
    x = waypoint.x
    z = waypoint.z
    remaining -= remainingToWaypoint
    nextWaypoint += 1
  }

  const completed = nextWaypoint >= route.waypoints.length
  return {
    position: { x, z },
    route: completed ? null : { waypoints: route.waypoints, nextWaypoint },
    completed,
  }
}
