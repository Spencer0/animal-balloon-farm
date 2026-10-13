import type { Scenario } from '../types'
import { pause } from '../types'

export const firstPlant: Scenario = {
  id: 'tutorial/first-plant',
  description: 'A brand new farmer: empty garden, the gifted seeds (the blueberry bush glows), and the first-plant trail armed. The shed quadrant of the balloon (bottom right) glows with a "Grow plants" bubble every 10 seconds; open it and the seed and Plant button glow in turn.',
  async run(d) {
    d.closeMenu()
    await pause(500)
    d.focusPoint(0, 0, 30)
  },
}
