import { pause, type Scenario } from '../types'

/**
 * The end-game farm: a resident starhorn (Harmony pinned high), flowers for its
 * nectar, and ten star gems in the purse. Open the shop to the Treasures tab.
 */
export const gemFarm: Scenario = {
  id: 'starhorn/gem-farm',
  description: 'A flowery lawn with a resident starhorn walking about and ten star gems in the purse. Open the shop: the Treasures tab sells the Helium Pump, Clover Charm, Rain Barrel and Golden Pail.',
  async run(d) {
    d.closeMenu()
    d.grantCoins(500)
    d.grantGems(10)
    d.grantSeeds(8)
    d.expandFarm(1)
    d.sowGrass(0, 2, 6, 'short')
    // Six or more grown flowers: the starhorn's nectar, and its home requirement.
    const beds: readonly (readonly [string, number, number])[] = [
      ['clover', -3, 3], ['clover', -1, 4], ['dandelion', 1, 3], ['dandelion', 3, 4], ['dandelion', -2, 1], ['clover', 2, 5], ['clover', 4, 2], ['dandelion', 0, 0],
    ]
    for (const [species, x, z] of beds) d.plant(species, x, z)
    d.growPlants(60, 2)
    d.spawnStarhorn()
    await pause(1500)
    d.focusPoint(-1, 2, 7)
  },
}
