import * as THREE from 'three'
import { heliumLevel, heliumStatus, isValidAnimalName, MAX_NAME_LENGTH, RESIDENT_STAGE, sanitizeAnimalName, stageChipLabel, armSellConfirm, cancelSellConfirm, createAnimalCardState, placeInfoCard, resetAnimalCardState } from '../game/animal-card'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createSurface, fillRoundRect, grain, strokeRoundRect, UI_THEME, verticalGradient, withShadow } from './ui-theme'

/**
 * The animal info card: a small pinned note beside the clicked balloon.
 *
 * A canvas-texture card in the shared Three.js UI layer -- no DOM -- drawn
 * with the same paper, gilt and shadow primitives as the journal, so the two
 * cannot drift apart. The rules (resident sell gate, always-full Helium, the
 * two-press confirm, rename limits, card placement) live in the pure
 * `src/game/animal-card.ts` model; this panel only draws them. The card is
 * pinned, not modal: clicks outside fall through to the farm untouched, and
 * opening it hides nothing.
 */

export interface AnimalCardTarget {
  readonly instanceId: string
  readonly speciesId: string
  readonly name: string
  /** e.g. "Balloon Cow". */
  readonly speciesLabel: string
  /** 1..4 on the condition ladder. */
  readonly stage: number
  readonly price: number
  /** Live `canSell` answer from the animal model. */
  readonly sellable: boolean
}

export interface AnimalSaleResult {
  readonly balance: number
  readonly price: number
}

export interface AnimalCardActions {
  /** Second Sell press. Return null to refuse (card stands the confirm down). */
  readonly onSell: (target: AnimalCardTarget) => AnimalSaleResult | null
  /** Journal button: main closes the card and deep-links the journal. */
  readonly onJournal: (speciesId: string) => void
  readonly onRename: (instanceId: string, name: string) => void
  readonly onToggle?: (isOpen: boolean) => void
}

export interface AnimalCardPanel extends UIPanel {
  readonly isOpen: boolean
  open(target: AnimalCardTarget, anchor?: DesignPoint): void
  close(): void
  setName(name: string): void
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

const CLOSE: DesignRect = { x: 134, y: 113, width: 40, height: 40 }
const PENCIL: DesignRect = { x: 86, y: 113, width: 40, height: 40 }
const SELL: DesignRect = { x: -170, y: -149, width: 162, height: BUTTON_HEIGHT }
const JOURNAL: DesignRect = { x: 8, y: -149, width: 162, height: BUTTON_HEIGHT }
const JOURNAL_WIDE: DesignRect = { x: -170, y: -149, width: 340, height: BUTTON_HEIGHT }
const CONFIRM: DesignRect = { x: -170, y: -149, width: 212, height: BUTTON_HEIGHT }
const KEEP: DesignRect = { x: 54, y: -149, width: 116, height: BUTTON_HEIGHT }

function drawHeart(context: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  context.save()
  context.fillStyle = color
  context.beginPath()
  context.moveTo(cx, cy + size * 0.9)
  context.bezierCurveTo(cx - size * 1.4, cy, cx - size * 0.6, cy - size, cx, cy - size * 0.3)
  context.bezierCurveTo(cx + size * 0.6, cy - size, cx + size * 1.4, cy, cx, cy + size * 0.9)
  context.fill()
  context.restore()
}

function drawPencil(context: CanvasRenderingContext2D, rect: DesignRect, hovered: boolean): void {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  context.save()
  context.translate(cx, cy)
  context.rotate(-0.7)
  context.fillStyle = hovered ? '#f2cd72' : UI_THEME.gold
  context.strokeStyle = UI_THEME.inkSoft
  context.lineWidth = 1.6
  context.beginPath()
  context.roundRect(-13, -4.5, 20, 9, 2)
  context.fill()
  context.stroke()
  context.fillStyle = '#fbf0d6'
  context.beginPath()
  context.moveTo(7, -4.5)
  context.lineTo(15, 0)
  context.lineTo(7, 4.5)
  context.closePath()
  context.fill()
  context.stroke()
  context.fillStyle = UI_THEME.ink
  context.beginPath()
  context.arc(13, 0, 1.8, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

export function createAnimalCard(actions: AnimalCardActions, cssWidth: number, cssHeight: number): AnimalCardPanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)

  const object = new THREE.Group()
  object.name = 'Animal info card'
  const surface = createSurface(WIDTH, HEIGHT)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), material)
  card.name = 'Animal info card · paper'
  card.position.z = 2
  card.visible = false
  object.add(card)

  const state = createAnimalCardState()
  let target: AnimalCardTarget | null = null
  let hovered: string | null = null
  let editing = false
  let draft = ''
  let caretVisible = true
  let caretTimer = 0

  // Pinned beside the balloon that was clicked: right side preferred,
  // flipping left at the screen edge, always fully on screen. Re-solved on
  // every open and resize so a window drag cannot strand the card.
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

  function drawButton(id: string, canvas: { x: number; y: number }, rect: DesignRect, fill: string | CanvasGradient, stroke: string, label: string, labelColor: string, font: string): void {
    const context = surface.context
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
    context.font = 'bold 26px Georgia, "Times New Roman", serif'
    const shown = editing ? draft : current.name
    const pencilCanvasX = WIDTH / 2 + PENCIL.x
    const maxTitleWidth = pencilCanvasX - PAD - 12
    let title = shown
    while (title.length > 1 && context.measureText(title).width > maxTitleWidth) {
      title = title.slice(0, -1)
    }
    context.fillText(title || (editing ? '' : current.name), PAD, TITLE_BASELINE)
    if (editing && caretVisible) {
      const caretX = PAD + context.measureText(title).width + 3
      context.save()
      context.strokeStyle = UI_THEME.ink
      context.lineWidth = 2
      context.beginPath()
      context.moveTo(caretX, TITLE_BASELINE - 26)
      context.lineTo(caretX, TITLE_BASELINE + 6)
      context.stroke()
      context.restore()
    }

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
    drawPencil(context, { x: WIDTH / 2 + PENCIL.x, y: HEIGHT / 2 - PENCIL.y - PENCIL.height, width: PENCIL.width, height: PENCIL.height }, hovered === 'pencil')

    context.font = 'bold 13px Georgia, "Times New Roman", serif'
    const speciesPad = 14
    const speciesWidth = context.measureText(current.speciesLabel).width + speciesPad * 2
    fillRoundRect(context, PAD, CHIP_Y, speciesWidth, CHIP_HEIGHT, 17, '#f4e7c9')
    strokeRoundRect(context, PAD, CHIP_Y, speciesWidth, CHIP_HEIGHT, 17, 'rgba(128, 75, 52, .55)', 1.5)
    context.fillStyle = UI_THEME.ink
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(current.speciesLabel, PAD + speciesWidth / 2, CHIP_Y + CHIP_HEIGHT / 2 + 1)
    const chip = stageChipLabel(current.stage)
    const stageWidth = context.measureText(chip).width + speciesPad * 2
    const stageX = PAD + speciesWidth + 10
    fillRoundRect(context, stageX, CHIP_Y, stageWidth, CHIP_HEIGHT, 17, '#5aa3a0')
    context.fillStyle = '#fff6e8'
    context.fillText(chip, stageX + stageWidth / 2, CHIP_Y + CHIP_HEIGHT / 2 + 1)

    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    drawHeart(context, PAD + 9, METER_LABEL_BASELINE - 6, 9, UI_THEME.barnRed)
    context.fillStyle = UI_THEME.ink
    context.font = 'bold 14px Georgia, "Times New Roman", serif'
    context.fillText('Helium', PAD + 24, METER_LABEL_BASELINE)
    context.fillStyle = UI_THEME.inkSoft
    context.font = 'italic 14px Georgia, "Times New Roman", serif'
    context.textAlign = 'right'
    context.fillText(heliumStatus(), WIDTH - PAD, METER_LABEL_BASELINE)
    context.textAlign = 'left'
    const barWidth = WIDTH - PAD * 2
    fillRoundRect(context, PAD, BAR_Y, barWidth, BAR_HEIGHT, 13, '#e0cda1')
    strokeRoundRect(context, PAD, BAR_Y, barWidth, BAR_HEIGHT, 13, 'rgba(128, 75, 52, .5)', 1.5)
    const fillWidth = Math.max(BAR_HEIGHT, barWidth * heliumLevel())
    if (fillWidth > 0) {
      fillRoundRect(context, PAD + 2, BAR_Y + 2, fillWidth - 4, BAR_HEIGHT - 4, 11, verticalGradient(context, 0, BAR_Y, BAR_HEIGHT, [[0, '#7cab66'], [1, '#4c7a45']]))
    }

    const confirming = state.mode === 'confirm'
    if (!current.sellable) {
      context.fillStyle = UI_THEME.inkSoft
      context.font = 'italic 14px Georgia, "Times New Roman", serif'
      context.textAlign = 'center'
      context.fillText(`Becomes sellable as a resident (Stage ${RESIDENT_STAGE}).`, WIDTH / 2, HINT_BASELINE)
      context.textAlign = 'left'
      const journalRect = canvasOf(JOURNAL_WIDE)
      drawButton('journal', journalRect, JOURNAL_WIDE, verticalGradient(context, 0, journalRect.y, JOURNAL_WIDE.height, [[0, '#f2cd72'], [1, '#d9a441']]), '#8a6420', 'Journal', UI_THEME.ink, 'bold 18px Georgia, "Times New Roman", serif')
    } else if (!confirming) {
      const sellRect = canvasOf(SELL)
      drawButton('sell', sellRect, SELL, verticalGradient(context, 0, sellRect.y, SELL.height, [[0, '#cf5245'], [1, '#9c3730']]), '#7c2a24', `Sell · ${current.price}`, '#fff4d5', 'bold 18px Georgia, "Times New Roman", serif')
      const journalRect = canvasOf(JOURNAL)
      drawButton('journal', journalRect, JOURNAL, verticalGradient(context, 0, journalRect.y, JOURNAL.height, [[0, '#f2cd72'], [1, '#d9a441']]), '#8a6420', 'Journal', UI_THEME.ink, 'bold 18px Georgia, "Times New Roman", serif')
    } else {
      const confirmRect = canvasOf(CONFIRM)
      drawButton('confirm', confirmRect, CONFIRM, verticalGradient(context, 0, confirmRect.y, CONFIRM.height, [[0, '#cf5245'], [1, '#9c3730']]), '#7c2a24', `Sure? Sell for ${current.price}`, '#fff4d5', 'bold 17px Georgia, "Times New Roman", serif')
      const keepRect = canvasOf(KEEP)
      drawButton('keep', keepRect, KEEP, '#fbf0d6', UI_THEME.gilt, 'Keep', UI_THEME.ink, 'bold 18px Georgia, "Times New Roman", serif')
    }
    texture.needsUpdate = true
  }

  function regionAt(point: DesignPoint): string | null {
    if (!target) return null
    const local = toLocal(point)
    if (rectContains(CLOSE, local)) return 'close'
    if (rectContains(PENCIL, local)) return 'pencil'
    if (!target.sellable) {
      if (rectContains(JOURNAL_WIDE, local)) return 'journal'
      return null
    }
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
    name: 'animal-card',
    object,
    order: 13,
    get isOpen(): boolean {
      return target !== null
    },
    open(next: AnimalCardTarget, nextAnchor?: DesignPoint): void {
      anchor = nextAnchor ?? { x: 0, y: 30 }
      target = next
      layout()
      resetAnimalCardState(state)
      editing = false
      draft = ''
      hovered = null
      card.visible = true
      draw()
      actions.onToggle?.(true)
    },
    close(): void {
      if (!target) return
      target = null
      resetAnimalCardState(state)
      editing = false
      draft = ''
      hovered = null
      card.visible = false
      draw()
      actions.onToggle?.(false)
    },
    setName(name: string): void {
      if (!target) return
      target = { ...target, name }
      draw()
    },
    pointerDown(point: DesignPoint, event: PointerEvent): boolean {
      if (!target) return false
      // A pinned card never blocks the farm: clicks outside fall through
      // untouched -- no close, no preventDefault -- so tools, planting and
      // the camera keep working underneath it.
      if (!containsCard(point)) {
        return false
      }
      event.preventDefault()
      const region = regionAt(point)
      const current = target
      if (region === 'close') {
        this.close()
      } else if (region === 'pencil') {
        editing = true
        draft = current.name
        caretVisible = true
        caretTimer = 0
        draw()
      } else if (region === 'sell') {
        editing = false
        armSellConfirm(state)
        draw()
      } else if (region === 'confirm') {
        const result = actions.onSell(current)
        if (!result) {
          cancelSellConfirm(state)
          draw()
        }
      } else if (region === 'keep') {
        cancelSellConfirm(state)
        draw()
      } else if (region === 'journal') {
        editing = false
        actions.onJournal(current.speciesId)
      }
      return true
    },
    pointerMove(point: DesignPoint): boolean {
      if (!target) return false
      const region = containsCard(point) ? (regionAt(point) ?? 'card') : null
      if (region !== hovered) {
        hovered = region
        draw()
      }
      return containsCard(point)
    },
    pointerUp(point: DesignPoint): boolean {
      if (!target) return false
      return containsCard(point)
    },
    cursor(point: DesignPoint): UiCursorKind | undefined {
      if (!target || !containsCard(point)) return undefined
      const region = regionAt(point)
      return region === 'close' || region === 'pencil' || region === 'sell' || region === 'journal' || region === 'confirm' || region === 'keep' ? 'point' : 'idle'
    },
    keyDown(event: KeyboardEvent): boolean {
      if (!target) return false
      if (event.ctrlKey || event.metaKey || event.altKey) return false
      if (event.key === 'Escape') {
        event.preventDefault()
        if (editing) {
          editing = false
          draft = ''
          draw()
        } else {
          this.close()
        }
        return true
      }
      if (!editing) return false
      if (event.key === 'Enter') {
        event.preventDefault()
        if (isValidAnimalName(draft)) {
          const clean = sanitizeAnimalName(draft)
          actions.onRename(target.instanceId, clean)
          target = { ...target, name: clean }
        }
        editing = false
        draft = ''
        draw()
        return true
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        draft = draft.slice(0, -1)
        draw()
        return true
      }
      if (event.key.length === 1 && draft.length < MAX_NAME_LENGTH && /^[A-Za-z'" \-]$/.test(event.key)) {
        event.preventDefault()
        draft += event.key
        draw()
        return true
      }
      event.preventDefault()
      return true
    },
    hitTest(point: DesignPoint): boolean {
      return target !== null && containsCard(point)
    },
    update(delta: number): void {
      if (!target || !editing) return
      caretTimer += delta
      if (caretTimer >= 0.5) {
        caretTimer = 0
        caretVisible = !caretVisible
        draw()
      }
    },
    resize(width: number, height: number): void {
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
        stage: target?.stage ?? null,
        stageChip: target ? stageChipLabel(target.stage) : null,
        sellable: target?.sellable ?? null,
        sellVisible: target ? target.sellable && target.stage >= RESIDENT_STAGE : null,
        mode: state.mode,
        editing,
        helium: { level: heliumLevel(), status: heliumStatus() },
        card: { x: object.position.x - WIDTH / 2, y: object.position.y - HEIGHT / 2, width: WIDTH, height: HEIGHT },
        sellButton: { ...SELL },
        journalButton: { ...(target?.sellable ? JOURNAL : JOURNAL_WIDE) },
      }
    },
    dispose(): void {
      card.geometry.dispose()
      texture.dispose()
      material.dispose()
    },
  }
}
