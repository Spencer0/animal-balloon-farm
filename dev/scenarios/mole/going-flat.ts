import { pause, type Scenario } from '../types'
import { openFarm } from './farm'

export const goingFlat: Scenario = {
  id: 'mole/going-flat',
  description: 'A resident mole and a lawn big enough that the farm is under 90% dirt. It is leaking helium: its card shows the meter falling, and it pops in about two minutes.',
  async run(d) {
    await openFarm(d)
    d.sowGrass(0, 0, 4.5, 'short')
    d.addAnimal('mole', 3)
  },
}

export const aboutToGoFlat: Scenario = {
  id: 'mole/about-to-go-flat',
  description: 'A resident mole on a farm that is under 90% dirt, with only a few seconds of helium left. Watch it hiss, sag and lie flat.',
  async run(d) {
    await openFarm(d)
    d.sowGrass(0, 0, 4.5, 'short')
    d.addAnimal('mole', 3)
    // Give the simulation a beat to register the animal, then leave about 12 s of helium (it leaks in two minutes).
    await pause(800)
    d.setHelium('mole', 0.1)
    const mole = d.animalReport().find((animal) => animal.species === 'mole')
    if (mole) d.focusPoint(Number(mole.x), Number(mole.z), 6)
  },
}
