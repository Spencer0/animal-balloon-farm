import { pause, type Scenario } from '../types'
import { holdDay, openFarm } from './farm'

export const residentRoosting: Scenario = {
  id: 'owl/resident-roosting',
  description: 'Daytime, a resident owl asleep on the oak, facing the camera. Release the clock with __gardenDebug.holdTime(false) to watch dusk, take-off and the first hunt.',
  async run(d) {
    await openFarm(d, { chickens: 4, oaks: 1 })
    d.addAnimal('owl', 3)
    holdDay(d)
    // Let the roost settle: the owl flies to the oak the first frames it is day.
    await pause(2500)
    d.stepHunt(30)
    d.focusPoint(-1, -7, 9)
  },
}
