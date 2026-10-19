import { pause, type Scenario, type ScenarioHarness } from '../types'

/**
 * The chapter-one row (a poppy, carrot, potato and onion) plus a second carrot, all fully grown.
 * Four kinds, not five: a fifth would end chapter 1 (GARDEN_SPECIES_GOAL), and the deer is its trouble.
 */
const GROWN = ['poppy', 'carrot', 'potato', 'onion', 'carrot'] as const
const SPOTS: readonly (readonly [number, number])[] = [[-2.4, -1.2], [-0.8, -1.2], [0.8, -1.2], [2.4, -1.2], [0, 1.6]]

/** Chapter 1, midday held, the garden grown, the shop open and coins for a salt lick. Returns the deer's id. */
async function grownGardenWithDeer(d: ScenarioHarness): Promise<string | null> {
  d.closeMenu()
  // Debug scenarios open every chapter; the deer is chapter 1's trouble, so close the rest.
  d.setChapter('garden')
  d.setTimeOfDay(0.45)
  d.holdTime(true)
  d.grantCoins(200 - d.grantCoins(0))
  // Farmer level 2: Pip's shop is up and stocks the Salt Lick.
  d.grantPoints(100)
  d.grantSeeds(2)
  // A fresh game has no plants, so these are instances 1..5.
  GROWN.forEach((species, index) => d.plant(species, SPOTS[index][0], SPOTS[index][1]))
  GROWN.forEach((_, index) => d.setPlantGrowth(index + 1, 1))
  const id = d.addAnimal('deer', 2)
  await pause(600)
  if (id) d.placeAnimal(id, 4.5, 1)
  d.focusPoint(0.5, 0, 8)
  return id
}

export const gardenRaid: Scenario = {
  id: 'deer/garden-raid',
  description: 'Chapter 1 at midday: five grown plants (four kinds, so the chapter stays open) and a wild deer on the farm. In about six seconds it walks to a random plant and eats it whole, then another every half minute or so. Buy a Salt Lick at Pip\'s (200 coins in the purse) and place it: the deer goes to lick it and leaves the garden alone.',
  async run(d) {
    await grownGardenWithDeer(d)
  },
}

export const saltLickDistraction: Scenario = {
  id: 'deer/salt-lick',
  description: 'The same grown garden and wild deer, with a Salt Lick already set out beside it. The deer heads straight for the lick and never touches a plant; it settles into its own colors for the lick. Pick the lick up (or sell it) and the raids start again.',
  async run(d) {
    await grownGardenWithDeer(d)
    d.buy('salt-lick')
    // One cell east of the plant row: the deer walks past the garden to get to it.
    d.placeProp('salt-lick', 2, -1)
  },
}
