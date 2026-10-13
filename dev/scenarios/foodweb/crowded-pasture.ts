import { pause, type Scenario } from '../types'

/**
 * Twelve cows on a lawn that feeds about three. Watch the food web cull the
 * herd: the newest cows go hungry first, the herd stops breeding, and the
 * surplus slowly goes flat while the oldest cows stay fed.
 */
export const crowdedPasture: Scenario = {
  id: 'foodweb/crowded-pasture',
  description: 'Twelve loving cows and two barns on a small lawn that feeds about three. Half a day in: the newest cows are already hungry.',
  async run(d) {
    d.closeMenu()
    d.grantCoins(2000)
    d.expandFarm(2)
    d.sowGrass(0, 0, 3.2, 'short')
    d.buy('barn')
    d.placeProp('barn', -4, -3, 0)
    d.buy('barn')
    d.placeProp('barn', 4, -3, 0)
    for (let index = 0; index < 12; index += 1) d.addAnimal('cow', 4)
    await pause(1500)
    // Half a day: bellies empty in one, so the back of the queue is hungry by now.
    d.advance(240, 1)
    d.focusPoint(0, 0, 18)
  },
}

/** A balanced little farm: enough lawn, pond and flowers for what lives on it. */
export const balancedFarm: Scenario = {
  id: 'foodweb/balanced-farm',
  description: 'Cows, sheep, ducks and chickens on a farm that grows enough for all of them, with a barn and coop holding a day of goods.',
  async run(d) {
    d.closeMenu()
    d.grantCoins(2000)
    d.grantSeeds(10)
    d.expandFarm(3)
    d.sowGrass(-3, 2, 5, 'short')
    d.sowGrass(4, 3, 4, 'short')
    d.buy('barn')
    d.placeProp('barn', -6, -4, 0)
    d.buy('coop')
    d.placeProp('coop', 6, -4, 0)
    for (const [x, z] of [[3, 2], [4, 2], [5, 3], [3, 4], [4, 4], [5, 4]] as const) d.plant('dandelion', x, z)
    d.growPlants(40, 2)
    for (let index = 0; index < 3; index += 1) d.addAnimal('cow', 4)
    for (let index = 0; index < 2; index += 1) d.addAnimal('sheep', 4)
    for (let index = 0; index < 3; index += 1) d.addAnimal('chicken', 4)
    await pause(1500)
    d.advance(480, 1)
    d.focusPoint(0, 0, 20)
  },
}
