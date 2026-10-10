/**
 * Test scenarios: named game states you can jump into from the URL.
 *
 *   ?gardenDebug=1&scenario=owl/ready-to-settle
 *
 * Nothing under `dev/` ships. `src/main.ts` only imports this folder inside its
 * `__GARDEN_DEBUG__` branch, which the production build folds away, so a
 * scenario can never reach the live game. `npm run check` verifies that.
 *
 * A scenario is a short script over the debug harness. Load it into a fresh
 * game (a page reload) so it starts from the opening state.
 */

/** The slice of `window.__gardenDebug` that scenarios are allowed to use. */
export interface ScenarioHarness {
  closeMenu(): void
  grantCoins(amount: number): number
  grantPoints(points: number): { points: number; level: number }
  grantSeeds(count: number): void
  expandFarm(level: number): number
  addAnimal(species: string, stage?: number): string | null
  buy(id: string): unknown
  /** Buy a shop upgrade ('shovel' | 'water-bucket' | 'tall-grass' | 'land-deed') by the shop's rules. */
  buyUpgrade(id: string): { readonly ok: boolean; readonly text: string }
  placeProp(id: string, cellX: number, cellZ: number, rotation?: number): unknown
  /** Sow a disc of full-grown grass: 'short' lawn or 'tall' meadow. */
  sowGrass(x: number, z: number, radius: number, pack?: 'short' | 'tall'): unknown
  plant(species: string, x: number, z: number): unknown
  growPlants(steps?: number, secondsPerStep?: number): unknown
  setTimeOfDay(time: number): void
  /** Freeze (or release) the day clock, so a night scenario stays night. */
  holdTime(hold: boolean): void
  advance(steps?: number, secondsPerStep?: number): unknown
  feedOwl(count: number): unknown
  feedSnake(count: number): unknown
  hurryHunt(): void
  setOwlHelium(level: number): void
  /** Set the helium (0..1) of every settled animal of a species. Returns how many it changed. */
  setHelium(species: string, level: number): number
  stepHunt(seconds: number, secondsPerStep?: number): unknown
  focusPoint(x: number, z: number, height?: number): void
  animalReport(): Record<string, unknown>[]
}

export interface Scenario {
  /** `folder/name`, as written after `scenario=`. */
  readonly id: string
  /** What state you land in and what to look at, in one or two sentences. */
  readonly description: string
  run(harness: ScenarioHarness): Promise<void> | void
}

export const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))
