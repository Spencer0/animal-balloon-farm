import { pause, type Scenario, type ScenarioHarness } from '../types'

async function berryPatch(d: ScenarioHarness) {
  d.closeMenu()
  d.setTimeOfDay(.45)
  d.holdTime(true)
  d.grantCoins(2000)
  d.grantPoints(200)
  d.grantSeeds(2)
  d.plant('blueberry', 0, 0)
  d.growPlants(100, 1)
  d.sowGrass(-3, 1, 1.5, 'short')
  d.focusPoint(0, 0, 5)
}

export const berryPicnic: Scenario = {
  id: 'squirrel/berry-picnic',
  description: 'One grown blueberry bush and a visiting squirrel. Watch it pluck and nibble six berries, settle, and leave the bush to regrow.',
  async run(d) {
    await berryPatch(d)
    const id = d.addAnimal('squirrel', 2)
    await pause(600)
    if (id) d.placeAnimal(id, 1.1, 0)
  },
}

export const squirrelHome: Scenario = {
  id: 'squirrel/acorn-home',
  description: 'A real six-berry picnic followed by a compact acorn-roof house. The squirrel loves its new home; inspect the house and journal.',
  async run(d) {
    await berryPatch(d)
    d.buy('squirrel-house')
    d.placeProp('squirrel-house', 1, 0)
    const id = d.addAnimal('squirrel', 2)
    await pause(600)
    if (id) d.placeAnimal(id, 1.1, 0)
    d.forageFor(25)
    d.focusPoint(1, 0, 6)
  },
}
