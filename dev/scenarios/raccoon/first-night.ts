import { type Scenario } from '../types'
import { holdNight, openFarm } from './farm'

export const firstNight: Scenario = {
  id: 'raccoon/first-night',
  description: 'Night, a resident cow, no garbage can yet. A wild raccoon is visiting; place a can (buy and placeProp) to settle it.',
  async run(d) {
    await openFarm(d, {})
    d.addAnimal('raccoon', 2)
    holdNight(d)
    d.focusPoint(0, 0, 9)
  },
}
