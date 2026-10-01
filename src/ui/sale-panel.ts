import * as THREE from 'three'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import { createSurface, fillRoundRect, strokeRoundRect, UI_THEME, verticalGradient } from './ui-theme'

export const SALE_PANEL_WIDTH = 440
export const SALE_PANEL_HEIGHT = 250

export interface SaleTarget {
  readonly id: string
  readonly kind: 'plant' | 'animal'
  readonly name: string
  readonly detail: string
  readonly price: number
  readonly sellable?: boolean
}

export interface SalePanel extends UIPanel {
  readonly isOpen: boolean
  open(target: SaleTarget): void
  close(): void
  setWallet(balance: number): void
  readonly walletRect: DesignRect
}

const WIDTH = SALE_PANEL_WIDTH
const HEIGHT = SALE_PANEL_HEIGHT
const WALLET_WIDTH = 208
const WALLET_HEIGHT = 62
const WALLET_LOCAL: DesignRect = { x: -WALLET_WIDTH / 2, y: -WALLET_HEIGHT / 2, width: WALLET_WIDTH, height: WALLET_HEIGHT }
const SELL_BUTTON: DesignRect = { x: -92, y: -91, width: 184, height: 54 }

export function createSalePanel(
  onSell: (target: SaleTarget) => number | null,
  cssWidth: number,
  cssHeight: number,
  onToggle?: (isOpen: boolean) => void,
): SalePanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)
  const object = new THREE.Group()
  object.name = 'Sale information panel'
  const surface = createSurface(WIDTH, HEIGHT)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), material)
  card.position.z = 2
  card.visible = false
  object.add(card)

  const walletSurface = createSurface(WALLET_WIDTH, WALLET_HEIGHT)
  const walletTexture = new THREE.CanvasTexture(walletSurface.canvas)
  walletTexture.colorSpace = THREE.SRGBColorSpace
  const walletMaterial = new THREE.MeshBasicMaterial({ map: walletTexture, transparent: true, depthWrite: false, depthTest: false })
  const walletMesh = new THREE.Mesh(new THREE.PlaneGeometry(WALLET_WIDTH, WALLET_HEIGHT), walletMaterial)
  walletMesh.name = 'Persistent gold counter'
  walletMesh.position.z = 3
  object.add(walletMesh)

  let target: SaleTarget | null = null
  let wallet = 0
  let receipt: { earned: number; balance: number } | null = null
  let sold = false
  let visible = true

  function layout(): void {
    object.position.set(-viewport.right + WIDTH / 2 + 24, viewport.top - HEIGHT / 2 - 24, 0)
    walletMesh.position.set(
      viewport.right - WALLET_WIDTH / 2 - 26 - object.position.x,
      viewport.top - 26 - 76 - 14 - WALLET_HEIGHT / 2 - object.position.y,
      3,
    )
  }

  function draw(): void {
    const context = surface.context
    context.clearRect(0, 0, WIDTH, HEIGHT)
    fillRoundRect(context, 0, 0, WIDTH, HEIGHT, 22, verticalGradient(context, 0, 0, HEIGHT, [[0, '#fbf2df'], [1, '#e8d5b0']]))
    strokeRoundRect(context, 3, 3, WIDTH - 6, HEIGHT - 6, 20, UI_THEME.gilt, 3)
    context.textBaseline = 'middle'
    context.textAlign = 'center'
    context.fillStyle = '#765136'
    context.font = 'bold 15px Georgia, "Times New Roman", serif'
    context.fillText(target?.kind === 'animal' ? 'A FRIEND OF THE FARM' : 'A GARDEN TREASURE', WIDTH / 2, 34)
    context.fillStyle = UI_THEME.ink
    context.font = 'bold 31px Georgia, "Times New Roman", serif'
    context.fillText(target?.name ?? '', WIDTH / 2, 77)
    context.fillStyle = '#856b4b'
    context.font = 'italic 15px Georgia, "Times New Roman", serif'
    context.fillText(target?.detail ?? '', WIDTH / 2, 108)
    // The Sell button only exists for settled residents. A wild animal's card
    // shows its name and nothing else: no price, no button to press.
    const sellable = target?.sellable !== false
    if (!sellable) {
      texture.needsUpdate = true
      return
    }
    context.fillStyle = '#5b7650'
    context.font = 'bold 16px Georgia, "Times New Roman", serif'
    context.fillText(`Wallet  ·  ${wallet} coins`, WIDTH / 2, 140)
    if (receipt) {
      context.fillStyle = '#55834e'
      context.font = 'bold 16px Georgia, "Times New Roman", serif'
      context.fillText(`Sold for ${receipt.earned} coins!  ·  Wallet ${receipt.balance}`, WIDTH / 2, 165)
    }
    const buttonY = HEIGHT / 2 - SELL_BUTTON.y - SELL_BUTTON.height
    fillRoundRect(context, SELL_BUTTON.x + WIDTH / 2, buttonY, SELL_BUTTON.width, SELL_BUTTON.height, 15, sold ? '#8ca17a' : '#668b55')
    strokeRoundRect(context, SELL_BUTTON.x + WIDTH / 2, buttonY, SELL_BUTTON.width, SELL_BUTTON.height, 15, '#d9c27c', 2)
    context.fillStyle = '#fff4d5'
    context.font = 'bold 20px Georgia, "Times New Roman", serif'
    context.fillText(sold ? 'Sold' : `Sell  ·  ${target?.price ?? 0} coins`, WIDTH / 2, buttonY + SELL_BUTTON.height / 2)
    texture.needsUpdate = true
  }

  function drawWallet(): void {
    const context = walletSurface.context
    context.clearRect(0, 0, WALLET_WIDTH, WALLET_HEIGHT)
    fillRoundRect(context, 1, 1, WALLET_WIDTH - 2, WALLET_HEIGHT - 2, 17, verticalGradient(context, 0, 0, WALLET_HEIGHT, [[0, '#875a2f'], [1, '#593c27']]))
    strokeRoundRect(context, 3, 3, WALLET_WIDTH - 6, WALLET_HEIGHT - 6, 15, UI_THEME.gilt, 2)
    context.fillStyle = '#e4bd58'
    context.beginPath()
    context.arc(31, WALLET_HEIGHT / 2, 17, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = '#fff0b7'
    context.lineWidth = 2
    context.stroke()
    context.fillStyle = '#fff3cf'
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.font = 'bold 12px Georgia, "Times New Roman", serif'
    context.fillText('GOLD', 57, 20)
    context.font = 'bold 22px Georgia, "Times New Roman", serif'
    context.fillText(`${wallet} coins`, 57, 43)
    walletTexture.needsUpdate = true
  }

  function toLocal(point: DesignPoint): DesignPoint {
    return { x: point.x - object.position.x, y: point.y - object.position.y }
  }

  function containsCard(point: DesignPoint): boolean {
    return rectContains({ x: -WIDTH / 2, y: -HEIGHT / 2, width: WIDTH, height: HEIGHT }, toLocal(point))
  }

  layout()
  draw()
  drawWallet()
  return {
    name: 'sale-panel',
    object,
    order: 12,
    get isOpen() { return target !== null && visible },
    get walletRect(): DesignRect {
      return {
        x: object.position.x + walletMesh.position.x + WALLET_LOCAL.x,
        y: object.position.y + walletMesh.position.y + WALLET_LOCAL.y,
        width: WALLET_LOCAL.width,
        height: WALLET_LOCAL.height,
      }
    },
    open(next): void {
      target = next
      receipt = null
      sold = false
      object.visible = visible
      card.visible = visible
      draw()
      onToggle?.(true)
    },
    close(): void {
      if (!target) return
      target = null
      receipt = null
      sold = false
      card.visible = false
      draw()
      onToggle?.(false)
    },
    setWallet(balance): void {
      wallet = balance
      drawWallet()
      draw()
    },
    pointerDown(point, event): boolean {
      if (rectContains(this.walletRect, point)) {
        event.preventDefault()
        return true
      }
      if (!target || !visible) return false
      if (!containsCard(point)) {
        event.preventDefault()
        this.close()
        return false
      }
      event.preventDefault()
      if (rectContains(SELL_BUTTON, toLocal(point)) && !sold && target.sellable !== false) {
        const balance = onSell(target)
        if (balance !== null) {
          receipt = { earned: target.price, balance }
          wallet = balance
          sold = true
          draw()
        }
      }
      return true
    },
    pointerMove(point): boolean { return rectContains(this.walletRect, point) || Boolean(target && visible && containsCard(point)) },
    pointerUp(point): boolean { return rectContains(this.walletRect, point) || Boolean(target && visible && containsCard(point)) },
    cursor(point): UiCursorKind | undefined {
      if (rectContains(this.walletRect, point)) return 'hand'
      if (!target || !visible || !containsCard(point)) return undefined
      return rectContains(SELL_BUTTON, toLocal(point)) && !sold && target.sellable !== false ? 'point' : 'hand'
    },
    hitTest(point): boolean { return Boolean(target && visible && containsCard(point)) || rectContains(this.walletRect, point) },
    update(): void {},
    resize(width, height): void { viewport.resize(width, height); layout() },
    describe() { return { open: Boolean(target && visible), target, wallet, receipt, sellButton: { ...SELL_BUTTON } } },
    dispose(): void {
      card.geometry.dispose()
      texture.dispose()
      material.dispose()
      walletMesh.geometry.dispose()
      walletTexture.dispose()
      walletMaterial.dispose()
    },
  }
}
