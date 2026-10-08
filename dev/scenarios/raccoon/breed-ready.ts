import { type Scenario } from '../types'
import { holdNight, openFarm } from './farm'

export const breedReady: Scenario = {
  id: 'raccoon/breed-ready',
  description: 'Night, a garbage can and a dumpster, two raccoons in love and ready to court.',
  async run(d) {
    await openFarm(d, { cans: 1, dumpsters: 1 })
    d.addAnimal('raccoon', 4)
    d.addAnimal('raccoon', 4)
    holdNight(d)
    d.focusPoint(0, -2, 9)
  },
}
