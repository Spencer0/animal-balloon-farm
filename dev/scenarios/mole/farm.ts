import { pause, type ScenarioHarness } from '../types'

/** The farm every mole scenario starts from: the shovel bought, a roomy plot, no lawn yet. */
export async function openFarm(d: ScenarioHarness): Promise<void> {
  d.closeMenu()
  d.grantCoins(2000)
  d.buyUpgrade('shovel')
  d.expandFarm(1)
  d.focusPoint(0, 0, 9)
  // Animals and the models load asynchronously; give them a moment to exist.
  await pause(1500)
}
