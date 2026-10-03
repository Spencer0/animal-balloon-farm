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
