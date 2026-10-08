import type { Scenario } from '../types'
import { advanceOwlTo, holdNight, openFarm } from './farm'

export const firstNight: Scenario = {
  id: 'owl/first-night',
  description: 'One resident chicken, night. The owl has just turned up at the carnival tents (stage 1, wild red) and circles over them.',
  async run(d) {
    await openFarm(d, { chickens: 1 })
    holdNight(d)
    await advanceOwlTo(d, 1)
    d.focusPoint(-20, 4, 22)
  },
}
