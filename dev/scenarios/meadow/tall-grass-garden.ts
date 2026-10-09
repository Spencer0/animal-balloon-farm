import { type Scenario } from '../types'
import { addMeadowAnimals, openMeadow } from './farm'

export const tallGrassGarden: Scenario = {
  id: 'meadow/tall-grass-garden',
  description: 'Daytime in a tall-grass garden: deep meadow with a hollow log and a rock pile, short lawn with dandelions and a can. Four mice, two snakes and two rats (asleep, by or in the log), all ready to breed.',
  async run(d) {
    await openMeadow(d)
    addMeadowAnimals(d)
    d.setTimeOfDay(0.5)
    d.holdTime(true)
    d.focusPoint(-3, 0, 16)
  },
}

export const tallGrassNight: Scenario = {
  id: 'meadow/tall-grass-night',
  description: 'The same tall-grass garden at night: the rats are awake and out raiding the can.',
  async run(d) {
    await openMeadow(d)
    addMeadowAnimals(d)
    d.setTimeOfDay(0.8)
    d.holdTime(true)
    d.focusPoint(-1, 0, 16)
  },
}

/** Just the meadow, no animals: watch the mice find it, then the rats and snakes follow. */
export const emptyMeadow: Scenario = {
  id: 'meadow/empty-meadow',
  description: 'The tall-grass garden with no animals yet. Day, clock running: mice are lured by the meadow, then rats (at night) and snakes follow the mice.',
  async run(d) {
    await openMeadow(d)
    d.setTimeOfDay(0.35)
    d.focusPoint(-3, 0, 18)
  },
}
