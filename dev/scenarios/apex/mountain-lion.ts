import { pause, type Scenario, type ScenarioHarness } from '../types'

/** Animals of a species out on the farm (the rest are indoors). */
const outside = (d: ScenarioHarness, species: string): number =>
  d.animalReport().filter((entry) => entry.species === species && (entry.stage as number) >= 3).length

/**
 * A farm with one species past six: the mountain lion catches its scent at once
 * and the warning shows. Once the extras have walked into their house (the most
 * that stay out is five), `hurryHunt` brings the lion over the fence instead of
 * waiting out the rest of the warning, so the raid, house and all, is what you land on.
 */
async function crowdedFarm(d: ScenarioHarness, crowd: { readonly species: string; readonly count: number; readonly house: string; readonly oaks?: number }): Promise<void> {
  d.closeMenu()
  d.grantCoins(4000)
  d.grantSeeds(10)
  d.expandFarm(3)
  d.setTimeOfDay(0.45)
  d.holdTime(true)
  d.sowGrass(-2, 2, 5, 'short')
  d.sowGrass(4, 2, 4, 'short')
  d.buy(crowd.house)
  d.placeProp(crowd.house, 3, -2, 0)
  const oakSpots: readonly (readonly [number, number])[] = [[-3, -5], [-5, -3]]
  for (let index = 0; index < (crowd.oaks ?? 0); index += 1) {
    d.buy('oak')
    d.placeProp('oak', oakSpots[index][0], oakSpots[index][1], 0)
  }
  for (const [x, z] of [[3, 2], [4, 2], [5, 3], [3, 4]] as const) d.plant('dandelion', x, z)
  d.growPlants(40, 2)
  // Two cows that are never its quarry: the lion only eats the crowded species.
  for (let index = 0; index < 2; index += 1) d.addAnimal('cow', 4)
  for (let index = 0; index < crowd.count; index += 1) d.addAnimal(crowd.species, 4)
  // Models load and play their reveal, the scent notice shows, and the extras walk indoors.
  for (let waited = 0; waited < 20000 && outside(d, crowd.species) > 5; waited += 250) await pause(250)
  await pause(1500)
  d.hurryHunt()
  d.focusPoint(0, 0, 20)
}

export const chickenRaid: Scenario = {
  id: 'apex/chicken-raid',
  description: 'Nine chickens (five out, four in the coop) and two cows, daytime. The mountain lion smells the crowd, comes over the fence, runs down every chicken in the open, breaks into the coop for the rest, then leaves. The cows are left alone.',
  async run(d) {
    await crowdedFarm(d, { species: 'chicken', count: 9, house: 'coop' })
  },
}

export const tameTheLion: Scenario = {
  id: 'apex/tame-the-lion',
  description: 'A farm of legend: Chapter 6 open, Harmony pinned at 90, two oaks. Nine chickens draw the lion; it decides to stay as it arrives (paint reveal), then trims the chickens back to six instead of wiping them out.',
  async run(d) {
    d.setHarmony(90)
    await crowdedFarm(d, { species: 'chicken', count: 9, house: 'coop', oaks: 2 })
  },
}
