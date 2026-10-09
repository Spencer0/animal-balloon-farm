import { pause, type Scenario } from '../types'
import { holdDay, openFarm } from './farm'

export const sleepingByDumpster: Scenario = {
  id: 'raccoon/sleeping-by-dumpster',
  description: 'Daytime, a garbage can and a dumpster. The dumpster is its house, so the resident raccoon walks in to sleep.',
  async run(d) {
    await openFarm(d, { cans: 1, dumpsters: 1 })
    d.addAnimal('raccoon', 3)
    holdDay(d)
    // It walks to its bed the first frames it is day.
    await pause(4000)
    d.focusPoint(2, -3, 7)
  },
}
