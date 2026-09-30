import * as THREE from 'three'
import { GARDEN_TOOLS, createGardenToolModel, type GardenToolId } from '../scene/garden-tool-art'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createSurface, fillRoundRect, strokeRoundRect } from './ui-theme'

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
 * Selecting a tool lights it: a golden outline shell grows around the model's
 * silhouette and a warm halo blooms behind it.
 */

const SLOT_WIDTH = 96
const SLOT_HEIGHT = 120
const SLOT_GAP = 44
const BOTTOM_MARGIN = 26
/** Resting tilt, so the tools read as three-dimensional objects at a glance. */
const TILT_Y = -0.62
const TILT_Z = 0.14
const OUTLINE_COLOR = '#ffd75e'
/**
 * The hull is grown from the model's own origin, so the thickness is a scale
 * factor rather than an offset. It had to go up when the icons shrank: at the
 * old size a 1.13 shell was several pixels wide, at half that it was a hairline
 * and the selected tool stopped reading as selected.
 */
const OUTLINE_THICKNESS = 1.22

export interface ToolsHud extends UIPanel {
  readonly selectedTool: GardenToolId
  selectTool(id: GardenToolId): void
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

/** A soft radial bloom drawn once and shared by every slot. */
function createGlowTexture(): THREE.CanvasTexture {
  const surface = createSurface(256, 256)
  const context = surface.context
  const gradient = context.createRadialGradient(128, 132, 8, 128, 132, 124)
  gradient.addColorStop(0, 'rgba(255, 226, 140, .85)')
  gradient.addColorStop(0.45, 'rgba(255, 198, 84, .34)')
  gradient.addColorStop(1, 'rgba(255, 186, 60, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** The little numbered chip that tells the player which key picks the tool. */
function createBadgeTexture(hotkey: string): THREE.CanvasTexture {
  const size = 64
  const surface = createSurface(size, size)
  const context = surface.context
  fillRoundRect(context, 4, 4, size - 8, size - 8, 16, 'rgba(48, 30, 16, .82)')
  strokeRoundRect(context, 4, 4, size - 8, size - 8, 16, 'rgba(255, 233, 190, .55)', 2.5)
  context.fillStyle = '#fff3d6'
  context.font = 'bold 34px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(hotkey, size / 2, size / 2 + 2)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * An inverted hull around the model, the standard cheap silhouette outline.
 * Each shell is pushed out from the *model's* origin rather than its own, so
 * the whole outline grows evenly instead of each part ballooning on its own.
 */
function buildOutline(model: THREE.Group, color: string, thickness: number): THREE.Group {
  const outline = new THREE.Group()
  outline.name = 'Tool selection outline'
  outline.visible = false
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, depthWrite: false })
  for (const child of model.children) {
    if (!(child instanceof THREE.Mesh)) continue
    const shell = new THREE.Mesh(child.geometry, material)
    shell.position.copy(child.position).multiplyScalar(thickness)
    shell.quaternion.copy(child.quaternion)
    shell.scale.copy(child.scale).multiplyScalar(thickness)
    shell.castShadow = false
    shell.receiveShadow = false
    outline.add(shell)
  }
  return outline
}

interface ToolSlot {
  readonly id: GardenToolId
  readonly hotkey: string
  readonly holder: THREE.Group
  readonly icon: THREE.Group
  readonly outline: THREE.Group
  readonly glowMaterial: THREE.MeshBasicMaterial
  readonly badgeMaterial: THREE.MeshBasicMaterial
  readonly lights: THREE.MeshStandardMaterial[]
  rect: DesignRect
  centreX: number
  centreY: number
  hover: number
  press: number
  glow: number
  outlineAmount: number
  bob: number
}

export function createToolsHud(
  initialTool: GardenToolId,
  onSelect: (id: GardenToolId) => void,
  cssWidth: number,
  cssHeight: number,
): ToolsHud {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)

  const object = new THREE.Group()
  object.name = 'Garden tool bar'

  const glowTexture = createGlowTexture()
  const slots: ToolSlot[] = GARDEN_TOOLS.map((tool, index) => {
    const holder = new THREE.Group()
    holder.name = `Garden tool · ${tool.id}`
    object.add(holder)

    const glowMaterial = new THREE.MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0,
    })
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(SLOT_WIDTH * 1.1, SLOT_HEIGHT * 1.05), glowMaterial)
    glow.name = 'Tool selection halo'
    glow.position.z = -2
    glow.renderOrder = -1
    holder.add(glow)

    const icon = new THREE.Group()
    holder.add(icon)
    // The model and its outline share one fitted frame. Keeping them as
    // siblings of `icon` instead meant the outline drew at the model's raw
    // size and vanished inside it.
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

    const outline = buildOutline(model, OUTLINE_COLOR, OUTLINE_THICKNESS)
    fit.add(outline)

    // The icon tips toward the camera and leans, so the two tools do not read
    // as flat stickers pasted on the lawn.
    icon.rotation.set(0.06, TILT_Y, TILT_Z)
    icon.position.y = SLOT_HEIGHT * 0.06

    const lights: THREE.MeshStandardMaterial[] = []
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material
        if (Array.isArray(material)) material.forEach((entry) => lights.push(entry))
        else lights.push(material)
      }
    })

    const badgeMaterial = new THREE.MeshBasicMaterial({
      map: createBadgeTexture(tool.hotkey),
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })
    const badgeSize = 32
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(badgeSize, badgeSize), badgeMaterial)
    badge.name = `Tool key badge · ${tool.hotkey}`
    badge.position.set(SLOT_WIDTH / 2 - badgeSize * 0.35, -SLOT_HEIGHT / 2 + badgeSize * 0.85, 3)
    badge.renderOrder = 4
    holder.add(badge)

    return {
      id: tool.id,
      hotkey: tool.hotkey,
      holder,
      icon,
      outline,
      glowMaterial,
      badgeMaterial,
      lights,
      rect: { x: 0, y: 0, width: SLOT_WIDTH, height: SLOT_HEIGHT },
      centreX: 0,
      centreY: 0,
      hover: 0,
      press: 0,
      glow: 0,
      outlineAmount: 0,
      // Stagger the idle bob so the tools do not breathe in lockstep.
      bob: index * 1.9,
    }
  })

  let selected = initialTool

  function select(id: GardenToolId): void {
    selected = id
    onSelect(id)
  }

  function layout(): void {
    const totalWidth = slots.length * SLOT_WIDTH + (slots.length - 1) * SLOT_GAP
    const centreY = viewport.bottom + BOTTOM_MARGIN + SLOT_HEIGHT / 2
    const startX = -totalWidth / 2 + SLOT_WIDTH / 2
    for (const [index, slot] of slots.entries()) {
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
    for (const slot of slots) {
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
      const glowTarget = isSelected ? 1 : 0
      slot.glow += (glowTarget - slot.glow) * blend
      const outlineTarget = isSelected ? 1 : 0
      slot.outlineAmount += (outlineTarget - slot.outlineAmount) * blend

      // Float, then lean in on hover, then dip on press.
      const bob = Math.sin(elapsed * 1.9 + slot.bob) * 3
      const scale = 1 + slot.hover * 0.07 - slot.press * 0.05 + slot.glow * 0.05
      slot.icon.position.y = SLOT_HEIGHT * 0.06 + bob + slot.hover * 6 - slot.press * 6
      slot.icon.rotation.set(0.06, TILT_Y + slot.hover * 0.14 - slot.glow * 0.05, TILT_Z - slot.hover * 0.05)
      slot.icon.scale.setScalar(scale)

      slot.glowMaterial.opacity = 0.06 + slot.glow * 0.44
      slot.outline.visible = slot.outlineAmount > 0.01
      slot.outline.scale.setScalar(0.9 + slot.outlineAmount * 0.1)
      slot.badgeMaterial.opacity = 0.8 + slot.glow * 0.2

      // A little warmth on the selected tool, not a floodlight: pushed further
      // the seeder's glass jar blew out and the silhouette disappeared.
      for (const material of slot.lights) {
        if (!material.emissive) continue
        material.emissive.set(isSelected ? '#ffcf63' : '#000000')
        material.emissiveIntensity = slot.glow * 0.2
      }
    }
  }

  layout()

  return {
    name: 'tools-hud',
    object,
    // Sits under everything: the journal and the menu both draw over the farm.
    order: 5,
    get selectedTool(): GardenToolId {
      return selected
    },
    selectTool(id: GardenToolId): void {
      select(id)
    },
    pointerDown(point: DesignPoint, event: PointerEvent): boolean {
      const slot = slotAt(point)
      if (!slot) return false
      event.preventDefault()
      slot.press = 1
      select(slot.id)
      return true
    },
    pointerMove(point: DesignPoint): boolean {
      const slot = slotAt(point)
      for (const candidate of slots) candidate.hover = candidate === slot ? 1 : 0
      return slot !== null
    },
    cursor(point: DesignPoint): UiCursorKind | undefined {
      return slotAt(point) ? 'point' : undefined
    },
    hitTest(point: DesignPoint): boolean {
      return slotAt(point) !== null
    },
    pointerUp(point: DesignPoint): boolean {
      const slot = slotAt(point)
      for (const candidate of slots) {
        if (candidate.press > 0) candidate.press = 0
      }
      return slot !== null
    },
    keyDown(event: KeyboardEvent): boolean {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return false
      const tool = GARDEN_TOOLS.find((item) => item.hotkey === event.key.toLowerCase())
      if (!tool) return false
      event.preventDefault()
      const slot = slots.find((item) => item.id === tool.id)
      if (slot) slot.press = 1
      select(tool.id)
      return true
    },
    update(delta: number): void {
      update(delta, performance.now() / 1000)
    },
    resize(width: number, height: number): void {
      viewport.resize(width, height)
      layout()
    },
    describe() {
      return {
        selected,
        // The bar is anchored to the bottom edge and sized in design units, so
        // its height as a fraction of the window must not drift with aspect.
        barHeightFraction: round(SLOT_HEIGHT / viewport.height),
        firstButton: { ...slots[0].rect },
        slots: slots.map((slot) => ({ id: slot.id, hotkey: slot.hotkey, ...slot.rect })),
      }
    },
    dispose(): void {
      for (const slot of slots) {
        slot.holder.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.geometry.dispose()
        })
        slot.glowMaterial.dispose()
        slot.badgeMaterial.map?.dispose()
        slot.badgeMaterial.dispose()
      }
      glowTexture.dispose()
    },
  }
}
