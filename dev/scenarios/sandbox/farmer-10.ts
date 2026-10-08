import type { Scenario } from '../types'
import { pause } from '../types'

/** Points that put the ledger at farmer level 10: 50 for the first, then 50 per level. */
const LEVEL_10_POINTS = 500

export const farmer10: Scenario = {
  id: 'sandbox/farmer-10',
  description: 'Farmer level 10 with 9999 coins, ten seeds of every plant and the parcels that level earns. For poking at the shop, shed and farm without playing up to them.',
  async run(d) {
    d.closeMenu()
    // grantCoins(0) just reports the balance, so top up to exactly 9999.
    d.grantCoins(9999 - d.grantCoins(0))
    d.grantPoints(LEVEL_10_POINTS)
    d.grantSeeds(10)
    // Reveal the parcels that level has earned straight away.
    d.expandFarm(10)
    await pause(500)
    d.focusPoint(0, 0, 30)
  },
}
