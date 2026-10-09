import type { Scenario } from '../types'
import { holdNight, openFarm } from './farm'

export const breedReady: Scenario = {
  id: 'owl/breed-ready',
  description: 'Night, two oaks, an owl box, a flock of four, and two owls in love (stage 4, heart eyes). An owlet is born in the box.',
  async run(d) {
    await openFarm(d, { chickens: 4, oaks: 2, level: 3, owlBox: true })
    d.addAnimal('owl', 4)
    d.addAnimal('owl', 4)
    holdNight(d)
    d.focusPoint(0, 0, 18)
  },
}
