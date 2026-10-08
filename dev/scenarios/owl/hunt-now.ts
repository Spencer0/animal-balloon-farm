import type { Scenario } from '../types'
import { advanceOwlTo, holdNight, openFarm } from './farm'

export const huntNow: Scenario = {
  id: 'owl/hunt-now',
  description: 'Five chickens, night, owl visiting the farm (stage 2) with its hunt ready. Within about ten seconds it stalks a chicken, dives, and the chicken pops.',
  async run(d) {
    await openFarm(d, { chickens: 5 })
    holdNight(d)
    await advanceOwlTo(d, 2)
    d.hurryHunt()
    d.focusPoint(0, 0, 18)
  },
}
