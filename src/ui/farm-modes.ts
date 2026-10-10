import type { GardenPlants } from '../scene/garden-plants'
import type { GardenProps } from '../scene/garden-props'
import type { GardenTools } from '../scene/garden-tools'
import type { GardenToolId } from '../scene/garden-tool-art'
import type { MenuChoice } from './menu-dom'
import type { createShedPanel } from './shed-panel'
import type { createSalePanel } from './sale-panel'
import type { ShopDomPanel } from './shop-dom'
import type { createJournalPanel } from './journal-panel'
import type { createToolsHud } from './tools-hud'
import type { createBalloonPanel } from './balloon-panel'
import type { createClockCalendarHud } from './clock-calendar-hud'
import type { createNotificationDomPanel } from './notification-dom'
import type { createPlayerDomPanel } from './player-dom'
import type { OptionsDomPanel } from './options-dom'
import type { createFarmsPanel } from './farms-panel'

/** The farm's menu, tool bar and farm-only chrome, and the choices the main menu makes. */
export interface FarmModesDeps {
  readonly menu: { readonly isOpen: boolean; open(): void; close(): void }
  readonly salePanel: ReturnType<typeof createSalePanel>
  readonly shed: ReturnType<typeof createShedPanel>
  readonly shop: ShopDomPanel
  readonly journal: ReturnType<typeof createJournalPanel>
  readonly toolsHud: ReturnType<typeof createToolsHud>
  readonly balloon: ReturnType<typeof createBalloonPanel>
  readonly clockCalendarHud: ReturnType<typeof createClockCalendarHud>
  readonly notificationDom: ReturnType<typeof createNotificationDomPanel>
  readonly playerDom: ReturnType<typeof createPlayerDomPanel>
  readonly optionsDom: OptionsDomPanel
  readonly farmsPanel: ReturnType<typeof createFarmsPanel>
  readonly markEntered: () => void
  readonly introWanted: () => boolean
  readonly startIntro: () => void
  readonly gardenTools: GardenTools | null
  readonly gardenPlants: () => GardenPlants | null
  readonly gardenProps: () => GardenProps | null
  readonly toolIsOwned: (id: GardenToolId) => boolean
  readonly endCameraTour: (restore: boolean) => void
  readonly refreshCursor: () => void
}

export function createFarmModes(deps: FarmModesDeps) {
  const { menu, salePanel, shed, shop, journal, toolsHud, balloon, clockCalendarHud, notificationDom, playerDom, optionsDom, farmsPanel, markEntered, introWanted, startIntro, gardenTools, gardenPlants, gardenProps, toolIsOwned, endCameraTour, refreshCursor } = deps

  function selectGardenTool(id: GardenToolId | null, force = false): void {
    if (id !== null && !force && !toolIsOwned(id)) return
    endCameraTour(true)
    gardenPlants()?.cancelPlacement()
    gardenProps()?.cancelPlacement()
    shed.setPlacementActive(false)
    gardenTools?.setPlantingMode(false)
    if (gardenTools) {
      // Tapping the active tool's key again cycles its brush size rather than
      // re-selecting what is already selected.
      if (gardenTools.selectedTool === id && id !== null) gardenTools.cycleBrushSize()
      else if (gardenTools.selectedTool !== id) gardenTools.selectTool(id)
    }
    toolsHud.setSelectedTool(id)
    shed.setInteractEnabled(id === null)
    syncFarmChrome()
    // Re-resolve the pointer now: a tool switch changes what it should look like,
    // and the next pointer move may be a while away.
    refreshCursor()
  }

  function handleMenuChoice(choice: MenuChoice): void {
    if (choice === 'farms') {
      farmsPanel.open()
      return
    }
    // A brand-new farm opens with the intro film; the farm itself waits for it.
    if (choice === 'enter' && introWanted()) {
      startIntro()
      return
    }
    if (choice === 'enter') markEntered()
    if (choice === 'options') {
      // The screen opens over the menu; closing it lands back on the menu.
      optionsDom.setOpen(true)
      return
    }
    endCameraTour(false)
    menu.close()
  }

  /**
   * The tool bar and the journal launcher belong to the farm. While the main menu
   * is up they used to stay on screen underneath it, so the menu's button row was
   * drawn straight through the tool bar and both sets of lettering overlapped.
   */
  function syncFarmChrome(): void {
    const farmOnly = !menu.isOpen
    if (menu.isOpen && shop.isOpen) shop.setOpen(false)
    const shopOpen = shop.isOpen
    const shedOpen = shed.isOpen
    const playerOpen = playerDom.isOpen
    toolsHud.setVisible(farmOnly && !journal.isOpen && !shedOpen && !salePanel.isOpen && !shopOpen && !gardenProps()?.placingId && !playerOpen)
    shed.setVisible(false)
    shed.setInteractEnabled(toolsHud.selectedTool === null)
    journal.setLauncherVisible(false)
    balloon.setVisible(farmOnly)
    clockCalendarHud.setVisible(farmOnly)
    balloon.setInteractEnabled(true)
    if (!farmOnly && notificationDom.isOpen) notificationDom.setOpen(false)
    refreshCursor()
  }

  return {
    selectGardenTool,
    handleMenuChoice,
    syncFarmChrome,
  }
}
