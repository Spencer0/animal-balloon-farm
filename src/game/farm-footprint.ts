import type { GardenBounds } from './farm-expansion'

/** Seeded lobes stay fixed as the silhouette grows, so owned land never retreats. */
export function farmEdgeFactor(angle: number): number {
  return 0.93 + 0.035 * Math.sin(angle * 3 + 0.4) + 0.025 * Math.sin(angle * 5 - 0.8) + 0.01 * Math.cos(angle * 7)
}

export function farmEdgePoint(angle: number, bounds: GardenBounds, outset = 0): { x: number; z: number } {
  const factor = bounds.footprint === 'organic' ? farmEdgeFactor(angle) : 1
  return { x: Math.cos(angle) * (bounds.halfWidth * factor + outset), z: Math.sin(angle) * (bounds.halfDepth * factor + outset) }
}

/** Radial signed edge distance in world units. Negative means cultivated land. */
export function farmEdgeDistance(x: number, z: number, bounds: GardenBounds): number {
  if (bounds.footprint === 'organic') {
    const nx = x / bounds.halfWidth
    const nz = z / bounds.halfDepth
    const angle = Math.atan2(nz, nx)
    const worldRadius = Math.hypot(Math.cos(angle) * bounds.halfWidth, Math.sin(angle) * bounds.halfDepth)
    return (Math.hypot(nx, nz) - farmEdgeFactor(angle)) * worldRadius
  }
  const radius = Math.min(0.9, bounds.halfWidth, bounds.halfDepth)
  const qx = Math.abs(x) - (bounds.halfWidth - radius)
  const qz = Math.abs(z) - (bounds.halfDepth - radius)
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius
}

export function containsFarmPoint(x: number, z: number, bounds: GardenBounds, inset = 0): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && farmEdgeDistance(x, z, bounds) <= -inset
}

export function clampToFarm(x: number, z: number, bounds: GardenBounds, inset = 1): { x: number; z: number } {
  if (bounds.footprint !== 'organic') return {
    x: Math.max(-bounds.halfWidth + inset, Math.min(bounds.halfWidth - inset, x)),
    z: Math.max(-bounds.halfDepth + inset, Math.min(bounds.halfDepth - inset, z)),
  }
  const angle = Math.atan2(z / bounds.halfDepth, x / bounds.halfWidth)
  const radius = Math.hypot(x / bounds.halfWidth, z / bounds.halfDepth)
  const worldRadius = Math.hypot(Math.cos(angle) * bounds.halfWidth, Math.sin(angle) * bounds.halfDepth)
  const limit = Math.max(0, farmEdgeFactor(angle) - inset / worldRadius)
  const scale = radius > limit ? limit / radius : 1
  return { x: x * scale, z: z * scale }
}
