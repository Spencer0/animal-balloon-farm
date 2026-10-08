import * as THREE from 'three'
import { armSellConfirm, cancelSellConfirm, createAnimalCardState, placeInfoCard, resetAnimalCardState } from '../game/animal-card'
import { propCardChip, type PropId } from '../game/farm-props'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createSurface, fillRoundRect, grain, strokeRoundRect, UI_THEME, verticalGradient, withShadow, wrapText } from './ui-theme'

/**
 * The prop info card: a small pinned note beside a placed prop the player
 * clicked, with Move, Store and Sell.
 *
 * Built like `animal-card.ts` -- a canvas-texture card in the shared Three.js
 * UI layer, pinned rather than modal, with the same two-press Sell confirm. The
 * rules it shows (sale value, chip copy) live in `src/game/farm-props.ts`; the
 * scene work (lifting, storing, selling) is done by the caller through
 * `PropCardActions`, so this file only draws and routes clicks.
 */

export interface PropCardTarget {
  readonly id: PropId
  readonly name: string
  readonly blurb: string
  readonly sections: number
  readonly salePrice: number
  /** Cell props can be lifted and set down elsewhere; a fence run cannot. */
  readonly movable: boolean
  readonly rotatable: boolean
}

export interface PropCardActions {
  readonly onMove: () => void
  readonly onStore: () => void
  /** Second Sell press. Return false to refuse (the card stands the confirm down). */
  readonly onSell: () => boolean
  readonly onToggle?: (isOpen: boolean) => void
}

export interface PropCardPanel extends UIPanel {
  readonly isOpen: boolean
  open(target: PropCardTarget, anchor?: DesignPoint): void
  close(): void
}

type ButtonId = 'move' | 'store' | 'sell' | 'confirm' | 'keep'

const WIDTH = 380
const HEIGHT = 292
const PAD = 20
const TITLE_BASELINE = 54
const CHIP_Y = 66
const CHIP_HEIGHT = 30
const BLURB_BASELINE = 134
const BUTTON_HEIGHT = 56
const BUTTON_GAP = 8
const BUTTON_Y = -HEIGHT / 2 + 16
const BUTTON_TOP = HEIGHT / 2 - BUTTON_Y - BUTTON_HEIGHT
const ROW_WIDTH = WIDTH - PAD * 2

const CLOSE: DesignRect = { x: 134, y: HEIGHT / 2 - 52, width: 40, height: 40 }

interface CardButton {
  readonly id: ButtonId
  readonly rect: DesignRect
  readonly label: string
}

/** One row of equal buttons across the foot of the card. */
function row(entries: readonly { id: ButtonId; label: string; weight?: number }[]): CardButton[] {
  const totalWeight = entries.reduce((sum, entry) => sum + (entry.weight ?? 1), 0)
  const room = ROW_WIDTH - BUTTON_GAP * (entries.length - 1)
  let x = -ROW_WIDTH / 2
  return entries.map((entry) => {
    const width = Math.round((room * (entry.weight ?? 1)) / totalWeight)
    const button: CardButton = { id: entry.id, label: entry.label, rect: { x, y: BUTTON_Y, width, height: BUTTON_HEIGHT } }
    x += width + BUTTON_GAP
    return button
  })
}

export function createPropCard(actions: PropCardActions, cssWidth: number, cssHeight: number): PropCardPanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)

  const object = new THREE.Group()
  object.name = 'Prop info card'
  const surface = createSurface(WIDTH, HEIGHT)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), material)
  card.name = 'Prop info card · paper'
  card.position.z = 2
  card.visible = false
  object.add(card)

  const state = createAnimalCardState()
  let target: PropCardTarget | null = null
  let hovered: string | null = null

  let anchor: DesignPoint = { x: 0, y: 30 }
  function layout(): void {
    const placed = placeInfoCard(
      anchor,
      { width: WIDTH, height: HEIGHT },
      { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom },
    )
    object.position.set(placed.x, placed.y, 0)
  }

  function toLocal(point: DesignPoint): DesignPoint {
    return { x: point.x - object.position.x, y: point.y - object.position.y }
  }

  function containsCard(point: DesignPoint): boolean {
    return rectContains({ x: -WIDTH / 2, y: -HEIGHT / 2, width: WIDTH, height: HEIGHT }, toLocal(point))
  }

  function canvasOf(rect: DesignRect): { x: number; y: number } {
    return { x: WIDTH / 2 + rect.x, y: HEIGHT / 2 - rect.y - rect.height }
  }

  /** The buttons the card shows right now: its row depends on the prop and the confirm. */
  function buttons(): readonly CardButton[] {
    if (!target) return []
    if (state.mode === 'confirm') {
      return row([
        { id: 'confirm', label: `Sure? Sell for ${target.salePrice}`, weight: 2 },
        { id: 'keep', label: 'Keep' },
      ])
    }
    const entries: { id: ButtonId; label: string }[] = []
    if (target.movable) entries.push({ id: 'move', label: 'Move' })
    entries.push({ id: 'store', label: 'Store' }, { id: 'sell', label: `Sell · ${target.salePrice}` })
    return row(entries)
  }

  function paletteFor(id: ButtonId): { top: string; bottom: string; stroke: string; text: string } {
    if (id === 'sell' || id === 'confirm') return { top: '#cf5245', bottom: '#9c3730', stroke: '#7c2a24', text: '#fff4d5' }
    if (id === 'move') return { top: '#7cab66', bottom: '#4c7a45', stroke: '#35582f', text: '#fff6e8' }
    if (id === 'keep') return { top: '#fbf0d6', bottom: '#fbf0d6', stroke: UI_THEME.gilt, text: UI_THEME.ink }
    return { top: '#f2cd72', bottom: '#d9a441', stroke: '#8a6420', text: UI_THEME.ink }
  }

  function drawButton(button: CardButton): void {
    const context = surface.context
    const at = canvasOf(button.rect)
    const colours = paletteFor(button.id)
    const fill = colours.top === colours.bottom
      ? colours.top
      : verticalGradient(context, 0, at.y, button.rect.height, [[0, colours.top], [1, colours.bottom]])
    fillRoundRect(context, at.x, at.y, button.rect.width, button.rect.height, 15, fill)
    strokeRoundRect(context, at.x, at.y, button.rect.width, button.rect.height, 15, colours.stroke, 2.5)
    if (hovered === button.id) {
      context.save()
      context.globalAlpha = 0.14
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.roundRect(at.x, at.y, button.rect.width, button.rect.height, 15)
      context.fill()
      context.restore()
    }
    context.fillStyle = colours.text
    context.font = `bold ${button.id === 'confirm' ? 17 : 18}px Georgia, "Times New Roman", serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(button.label, at.x + button.rect.width / 2, at.y + button.rect.height / 2 + 1)
  }

  function draw(): void {
    const context = surface.context
    context.clearRect(0, 0, WIDTH, HEIGHT)
    if (!target) {
      texture.needsUpdate = true
      return
    }
    const current = target
    withShadow(context, 25, 10, () => {
      fillRoundRect(context, 0, 0, WIDTH, HEIGHT, 24, verticalGradient(context, 0, 0, HEIGHT, [[0, '#fdf6e3'], [1, '#eedcb6']]))
    })
    strokeRoundRect(context, 3, 3, WIDTH - 6, HEIGHT - 6, 22, UI_THEME.gilt, 3)
    grain(context, 6, 6, WIDTH - 12, HEIGHT - 12, 9182, 150, 0.05)

    context.textBaseline = 'alphabetic'
    context.textAlign = 'left'
    context.fillStyle = UI_THEME.ink
    context.font = 'bold 26px Georgia, "Times New Roman", serif'
    let title = current.name
    const maxTitleWidth = WIDTH / 2 + CLOSE.x - PAD - 12
    while (title.length > 1 && context.measureText(title).width > maxTitleWidth) title = title.slice(0, -1)
    context.fillText(title, PAD, TITLE_BASELINE)

    const close = canvasOf(CLOSE)
    fillRoundRect(context, close.x, close.y, CLOSE.width, CLOSE.height, 12, hovered === 'close' ? '#d95f43' : UI_THEME.barnRed)
    context.save()
    context.strokeStyle = '#fff4d5'
    context.lineWidth = 4
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(close.x + 13, close.y + 13)
    context.lineTo(close.x + CLOSE.width - 13, close.y + CLOSE.height - 13)
    context.moveTo(close.x + CLOSE.width - 13, close.y + 13)
    context.lineTo(close.x + 13, close.y + CLOSE.height - 13)
    context.stroke()
    context.restore()

    context.font = 'bold 13px Georgia, "Times New Roman", serif'
    const chipLabel = propCardChip(current.id, current.sections)
    const chipWidth = context.measureText(chipLabel).width + 28
    fillRoundRect(context, PAD, CHIP_Y, chipWidth, CHIP_HEIGHT, 17, '#5aa3a0')
    context.fillStyle = '#fff6e8'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(chipLabel, PAD + chipWidth / 2, CHIP_Y + CHIP_HEIGHT / 2 + 1)

    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillStyle = UI_THEME.inkSoft
    context.font = '15px Georgia, "Times New Roman", serif'
    const afterBlurb = wrapText(context, current.blurb, PAD, BLURB_BASELINE, WIDTH - PAD * 2, 20)
    if (current.rotatable) {
      context.font = 'italic 14px Georgia, "Times New Roman", serif'
      context.fillText('Press R while moving to turn it.', PAD, Math.min(afterBlurb + 4, BUTTON_TOP - 12))
    }

    for (const button of buttons()) drawButton(button)
    texture.needsUpdate = true
  }

  function regionAt(point: DesignPoint): string | null {
    if (!target) return null
    const local = toLocal(point)
    if (rectContains(CLOSE, local)) return 'close'
    for (const button of buttons()) {
      if (rectContains(button.rect, local)) return button.id
    }
    return null
  }

  layout()
  draw()

  function reset(): void {
    resetAnimalCardState(state)
    hovered = null
  }

  return {
    name: 'prop-card',
    object,
    order: 13,
    get isOpen(): boolean {
      return target !== null
    },
    open(next: PropCardTarget, nextAnchor?: DesignPoint): void {
      anchor = nextAnchor ?? { x: 0, y: 30 }
      const wasOpen = target !== null
      target = next
      layout()
      reset()
      card.visible = true
      draw()
      if (!wasOpen) actions.onToggle?.(true)
    },
    close(): void {
      if (!target) return
      target = null
      reset()
      card.visible = false
      draw()
      actions.onToggle?.(false)
    },
    pointerDown(point: DesignPoint, event: PointerEvent): boolean {
      if (!target) return false
      // Pinned, not modal: a click outside falls through to the farm untouched.
      if (!containsCard(point)) return false
      event.preventDefault()
      const region = regionAt(point)
      if (region === 'close') {
        this.close()
      } else if (region === 'move') {
        this.close()
        actions.onMove()
      } else if (region === 'store') {
        this.close()
        actions.onStore()
      } else if (region === 'sell') {
        armSellConfirm(state)
        draw()
      } else if (region === 'confirm') {
        if (actions.onSell()) {
          this.close()
        } else {
          cancelSellConfirm(state)
          draw()
        }
      } else if (region === 'keep') {
        cancelSellConfirm(state)
        draw()
      }
      return true
    },
    pointerMove(point: DesignPoint): boolean {
      if (!target) return false
      const inside = containsCard(point)
      const region = inside ? (regionAt(point) ?? 'card') : null
      if (region !== hovered) {
        hovered = region
        draw()
      }
      return inside
    },
    pointerUp(point: DesignPoint): boolean {
      if (!target) return false
      return containsCard(point)
    },
    cursor(point: DesignPoint): UiCursorKind | undefined {
      if (!target || !containsCard(point)) return undefined
      return regionAt(point) ? 'point' : 'hand'
    },
    keyDown(event: KeyboardEvent): boolean {
      if (!target || event.ctrlKey || event.metaKey || event.altKey) return false
      if (event.key === 'Escape') {
        event.preventDefault()
        this.close()
        return true
      }
      return false
    },
    hitTest(point: DesignPoint): boolean {
      return target !== null && containsCard(point)
    },
    update(): void {},
    resize(width: number, height: number): void {
      viewport.resize(width, height)
      layout()
    },
    describe() {
      return {
        open: target !== null,
        anchor,
        id: target?.id ?? null,
        name: target?.name ?? null,
        sections: target?.sections ?? null,
        salePrice: target?.salePrice ?? null,
        mode: state.mode,
        buttons: buttons().map((button) => ({ id: button.id, label: button.label, rect: { ...button.rect } })),
        card: { x: object.position.x - WIDTH / 2, y: object.position.y - HEIGHT / 2, width: WIDTH, height: HEIGHT },
      }
    },
    dispose(): void {
      card.geometry.dispose()
      texture.dispose()
      material.dispose()
    },
  }
}
