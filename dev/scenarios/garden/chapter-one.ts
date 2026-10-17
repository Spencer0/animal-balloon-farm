import type { Scenario } from '../types'
import { pause } from '../types'

/**
 * Four soil plants already fully grown, and a blueberry bush parked just short of
 * maturity. Chapter 1 counts distinct species, so the bush is the fifth and ends it.
 */
const GROWN = ['poppy', 'carrot', 'potato', 'onion'] as const

export const chapterOne: Scenario = {
  id: 'garden/chapter-one',
  description: 'Chapter 1 at four of five species: a poppy, carrot, potato and onion fully grown in a row, and a blueberry bush nearly grown in front. Growing it ends the chapter (the journal shows 4 / 5 until then). Pip already stocks clover and dandelion seeds, and the water lily stays hidden until chapter 2.',
  async run(d) {
    d.closeMenu()
    // Debug scenarios open every chapter; this one is the first, so close the rest.
    d.setChapter('garden')
    d.grantCoins(200 - d.grantCoins(0))
    d.grantSeeds(2)
    // A fresh game has no plants, so these are instances 1..5.
    // Spaced for the widest pair (a bush is 0.62 across, so 1.6 apart clears every plant).
    GROWN.forEach((species, index) => d.plant(species, -2.4 + index * 1.6, -1.2))
    d.plant('blueberry', 0, 1.6)
    GROWN.forEach((_, index) => d.setPlantGrowth(index + 1, 1))
    d.setPlantGrowth(5, 0.95)
    await pause(300)
    d.focusPoint(0, 0, 6)
  },
}
