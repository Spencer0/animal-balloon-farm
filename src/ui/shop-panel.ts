import * as THREE from 'three'
import { PROP_CATALOG, PROP_ORDER, type PropId } from '../game/farm-props'
import { requestUIProp, type UIPropId, type LoadedUIProp } from './ui-props'
import { createScrim, fitScrim, type UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createUIViewport, fitAspectRect, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import { createSurface, fillRoundRect, strokeRoundRect, UI_THEME, verticalGradient } from './ui-theme'

export interface ShopBuyFeedback {
  readonly ok: boolean
  readonly reason: string | null
  readonly balance: number
}

export interface ShopPanel extends UIPanel {
  readonly isOpen: boolean
  open(): void
  close(): void
  setWallet(balance: number): void
  /** Where the owned counts shown beside each item come from. */
  setCountsSource(source: (id: PropId) => number): void
  /** Repaint the owned counts shown beside each item. */
  refresh(): void
}

const CARD_WIDTH = 1120
const CARD_HEIGHT = 620
const ROW_HEIGHT = 92
const ROW_GAP = 12
const ROW_TOP = 132
const ROW_LEFT = 40
const ROW_WIDTH = CARD_WIDTH - ROW_LEFT * 2
const BUTTON_WIDTH = 180
const BUTTON_HEIGHT = 58

/**
 * Item rows, in card-relative design units (origin at the card's centre, and the
 * rect's `y` is its bottom edge). Subtracting the full row height is what puts
 * the first row's top edge exactly `ROW_TOP` below the card's top: taking only
 * half of it slides the whole stack up through the header.
 */
const ROWS: readonly DesignRect[] = PROP_ORDER.map((_, index) => ({
  x: -ROW_WIDTH / 2,
  y: CARD_HEIGHT / 2 - ROW_TOP - ROW_HEIGHT - index * (ROW_HEIGHT + ROW_GAP),
  width: ROW_WIDTH,
  height: ROW_HEIGHT,
}))
const BUTTONS: readonly DesignRect[] = ROWS.map((row) => ({
  x: row.x + row.width - 20 - BUTTON_WIDTH,
  y: row.y,
  width: BUTTON_WIDTH,
  height: BUTTON_HEIGHT,
}))
const CLOSE_BOX: DesignRect = { x: CARD_WIDTH / 2 - 92, y: CARD_HEIGHT / 2 - 74, width: 64, height: 48 }

interface FurnitureSpec {
  readonly id: UIPropId
  readonly width: number
  readonly height: number
  readonly x: number
  readonly y: number
}

const FURNITURE: readonly FurnitureSpec[] = [
  { id: 'ui-counter', width: 380, height: 200, x: 0, y: -230 },
  { id: 'ui-shelf', width: 262, height: 311, x: 660, y: -130 },
  { id: 'ui-crate', width: 150, height: 118, x: -660, y: -320 },
  { id: 'ui-crate', width: 108, height: 85, x: -560, y: -290 },
]

export function createShopPanel(
  onBuy: (id: PropId) => ShopBuyFeedback,
  cssWidth: number,
  cssHeight: number,
  onToggle?: (isOpen: boolean) => void,
): ShopPanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)
  const object = new THREE.Group()
  object.name = 'Shop storefront'
  object.visible = false

  const scrim = createScrim(0.42, '#12211f')
  scrim.position.z = 0
  object.add(scrim)

  const cardSurface = createSurface(CARD_WIDTH, CARD_HEIGHT)
  const cardTexture = new THREE.CanvasTexture(cardSurface.canvas)
  cardTexture.colorSpace = THREE.SRGBColorSpace
  const cardMaterial = new THREE.MeshBasicMaterial({ map: cardTexture, transparent: true, depthWrite: false, depthTest: false })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), cardMaterial)
  card.position.z = 4
  object.add(card)

  const furnitureGroup = new THREE.Group()
  object.add(furnitureGroup)
  const loaded: LoadedUIProp[] = []
  const resolved: boolean[] = FURNITURE.map(() => false)

  let open = false
  let wallet = 0
  let receipt: { ok: boolean; text: string } | null = null
  let hovered = -1
  let hoveredButton = -1
  let countsFor: (id: PropId) => number = () => 0
  let lastSignature = ''

  function layout(): void {
    const frame = fitAspectRect(viewport, CARD_WIDTH / CARD_HEIGHT, 44)
    fitScrim(scrim, viewport)
    card.scale.setScalar(Math.min(1, frame.width / CARD_WIDTH))
  }

  function toLocal(point: DesignPoint): DesignPoint {
    return { x: point.x - object.position.x, y: point.y - object.position.y }
  }

  function draw(): void {
    const context = cardSurface.context
    context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
    fillRoundRect(context, 0, 0, CARD_WIDTH, CARD_HEIGHT, 26, verticalGradient(context, 0, 0, CARD_HEIGHT, [[0, '#fbf2df'], [1, '#e4cfa8']]))
    strokeRoundRect(context, 4, 4, CARD_WIDTH - 8, CARD_HEIGHT - 8, 23, UI_THEME.gilt, 4)

    // Header: the shopkeeper's board, the wallet and the close cross.
    fillRoundRect(context, 24, 22, CARD_WIDTH - 48, 86, 16, verticalGradient(context, 0, 22, 86, [[0, '#8a5e3a'], [1, '#563a28']]))
    strokeRoundRect(context, 26, 24, CARD_WIDTH - 52, 82, 15, UI_THEME.gilt, 2)
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillStyle = '#fff1d2'
    context.font = 'bold 36px Georgia, "Times New Roman", serif'
    context.fillText('The Farm Shop', 52, 56)
    context.fillStyle = '#f0d8ad'
    context.font = 'italic 15px Georgia, "Times New Roman", serif'
    context.fillText('“Furniture for the garden — spend what your clover earned.”', 52, 88)
    context.textAlign = 'right'
    context.fillStyle = '#ffe9b6'
    context.font = 'bold 30px Georgia, "Times New Roman", serif'
    context.fillText(`${wallet} coins`, CARD_WIDTH - 92, 62)
    context.fillStyle = '#79573a'
    context.font = '26px Georgia, "Times New Roman", serif'
    context.fillText('×', CARD_WIDTH - 34, 56)

    for (const [index, id] of PROP_ORDER.entries()) {
      const def = PROP_CATALOG[id]
      const row = ROWS[index]
      const button = BUTTONS[index]
      const left = row.x + CARD_WIDTH / 2
      const top = CARD_HEIGHT / 2 - row.y - row.height
      const centerY = top + row.height / 2
      const affordable = wallet >= def.price
      const hoverRow = hovered === index
      fillRoundRect(context, left, top, row.width, row.height, 14, hoverRow ? '#fff9e9' : 'rgba(255, 250, 235, .58)')
      strokeRoundRect(context, left, top, row.width, row.height, 14, hoverRow ? def.color : 'rgba(125, 88, 53, .26)', hoverRow ? 2.5 : 1)
      context.fillStyle = def.color
      context.beginPath()
      context.roundRect(left + 18, centerY - 22, 44, 44, 10)
      context.fill()
      context.strokeStyle = 'rgba(84, 59, 43, .5)'
      context.lineWidth = 2
      context.stroke()
      context.textAlign = 'left'
      context.fillStyle = '#543b2b'
      context.font = 'bold 24px Georgia, "Times New Roman", serif'
      context.fillText(def.name, left + 78, centerY - 10)
      context.fillStyle = '#94744f'
      context.font = 'italic 14px Georgia, "Times New Roman", serif'
      context.fillText(def.blurb, left + 78, centerY + 18)
      context.textAlign = 'right'
      context.fillStyle = '#765739'
      context.font = 'bold 18px Georgia, "Times New Roman", serif'
      context.fillText(`${def.price} coins`, button.x + CARD_WIDTH / 2 - 22, centerY)
      if (countsFor(id) > 0) {
        context.textAlign = 'left'
        context.fillStyle = '#55834e'
        context.font = 'bold 15px Georgia, "Times New Roman", serif'
        context.fillText(`owned ×${countsFor(id)}`, left + 78, centerY + 38)
      }
      const buttonLeft = button.x + CARD_WIDTH / 2
      const buttonTop = CARD_HEIGHT / 2 - button.y - button.height
      const buttonHover = hoveredButton === index
      fillRoundRect(context, buttonLeft, buttonTop, button.width, button.height, 14,
        affordable ? (buttonHover ? '#7aa863' : '#668b55') : '#a9a08f')
      strokeRoundRect(context, buttonLeft, buttonTop, button.width, button.height, 14, '#d9c27c', 2)
      context.textAlign = 'center'
      context.fillStyle = affordable ? '#fff4d5' : '#efe6d2'
      context.font = 'bold 20px Georgia, "Times New Roman", serif'
      context.fillText(affordable ? 'Buy' : 'Too dear', buttonLeft + button.width / 2, buttonTop + button.height / 2)
    }

    context.textAlign = 'center'
    if (receipt) {
      context.fillStyle = receipt.ok ? '#55834e' : '#a3503f'
      context.font = 'bold 17px Georgia, "Times New Roman", serif'
      context.fillText(receipt.text, CARD_WIDTH / 2, CARD_HEIGHT - 62)
    }
    context.fillStyle = '#896b48'
    context.font = 'italic 13px Georgia, "Times New Roman", serif'
    context.fillText('Esc closes · bought pieces land in the Propbox', CARD_WIDTH / 2, CARD_HEIGHT - 32)
    cardTexture.needsUpdate = true
  }

  function ensureFurniture(): void {
    for (const [index, spec] of FURNITURE.entries()) {
      if (resolved[index]) continue
      const prop = requestUIProp(spec.id, { width: spec.width, height: spec.height })
      if (!prop) continue
      resolved[index] = true
      prop.object.position.set(spec.x, spec.y, 3)
      furnitureGroup.add(prop.object)
      loaded.push(prop)
    }
  }

  function setOpen(next: boolean): void {
    open = next
    object.visible = next
    receipt = null
    hovered = -1
    hoveredButton = -1
    lastSignature = ''
    if (next) ensureFurniture()
    draw()
    onToggle?.(next)
  }

  function buttonAt(point: DesignPoint): number {
    if (!open) return -1
    const local = toLocal(point)
    return BUTTONS.findIndex((button) => rectContains(button, local))
  }

  function rowAt(point: DesignPoint): number {
    if (!open) return -1
    const local = toLocal(point)
    return ROWS.findIndex((row) => rectContains(row, local))
  }

  function containsCard(point: DesignPoint): boolean {
    const local = toLocal(point)
    const scale = card.scale.x
    return rectContains(
      { x: (-CARD_WIDTH / 2) * scale, y: (-CARD_HEIGHT / 2) * scale, width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale },
      local,
    )
  }

  layout()
  draw()
  return {
    name: 'shop',
    object,
    order: 14,
    get isOpen() { return open },
    open: () => setOpen(true),
    close: () => { if (open) setOpen(false) },
    setWallet(balance): void { wallet = balance; lastSignature = ''; draw() },
    setCountsSource(source): void { countsFor = source; lastSignature = '' },
    refresh(): void {
      if (!open) return
      // The frame loop calls this every frame, so only rebuild the surface when
      // something the card actually shows has changed.
      const signature = `${wallet}|${PROP_ORDER.map((id) => countsFor(id)).join(',')}`
      if (signature === lastSignature) return
      lastSignature = signature
      draw()
    },
    pointerDown(point, event): boolean {
      if (!open) return false
      event.preventDefault()
      if (rectContains(CLOSE_BOX, toLocal(point))) {
        setOpen(false)
        return true
      }
      const index = buttonAt(point)
      if (index >= 0) {
        const id = PROP_ORDER[index]
        const feedback = onBuy(id)
        receipt = feedback.ok
          ? { ok: true, text: `Bought ${PROP_CATALOG[id].name} for ${PROP_CATALOG[id].price} coins · wallet ${feedback.balance}` }
          : { ok: false, text: feedback.reason ?? 'That purchase did not go through.' }
        wallet = feedback.balance
        draw()
        return true
      }
      if (!containsCard(point)) {
        setOpen(false)
        return true
      }
      return true
    },
    pointerMove(point): boolean {
      if (!open) return false
      const nextButton = buttonAt(point)
      const nextRow = rowAt(point)
      if (nextButton !== hoveredButton || nextRow !== hovered) {
        hoveredButton = nextButton
        hovered = nextRow
        draw()
      }
      return true
    },
    pointerUp(point): boolean { return open && (containsCard(point) || rectContains(CLOSE_BOX, toLocal(point))) },
    cursor(point): UiCursorKind | undefined {
      if (!open) return undefined
      if (buttonAt(point) >= 0) return 'point'
      if (rectContains(CLOSE_BOX, toLocal(point))) return 'point'
      return 'hand'
    },
    hitTest(point): boolean { return open && containsCard(point) },
    keyDown(event): boolean {
      if (!open || event.key !== 'Escape') return false
      event.preventDefault()
      setOpen(false)
      return true
    },
    update(): void { if (open) ensureFurniture() },
    resize(width, height): void { viewport.resize(width, height); layout() },
    describe() {
      return {
        isOpen: open,
        wallet,
        receipt: receipt ? receipt.text : null,
        rows: ROWS.map((row) => ({ ...row })),
        buttons: BUTTONS.map((button) => ({ ...button })),
        counts: Object.fromEntries(PROP_ORDER.map((id) => [id, countsFor(id)])),
      }
    },
    dispose(): void {
      card.geometry.dispose()
      cardTexture.dispose()
      cardMaterial.dispose()
      scrim.geometry.dispose()
      ;(scrim.material as THREE.Material).dispose()
      for (const prop of loaded) prop.dispose()
      loaded.length = 0
    },
  }
}
