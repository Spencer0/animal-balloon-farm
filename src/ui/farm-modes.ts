import * as THREE from 'three'
import type { BalloonAnimal } from '../animals/balloon-animal'
import { VIEWER_CAST } from '../animals/animal-catalog'
import { createCaptureShowcaseStage } from '../scene/capture-showcase'
import type { Fairground } from '../scene/fairground'
import type { GardenPlants } from '../scene/garden-plants'
import type { GardenProps } from '../scene/garden-props'
import type { GardenTools } from '../scene/garden-tools'
import type { GardenToolId } from '../scene/garden-tool-art'
import type { MenuChoice, createMenuPanel } from './menu-panel'
import type { createViewerPanel } from './viewer-panel'
import type { createSalePanel } from './sale-panel'
import type { createAnimalCard } from './animal-card'
import type { createPropCard } from './prop-card'
import type { createPlantCard } from './plant-card'
import type { createShedPanel } from './shed-panel'
import type { ShopDomPanel } from './shop-dom'
import type { createJournalPanel } from './journal-panel'
import type { createToolsHud } from './tools-hud'
import type { createBalloonPanel } from './balloon-panel'
import type { createClockCalendarHud } from './clock-calendar-hud'
import type { createNotificationDomPanel } from './notification-dom'
import type { createPlayerDomPanel } from './player-dom'
import type { OptionsDomPanel } from './options-dom'
import type { createFarmsPanel } from './farms-panel'

type GameMode = 'farm' | 'viewer'

export interface FarmModesDeps {
  readonly scene: THREE.Scene
  readonly fairground: Fairground
  readonly getMode: () => GameMode
  readonly setGameMode: (next: GameMode) => void
  readonly menu: ReturnType<typeof createMenuPanel>
  readonly viewer: ReturnType<typeof createViewerPanel>
  readonly salePanel: ReturnType<typeof createSalePanel>
  readonly animalCard: ReturnType<typeof createAnimalCard>
  readonly propCard: ReturnType<typeof createPropCard>
  readonly plantCard: ReturnType<typeof createPlantCard>
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
  readonly gardenTools: GardenTools | null
  readonly gardenPlants: () => GardenPlants | null
  readonly gardenProps: () => GardenProps | null
  readonly viewerStands: Map<string, THREE.Vector3>
  readonly farmHomes: Map<string, { parent: THREE.Object3D; position: THREE.Vector3 }>
  readonly getViewerCastAnimals: () => BalloonAnimal[]
  readonly refreshAnimalVisibility: (nowSeconds: number, force?: boolean) => void
  readonly focusCamera: () => void
  readonly updateCameraProjection: () => void
  readonly endCameraTour: (restore: boolean) => void
  readonly refreshCursor: () => void
}

export function createFarmModes(deps: FarmModesDeps) {
  const { scene, fairground, getMode, setGameMode, menu, viewer, salePanel, animalCard, propCard, plantCard, shed, shop, journal, toolsHud, balloon, clockCalendarHud, notificationDom, playerDom, optionsDom, farmsPanel, markEntered, gardenTools, gardenPlants, gardenProps, viewerStands, farmHomes, getViewerCastAnimals, refreshAnimalVisibility, focusCamera, updateCameraProjection, endCameraTour, refreshCursor } = deps
  let viewerStage: ReturnType<typeof createCaptureShowcaseStage> | null = null

  function selectGardenTool(id: GardenToolId | null): void {
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
    if (choice === 'enter') markEntered()
    if (choice === 'options') {
      // The screen opens over the menu; closing it lands back on the menu.
      optionsDom.setOpen(true)
      return
    }
    setMode(choice === 'viewer' ? 'viewer' : 'farm')
  }

  function setMode(next: GameMode): void {
    // Neither destination wants a tour running: the viewer stages its own camera
    // and the farm restores its opening framing below.
    endCameraTour(false)
    if (next !== 'farm') {
      salePanel.close()
      animalCard.close()
      propCard.close()
      plantCard.close()
      shed.close()
      shed.setPlacementActive(false)
      shop.setOpen(false)
      gardenPlants()?.cancelPlacement()
      gardenProps()?.cancelPlacement()
      gardenTools?.setPlantingMode(false)
    }
    if (next === getMode()) {
      menu.close()
      return
    }
    setGameMode(next)
    if (next === 'viewer') {
      menu.close()
      viewer.open()
      journal.close()
      // Swap in the showcase staging so the animals stand together on a stage.
      if (!viewerStage) {
        viewerStage = createCaptureShowcaseStage(VIEWER_CAST)
        scene.add(viewerStage.root)
      }
      // Only the cast travels to the stage; the rest of the farm stays in the
      // fairground, which is simply removed from the scene while the booth is up.
      for (const animal of getViewerCastAnimals()) {
        viewerStage.root.add(animal.root)
        animal.root.position.copy(viewerStands.get(animal.instanceId)!)
        animal.setDetailedVisible(animal.stage > 0)
      }
      refreshAnimalVisibility(performance.now() / 1000, true)
      scene.remove(fairground.root)
      focusCamera()
    } else {
      viewer.close()
      scene.remove(viewerStage?.root ?? fairground.root)
      // Return only the cast; everyone else never left the fairground and keeps
      // whatever wander they were in the middle of.
      for (const animal of getViewerCastAnimals()) {
        const home = farmHomes.get(animal.instanceId)
        if (!home) continue
        home.parent.add(animal.root)
        animal.root.position.copy(home.position)
      }
      scene.add(fairground.root)
      refreshAnimalVisibility(performance.now() / 1000, true)
      focusCamera()
    }
    syncFarmChrome()
    updateCameraProjection()
  }

  /**
   * The tool bar and the journal launcher belong to the farm. While the main menu
   * is up they used to stay on screen underneath it, so the menu's button row was
   * drawn straight through the tool bar and both sets of lettering overlapped.
   */
  function syncFarmChrome(): void {
    const farmOnly = getMode() === 'farm' && !menu.isOpen
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
    const plants = gardenPlants()
    if (plants) plants.root.visible = getMode() === 'farm'
    refreshCursor()
  }
  function updateViewerStage(delta: number): void { viewerStage?.update(delta) }

  return {
    selectGardenTool,
    handleMenuChoice,
    setMode,
    syncFarmChrome,
    updateViewerStage,
  }
}
