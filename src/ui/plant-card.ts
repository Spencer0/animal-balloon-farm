import * as THREE from 'three'
import { armSellConfirm, cancelSellConfirm, createAnimalCardState, placeInfoCard, resetAnimalCardState } from '../game/animal-card'
import { plantCareLine, plantGrowthLevel, plantGrowthStatus, plantStageChip, type PlantCareNeed } from '../game/plant-card'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createSurface, fillRoundRect, grain, strokeRoundRect, UI_THEME, verticalGradient, withShadow } from './ui-theme'

/**
 * The plant info card: the animal info card's twin for a clicked plant.
 *
 * Same canvas-texture note in the shared Three.js UI layer, same paper, gilt and
 * shadow primitives, same pinned (non-modal) behaviour and the same two-press
 * Sell confirm; only the contents differ -- a growth meter where the animal has
 * Helium, and a care line where the animal has its sell hint. The rules live in
 * the pure `src/game/plant-card.ts`.
 */

export interface PlantCardTarget {
  readonly instanceId: number
  readonly speciesId: string
  /** e.g. "Clover 2". */
  readonly name: string
  /** The catalog subtitle, e.g. "Meadow groundcover". */
  readonly speciesLabel: string
  /** 0..1. */
  readonly growth: number
  readonly care: PlantCareNeed
  readonly price: number
}

export interface PlantSaleResult {
  readonly balance: number
  readonly price: number
}

export interface PlantCardActions {
  /** Second Sell press. Return null to refuse (the card stands the confirm down). */
  readonly onSell: (target: PlantCardTarget) => PlantSaleResult | null
  /** Journal button: main closes the card and opens the plant's page. */
  readonly onJournal: (speciesId: string) => void
  readonly onToggle?: (isOpen: boolean) => void
}

export interface PlantCardPanel extends UIPanel {
  readonly isOpen: boolean
  readonly instanceId: number | null
  open(target: PlantCardTarget, anchor?: DesignPoint): void
  /** Re-read growth, care and price from the live plant; redraws only on change. */
  sync(next: Pick<PlantCardTarget, 'growth' | 'care' | 'price'>): void
  close(): void
}

const WIDTH = 380
const HEIGHT = 330
const PAD = 20
const TITLE_BASELINE = 54
const CHIP_Y = 66
const CHIP_HEIGHT = 30
const METER_LABEL_BASELINE = 140
const BAR_Y = 150
const BAR_HEIGHT = 24
const HINT_BASELINE = 214
const BUTTON_HEIGHT = 56
const SERIF = 'Georgia, "Times New Roman", serif'

const CLOSE: DesignRect = { x: 134, y: 113, width: 40, height: 40 }
const SELL: DesignRect = { x: -170, y: -149, width: 162, height: BUTTON_HEIGHT }
const JOURNAL: DesignRect = { x: 8, y: -149, width: 162, height: BUTTON_HEIGHT }
const CONFIRM: DesignRect = { x: -170, y: -149, width: 212, height: BUTTON_HEIGHT }
const KEEP: DesignRect = { x: 54, y: -149, width: 116, height: BUTTON_HEIGHT }

function drawLeaf(context: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  context.save()
  context.fillStyle = '#5f9a4c'
  context.beginPath()
  context.moveTo(cx - size, cy + size * 0.8)
  context.bezierCurveTo(cx - size * 1.1, cy - size * 0.6, cx + size * 0.2, cy - size * 1.2, cx + size, cy - size * 0.9)
  context.bezierCurveTo(cx + size * 1.1, cy + size * 0.1, cx + size * 0.2, cy + size * 1.0, cx - size, cy + size * 0.8)
  context.fill()
  context.strokeStyle = '#3f7339'
  context.lineWidth = 1.4
  context.beginPath()
  context.moveTo(cx - size, cy + size * 0.8)
  context.lineTo(cx + size * 0.6, cy - size * 0.5)
  context.stroke()
  context.restore()
}

export function createPlantCard(actions: PlantCardActions, cssWidth: number, cssHeight: number): PlantCardPanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)

  const object = new THREE.Group()
  object.name = 'Plant info card'
  const surface = createSurface(WIDTH, HEIGHT)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), material)
  card.name = 'Plant info card · paper'
  card.position.z = 2
  card.visible = false
  object.add(card)

  const state = createAnimalCardState()
  let target: PlantCardTarget | null = null
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

  function drawButton(id: string, rect: DesignRect, fill: string | CanvasGradient, stroke: string, label: string, labelColor: string, font: string): void {
    const context = surface.context
    const canvas = canvasOf(rect)
    fillRoundRect(context, canvas.x, canvas.y, rect.width, rect.height, 15, fill)
    strokeRoundRect(context, canvas.x, canvas.y, rect.width, rect.height, 15, stroke, 2.5)
    if (hovered === id) {
      context.save()
      context.globalAlpha = 0.14
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.roundRect(canvas.x, canvas.y, rect.width, rect.height, 15)
      context.fill()
      context.restore()
    }
    context.fillStyle = labelColor
    context.font = font
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(label, canvas.x + rect.width / 2, canvas.y + rect.height / 2 + 1)
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
    context.font = `bold 26px ${SERIF}`
    const maxTitleWidth = WIDTH / 2 + CLOSE.x - PAD - 12
    let title = current.name
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

    context.font = `bold 13px ${SERIF}`
    const chipPad = 14
    const speciesWidth = context.measureText(current.speciesLabel).width + chipPad * 2
    fillRoundRect(context, PAD, CHIP_Y, speciesWidth, CHIP_HEIGHT, 17, '#f4e7c9')
    strokeRoundRect(context, PAD, CHIP_Y, speciesWidth, CHIP_HEIGHT, 17, 'rgba(128, 75, 52, .55)', 1.5)
    context.fillStyle = UI_THEME.ink
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(current.speciesLabel, PAD + speciesWidth / 2, CHIP_Y + CHIP_HEIGHT / 2 + 1)
    const chip = plantStageChip(current.growth)
    const stageWidth = context.measureText(chip).width + chipPad * 2
    const stageX = PAD + speciesWidth + 10
    fillRoundRect(context, stageX, CHIP_Y, stageWidth, CHIP_HEIGHT, 17, '#5aa3a0')
    context.fillStyle = '#fff6e8'
    context.fillText(chip, stageX + stageWidth / 2, CHIP_Y + CHIP_HEIGHT / 2 + 1)

    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    drawLeaf(context, PAD + 9, METER_LABEL_BASELINE - 6, 8)
    context.fillStyle = UI_THEME.ink
    context.font = `bold 14px ${SERIF}`
    context.fillText('Growth', PAD + 24, METER_LABEL_BASELINE)
    context.fillStyle = UI_THEME.inkSoft
    context.font = `italic 14px ${SERIF}`
    context.textAlign = 'right'
    context.fillText(plantGrowthStatus(current.growth), WIDTH - PAD, METER_LABEL_BASELINE)
    context.textAlign = 'left'
    const barWidth = WIDTH - PAD * 2
    fillRoundRect(context, PAD, BAR_Y, barWidth, BAR_HEIGHT, 13, '#e0cda1')
    strokeRoundRect(context, PAD, BAR_Y, barWidth, BAR_HEIGHT, 13, 'rgba(128, 75, 52, .5)', 1.5)
    const fillWidth = Math.max(BAR_HEIGHT, barWidth * plantGrowthLevel(current.growth))
    fillRoundRect(context, PAD + 2, BAR_Y + 2, fillWidth - 4, BAR_HEIGHT - 4, 11, verticalGradient(context, 0, BAR_Y, BAR_HEIGHT, [[0, '#7cab66'], [1, '#4c7a45']]))

    context.fillStyle = UI_THEME.inkSoft
    context.font = `italic 14px ${SERIF}`
    context.textAlign = 'center'
    context.fillText(plantCareLine(current.growth, current.care), WIDTH / 2, HINT_BASELINE)
    context.textAlign = 'left'

    const gold = (rect: DesignRect): CanvasGradient => verticalGradient(context, 0, canvasOf(rect).y, rect.height, [[0, '#f2cd72'], [1, '#d9a441']])
    const red = (rect: DesignRect): CanvasGradient => verticalGradient(context, 0, canvasOf(rect).y, rect.height, [[0, '#cf5245'], [1, '#9c3730']])
    if (state.mode === 'confirm') {
      drawButton('confirm', CONFIRM, red(CONFIRM), '#7c2a24', `Sure? Sell for ${current.price}`, '#fff4d5', `bold 17px ${SERIF}`)
      drawButton('keep', KEEP, '#fbf0d6', UI_THEME.gilt, 'Keep', UI_THEME.ink, `bold 18px ${SERIF}`)
    } else {
      drawButton('sell', SELL, red(SELL), '#7c2a24', `Sell · ${current.price}`, '#fff4d5', `bold 18px ${SERIF}`)
      drawButton('journal', JOURNAL, gold(JOURNAL), '#8a6420', 'Journal', UI_THEME.ink, `bold 18px ${SERIF}`)
    }
    texture.needsUpdate = true
  }

  function regionAt(point: DesignPoint): string | null {
    if (!target) return null
    const local = toLocal(point)
    if (rectContains(CLOSE, local)) return 'close'
    if (state.mode === 'confirm') {
      if (rectContains(CONFIRM, local)) return 'confirm'
      if (rectContains(KEEP, local)) return 'keep'
      return null
    }
    if (rectContains(SELL, local)) return 'sell'
    if (rectContains(JOURNAL, local)) return 'journal'
    return null
  }

  layout()
  draw()

  return {
    name: 'plant-card',
    object,
    order: 13,
    get isOpen(): boolean { return target !== null },
    get instanceId(): number | null { return target?.instanceId ?? null },
    open(next, nextAnchor): void {
      anchor = nextAnchor ?? { x: 0, y: 30 }
      target = next
      layout()
      resetAnimalCardState(state)
      hovered = null
      card.visible = true
      draw()
      actions.onToggle?.(true)
    },
    sync(next): void {
      if (!target) return
      if (Math.abs(next.growth - target.growth) < 0.005 && next.care === target.care && next.price === target.price) return
      target = { ...target, ...next }
      draw()
    },
    close(): void {
      if (!target) return
      target = null
      resetAnimalCardState(state)
      hovered = null
      card.visible = false
      draw()
      actions.onToggle?.(false)
    },
    pointerDown(point, event): boolean {
      if (!target) return false
      // Pinned, like the animal card: clicks outside fall through to the farm.
      if (!containsCard(point)) return false
      event.preventDefault()
      const region = regionAt(point)
      const current = target
      if (region === 'close') this.close()
      else if (region === 'sell') {
        armSellConfirm(state)
        draw()
      } else if (region === 'confirm') {
        if (!actions.onSell(current)) {
          cancelSellConfirm(state)
          draw()
        }
      } else if (region === 'keep') {
        cancelSellConfirm(state)
        draw()
      } else if (region === 'journal') actions.onJournal(current.speciesId)
      return true
    },
    pointerMove(point): boolean {
      if (!target) return false
      const region = containsCard(point) ? (regionAt(point) ?? 'card') : null
      if (region !== hovered) {
        hovered = region
        draw()
      }
      return containsCard(point)
    },
    pointerUp(point): boolean {
      return target !== null && containsCard(point)
    },
    cursor(point): UiCursorKind | undefined {
      if (!target || !containsCard(point)) return undefined
      return regionAt(point) ? 'point' : 'idle'
    },
    keyDown(event): boolean {
      if (!target || event.ctrlKey || event.metaKey || event.altKey) return false
      if (event.key === 'Escape') {
        event.preventDefault()
        this.close()
        return true
      }
      return false
    },
    hitTest(point): boolean {
      return target !== null && containsCard(point)
    },
    update(): void {},
    resize(width, height): void {
      viewport.resize(width, height)
      layout()
    },
    describe() {
      return {
        open: target !== null,
        anchor,
        instanceId: target?.instanceId ?? null,
        speciesId: target?.speciesId ?? null,
        name: target?.name ?? null,
        growth: target?.growth ?? null,
        stageChip: target ? plantStageChip(target.growth) : null,
        care: target?.care ?? null,
        price: target?.price ?? null,
        mode: state.mode,
        card: { x: object.position.x - WIDTH / 2, y: object.position.y - HEIGHT / 2, width: WIDTH, height: HEIGHT },
        sellButton: { ...SELL },
        journalButton: { ...JOURNAL },
      }
    },
    dispose(): void {
      card.geometry.dispose()
      texture.dispose()
      material.dispose()
    },
  }
}
