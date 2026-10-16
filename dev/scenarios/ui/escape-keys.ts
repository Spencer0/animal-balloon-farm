import type { Scenario } from '../types'
import { pause } from '../types'

export const escapeKeys: Scenario = {
  id: 'ui/escape-keys',
  description: 'In the farm with the menu closed, 9999 coins and level 10. Try Escape: J then Escape closes the journal, the balloon or the shop (click the stall) closes with one press, and a press with nothing open opens the menu, which Escape then closes. Hold Escape too: it should act once, on release.',
  async run(d) {
    d.closeMenu()
    d.grantCoins(9999 - d.grantCoins(0))
    d.grantPoints(500)
    d.grantSeeds(10)
    d.expandFarm(10)
    await pause(500)
    d.focusPoint(0, 0, 30)
  },
}
