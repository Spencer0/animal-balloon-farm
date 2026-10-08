import { pause, type ScenarioHarness } from '../types'

/** The farm every raccoon scenario starts from: a roomy plot with a resident cow to lure it. */
export async function openFarm(d: ScenarioHarness, options: { readonly cans?: number; readonly dumpsters?: number }): Promise<void> {
  d.closeMenu()
  d.grantCoins(2000)
  d.expandFarm(2)
  d.addAnimal('cow', 3)
  // Props go on the 2 m lattice clear of the herd. A can is one cell; a dumpster is two by one.
  const canSpots: readonly (readonly [number, number])[] = [[-2, -2], [-4, -2]]
  for (let index = 0; index < (options.cans ?? 0); index += 1) {
    d.buy('garbage-can')
    d.placeProp('garbage-can', canSpots[index][0], canSpots[index][1], 0)
  }
  for (let index = 0; index < (options.dumpsters ?? 0); index += 1) {
    d.buy('dumpster')
    d.placeProp('dumpster', 2, -3, 0)
  }
  // Animals and the prop models load asynchronously; give them a moment to exist.
  await pause(1500)
}

/** Night, held there so a night scenario stays night. */
export function holdNight(d: ScenarioHarness): void {
  d.setTimeOfDay(0.8)
  d.holdTime(true)
}

export function holdDay(d: ScenarioHarness): void {
  d.setTimeOfDay(0.5)
  d.holdTime(true)
}
