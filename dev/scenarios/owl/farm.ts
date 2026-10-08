import { pause, type ScenarioHarness } from '../types'

/** The farm every owl scenario starts from: roomy enough to hold a flock and an owl. */
export async function openFarm(d: ScenarioHarness, options: { readonly level?: number; readonly chickens: number; readonly oaks?: number }): Promise<void> {
  d.closeMenu()
  d.grantCoins(2000)
  d.expandFarm(options.level ?? 2)
  for (let index = 0; index < options.chickens; index += 1) d.addAnimal('chicken', 3)
  const oaks = options.oaks ?? 0
  // Oaks go on the lattice well clear of the flock's spawn; two cells square each.
  const spots: readonly (readonly [number, number])[] = [[-2, -2], [2, -3]]
  for (let index = 0; index < oaks; index += 1) {
    d.buy('oak')
    d.placeProp('oak', spots[index][0], spots[index][1], 0)
  }
  // Animals and the oak model load asynchronously; give them a moment to exist.
  await pause(1500)
}

/** The owl's rung on the ladder, or -1 while it has not arrived. */
export function owlStage(d: ScenarioHarness): number {
  const owl = d.animalReport().find((entry) => entry.species === 'owl' && (entry.stage as number) > 0)
  return owl ? (owl.stage as number) : -1
}

/** Run the clock forward in small steps until the owl reaches `stage`, or give up. */
export async function advanceOwlTo(d: ScenarioHarness, stage: number): Promise<boolean> {
  for (let batch = 0; batch < 12 && owlStage(d) < stage; batch += 1) {
    d.advance(400, 0.1)
    await pause(60)
  }
  return owlStage(d) >= stage
}

/** Night, held there: dusk is the start of a full night, so there is time to look around. */
export function holdNight(d: ScenarioHarness): void {
  d.setTimeOfDay(0.8)
  d.holdTime(true)
}

export function holdDay(d: ScenarioHarness): void {
  d.setTimeOfDay(0.5)
  d.holdTime(true)
}
