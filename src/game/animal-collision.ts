/**
 * Keep animals out of the houses and out of each other.
 *
 * Pure and cheap on purpose: every animal is a circle on the ground, every
 * solid prop an axis-aligned box (props snap to a 2 m lattice and turn in
 * quarter turns, so their footprints already are boxes). One pass a frame
 * pushes circles out of boxes and pairs of circles apart. Animal pairs are
 * found through a uniform grid, so the pass stays linear in the herd size
 * rather than checking every pair.
 *
 * It only ever nudges positions; walking, wandering and targets are left to
 * the animals, which simply slide along a wall or around a neighbour.
 */

export interface CollisionBody {
  x: number
  z: number
  readonly radius: number
  /** Pushes other animals but is never moved by them: asleep, mid-capture, or held still. */
  readonly fixed?: boolean
  /** Ignores boxes, e.g. on its way in through a house door, or asleep in its bed by one. */
  readonly ghost?: boolean
}

export interface CollisionBox {
  readonly minX: number
  readonly minZ: number
  readonly maxX: number
  readonly maxZ: number
}

/** Grid cell size in metres: comfortably larger than any animal's diameter. */
const CELL = 2.5

/** Push a circle out of a box, if it overlaps. Returns true when it moved. */
export function pushOutOfBox(body: CollisionBody, box: CollisionBox): boolean {
  const nearestX = Math.max(box.minX, Math.min(body.x, box.maxX))
  const nearestZ = Math.max(box.minZ, Math.min(body.z, box.maxZ))
  const dx = body.x - nearestX
  const dz = body.z - nearestZ
  const distanceSq = dx * dx + dz * dz
  if (distanceSq >= body.radius * body.radius) return false
  if (distanceSq > 1e-12) {
    const distance = Math.sqrt(distanceSq)
    const push = body.radius - distance
    body.x += (dx / distance) * push
    body.z += (dz / distance) * push
    return true
  }
  // The centre is inside the box: leave by the nearest side.
  const exits = [
    { side: body.x - box.minX, x: box.minX - body.radius, z: body.z },
    { side: box.maxX - body.x, x: box.maxX + body.radius, z: body.z },
    { side: body.z - box.minZ, x: body.x, z: box.minZ - body.radius },
    { side: box.maxZ - body.z, x: body.x, z: box.maxZ + body.radius },
  ]
  const exit = exits.reduce((best, next) => (next.side < best.side ? next : best))
  body.x = exit.x
  body.z = exit.z
  return true
}

/**
 * Resolve one frame of overlaps in place. Bodies leave boxes first (even a
 * fixed one: nothing may stand inside a house), then
 * overlapping pairs split the overlap between them (all of it to the free one
 * when the other is fixed). A single pass is enough at walking speeds; any
 * leftover overlap is taken up next frame.
 */
export function resolveCollisions(bodies: readonly CollisionBody[], boxes: readonly CollisionBox[]): void {
  pushOutOfBoxes(bodies, boxes)
  if (bodies.length < 2) return
  separatePairs(bodies)
  // Walls win: a pair split must never leave an animal inside a house. Any
  // overlap that leaves between animals is taken up over the next frames.
  pushOutOfBoxes(bodies, boxes)
}

function pushOutOfBoxes(bodies: readonly CollisionBody[], boxes: readonly CollisionBox[]): void {
  for (const body of bodies) {
    if (body.ghost) continue
    for (const box of boxes) pushOutOfBox(body, box)
  }
}

function separatePairs(bodies: readonly CollisionBody[]): void {
  const grid = new Map<string, number[]>()
  const keyOf = (cx: number, cz: number): string => `${cx},${cz}`
  bodies.forEach((body, index) => {
    const key = keyOf(Math.floor(body.x / CELL), Math.floor(body.z / CELL))
    const cell = grid.get(key)
    if (cell) cell.push(index)
    else grid.set(key, [index])
  })
  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index]
    const cx = Math.floor(body.x / CELL)
    const cz = Math.floor(body.z / CELL)
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        for (const other of grid.get(keyOf(cx + ox, cz + oz)) ?? []) {
          // Each pair once.
          if (other <= index) continue
          separate(body, bodies[other])
        }
      }
    }
  }
}

function separate(a: CollisionBody, b: CollisionBody): void {
  if (a.fixed && b.fixed) return
  let dx = b.x - a.x
  let dz = b.z - a.z
  const reach = a.radius + b.radius
  const distanceSq = dx * dx + dz * dz
  if (distanceSq >= reach * reach) return
  let distance = Math.sqrt(distanceSq)
  if (distance < 1e-6) {
    // Exactly on top of each other: split along x so the result is stable.
    dx = 1
    dz = 0
    distance = 1
    const overlap = reach
    if (!a.fixed && !b.fixed) {
      a.x -= overlap / 2
      b.x += overlap / 2
    } else if (a.fixed) {
      b.x += overlap
    } else {
      a.x -= overlap
    }
    return
  }
  const overlap = reach - distance
  const nx = dx / distance
  const nz = dz / distance
  const shareA = a.fixed ? 0 : b.fixed ? 1 : 0.5
  const shareB = 1 - shareA
  a.x -= nx * overlap * shareA
  a.z -= nz * overlap * shareA
  b.x += nx * overlap * shareB
  b.z += nz * overlap * shareB
}
