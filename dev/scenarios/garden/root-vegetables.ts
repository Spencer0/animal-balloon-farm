import type { Scenario } from '../types'
import { pause } from '../types'

/**
 * A three-by-three bed of root vegetables, each parked a hair before one of its
 * care stops, so every marker comes up within a second or two. Rows, back to
 * front: carrots, potatoes, onions. Columns, left to right: water (the barrel
 * climb), pests (bug breakout), a trim (trim pong).
 */
const BED: ReadonlyArray<{ readonly species: string; readonly stops: readonly [number, number, number] }> = [
  // water, pest, prune: each species' stop minus a hair (see PLANT_CATALOG).
  { species: 'carrot', stops: [0.219, 0.739, 0.479] },
  { species: 'potato', stops: [0.499, 0.249, 0.759] },
  { species: 'onion', stops: [0.299, 0.549, 0.779] },
]
const SPACING = 1.6

export const rootVegetables: Scenario = {
  id: 'garden/root-vegetables',
  description: 'Carrots, potatoes and onions in a three-by-three bed (back to front), each about to ask for water (left column, the barrel climb), a bug squash (middle, bug breakout) or a trim (right, trim pong). Click a marker to play its game. 500 coins and three seeds of everything for the shop and shed.',
  async run(d) {
    d.closeMenu()
    d.grantCoins(500 - d.grantCoins(0))
    // Enough for the bed, with three of each left over in the shed.
    d.grantSeeds(6)
    // A fresh game has no plants, so these are instances 1..9, row by row.
    BED.forEach((row, rowIndex) => {
      row.stops.forEach((_, column) => d.plant(row.species, (column - 1) * SPACING, (rowIndex - 1) * SPACING))
    })
    BED.forEach((row, rowIndex) => {
      row.stops.forEach((growth, column) => d.setPlantGrowth(rowIndex * 3 + column + 1, growth))
    })
    await pause(300)
    d.focusPoint(0, 0, 5.2)
  },
}
