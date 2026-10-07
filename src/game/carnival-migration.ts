import type { GardenBounds } from './farm-expansion'
import { farmEdgeDistance } from './farm-footprint'

export type CarnivalKind = 'decoration' | 'stall' | 'tent' | 'ride'
export type CarnivalPhase = 'active' | 'threatened' | 'shutdown' | 'packing' | 'removed' | 'relocated'
export interface CarnivalProp {
  readonly id: string
  readonly kind: CarnivalKind
  readonly label?: string
  readonly x: number
  readonly z: number
  readonly radius: number
  readonly removable: boolean
  readonly priority?: number
}
export interface CarnivalStatus extends CarnivalProp {
  readonly phase: CarnivalPhase
  readonly progress: number
}
const DURATIONS: Record<CarnivalKind, number> = { decoration: 0.85, stall: 1.4, tent: 1.8, ride: 2.7 }
const SHUTDOWN_SECONDS = 0.35
const RELOCATION_SECONDS = 1.2

/** No scene objects here: the same identity survives packing and far-layer arrival. */
export function createCarnivalMigration(props: readonly CarnivalProp[]) {
  if (new Set(props.map((prop) => prop.id)).size !== props.length) throw new Error('Carnival prop IDs must be unique')
  if (props.some((prop) => ![prop.x, prop.z, prop.radius, prop.priority ?? 0].every(Number.isFinite) || prop.radius < 0)) {
    throw new RangeError('Carnival footprints must be finite with non-negative radii')
  }
  const records = props.map((prop) => ({ ...prop, phase: 'active' as CarnivalPhase, progress: 0, elapsed: 0 }))
  let queue: typeof records = []
  let current: typeof records[number] | null = null
  return {
    get busy(): boolean { return current !== null || queue.length > 0 },
    statuses(): readonly CarnivalStatus[] { return records.map(({ elapsed: _elapsed, ...record }) => ({ ...record })) },
    target(bounds: GardenBounds): number {
      const candidates = records.filter((prop) => prop.removable && prop.phase === 'active'
        && farmEdgeDistance(prop.x, prop.z, bounds) <= prop.radius + 0.8)
      candidates.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)
        || Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z) || a.radius - b.radius || a.id.localeCompare(b.id))
      for (const prop of candidates) prop.phase = 'threatened'
      queue.push(...candidates)
      return candidates.length
    },
    update(deltaSeconds: number): number {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0
      // Arrivals are independent of the packing queue, and never block land ownership.
      for (const prop of records) {
        if (prop.phase !== 'removed') continue
        prop.elapsed += deltaSeconds
        if (prop.elapsed >= RELOCATION_SECONDS) { prop.phase = 'relocated'; prop.progress = 1 }
      }
      let remaining = deltaSeconds
      while (remaining > 0) {
        if (!current) {
          current = queue.shift() ?? null
          if (!current) break
          current.phase = 'shutdown'
          current.elapsed = 0
        }
        const shutdown = current.phase === 'shutdown'
        const duration = shutdown ? SHUTDOWN_SECONDS : DURATIONS[current.kind]
        const consumed = Math.min(remaining, duration - current.elapsed)
        current.elapsed += consumed
        remaining -= consumed
        current.progress = shutdown ? 0 : Math.min(1, current.elapsed / duration)
        if (current.elapsed + 1e-9 < duration) break
        if (shutdown) { current.phase = 'packing'; current.elapsed = 0 }
        else { current.phase = 'removed'; current.progress = 1; current.elapsed = 0; current = null }
      }
      // Seconds unused by packing may be spent on the land reveal, but time
      // already spent packing must never also advance the farm animation.
      return remaining
    },
  }
}
