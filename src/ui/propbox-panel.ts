import * as THREE from 'three'
import { PROP_CATALOG, PROP_ORDER, type PropId } from '../game/farm-props'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import { createSurface, fillRoundRect, strokeRoundRect, UI_THEME, verticalGradient } from './ui-theme'

/**
 * The Propbox: the shop's inventory, modelled on the Seedbox.
 *
 * Same launcher-plus-card shape, same hover and row-gating rules, same
 * signature-based `refresh`. The differences are the contents (props with a
 * price and a count rather than seeds) and the launcher's slot: the Seedbox
 * holds the top-right corner, so the Propbox hangs directly below it at the
 * same margin so the pair reads as one shelf.
 */
export interface PropboxPanel extends UIPanel {
  readonly isOpen: boolean
  setVisible(visible: boolean): void
  setCountsSource(source: (id: PropId) => number): void
  setPlacementActive(active: boolean): void
  setInteractEnabled(enabled: boolean): void
  contains(point: DesignPoint): boolean
  refresh(): void
  close(): void
}

/**
 * The top-right corner is a stack. The sale panel owns the Seedbox launcher slot
 * (26 from the top, 76 tall) and parks the persistent gold counter 14 below it
 * (62 tall), so the Propbox launcher hangs under both, inset by the same margin.
 */
const LAUNCHER = { width: 174, height: 76, margin: 26, gap: 12 }
const STACK_ABOVE = LAUNCHER.margin + LAUNCHER.height + 14 + 62 + LAUNCHER.gap

const CARD_WIDTH = 700
const CARD_HEIGHT = 440

export function createPropboxPanel(
  onChoose: (id: PropId) => void,
  cssWidth: number,
  cssHeight: number,
  onToggle?: (isOpen: boolean) => void,
): PropboxPanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)
  const object = new THREE.Group()
  object.name = 'Propbox panel'
  object.visible = false
  const cardSurface = createSurface(CARD_WIDTH, CARD_HEIGHT)
  const cardTexture = new THREE.CanvasTexture(cardSurface.canvas)
  cardTexture.colorSpace = THREE.SRGBColorSpace
  const cardMaterial = new THREE.MeshBasicMaterial({ map: cardTexture, transparent: true, depthWrite: false, depthTest: false })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), cardMaterial)
  card.position.z = 2
  object.add(card)
  const backingMaterial = new THREE.MeshBasicMaterial({ color: '#243b31', transparent: true, opacity: 0.5, depthWrite: false, depthTest: false })
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH + 32, CARD_HEIGHT + 32), backingMaterial)
  backing.position.z = 1
  object.add(backing)
  const launcherSurface = createSurface(LAUNCHER.width, LAUNCHER.height)
  const launcherTexture = new THREE.CanvasTexture(launcherSurface.canvas)
  launcherTexture.colorSpace = THREE.SRGBColorSpace
  const launcherMaterial = new THREE.MeshBasicMaterial({ map: launcherTexture, transparent: true, depthWrite: false, depthTest: false })
  const launcher = new THREE.Mesh(new THREE.PlaneGeometry(LAUNCHER.width, LAUNCHER.height), launcherMaterial)
  launcher.position.z = 1
  object.add(launcher)

  let isOpen = false
  let visible = true
  let hovered = -1
  let countsFor: (id: PropId) => number = () => 0
  let launcherRect: DesignRect = { x: 0, y: 0, width: LAUNCHER.width, height: LAUNCHER.height }
  // Four rows at a 80-unit pitch: the last one bottoms out at 398 of the 440-tall
  // card, leaving the footer line at 418 clear.
  const rows: DesignRect[] = PROP_ORDER.map((_, index) => ({ x: -314, y: 62 - index * 80, width: 628, height: 66 }))
  let lastCountSignature = ''
  let interactEnabled = true

  function layout(): void {
    launcherRect = {
      x: viewport.right - LAUNCHER.margin - LAUNCHER.width,
      y: viewport.top - STACK_ABOVE - LAUNCHER.height,
      width: LAUNCHER.width,
      height: LAUNCHER.height,
    }
    launcher.position.set(launcherRect.x + launcherRect.width / 2, launcherRect.y + launcherRect.height / 2, 1)
  }

  function draw(): void {
    const context = cardSurface.context
    context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
    fillRoundRect(context, 0, 0, CARD_WIDTH, CARD_HEIGHT, 22, verticalGradient(context, 0, 0, CARD_HEIGHT, [[0, '#f9f0d9'], [1, '#e8d6b4']]))
    strokeRoundRect(context, 3, 3, CARD_WIDTH - 6, CARD_HEIGHT - 6, 20, UI_THEME.gilt, 3)
    context.textAlign = 'left'
    context.fillStyle = UI_THEME.ink
    context.font = 'bold 34px Georgia, "Times New Roman", serif'
    context.fillText('The Propbox', 34, 47)
    context.textAlign = 'right'
    context.fillStyle = '#876848'
    context.font = 'italic 15px Georgia, "Times New Roman", serif'
    context.fillText('Choose a piece, then click the ground', CARD_WIDTH - 65, 44)
    context.fillStyle = '#79573a'
    context.font = '24px Georgia, "Times New Roman", serif'
    context.fillText('×', CARD_WIDTH - 30, 39)
    for (const [index, id] of PROP_ORDER.entries()) {
      const def = PROP_CATALOG[id]
      const row = rows[index]
      const left = row.x + CARD_WIDTH / 2
      const top = CARD_HEIGHT / 2 - row.y - row.height
      const centerY = top + row.height / 2
      const available = countsFor(id) > 0
      fillRoundRect(context, left, top, row.width, row.height, 12, hovered === index ? '#fff9e9' : 'rgba(255, 250, 235, .55)')
      strokeRoundRect(context, left, top, row.width, row.height, 12, hovered === index ? def.color : 'rgba(125, 88, 53, .24)', hovered === index ? 2.5 : 1)
      context.globalAlpha = available ? 1 : 0.48
      context.fillStyle = def.color
      context.beginPath()
      context.roundRect(left + 18, centerY - 17, 34, 34, 8)
      context.fill()
      context.strokeStyle = 'rgba(84, 59, 43, .5)'
      context.lineWidth = 2
      context.stroke()
      context.textAlign = 'left'
      context.fillStyle = '#543b2b'
      context.font = 'bold 20px Georgia, "Times New Roman", serif'
      context.fillText(def.name, left + 66, centerY - 6)
      context.textAlign = 'right'
      context.fillStyle = '#765739'
      context.font = 'bold 16px Georgia, "Times New Roman", serif'
      context.fillText(countsFor(id) > 0 ? `×${countsFor(id)}` : `${def.price} coins`, left + row.width - 18, centerY - 5)
      context.textAlign = 'left'
      context.fillStyle = '#94744f'
      context.font = 'italic 12px Georgia, "Times New Roman", serif'
      context.fillText(def.description, left + 66, centerY + 16)
      context.globalAlpha = 1
    }
    context.textAlign = 'center'
    context.fillStyle = '#896b48'
    context.font = 'italic 13px Georgia, "Times New Roman", serif'
    context.fillText('Esc closes · place with the Hand tool · fences are dragged along the grid', CARD_WIDTH / 2, CARD_HEIGHT - 22)
    cardTexture.needsUpdate = true

    const launcherContext = launcherSurface.context
    launcherContext.clearRect(0, 0, LAUNCHER.width, LAUNCHER.height)
    fillRoundRect(launcherContext, 2, 2, LAUNCHER.width - 4, LAUNCHER.height - 4, 18, verticalGradient(launcherContext, 0, 0, LAUNCHER.height, [[0, '#8a5e3a'], [1, '#563a28']]))
    strokeRoundRect(launcherContext, 4, 4, LAUNCHER.width - 8, LAUNCHER.height - 8, 15, UI_THEME.gilt, 2)
    launcherContext.textAlign = 'center'
    launcherContext.fillStyle = '#fff1d2'
    launcherContext.font = 'bold 21px Georgia, "Times New Roman", serif'
    launcherContext.fillText('Propbox', LAUNCHER.width / 2, 34)
    launcherContext.fillStyle = '#f0d8ad'
    launcherContext.font = '13px Georgia, "Times New Roman", serif'
    launcherContext.fillText('open the box', LAUNCHER.width / 2, 55)
    launcherTexture.needsUpdate = true
  }

  function setOpen(next: boolean): void {
    isOpen = next
    card.visible = visible && isOpen
    backing.visible = visible && isOpen
    launcher.visible = visible && !isOpen
    object.visible = visible
    if (!next) hovered = -1
    draw()
    onToggle?.(next)
  }

  function rowAt(point: DesignPoint): number {
    return isOpen ? rows.findIndex((row) => rectContains(row, point)) : -1
  }

  layout()
  draw()
  return {
    name: 'propbox',
    object,
    order: 8,
    get isOpen() { return isOpen },
    setVisible(next): void {
      visible = next
      if (!visible && isOpen) setOpen(false)
      object.visible = visible
      card.visible = visible && isOpen
      backing.visible = visible && isOpen
      launcher.visible = visible && !isOpen
    },
    setCountsSource(source): void {
      countsFor = source
      lastCountSignature = ''
      draw()
    },
    setPlacementActive(_active): void {
      object.visible = visible
      launcher.visible = visible && !isOpen
    },
    setInteractEnabled(enabled): void { interactEnabled = enabled },
    refresh(): void {
      if (!isOpen) return
      const signature = PROP_ORDER.map((id) => countsFor(id)).join(',')
      if (signature === lastCountSignature) return
      lastCountSignature = signature
      draw()
    },
    contains(point): boolean { return visible && (isOpen || rectContains(launcherRect, point)) },
    close(): void { setOpen(false) },
    pointerDown(point, event): boolean {
      if (!visible) return false
      const overBox = isOpen || rectContains(launcherRect, point)
      if (!interactEnabled && isOpen) {
        if (!overBox) return false
        event.preventDefault()
        if (rowAt(point) < 0 && point.x > 292 && point.y > 135) setOpen(false)
        return true
      }
      if (!isOpen) {
        if (event.button !== 0 || !rectContains(launcherRect, point)) return false
        event.preventDefault()
        setOpen(true)
        return true
      }
      event.preventDefault()
      const index = rowAt(point)
      if (index >= 0 && countsFor(PROP_ORDER[index]) > 0) {
        setOpen(false)
        onChoose(PROP_ORDER[index])
      } else if (point.x > 292 && point.y > 135) setOpen(false)
      return true
    },
    pointerMove(point): boolean {
      if (!visible) return false
      const next = rowAt(point)
      if (next !== hovered) {
        hovered = next
        if (isOpen) draw()
      }
      return isOpen || rectContains(launcherRect, point)
    },
    pointerUp(point): boolean { return visible && (isOpen || rectContains(launcherRect, point)) },
    cursor(point): UiCursorKind | undefined {
      if (!visible) return undefined
      if (isOpen) {
        const overRow = rowAt(point) >= 0
        if (overRow && !interactEnabled) return 'hand'
        return overRow || (point.x > 292 && point.y > 135) ? 'point' : 'hand'
      }
      return rectContains(launcherRect, point) ? 'point' : undefined
    },
    hitTest(point): boolean { return visible && (isOpen || rectContains(launcherRect, point)) },
    keyDown(event): boolean {
      if (!isOpen || event.key !== 'Escape') return false
      event.preventDefault()
      setOpen(false)
      return true
    },
    update(): void {},
    resize(width, height): void { viewport.resize(width, height); layout() },
    describe() {
      return {
        isOpen,
        visible,
        launcher: { ...launcherRect },
        rows: rows.map((row) => ({ ...row })),
        counts: Object.fromEntries(PROP_ORDER.map((id) => [id, countsFor(id)])),
      }
    },
    dispose(): void {
      card.geometry.dispose()
      cardTexture.dispose()
      cardMaterial.dispose()
      backing.geometry.dispose()
      backingMaterial.dispose()
      launcher.geometry.dispose()
      launcherTexture.dispose()
      launcherMaterial.dispose()
    },
  }
}
