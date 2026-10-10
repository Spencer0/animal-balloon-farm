import * as THREE from 'three'
import { GARDEN_TOOLS, createGardenToolModel, tintSeedPack, type GardenToolId } from '../scene/garden-tool-art'
import type { GrassPack } from '../game/tool-unlocks'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createSurface, fillRoundRect, strokeRoundRect } from './ui-theme'
import { createToolTooltipDom } from './tool-tooltip-dom'

/**
 * The garden tool bar.
 *
 * The bar used to be a row of carved plaques with a caption, a title, a
 * subtitle and an accent bar -- a lot of lettering to say "this is the shovel".
 * The tool is already a model, so the bar just shows the model: the seeder and
 * the shovel float above the lawn, tipped toward the camera so they read as
 * objects rather than as icons on a list. The only text left is the key number
 * beside each one, because that is the one thing a player cannot guess. The
 * bucket joins the seeder and shovel as a plain, readable tool silhouette.
 *
 * Selecting a tool sizes it: the selected tool grows a step while the rest
 * shrink a step, so the bar reads by silhouette size instead of a glow.
 */

const SLOT_WIDTH = 96
const SLOT_HEIGHT = 120
const SLOT_GAP = 44
const BOTTOM_MARGIN = 26
/** Resting tilt, so the tools read as three-dimensional objects at a glance. */
const TILT_Y = -0.62
const TILT_Z = 0.14
/** Selection reads by size: selected grows, the rest shrink. */
const SELECTED_SCALE = 1.3
const IDLE_SCALE = 0.7

export interface ToolsHud extends UIPanel {
  /** Null while no tool is armed: the pointer is in charge. */
  readonly selectedTool: GardenToolId | null
  readonly isVisible: boolean
  setVisible(visible: boolean): void
  selectTool(id: GardenToolId | null): void
  setSelectedTool(id: GardenToolId | null): void
  /** Show the pack in the seeder's hand; `canSwap` reveals the E chip once the tall pack is owned. */
  setGrassPack(pack: GrassPack, canSwap: boolean): void
  /**
   * Which tools the farmer owns. The seeder, shovel and bucket are always in the
   * bar; a bought tool (the Snower) takes the next slot and number key once owned.
   */
  setOwnedTools(ids: readonly GardenToolId[]): void
  isToolOwned(id: GardenToolId): boolean
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * The little key chip that tells the player which key picks the tool.
 *
 * Digits fit the original square, but the camera tool's key is the word
 * "space": widen the chip to hold it rather than shrinking the type into an
 * unreadable smudge.
 */
function createBadgeTexture(hotkey: string): THREE.CanvasTexture {
  const fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace'
  const height = 64
  const measure = createSurface(height * 4, height).context
  measure.font = `bold 34px ${fontFamily}`
  const width = Math.max(height, Math.ceil(measure.measureText(hotkey).width) + 22)
  const surface = createSurface(width, height)
  const context = surface.context
  fillRoundRect(context, 3, 3, width - 6, height - 6, 16, 'rgba(48, 30, 16, .82)')
  strokeRoundRect(context, 3, 3, width - 6, height - 6, 16, 'rgba(255, 233, 190, .55)', 2.5)
  context.fillStyle = '#fff3d6'
  context.font = `bold 34px ${fontFamily}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(hotkey, width / 2, height / 2 + 2)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface ToolSlot {
  readonly id: GardenToolId
  readonly hotkey: string
  readonly holder: THREE.Group
  readonly icon: THREE.Group
  readonly badgeMaterial: THREE.MeshBasicMaterial
  readonly model: THREE.Group
  rect: DesignRect
  centreX: number
  centreY: number
  hover: number
  press: number
  selectedAmount: number
  bob: number
}

export function createToolsHud(
  initialTool: GardenToolId | null,
  onSelect: (id: GardenToolId | null) => void,
  cssWidth: number,
  cssHeight: number,
): ToolsHud {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)

  const object = new THREE.Group()
  object.name = 'Garden tool bar'

  const slots: ToolSlot[] = GARDEN_TOOLS.map((tool, index) => {
    const holder = new THREE.Group()
    holder.name = `Garden tool · ${tool.id}`
    object.add(holder)

    const icon = new THREE.Group()
    holder.add(icon)
    const fit = new THREE.Group()
    fit.name = 'Tool fitted frame'
    icon.add(fit)
    const model = createGardenToolModel(tool.id)
    model.name = `Garden tool model · ${tool.id}`

    // Fit the model to the slot without distorting it, then hang it from the
    // slot's centre so a tall seeder and a wide shovel both sit on one line.
    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    const centre = bounds.getCenter(new THREE.Vector3())
    const scale = Math.min(SLOT_WIDTH * 0.98 / Math.max(size.x, size.z), SLOT_HEIGHT * 0.9 / size.y)
    fit.scale.setScalar(scale)
    fit.position.set(-centre.x * scale, -centre.y * scale, 0)
    fit.add(model)

    // The icon tips toward the camera and leans, so the two tools do not read
    // as flat stickers pasted on the lawn.
    icon.rotation.set(0.06, TILT_Y, TILT_Z)
    icon.position.y = SLOT_HEIGHT * 0.06

    const badgeMaterial = new THREE.MeshBasicMaterial({
      map: createBadgeTexture(tool.hotkey),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })
    const badgeSize = 32
    // The chip's canvas is wider for multi-character keys; keep the plane in
    // the same aspect instead of stretching the letters.
    const badgeImage = badgeMaterial.map?.image as { width?: number; height?: number } | undefined
    const badgeWidth = badgeSize * (badgeImage?.width && badgeImage.height ? badgeImage.width / badgeImage.height : 1)
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(badgeWidth, badgeSize), badgeMaterial)
    badge.name = `Tool key badge · ${tool.hotkey}`
    badge.position.set(SLOT_WIDTH / 2 - badgeWidth * 0.35, -SLOT_HEIGHT / 2 + badgeSize * 0.85, 3)
    badge.renderOrder = 4
    holder.add(badge)

    return {
      id: tool.id,
      hotkey: tool.hotkey,
      holder,
      icon,
      badgeMaterial,
      model,
      rect: { x: 0, y: 0, width: SLOT_WIDTH, height: SLOT_HEIGHT },
      centreX: 0,
      centreY: 0,
      hover: 0,
      press: 0,
      selectedAmount: 0,
      // Stagger the idle bob so the tools do not breathe in lockstep.
      bob: index * 1.9,
    }
  })

  // The E chip hangs off the seeder's top corner and only shows once there is a
  // second pack to swap to, so a new farmer is not teased with a key that does nothing.
  const swapChipMaterial = new THREE.MeshBasicMaterial({ map: createBadgeTexture('E'), transparent: true, depthWrite: false, depthTest: false })
  const swapChip = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), swapChipMaterial)
  swapChip.name = 'Seed pack swap key badge · E'
  swapChip.position.set(SLOT_WIDTH / 2 - 8, SLOT_HEIGHT / 2 - 6, 3)
  swapChip.renderOrder = 4
  swapChip.visible = false
  slots.find((slot) => slot.id === 'grass')?.holder.add(swapChip)

  let selected = initialTool
  let visible = true
  // Bought tools stay out of the bar, and off the keyboard, until they are owned.
  const BOUGHT_TOOLS: readonly GardenToolId[] = ['snower']
  const owned = new Set<GardenToolId>(GARDEN_TOOLS.map((tool) => tool.id).filter((id) => !BOUGHT_TOOLS.includes(id)))
  const shown = (): ToolSlot[] => slots.filter((slot) => owned.has(slot.id))

  // The hover tooltip is a DOM card (see tool-tooltip-dom.ts); the bar only
  // reports which tool is hovered and where it sits on screen.
  const tooltip = createToolTooltipDom()
  let cssSize = { width: cssWidth, height: cssHeight }
  let hoveredId: GardenToolId | null = null
  let grassPack: GrassPack = 'short'
  let canSwapPack = false

  function showTooltip(slot: ToolSlot): void {
    const x = (slot.centreX + viewport.width / 2) / viewport.width
    const top = (viewport.height / 2 - (slot.centreY + SLOT_HEIGHT / 2)) / viewport.height
    tooltip.show(
      slot.id,
      { centreX: x * cssSize.width, top: top * cssSize.height },
      { canSwapPack, pack: grassPack },
    )
  }

  function hoverSlot(slot: ToolSlot | null): void {
    const id = slot?.id ?? null
    if (id === hoveredId) return
    hoveredId = id
    if (slot) showTooltip(slot)
    else tooltip.hide()
  }

  function select(id: GardenToolId | null): void {
    selected = id
    onSelect(id)
  }

  function layout(): void {
    const row = shown()
    for (const slot of slots) slot.holder.visible = owned.has(slot.id)
    const totalWidth = row.length * SLOT_WIDTH + (row.length - 1) * SLOT_GAP
    const centreY = viewport.bottom + BOTTOM_MARGIN + SLOT_HEIGHT / 2
    const startX = -totalWidth / 2 + SLOT_WIDTH / 2
    for (const [index, slot] of row.entries()) {
      slot.centreX = startX + index * (SLOT_WIDTH + SLOT_GAP)
      slot.centreY = centreY
      slot.holder.position.set(slot.centreX, slot.centreY, 0)
      slot.rect = {
        x: slot.centreX - SLOT_WIDTH / 2,
        y: slot.centreY - SLOT_HEIGHT / 2,
        width: SLOT_WIDTH,
        height: SLOT_HEIGHT,
      }
    }
  }

  function slotAt(point: DesignPoint): ToolSlot | null {
    for (const slot of shown()) {
      if (rectContains(slot.rect, point)) return slot
    }
    return null
  }

  function update(delta: number, elapsed: number): void {
    const blend = 1 - Math.exp(-delta * 14)
    for (const slot of slots) {
      const isSelected = slot.id === selected
      const hoverTarget = slot.hover > 0.5 ? 1 : 0
      slot.press += ((slot.press > 0.5 ? 1 : 0) - slot.press) * blend
      slot.hover += (hoverTarget - slot.hover) * blend
      const selectedTarget = isSelected ? 1 : 0
      slot.selectedAmount += (selectedTarget - slot.selectedAmount) * blend

      // Float, then lean in on hover, then dip on press. Selection reads by
      // size: the picked tool grows a step while the rest shrink a step.
      const bob = Math.sin(elapsed * 1.9 + slot.bob) * 3
      const scale = IDLE_SCALE
        + slot.selectedAmount * (SELECTED_SCALE - IDLE_SCALE)
        + slot.hover * 0.07
        - slot.press * 0.05
      slot.icon.position.y = SLOT_HEIGHT * 0.06 + bob + slot.hover * 6 - slot.press * 6
      slot.icon.rotation.set(0.06, TILT_Y + slot.hover * 0.14, TILT_Z - slot.hover * 0.05)
      slot.icon.scale.setScalar(scale)

      slot.badgeMaterial.opacity = 0.8 + slot.selectedAmount * 0.2
    }
  }

  layout()

  return {
    name: 'tools-hud',
    object,
    // Sits under everything: the journal and the menu both draw over the farm.
    order: 5,
    get selectedTool(): GardenToolId | null {
      return selected
    },
    get isVisible(): boolean { return visible },
    setVisible(next): void {
      visible = next
      object.visible = next
      if (!next) hoverSlot(null)
    },
    selectTool(id: GardenToolId | null): void {
      select(id)
    },
    setSelectedTool(id: GardenToolId | null): void {
      if (id === null || GARDEN_TOOLS.some((tool) => tool.id === id)) selected = id
    },
    pointerDown(point: DesignPoint, event: PointerEvent): boolean {
      if (!visible) return false
      const slot = slotAt(point)
      if (!slot) return false
      event.preventDefault()
      slot.press = 1
      // Pressing the armed tool again puts it down, which hands the pointer back.
      select(slot.id === selected ? null : slot.id)
      return true
    },
    pointerMove(point: DesignPoint): boolean {
      if (!visible) return false
      const slot = slotAt(point)
      for (const candidate of slots) candidate.hover = candidate === slot ? 1 : 0
      hoverSlot(slot)
      return slot !== null
    },
    cursor(point: DesignPoint): UiCursorKind | undefined {
      return visible && slotAt(point) ? 'point' : undefined
    },
    hitTest(point: DesignPoint): boolean {
      return visible && slotAt(point) !== null
    },
    pointerUp(point: DesignPoint): boolean {
      if (!visible) return false
      const slot = slotAt(point)
      for (const candidate of slots) {
        if (candidate.press > 0) candidate.press = 0
      }
      return slot !== null
    },
    keyDown(event: KeyboardEvent): boolean {
      if (!visible || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return false
      const key = event.code === 'Space' ? 'space' : event.key.toLowerCase()
      const tool = GARDEN_TOOLS.find((item) => item.hotkey === key && owned.has(item.id))
      if (!tool) return false
      event.preventDefault()
      const slot = slots.find((item) => item.id === tool.id)
      if (slot) slot.press = 1
      select(tool.id)
      return true
    },
    setOwnedTools(ids: readonly GardenToolId[]): void {
      owned.clear()
      for (const tool of GARDEN_TOOLS) if (!BOUGHT_TOOLS.includes(tool.id)) owned.add(tool.id)
      for (const id of ids) owned.add(id)
      layout()
    },
    isToolOwned(id: GardenToolId): boolean {
      return owned.has(id)
    },
    setGrassPack(pack: GrassPack, canSwap: boolean): void {
      const grass = slots.find((slot) => slot.id === 'grass')
      if (grass) tintSeedPack(grass.model, pack)
      swapChip.visible = canSwap
      grassPack = pack
      canSwapPack = canSwap
      // Keep an open tooltip honest when E swaps the pack under the pointer.
      const hovered = slots.find((slot) => slot.id === hoveredId)
      if (hovered) showTooltip(hovered)
    },
    update(delta: number): void {
      update(delta, performance.now() / 1000)
    },
    resize(width: number, height: number): void {
      viewport.resize(width, height)
      cssSize = { width, height }
      layout()
    },
    describe() {
      return {
        selected,
        // The bar is anchored to the bottom edge and sized in design units, so
        // its height as a fraction of the window must not drift with aspect.
        barHeightFraction: round(SLOT_HEIGHT / viewport.height),
        firstButton: { ...slots[0].rect },
        slots: shown().map((slot) => ({ id: slot.id, hotkey: slot.hotkey, ...slot.rect })),
      }
    },
    dispose(): void {
      tooltip.dispose()
      for (const slot of slots) {
        slot.holder.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.geometry.dispose()
        })
        slot.badgeMaterial.map?.dispose()
        slot.badgeMaterial.dispose()
      }
      swapChip.geometry.dispose()
      swapChipMaterial.map?.dispose()
      swapChipMaterial.dispose()
    },
  }
}
