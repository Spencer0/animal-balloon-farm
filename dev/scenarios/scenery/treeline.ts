import type { Scenario } from '../types'
import { pause } from '../types'

/** Compass angles of the biome sectors, the way the scene measures them: atan2(z, x). */
const VIEWS = {
  meadow: -90, rocky: -22, lake: 42, swamp: 108, ocean: 178,
} as const

export const treeline: Scenario = {
  id: 'scenery/treeline',
  description: 'The biome ring around the farm: mountain meadow, rocky peaks, lake, swamp and ocean. Opens on the rocky sector at the back right; pass &biome=meadow|rocky|lake|swamp|ocean to look at another.',
  async run(d) {
    d.closeMenu()
    // The farm at its full size, so the ring is seen from where a late-game camera sits.
    d.expandFarm(15)
    await pause(400)
    const requested = new URLSearchParams(location.search).get('biome') ?? 'rocky'
    const degrees = VIEWS[requested as keyof typeof VIEWS] ?? VIEWS.rocky
    const angle = degrees * Math.PI / 180
    d.focusPoint(Math.cos(angle) * 62, Math.sin(angle) * 62, 46)
  },
}
