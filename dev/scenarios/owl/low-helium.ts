import type { Scenario } from '../types'
import { holdNight, openFarm } from './farm'

export const lowHelium: Scenario = {
  id: 'owl/low-helium',
  description: 'Night, a resident owl with no oak and about 15 seconds of helium left. It sags and shrinks, then pops. Place an oak (shop, 140 coins) before it runs out to refill it.',
  async run(d) {
    await openFarm(d, { chickens: 4 })
    d.addAnimal('owl', 3)
    holdNight(d)
    d.setOwlHelium(0.12)
    d.focusPoint(0, 0, 18)
  },
}
