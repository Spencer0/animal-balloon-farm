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
    d.sowGrass(0, 0, 4, 'short')
    d.plant('clover', -2, 2)
    d.plant('dandelion', 1, 2.5)
    d.plant('poppy', 3, 1)
    d.growPlants(90, 1)
    d.spawnStarhorn()
    await pause(1500)
    d.focusPoint(-1, 2, 7)
  },
}
