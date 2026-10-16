import type { Scenario } from '../types'
import { pause } from '../types'

/**
 * Each poppy's growth, left to right: a seedling, nodding buds, a hair before
 * its water, pest and pinch stops, and a hair before it blooms out.
 */
const STAGES = [0.12, 0.38, 0.249, 0.449, 0.619, 0.975] as const

export const poppyStages: Scenario = {
  id: 'garden/poppy-stages',
  description: 'Six Blender poppies in a row, left to right: a seedling on its bed, nodding buds, then one each asking for water (bowed), a pest swat (aphids) and a pinch (stray shoot), and the last opening into bloom. Click anywhere on a bed to select its poppy.',
  async run(d) {
    d.closeMenu()
    d.grantSeeds(STAGES.length)
    // A fresh game has no plants, so these are instances 1..6.
    STAGES.forEach((_, index) => d.plant('poppy', -3.5 + index * 1.4, 0))
    STAGES.forEach((growth, index) => d.setPlantGrowth(index + 1, growth))
    await pause(300)
    d.focusPoint(0, 0, 8)
  },
}
