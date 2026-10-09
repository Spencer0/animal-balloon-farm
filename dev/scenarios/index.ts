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
import { emptyMeadow, snakeHunt, tallGrassGarden, tallGrassNight } from './meadow/tall-grass-garden'

/** Every scenario, in the order the console lists them. Add new ones here. */
export const SCENARIOS: readonly Scenario[] = [
  farmer10, firstNight, huntNow, readyToSettle, residentRoosting, breedReady, lowHelium,
  raccoonFirstNight, sleepingByCan, sleepingByDumpster, raccoonBreedReady,
  tallGrassGarden, tallGrassNight, emptyMeadow, snakeHunt,
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
