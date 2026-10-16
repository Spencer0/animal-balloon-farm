import type { Scenario } from '../types'
import { pause } from '../types'

/** Each bush's growth: a hair before its water, pest and prune stops, and before maturity. */
const STAGES = [0.219, 0.499, 0.759, 0.975] as const

export const careCues: Scenario = {
  id: 'garden/care-cues',
  description: 'Four blueberry bushes in a row, left to right: one asks for water, one for a beetle swat, one for a trim, and the last matures a few seconds in, popping the "Fully grown!" banner and then its rosette seal. Each marker springs in on its own.',
  async run(d) {
    d.closeMenu()
    d.grantSeeds(4)
    // A fresh game has no plants, so these are instances 1..4.
    STAGES.forEach((_, index) => d.plant('blueberry', -2.4 + index * 1.6, 0))
    STAGES.forEach((growth, index) => d.setPlantGrowth(index + 1, growth))
    await pause(300)
    d.focusPoint(0, 0, 9)
  },
}
