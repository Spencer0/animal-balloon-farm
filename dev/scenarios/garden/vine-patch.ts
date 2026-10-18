import type { Scenario } from '../types'
import { pause } from '../types'

/**
 * A three-by-three patch of vines, each parked a hair before one of its care
 * stops, so every marker comes up within a second or two. Rows, back to front:
 * pumpkins, watermelons, cucumbers. Columns, left to right: water (the pipe
 * spin), pests (the caterpillar squirt), a trim (the runner steer).
 */
const PATCH: ReadonlyArray<{ readonly species: string; readonly stops: readonly [number, number, number] }> = [
  // water, pest, prune: each species' stop minus a hair (see PLANT_CATALOG).
  { species: 'pumpkin', stops: [0.219, 0.759, 0.499] },
  { species: 'watermelon', stops: [0.499, 0.239, 0.759] },
  { species: 'cucumber', stops: [0.519, 0.779, 0.259] },
]
const SPACING = 1.7

export const vinePatch: Scenario = {
  id: 'garden/vine-patch',
  description: 'Pumpkins, watermelons and cucumbers in a three-by-three patch (back to front), each about to ask for water (left column, the pipe spin), a caterpillar squirt (middle) or a trim (right, the runner steer). Click a marker to play its game. 500 coins and three seeds of everything for the shop and shed.',
  async run(d) {
    d.closeMenu()
    d.grantCoins(500 - d.grantCoins(0))
    // Enough for the patch, with three of each left over in the shed.
    d.grantSeeds(6)
    // A fresh game has no plants, so these are instances 1..9, row by row.
    PATCH.forEach((row, rowIndex) => {
      row.stops.forEach((_, column) => d.plant(row.species, (column - 1) * SPACING, (rowIndex - 1) * SPACING))
    })
    PATCH.forEach((row, rowIndex) => {
      row.stops.forEach((growth, column) => d.setPlantGrowth(rowIndex * 3 + column + 1, growth))
    })
    await pause(300)
    d.focusPoint(0, 0, 5.8)
  },
}
