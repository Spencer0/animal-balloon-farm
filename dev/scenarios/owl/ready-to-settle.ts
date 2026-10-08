import type { Scenario } from '../types'
import { advanceOwlTo, holdNight, openFarm } from './farm'

export const readyToSettle: Scenario = {
  id: 'owl/ready-to-settle',
  description: 'Five chickens, an oak, night, owl visiting with four chickens already eaten. The next catch is the fifth: it settles, paints into its own colours, and takes the oak.',
  async run(d) {
    await openFarm(d, { chickens: 5, oaks: 1 })
    holdNight(d)
    await advanceOwlTo(d, 2)
    d.feedOwl(4)
    d.hurryHunt()
    d.focusPoint(0, 0, 18)
  },
}
