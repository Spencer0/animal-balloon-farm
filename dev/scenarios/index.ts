import { berryPicnic, squirrelHome } from './squirrel/berry-picnic'
import type { Scenario, ScenarioHarness } from './types'
import { farmer10 } from './sandbox/farmer-10'
import { breedReady } from './owl/breed-ready'
import { firstNight } from './owl/first-night'
import { huntNow } from './owl/hunt-now'
import { readyToSettle } from './owl/ready-to-settle'
import { lowHelium } from './owl/low-helium'
import { residentRoosting } from './owl/resident-roosting'
import { breedReady as raccoonBreedReady } from './raccoon/breed-ready'
import { firstNight as raccoonFirstNight } from './raccoon/first-night'
import { sleepingByCan } from './raccoon/sleeping-by-can'
import { sleepingByDumpster } from './raccoon/sleeping-by-dumpster'
import { aboutToGoFlat, goingFlat } from './mole/going-flat'
import { readyToSettle as moleReadyToSettle } from './mole/ready-to-settle'
import { emptyMeadow, snakeHunt, tallGrassGarden, tallGrassNight } from './meadow/tall-grass-garden'
import { ratsAndRaccoons } from './sleep/rats-and-raccoons'
import { balancedFarm, crowdedPasture } from './foodweb/crowded-pasture'
import { gemFarm } from './starhorn/gem-farm'
import { firstPlant } from './tutorial/first-plant'
import { panLimit } from './camera/pan-limit'
import { careCues } from './garden/care-cues'
import { poppyStages } from './garden/poppy-stages'
import { rootVegetables } from './garden/root-vegetables'
import { vinePatch } from './garden/vine-patch'
import { chapterOne } from './garden/chapter-one'
import { plantRaiders } from './garden/plant-raiders'
import { escapeKeys } from './ui/escape-keys'

/** Every scenario, in the order the console lists them. Add new ones here. */
export const SCENARIOS: readonly Scenario[] = [
  berryPicnic, squirrelHome,
  farmer10, firstNight, huntNow, readyToSettle, residentRoosting, breedReady, lowHelium,
  raccoonFirstNight, sleepingByCan, sleepingByDumpster, raccoonBreedReady,
  tallGrassGarden, tallGrassNight, emptyMeadow, snakeHunt, ratsAndRaccoons,
  moleReadyToSettle, goingFlat, aboutToGoFlat,
  crowdedPasture, balancedFarm,
  gemFarm,
  firstPlant,
  panLimit,
  careCues, poppyStages, rootVegetables, vinePatch, chapterOne, plantRaiders,
  escapeKeys,
]

/** Accepts `owl/hunt-now` or the bare `hunt-now`, as long as the bare name is unambiguous. */
export function findScenario(name: string): Scenario | null {
  const wanted = name.trim().toLowerCase()
  const exact = SCENARIOS.find((scenario) => scenario.id === wanted)
  if (exact) return exact
  const bare = SCENARIOS.filter((scenario) => scenario.id.split('/').pop() === wanted)
  return bare.length === 1 ? bare[0] : null
}

export function listScenarios(): Record<string, string> {
  return Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario.description]))
}

export async function runScenario(name: string, harness: ScenarioHarness): Promise<string> {
  const scenario = findScenario(name)
  if (!scenario) throw new Error(`No scenario "${name}". Known: ${SCENARIOS.map((entry) => entry.id).join(', ')}`)
  await scenario.run(harness)
  return scenario.id
}
