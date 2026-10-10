import { pause, type Scenario } from '../types'
import { openMeadow } from '../meadow/farm'

/**
 * Daytime, every night animal settled in its own home: eleven rats curled in the
 * hollow log and eleven raccoons asleep in a dumpster. Watch them sleep, then
 * release the clock with __gardenDebug.holdTime(false) to see them wake at dusk.
 */
export const ratsAndRaccoons: Scenario = {
  id: 'sleep/rats-and-raccoons',
  description: 'Daytime: eleven resident rats asleep in the hollow log and eleven resident raccoons asleep in a dumpster, each in its own home. Release the clock with __gardenDebug.holdTime(false) to watch them wake at dusk.',
  async run(d) {
    await openMeadow(d)
    d.buy('dumpster')
    d.placeProp('dumpster', 2, -3, 0)
    for (let index = 0; index < 11; index += 1) d.addAnimal('rat', 4)
    for (let index = 0; index < 11; index += 1) d.addAnimal('raccoon', 4)
    d.setTimeOfDay(0.5)
    d.holdTime(true)
    // Animals walk to their beds in the first frames of daylight.
    await pause(4000)
    d.focusPoint(-1, -1, 14)
  },
}
