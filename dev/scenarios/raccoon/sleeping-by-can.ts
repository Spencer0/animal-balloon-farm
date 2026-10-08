import { pause, type Scenario } from '../types'
import { holdDay, openFarm } from './farm'

export const sleepingByCan: Scenario = {
  id: 'raccoon/sleeping-by-can',
  description: 'Daytime, a resident raccoon curled up beside its garbage can. Release the clock with __gardenDebug.holdTime(false) to watch it wake at dusk.',
  async run(d) {
    await openFarm(d, { cans: 1 })
    d.addAnimal('raccoon', 3)
    holdDay(d)
    // It walks to its bed the first frames it is day.
    await pause(4000)
    d.focusPoint(-2, -2, 6)
  },
}
