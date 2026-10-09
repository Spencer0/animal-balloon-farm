import { pause, type ScenarioHarness } from '../types'

/**
 * The tall-grass garden every meadow scenario starts from.
 *
 * The west half is deep meadow (the green seed pack), about 80 m² of it, with
 * the hollow log and the rock pile sitting in it. The east half stays short
 * lawn: a path, the garbage can, and dandelions, which only take root in short
 * grass. That keeps the contrast the scenario is for: the same farm, one half
 * lawn and one half meadow.
 */
export async function openMeadow(d: ScenarioHarness): Promise<void> {
  d.closeMenu()
  d.grantCoins(2000)
  d.grantPoints(300)
  d.grantSeeds(10)
  d.expandFarm(2)
  // Short lawn first, then the meadow over the west half.
  for (const [x, z] of [[4, -3], [4, 2.5], [7.5, 0]] as const) d.sowGrass(x, z, 3.2, 'short')
  for (const [x, z] of [[-6, -3], [-6, 3], [-2.5, -4], [-2.5, 1.5], [-9, 0]] as const) d.sowGrass(x, z, 3.4, 'tall')
  // Dandelions for the mice, on the lawn side.
  for (const [x, z] of [[3, 3], [5, 4], [5.5, -4], [3, -4.5]] as const) d.plant('dandelion', x, z)
  d.growPlants(120, 1)
  // Houses in the meadow, doors (+Z) facing the open middle. The can sits on the lawn.
  d.buy('hollow-log')
  d.placeProp('hollow-log', -3, -2, 0)
  d.buy('rock-pile')
  d.placeProp('rock-pile', -2, 1, 0)
  d.buy('garbage-can')
  d.placeProp('garbage-can', 2, -1, 0)
  // Animals and prop models load asynchronously; give them a moment to exist.
  await pause(1500)
}

/**
 * Every tall-grass species, settled and in love, so the houses fill and young
 * are born. Six mice, because the snakes hunt them down to the breeding pair;
 * the two already "eaten" are what made the snakes stay.
 */
export function addMeadowAnimals(d: ScenarioHarness): void {
  d.feedSnake(2)
  for (let index = 0; index < 6; index += 1) d.addAnimal('mouse', 4)
  for (let index = 0; index < 2; index += 1) d.addAnimal('rat', 4)
  for (let index = 0; index < 2; index += 1) d.addAnimal('snake', 4)
}
