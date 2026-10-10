import * as THREE from 'three'
import type { GardenPlants } from './scene/garden-plants'
import type { GardenProps, PropSelection } from './scene/garden-props'
import type { GardenTools } from './scene/garden-tools'
import { GARDEN_TOOLS } from './scene/garden-tool-art'
import type { BalloonAnimal } from './animals/balloon-animal'
import { routePointer, type UIPanel } from './ui/ui-layer'
import { setCursor } from './ui/ui-cursor'
import type { DesignPoint } from './ui/ui-viewport'
import { createHoverGlow, type HoverGlowTarget } from './scene/hover-glow'
import { GARDEN_LAWN_Y } from './scene/fairground'

/** The game objects the pointer and keyboard act on. Mutable main-owned values come as getters. */
export interface FarmInputDeps {
  readonly canvas: HTMLCanvasElement
  readonly ui: { readonly viewport: { toDesign(x: number, y: number, rect: DOMRect): DesignPoint | null; readonly width: number; readonly height: number } }
  readonly panels: readonly UIPanel[]
  readonly gardenDebugMode: boolean
  readonly setFocusedAnimal: (id: string | null) => void
  readonly gardenPlants: () => GardenPlants | null
  readonly gardenProps: () => GardenProps | null
  readonly gardenTools: GardenTools | null
  readonly menu: { readonly isOpen: boolean; open(): void; close(): void }
  readonly journal: { readonly isOpen: boolean; open(): void; close(): void; setOpen?(open: boolean): void }
  readonly shed: { readonly isOpen: boolean; contains(point: DesignPoint): boolean; setPlacementActive(on: boolean): void; setInteractEnabled(on: boolean): void; open(): void; close(): void }
  readonly shedDom: { refresh(): void }
  readonly shop: { readonly isOpen: boolean; setOpen(open: boolean): void; refresh(): void }
  readonly salePanel: { readonly isOpen: boolean; close(): void; hitTest?(point: DesignPoint): boolean }
  readonly animalCard: { readonly isOpen: boolean; close(): void; hitTest?(point: DesignPoint): boolean }
  readonly propCard: { readonly isOpen: boolean; close(): void; hitTest?(point: DesignPoint): boolean }
  readonly plantCard: { readonly isOpen: boolean; close(): void; hitTest?(point: DesignPoint): boolean }
  readonly toolsHud: { readonly selectedTool: import('./scene/garden-tool-art').GardenToolId | null; readonly isVisible: boolean; hitTest?(point: DesignPoint): boolean }
  readonly farmCamera: { readonly tour: unknown; endTour(restore: boolean): void; moveAlongGround(horizontal: number, vertical: number, edgeStrength: number, deltaSeconds: number): void; dragPan(dx: number, dy: number): void; dragOrbit(dx: number, dy: number): void; zoomBy(deltaY: number): void }
  readonly pickAnimal: (clientX: number, clientY: number) => BalloonAnimal | null
  readonly openAnimalCardFor: (animal: BalloonAnimal) => void
  readonly openPropCardFor: (selection: PropSelection) => void
  readonly openPlantCardFor: (plant: import('./game/plants').GardenPlant) => void
  readonly selectGardenTool: (id: import('./scene/garden-tool-art').GardenToolId | null) => void
  readonly swapGrassPack: () => boolean
  readonly syncFarmChrome: () => void
  readonly refreshShopUi: () => void
  readonly terrainHeightAt: (x: number, z: number) => number
  readonly endCameraTour: (restore: boolean) => void
  readonly hoverGlow: ReturnType<typeof createHoverGlow>
  readonly toolIsOwned: (id: import('./scene/garden-tool-art').GardenToolId) => boolean
}

export interface FarmInput {
  attach(): void
  refreshCursor(): void
  setShiftHeld(held: boolean): void
  isOverGameHUD(clientX: number, clientY: number): boolean
  updateCameraPan(deltaSeconds: number): void
  refreshHover(nowSeconds: number, deltaSeconds: number): void
  /** Keeps a held tool or seed following the pointer while the camera or the tour moves. */
  followPointer(): void
  cancelDrag(): void
  plantingArmed(): boolean
  isWorldToolActive(): boolean
  readonly pointerSeen: () => boolean
  readonly pointerPosition: () => { x: number; y: number }
}

export function createFarmInput(deps: FarmInputDeps): FarmInput {
  const gardenPlants = (): GardenPlants | null => deps.gardenPlants()
  const gardenProps = (): GardenProps | null => deps.gardenProps()
  const { canvas: gameCanvas, gardenDebugMode, ui, panels, gardenTools, menu, journal, shed, shedDom, shop, salePanel, animalCard, propCard, plantCard, toolsHud, farmCamera, hoverGlow, pickAnimal, openAnimalCardFor, openPropCardFor, openPlantCardFor, selectGardenTool, swapGrassPack, syncFarmChrome, refreshShopUi, endCameraTour } = deps

  let dragPointer: number | null = null
  let toolPointer: number | null = null
  let previousPointer = { x: 0, y: 0 }
  let dragMode: 'orbit' | 'pan' | null = null
  const pressedKeys = new Set<string>()
  let pointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  let pointerWasSeen = false
  const lastPointerClient = { x: -1, y: -1 }
  const CAMERA_EDGE_MARGIN = 34

  /** Shift holds the pointer: while it is down nothing is armed, so presses and hovers act on the farm. */
  let shiftHeld = false

  function setShiftHeld(held: boolean): void {
    if (shiftHeld === held) return
    shiftHeld = held
    refreshCursor()
    // Releasing Shift brings the brush ring back straight away, not on the next move.
    if (isWorldToolActive() && lastPointerClient.x >= 0) gardenTools?.pointerMove({ clientX: lastPointerClient.x, clientY: lastPointerClient.y })
  }

  /** No tool is armed, so the pointer is in charge. */
  function noToolArmed(): boolean {
    return toolsHud.selectedTool === null
  }

  /** Whether the pointer is over the lawn, where an armed tool or seed acts. */
  function pointerOverLawn(): boolean {
    return gardenTools?.overLawn({ clientX: lastPointerClient.x, clientY: lastPointerClient.y }) ?? false
  }

  /**
   * The pointer is in charge: Shift is down, or nothing is armed, or the pointer
   * is off the lawn. A tool or seed only claims the pointer over the lawn, so
   * everything else on the farm stays clickable without holding Shift.
   */
  function pointerActive(): boolean {
    if (shiftHeld) return true
    const armed = !noToolArmed() || !!gardenPlants()?.selectedSpecies
    return !armed || !pointerOverLawn()
  }

  /** A seed is on the cursor, over the lawn, and Shift is not holding it back. */
  function plantingArmed(): boolean {
    return !shiftHeld && noToolArmed() && !!gardenPlants()?.selectedSpecies && pointerOverLawn()
  }

  /** A farm tool is armed, over the lawn, and Shift is not holding it back. */
  function isWorldToolActive(): boolean {
    return !shiftHeld && toolsHud.selectedTool !== null && pointerOverLawn()
  }


  // -------------------------------------------------------------------- input --

  function pointerDesign(event: PointerEvent) {
    return ui.viewport.toDesign(event.clientX, event.clientY, gameCanvas.getBoundingClientRect())
  }

  /**
   * Decide what the pointer looks like.
   *
   * Anything the pointer would act on (an animal, a prop, the shop door,
   * a plant's care marker) owns the cursor and the press, whatever tool is armed.
   * That is what lets a seedbag sweep across the lawn without grabbing a
   * neighbour. Otherwise the armed tool or seed owns the pointer over the farm,
   * and everything else gets the balloon arrow.
   */
  function updateCursor(point: DesignPoint | null): void {
    if (!point) {
      setCursor('idle', gameCanvas)
      return
    }
    const farmOpen = !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen
    const overFarm = farmOpen && !isOverGameHUD(lastPointerClient.x, lastPointerClient.y)
    // Only pointer mode (Shift, or nothing armed) lets farm objects claim the pointer.
    const interactive = overFarm && pointerActive() && hoverInteractable(lastPointerClient.x, lastPointerClient.y)
    syncWorldTool(interactive)
    for (const panel of [...panels].sort((a, b) => b.order - a.order)) {
      const kind = panel.cursor?.(point as DesignPoint)
      if (kind) {
        setCursor(kind, gameCanvas)
        return
      }
    }
    if (overFarm) {
      const markerKind = pointerActive() ? gardenPlants()?.markerKindAt(lastPointerClient.x, lastPointerClient.y) : null
      if (markerKind) {
        setCursor(markerKind === 'water' ? 'water' : markerKind === 'prune' ? 'prune' : 'point', gameCanvas)
        return
      }
      if (interactive) {
        setCursor('point', gameCanvas)
        return
      }
      if (plantingArmed()) {
        setCursor('plant', gameCanvas)
        return
      }
      if (isWorldToolActive()) {
        // A tool stroke lags the pointer by design (drag speed cap), so the OS
        // pointer stays visible mid-stroke: it marks the real mouse while the
        // ring marks where the tool actually works. Without it the mouse goes
        // invisible mid-drag and flies off the screen.
        setCursor(gardenTools?.strokeHeld ? 'point' : 'hidden', gameCanvas)
        return
      }
    }
    setCursor('idle', gameCanvas)
  }

  /** Keeps the brush ring off while the pointer is on a farm object or Shift holds it. A stroke in progress keeps its ring. */
  function syncWorldTool(interactive: boolean): void {
    if (toolPointer !== null) return
    gardenTools?.setSuspended(shiftHeld || interactive)
  }

  /** Whether a press here belongs to a farm object rather than to the armed tool or seed. */
  function hoverInteractable(clientX: number, clientY: number): boolean {
    if (menu.isOpen || journal.isOpen || shed.isOpen || shop.isOpen) return false
    if (gardenProps()?.placingId) return false
    return Boolean(
      pickAnimal(clientX, clientY)
      || gardenProps()?.propAt(clientX, clientY)
      || gardenProps()?.pickShop(clientX, clientY)
      || gardenPlants()?.markerKindAt(clientX, clientY)
    )
  }

  // ---------------------------------------------------------------- hover glow --

  /** The soft light under whatever the pointer would act on. */
  const HOVER_ANIMAL_RADIUS = 0.9
  let hoverPlantId: number | null = null
  let lastHoverRefreshAt = -Infinity
  const HOVER_REFRESH_SECONDS = 1 / 12

  /** What the pointer would act on under it, and where to glow for it. Only pointer mode glows. */
  function hoverTargetAt(clientX: number, clientY: number): { glow: HoverGlowTarget; plantId: number | null } | null {
    if (!pointerActive()) return null
    const animal = pickAnimal(clientX, clientY)
    if (animal) {
      const at = animal.root.getWorldPosition(new THREE.Vector3())
      const ground = GARDEN_LAWN_Y + (deps.terrainHeightAt(at.x, at.z))
      return { glow: { x: at.x, y: ground, z: at.z, radius: HOVER_ANIMAL_RADIUS }, plantId: null }
    }
    const prop = gardenProps()?.propAt(clientX, clientY) ?? null
    if (prop) return { glow: prop, plantId: null }
    const plant = gardenPlants()?.plantAt(clientX, clientY) ?? null
    if (plant) return { glow: plant, plantId: plant.instanceId }
    return null
  }

  /** The glow only shows over the farm, with nothing else on top and no press in progress. */
  function hoverAllowed(): boolean {
    return pointerWasSeen
      && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && !salePanel.isOpen
      && !gardenProps()?.placingId
      && dragPointer === null && toolPointer === null
      && !isOverGameHUD(lastPointerClient.x, lastPointerClient.y)
  }

  function refreshHover(nowSeconds: number, deltaSeconds: number): void {
    hoverGlow.update(deltaSeconds, nowSeconds)
    if (nowSeconds - lastHoverRefreshAt < HOVER_REFRESH_SECONDS) return
    lastHoverRefreshAt = nowSeconds
    const target = hoverAllowed() ? hoverTargetAt(lastPointerClient.x, lastPointerClient.y) : null
    if (target) hoverGlow.show(target.glow)
    else hoverGlow.hide()
    const plantId = target?.plantId ?? null
    if (plantId !== hoverPlantId) {
      hoverPlantId = plantId
      gardenPlants()?.setHoveredPlant(plantId)
    }
  }

  function uiPointerDown(event: PointerEvent): boolean {
    lastPointerClient.x = event.clientX
    lastPointerClient.y = event.clientY
    const point = pointerDesign(event)
    updateCursor(point)
    if (!point) return false
    const claimed = routePointer(panels, point, event, 'down')
    updateCursor(point)
    return claimed
  }

  function uiPointerMove(event: PointerEvent): boolean {
    lastPointerClient.x = event.clientX
    lastPointerClient.y = event.clientY
    const point = pointerDesign(event)
    updateCursor(point)
    if (!point) return false
    return routePointer(panels, point, event, 'move')
  }

  function uiPointerUp(event: PointerEvent): boolean {
    const point = pointerDesign(event)
    if (!point) return false
    return routePointer(panels, point, event, 'up')
  }

  /** The brush ring only exists in the farm, so the pointer has to be re-checked
   * whenever the mode or a panel's visibility changes, not just on pointer move. */
  function refreshCursor(): void {
    if (lastPointerClient.x < 0) return
    const rect = gameCanvas.getBoundingClientRect()
    const point = ui.viewport.toDesign(lastPointerClient.x, lastPointerClient.y, rect)
    updateCursor(point)
  }

  /**
   * Whether the pointer is over the interface rather than over the farm.
   *
   * Edge-panning and the garden brush both have to get out of the way here, or
   * dragging the camera fights the tool bar. Full-screen panels (the menu, the
   * journal, the viewer) always count as the interface; the tool bar asks its own
   * slots, and the expansion card still lives in its own 1280x720 scene so its
   * rectangle is measured in device pixels.
   */
  function isOverGameHUD(clientX: number, clientY: number): boolean {
    if (menu.isOpen || journal.isOpen || shed.isOpen || shop.isOpen) return true
    const point = ui.viewport.toDesign(clientX, clientY, gameCanvas.getBoundingClientRect())
    return Boolean(point && (
      (toolsHud.isVisible && toolsHud.hitTest?.(point))
      || shed.contains(point)
      || salePanel.hitTest?.(point)
      || animalCard.hitTest?.(point)
      || propCard.hitTest?.(point)
      || plantCard.hitTest?.(point)
    ))
  }

  function updateCameraPan(deltaSeconds: number): void {
    if (menu.isOpen || deltaSeconds <= 0) return
    let horizontal = Number(pressedKeys.has('d') || pressedKeys.has('arrowright'))
      - Number(pressedKeys.has('a') || pressedKeys.has('arrowleft'))
    let vertical = Number(pressedKeys.has('w') || pressedKeys.has('arrowup'))
      - Number(pressedKeys.has('s') || pressedKeys.has('arrowdown'))
    let edgeStrength = 0

    if (farmCamera.tour) {
      // A key takes the camera back from the tour; a mouse resting near the edge
      // does not, or the tour would end the moment the pointer drifted.
      if (Math.abs(horizontal) + Math.abs(vertical) < 0.001) return
      endCameraTour(true)
    }

    if (pointerWasSeen && dragPointer === null && toolPointer === null
      && !isOverGameHUD(pointerPosition.x, pointerPosition.y)) {
      if (pointerPosition.x < CAMERA_EDGE_MARGIN) {
        const strength = THREE.MathUtils.clamp((CAMERA_EDGE_MARGIN - pointerPosition.x) / CAMERA_EDGE_MARGIN, 0, 1)
        horizontal -= strength
        edgeStrength = Math.max(edgeStrength, strength)
      } else if (pointerPosition.x > window.innerWidth - CAMERA_EDGE_MARGIN) {
        const strength = THREE.MathUtils.clamp((pointerPosition.x - (window.innerWidth - CAMERA_EDGE_MARGIN)) / CAMERA_EDGE_MARGIN, 0, 1)
        horizontal += strength
        edgeStrength = Math.max(edgeStrength, strength)
      }
      if (pointerPosition.y < CAMERA_EDGE_MARGIN) {
        const strength = THREE.MathUtils.clamp((CAMERA_EDGE_MARGIN - pointerPosition.y) / CAMERA_EDGE_MARGIN, 0, 1)
        vertical += strength
        edgeStrength = Math.max(edgeStrength, strength)
      } else if (pointerPosition.y > window.innerHeight - CAMERA_EDGE_MARGIN) {
        const strength = THREE.MathUtils.clamp((pointerPosition.y - (window.innerHeight - CAMERA_EDGE_MARGIN)) / CAMERA_EDGE_MARGIN, 0, 1)
        vertical -= strength
        edgeStrength = Math.max(edgeStrength, strength)
      }
    }

    const inputLength = Math.hypot(horizontal, vertical)
    if (inputLength < 0.001) return
    if (inputLength > 1) {
      horizontal /= inputLength
      vertical /= inputLength
    }

    farmCamera.moveAlongGround(horizontal, vertical, edgeStrength, deltaSeconds)
  }

  function orbitPointerDown(event: PointerEvent): void {
    if (uiPointerDown(event)) return
    if (menu.isOpen) return
    // A press on a farm object goes to the object, whatever tool is armed.
    const onObject = !isOverGameHUD(event.clientX, event.clientY) && pointerActive() && hoverInteractable(event.clientX, event.clientY)
    if (event.button === 0 && (pointerActive() || onObject) && !isOverGameHUD(event.clientX, event.clientY)) {
      // Placement owns the click outright while a prop is on the ghost.
      if (gardenProps()?.placingId) {
        event.preventDefault()
        gardenProps()!.pointerMove(event)
        gardenProps()!.pointerDown(event)
        gardenProps()!.update(0)
        if (!gardenProps()!.placingId) shed.setPlacementActive(false)
        shedDom.refresh()
        syncFarmChrome()
        return
      }
      if (!journal.isOpen && !shed.isOpen && !shop.isOpen) {
        // A placed prop opens its info card (move, store or sell); then the shop door.
        const propHit = gardenProps()?.inspectAt(event.clientX, event.clientY)
        if (propHit) {
          openPropCardFor(propHit)
          return
        }
        if (gardenProps()?.pickShop(event.clientX, event.clientY)) {
          salePanel.close()
          animalCard.close()
          propCard.close()
          gardenProps()?.cancelPlacement()
          gardenPlants()?.cancelPlacement()
          gardenTools?.setPlantingMode(false)
          shed.setPlacementActive(false)
          shop.setOpen(true)
          syncFarmChrome()
          refreshCursor()
          return
        }
      }
      const markerKind = gardenPlants()?.markerKindAt(event.clientX, event.clientY)
      if (markerKind) {
        gardenPlants()?.pointerDown(event)
        syncFarmChrome()
        return
      }
      const animal = pickAnimal(event.clientX, event.clientY)
      if (animal) {
        openAnimalCardFor(animal)
        return
      }
      const plant = gardenPlants()?.selectAt(event.clientX, event.clientY)
      if (plant) {
        propCard.close()
        animalCard.close()
        deps.setFocusedAnimal(null)
        openPlantCardFor(plant)
        return
      }
    }
    if (salePanel.isOpen) {
      salePanel.close()
    }
    // Plant mode owns the lawn press, so an armed seed plants without Shift.
    if (event.button === 0 && (pointerActive() || plantingArmed()) && !onObject && !journal.isOpen && !shed.isOpen && !shop.isOpen && gardenPlants()?.pointerDown(event)) {
      event.preventDefault()
      if (!gardenPlants()!.selectedSpecies) {
        shed.setPlacementActive(false)
        gardenTools?.setPlantingMode(false)
      }
      syncFarmChrome()
      shedDom.refresh()
      return
    }
    if (event.button === 0 && event.detail >= 2) return
    // Middle click levels with the shovel. With no tool armed, left-drag orbits
    // the farm and right-drag pans it; the farm tools keep their own buttons.
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
    if (event.button === 2 && isWorldToolActive() && !onObject && !isOverGameHUD(event.clientX, event.clientY) && gardenTools?.pointerDown(event)) {
      event.preventDefault()
      toolPointer = event.pointerId
      if (event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
      return
    }
    // Tool selections are handled by the shared HUD above. Right-click belongs
    // to the active garden tool inside the plot; outside the plot it remains a pan.

    if (isOverGameHUD(event.clientX, event.clientY)) {
      event.preventDefault()
      return
    }
    if (event.button === 0 && isWorldToolActive() && !onObject && gardenTools?.pointerDown(event)) {
      event.preventDefault()
      toolPointer = event.pointerId
      if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
      return
    }
    if (event.button === 1 && isWorldToolActive() && !onObject && gardenTools?.pointerDown(event)) {
      event.preventDefault()
      toolPointer = event.pointerId
      if (!gardenDebugMode && event.isTrusted && gameCanvas.isConnected) gameCanvas.setPointerCapture(event.pointerId)
      return
    }
    // In the debug harness, synthetic drags (the garden-drag script) must not
    // move the camera; a real player's drag in a debug build still should.
    if (gardenDebugMode && !event.isTrusted) return
    dragPointer = event.pointerId
    dragMode = event.button === 2 ? 'pan' : 'orbit'
    previousPointer = { x: event.clientX, y: event.clientY }
    gameCanvas.setPointerCapture(event.pointerId)
  }

  function orbitPointerMove(event: PointerEvent): void {
    if (uiPointerMove(event)) return
    updateCursor(pointerDesign(event))
    if (gardenProps()?.placingId) gardenProps()!.pointerMove(event)
    if (!menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && plantingArmed()) gardenPlants()?.pointerMove(event)
    if (isWorldToolActive()) gardenTools?.pointerMove(event)
    if (toolPointer === event.pointerId || dragPointer !== event.pointerId) return
    const dx = event.clientX - previousPointer.x
    const dy = event.clientY - previousPointer.y
    previousPointer = { x: event.clientX, y: event.clientY }
    if (dragMode === 'pan') {
      farmCamera.dragPan(dx, dy)
      return
    }
    farmCamera.dragOrbit(dx, dy)
  }

  function orbitPointerUp(event: PointerEvent): void {
    uiPointerUp(event)
    if (gardenProps()?.placingId) {
      gardenProps()!.pointerUp()
      if (!gardenProps()!.placingId) shed.setPlacementActive(false)
      shedDom.refresh()
      syncFarmChrome()
    }
    if (toolPointer === event.pointerId) {
      gardenTools?.pointerUp()
      toolPointer = null
      if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId)
      return
    }
    if (dragPointer !== event.pointerId) return
    dragPointer = null
    dragMode = null
    if (gameCanvas.hasPointerCapture(event.pointerId)) gameCanvas.releasePointerCapture(event.pointerId)
  }

  function preventCanvasMenu(event: MouseEvent): void {
    event.preventDefault()
  }

  function handleZoom(event: WheelEvent): void {
    const point = pointerDesign(event as unknown as PointerEvent)
    if (point) {
      for (let index = panels.length - 1; index >= 0; index -= 1) {
        if (panels[index].wheel?.(point, event)) {
          event.preventDefault()
          return
        }
      }
    }
    event.preventDefault()
    farmCamera.zoomBy(event.deltaY)
  }

  function isTextInputTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"]')))
  }

  /**
   * The key a tool definition would name, with one wrinkle: the camera tool's
   * hotkey is the space bar, whose `event.key` is the character " ".
   */
  function toolHotkey(event: KeyboardEvent): string {
    return event.code === 'Space' ? 'space' : event.key.toLowerCase()
  }

  const PAN_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') setShiftHeld(true)
    if (gardenPlants()?.selectedSpecies && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && !event.altKey && !event.ctrlKey && !event.metaKey && !isTextInputTarget(event.target)) {
      const tool = GARDEN_TOOLS.find((entry) => entry.hotkey === toolHotkey(event) && deps.toolIsOwned(entry.id))
      if (tool) {
        event.preventDefault()
        selectGardenTool(tool.id)
        return
      }
    }
    // Topmost panel first, so a key never reaches the farm while a screen owns it.
    for (let index = panels.length - 1; index >= 0; index -= 1) {
      if (panels[index].keyDown?.(event)) return
    }
    // A prop on the ghost answers R (rotate) and Escape (cancel) before anything else.
    if (gardenProps()?.placingId && !menu.isOpen && !journal.isOpen) {
      if (event.key.toLowerCase() === 'r' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        gardenProps()!.rotate(event.shiftKey ? -1 : 1)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        gardenProps()!.cancelPlacement()
        shed.setPlacementActive(false)
        refreshShopUi()
        syncFarmChrome()
        return
      }
    }
    if (event.altKey || event.ctrlKey || event.metaKey || isTextInputTarget(event.target)) return
    if (event.code === 'Space') {
      // The tool bar claims Space while it is on screen; this only keeps the page
      // itself from scrolling when a screen owns the keys instead.
      event.preventDefault()
      return
    }
    const key = event.key.toLowerCase()
    if (key === 'e' && !event.repeat && !menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && swapGrassPack()) {
      event.preventDefault()
      return
    }
    if (event.key === 'Escape' && farmCamera.tour) {
      // Escape leaves the tour before it means anything else, so a tour ends
      // where it started instead of dropping the player into the menu.
      event.preventDefault()
      endCameraTour(true)
      return
    }
    if (PAN_KEYS.includes(key)) {
      pressedKeys.add(key)
      event.preventDefault()
      return
    }
    if (event.key === 'Escape' && (salePanel.isOpen || animalCard.isOpen || plantCard.isOpen)) {
      salePanel.close()
      animalCard.close()
      plantCard.close()
      syncFarmChrome()
      event.preventDefault()
      return
    }
    if (event.key === 'Escape' && !menu.isOpen && !journal.isOpen) {
      if (gardenPlants()?.selectedSpecies) {
        gardenPlants()!.cancelPlacement()
        shed.setPlacementActive(false)
        gardenTools?.setPlantingMode(false)
        if (lastPointerClient.x >= 0) gardenTools?.pointerMove({ clientX: lastPointerClient.x, clientY: lastPointerClient.y })
        syncFarmChrome()
        event.preventDefault()
        return
      }
      menu.open()
      event.preventDefault()
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') setShiftHeld(false)
    pressedKeys.delete(event.key.toLowerCase())
    if (menu.isOpen || journal.isOpen) return
    if (!isTextInputTarget(event.target) && ['arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(event.key.toLowerCase())) {
      event.preventDefault()
    }
  }

  /**
   * The garden brush follows the pointer from a window-level listener, not from
   * the canvas's, so a drag that runs off the edge of the window keeps painting
   * instead of stopping dead at the border.
   */
  function handleWindowPointerMove(event: PointerEvent): void {
    lastPointerClient.x = event.clientX
    lastPointerClient.y = event.clientY
    pointerPosition = { x: event.clientX, y: event.clientY }
    pointerWasSeen = event.clientX >= 0 && event.clientY >= 0
      && event.clientX <= window.innerWidth && event.clientY <= window.innerHeight
      && !isOverGameHUD(event.clientX, event.clientY)
  }

  function handleWindowBlur(): void {
    pressedKeys.clear()
    setShiftHeld(false)
    pointerWasSeen = false
  }

  function handleWindowPointerUp(event: PointerEvent): void {
    // Canvas pointer capture normally delivers the release to orbitPointerUp.
    // Keep a window fallback for releases outside the canvas, but only let the
    // pointer that started a tool stroke terminate it.
    if (toolPointer !== event.pointerId) return
    gardenTools?.pointerUp()
    toolPointer = null
  }

  function handleCanvasLeave(): void {
    // Keep painting when the pointer merely slips off the canvas edge mid-hold.
    if (!toolPointer) gardenTools?.pointerLeave()
    gardenPlants()?.pointerLeave()
  }


  return {
    attach(): void {
        gameCanvas.addEventListener('pointerdown', orbitPointerDown)
        gameCanvas.addEventListener('pointermove', orbitPointerMove)
        gameCanvas.addEventListener('pointerup', orbitPointerUp)
        gameCanvas.addEventListener('pointercancel', orbitPointerUp)
        gameCanvas.addEventListener('pointerleave', () => {
          // Keep painting when the pointer merely slips off the canvas edge mid-hold
          // (it can return without a new press); only the true garden bounds hide the
          // cursor, which garden-tools handles itself.
          if (!toolPointer) gardenTools?.pointerLeave()
          gardenPlants()?.pointerLeave()
        })
        gameCanvas.addEventListener('contextmenu', preventCanvasMenu)
        gameCanvas.addEventListener('wheel', handleZoom, { passive: false })
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('pointermove', handleWindowPointerMove)
        window.addEventListener('pointerup', handleWindowPointerUp)
        window.addEventListener('keyup', handleKeyUp)
        window.addEventListener('blur', handleWindowBlur)
        window.addEventListener('mouseleave', handleWindowBlur)
        gameCanvas.addEventListener('pointerleave', handleCanvasLeave)
    },
    refreshCursor,
    setShiftHeld,
    isOverGameHUD,
    updateCameraPan,
    refreshHover,
    followPointer(): void {
      if (pointerWasSeen && !isOverGameHUD(pointerPosition.x, pointerPosition.y)) {
        if (!menu.isOpen && !journal.isOpen && !shed.isOpen && !shop.isOpen && plantingArmed()) deps.gardenPlants()?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y, button: 0 })
        deps.gardenProps()?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
        if (isWorldToolActive()) gardenTools?.pointerMove({ clientX: pointerPosition.x, clientY: pointerPosition.y })
      } else {
        deps.gardenPlants()?.pointerLeave()
        deps.gardenProps()?.pointerLeave()
        gardenTools?.pointerLeave()
      }
    },
    cancelDrag(): void {
      dragPointer = null
      dragMode = null
    },
    plantingArmed,
    isWorldToolActive,
    pointerSeen: () => pointerWasSeen,
    pointerPosition: () => pointerPosition,
  }
}
