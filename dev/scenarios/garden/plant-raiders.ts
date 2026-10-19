import { pause, type Scenario } from '../types'

/**
 * Raiders and fences. Two grown blueberry bushes and two grown carrots: one of
 * each out in the open (left), the other inside a two-cell fence pen (right;
 * lattice vertices 1,0 to 3,1, so garden metres 2..6 by 0..2). A visiting
 * squirrel and a mole eat the open ones bare; the penned ones stay untouched. A
 * third carrot (nearest the camera) starts withered, so its badge is up straight
 * away: click it to clear the plant.
 */
export const plantRaiders: Scenario = {
  id: 'garden/plant-raiders',
  description: 'A squirrel and a mole raid an open blueberry bush and carrot until they wither; the fenced-in pair (right) is safe. The lone carrot nearest the camera is already withered: click its badge to clear it.',
  async run(d) {
    d.closeMenu()
    d.setTimeOfDay(.45)
    d.holdTime(true)
    d.grantCoins(2000)
    d.grantPoints(400)
    d.grantSeeds(3)
    // A fresh game has no plants, so these are instances 1..5.
    d.plant('blueberry', -1.6, 0.4)
    d.plant('carrot', -1.4, 1.9)
    d.plant('blueberry', 3, 1)
    d.plant('carrot', 5, 1)
    d.plant('carrot', 0.4, 3.2)
    d.growPlants(160, 1)
    d.witherPlant(5)
    for (let section = 0; section < 6; section += 1) d.buy('fence')
    d.placeFence(1, 0, 3, 0)
    d.placeFence(1, 1, 3, 1)
    d.placeFence(1, 0, 1, 1)
    d.placeFence(3, 0, 3, 1)
    const squirrel = d.addAnimal('squirrel', 2)
    const mole = d.addAnimal('mole', 2)
    await pause(600)
    if (squirrel) d.placeAnimal(squirrel, -0.6, 0.2)
    if (mole) d.placeAnimal(mole, -0.4, 2.2)
    d.focusPoint(1.6, 1.4, 7)
  },
}
