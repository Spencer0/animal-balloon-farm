import * as THREE from 'three'
import type { BalloonAnimal, BalloonAnimalId } from '../animals/balloon-animal'
import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import { CAPTURE_DURATION_SECONDS } from '../animals/balloon-capture'
import { createFarmButton, type FarmButton } from './ui-button'
import { createScrim, fitScrim, type UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import {
  createSurface,
  fillRoundRect,
  grain,
  roundRectPath,
  strokeRoundRect,
  UI_THEME,
  verticalGradient,
  withShadow,
  withTracking,
} from './ui-theme'

/**
 * The animal viewer, reached from the main menu's VIEWER button.
 *
 * This replaces the `?showcase=1` page's DOM overlay, which was the last screen
 * in the game still built from HTML. The animals themselves were already Three.js
 * objects in the showcase stage; this only replaces the surrounding chrome, so
 * the whole game now renders through one pipeline and one UI layer.
 *
 * The screen is deliberately a *tray along the bottom* rather than a full-window
 * panel: the point of the viewer is watching the balloon animals stand on their
 * plinths while the colour reveal paints them, so the chrome has to stay out of
 * the way of the stage.
 */

export interface ViewerPanel extends UIPanel {
  readonly isOpen: boolean
  open(): void
  close(): void
}

export interface ViewerActions {
  readonly getAnimals: () => readonly BalloonAnimal[]
  readonly getAnimalName?: (id: BalloonAnimalId) => string
  readonly playAll: () => void
  readonly resetAll: () => void
  readonly replay: (id: BalloonAnimalId) => void
  readonly exit: () => void
}

const TRAY_WIDTH = 1520
const TRAY_HEIGHT = 380
const TRAY_PADDING = 24
const TRAY_RADIUS = 26
const CARD_GAP = 12

/**
 * The Blender plaque is roughly 2.17:1 and is fitted without distorting it, so
 * a control's slot has to be near that shape or the plaque comes out far
 * narrower than the space reserved for it. The controls therefore get their own
 * band across the top of the tray, beside the title, rather than being crushed
 * into a column next to the cards.
 */
const CONTROLS_WIDTH = 300
const CONTROLS_HEIGHT = 138
const CONTROLS_GAP = 16
const CONTROLS_TOP = 10

/** Canvas repaints are throttled to this many per second while a capture runs. */
const REPAINT_INTERVAL = 1 / 12

const CARD_COUNT = ANIMAL_CATALOG.length
const CONTROLS_LEFT = TRAY_WIDTH - TRAY_PADDING - (CONTROLS_WIDTH * 3 + CONTROLS_GAP * 2)
const CARD_TOP = CONTROLS_TOP + CONTROLS_HEIGHT + 14
const CARD_HEIGHT = TRAY_HEIGHT - TRAY_PADDING - CARD_TOP
const CARDS_LEFT = TRAY_PADDING
const CARDS_RIGHT = TRAY_WIDTH - TRAY_PADDING
const CARD_WIDTH = Math.floor((CARDS_RIGHT - CARDS_LEFT - CARD_GAP * (CARD_COUNT - 1)) / CARD_COUNT)

export function createViewerPanel(
  actions: ViewerActions,
  cssWidth: number,
  cssHeight: number,
): ViewerPanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)

  const object = new THREE.Group()
  object.name = 'Animal viewer'
  object.visible = false

  // Light, not a blackout: the stage behind the tray is the content.
  const scrim = createScrim(0.22, '#1b2f33')
  scrim.renderOrder = 0
  object.add(scrim)

  const board = createSurface(TRAY_WIDTH, TRAY_HEIGHT)
  // Depth-tested on purpose: the tray is drawn in the transparent pass, so if
  // it ignored depth it would paint straight over the three wooden buttons,
  // which are opaque meshes standing on top of it. Sitting behind them in z and
  // testing against the depth buffer is what keeps the plaques visible.
  const boardMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(board.canvas),
    transparent: true,
    depthWrite: false,
    depthTest: true,
  })
  boardMaterial.map!.colorSpace = THREE.SRGBColorSpace
  boardMaterial.map!.anisotropy = 4
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(TRAY_WIDTH, TRAY_HEIGHT), boardMaterial)
  boardMesh.name = 'Animal viewer · field guide'
  boardMesh.renderOrder = 2
  // Behind the buttons, which sit at the panel's own z.
  boardMesh.position.z = -3
  object.add(boardMesh)

  const controlSpecs = [
    { title: 'Play all', sublabel: 'Paint every friend', hotkey: 'P', accent: UI_THEME.meadow, run: actions.playAll },
    { title: 'Reset', sublabel: 'Back to wild red', hotkey: 'R', accent: UI_THEME.barnRed, run: actions.resetAll },
    { title: 'Back to farm', sublabel: 'Leave the viewer', hotkey: 'Esc', accent: '#7f9fb8', run: actions.exit },
  ] as const

  const controls: FarmButton[] = controlSpecs.map((spec) => {
    const button = createFarmButton({
      title: spec.title,
      sublabel: spec.sublabel,
      hotkey: spec.hotkey,
      accent: spec.accent,
      width: CONTROLS_WIDTH,
      height: CONTROLS_HEIGHT,
      onPress: spec.run,
    })
    object.add(button.object)
    return button
  })

  let isOpen = false
  let repaintTimer = 0

  /**
   * Card geometry in tray-local design space (y up, x centred on the tray). This
   * is the shape pointer hit-testing needs.
   */
  function cardLayoutRect(index: number): DesignRect {
    return {
      x: CARDS_LEFT - TRAY_WIDTH / 2 + index * (CARD_WIDTH + CARD_GAP),
      y: TRAY_HEIGHT / 2 - CARD_TOP - CARD_HEIGHT,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    }
  }

  /**
   * The same rect on the board texture, whose 2D canvas origin is the top-left
   * corner. Every centred x has to be shifted by half the tray and every y
   * flipped, or the cards paint off the left edge of the texture.
   */
  function cardPaintRect(index: number): DesignRect {
    const rect = cardLayoutRect(index)
    return {
      x: rect.x + TRAY_WIDTH / 2,
      y: TRAY_HEIGHT / 2 - rect.y - rect.height,
      width: rect.width,
      height: rect.height,
    }
  }

  function cardRect(index: number): DesignRect {
    const rect = cardLayoutRect(index)
    return {
      x: boardMesh.position.x + rect.x,
      y: boardMesh.position.y + rect.y,
      width: rect.width,
      height: rect.height,
    }
  }

  function drawBoard(hoverIndex: number): void {
    const context = board.context
    context.clearRect(0, 0, TRAY_WIDTH, TRAY_HEIGHT)

    // The tray: a chunky wooden shelf so the cards read as one physical thing.
    withShadow(context, 40, 18, () => {
      roundRectPath(context, 4, 4, TRAY_WIDTH - 8, TRAY_HEIGHT - 8, TRAY_RADIUS)
      context.fillStyle = '#5d3826'
      context.fill()
    })
    roundRectPath(context, 4, 4, TRAY_WIDTH - 8, TRAY_HEIGHT - 8, TRAY_RADIUS)
    context.fillStyle = verticalGradient(context, 0, 0, TRAY_HEIGHT, [
      [0, '#7b4d34'],
      [0.16, '#a06a49'],
      [0.9, '#6b422e'],
      [1, '#59351f'],
    ])
    context.fill()
    strokeRoundRect(context, 4, 4, TRAY_WIDTH - 8, TRAY_HEIGHT - 8, TRAY_RADIUS, UI_THEME.gilt, 3)
    strokeRoundRect(context, 12, 12, TRAY_WIDTH - 24, TRAY_HEIGHT - 24, 18, 'rgba(240, 213, 162, .5)', 1.2)
    // The lit top edge that makes the plank read as a shelf rather than a panel.
    fillRoundRect(context, 26, 8, TRAY_WIDTH - 52, 3, 1.5, 'rgba(255, 232, 186, .55)')

    context.textAlign = 'left'
    context.fillStyle = '#f6e0b8'
    const titleX = TRAY_PADDING
    context.font = '700 13px Georgia, "Times New Roman", serif'
    withTracking(context, 2.6, () => {
      context.fillText('BALLOON ANIMAL STUDIO', titleX, 50)
    })
    context.fillStyle = '#fff3d6'
    context.font = 'bold 34px Georgia, "Times New Roman", serif'
    context.fillText('The color reveal', titleX, 90)
    context.fillStyle = 'rgba(240, 213, 162, .72)'
    context.font = 'italic 15px Georgia, "Times New Roman", serif'
    context.fillText(
      `${CARD_COUNT} personalities · ${CAPTURE_DURATION_SECONDS.toFixed(1)}s each`,
      titleX,
      118,
    )
    context.fillText('click a card to replay', titleX, 140)
    context.textAlign = 'left'

    // The recess the three wooden plaques drop into, sized to the band they sit
    // in so the buttons read as set into the shelf rather than pasted on it.
    fillRoundRect(context, CONTROLS_LEFT - 8, CONTROLS_TOP - 6, CONTROLS_WIDTH * 3 + CONTROLS_GAP * 2 + 16, CONTROLS_HEIGHT + 12, 18, 'rgba(60, 34, 20, .38)')
    strokeRoundRect(context, CONTROLS_LEFT - 8, CONTROLS_TOP - 6, CONTROLS_WIDTH * 3 + CONTROLS_GAP * 2 + 16, CONTROLS_HEIGHT + 12, 18, 'rgba(240, 213, 162, .28)', 1.2)

    const animals = actions.getAnimals()
    for (const [index, item] of ANIMAL_CATALOG.entries()) {
      const rect = cardPaintRect(index)
      const animal = animals.find((candidate) => candidate.id === item.id)
      const progress = animal ? animal.captureProgress : 0
      const hovered = index === hoverIndex
      const centreX = rect.x + rect.width / 2

      context.save()
      fillRoundRect(context, rect.x, rect.y, rect.width, rect.height, 16, hovered ? '#e7c894' : '#f4e6c8')
      if (hovered) {
        strokeRoundRect(context, rect.x + 1.5, rect.y + 1.5, rect.width - 3, rect.height - 3, 15, 'rgba(150, 96, 48, .7)', 2)
      } else {
        strokeRoundRect(context, rect.x + 1.5, rect.y + 1.5, rect.width - 3, rect.height - 3, 15, 'rgba(120, 79, 52, .35)', 1.5)
      }
      grain(context, rect.x + 4, rect.y + 4, rect.width - 8, rect.height - 8, 3307 + index, 140, 0.05)

      // The animal's own colour chip, outlined when it is a pale one.
      const chipY = rect.y + 44
      context.fillStyle = item.color
      context.beginPath()
      context.arc(centreX, chipY, 25, 0, Math.PI * 2)
      context.fill()
      if (item.color === '#fff0d0' || item.color === '#fff2df') {
        context.strokeStyle = 'rgba(112, 81, 54, .5)'
        context.lineWidth = 1.5
        context.stroke()
      }

      context.textAlign = 'center'
      context.fillStyle = '#563e2e'
      context.font = 'bold 22px Georgia, "Times New Roman", serif'
      context.fillText(actions.getAnimalName?.(item.id) ?? item.label, centreX, rect.y + 96)
      context.fillStyle = '#8a684a'
      context.font = 'italic 14px Georgia, "Times New Roman", serif'
      context.fillText(item.gesture, centreX, rect.y + 118)

      // A paint-bar that fills as the colour reveal runs.
      const barWidth = rect.width - 72
      const barX = centreX - barWidth / 2
      const barY = rect.y + rect.height - 38
      fillRoundRect(context, barX, barY, barWidth, 12, 6, 'rgba(120, 82, 52, .22)')
      if (progress > 0) {
        fillRoundRect(context, barX, barY, Math.max(8, barWidth * progress), 12, 6, UI_THEME.barnRed)
      }
      const status = animal?.isCapturing ? 'PAINTING…' : animal?.isCaptured ? 'RESTORED' : 'WILD'
      context.fillStyle = animal?.isCapturing ? UI_THEME.barnRed : '#a17a54'
      context.font = '700 10px Georgia, "Times New Roman", serif'
      withTracking(context, 1.4, () => {
        context.fillText(status, centreX, rect.y + rect.height - 12)
      })
      context.restore()
    }
    boardMaterial.map!.needsUpdate = true
  }

  function layout(): void {
    fitScrim(scrim, viewport)
    // Sit the tray on the floor of the safe area. If the window is too short to
    // hold it there, centre it instead of pushing it off the bottom.
    const lowest = viewport.bottom + TRAY_HEIGHT / 2 + 16
    const highest = viewport.top - TRAY_HEIGHT / 2 - 16
    const centreY = lowest > highest ? 0 : lowest
    boardMesh.position.set(0, centreY, -3)
    const centre = centreY + TRAY_HEIGHT / 2 - CONTROLS_TOP - CONTROLS_HEIGHT / 2
    controls.forEach((control, index) => {
      control.setCenter(
        CONTROLS_LEFT - TRAY_WIDTH / 2 + CONTROLS_WIDTH / 2 + index * (CONTROLS_WIDTH + CONTROLS_GAP),
        centre,
      )
    })
  }

  let hoverIndex = -1

  function cardAt(point: DesignPoint): number {
    for (let index = 0; index < CARD_COUNT; index += 1) {
      if (rectContains(cardRect(index), point)) return index
    }
    return -1
  }

  function boardAt(point: DesignPoint): boolean {
    return rectContains({ x: boardMesh.position.x - TRAY_WIDTH / 2, y: boardMesh.position.y - TRAY_HEIGHT / 2, width: TRAY_WIDTH, height: TRAY_HEIGHT }, point)
  }

  drawBoard(-1)
  layout()

  return {
    name: 'viewer',
    object,
    order: 15,
    get isOpen(): boolean {
      return isOpen
    },
    open(): void {
      isOpen = true
      object.visible = true
      drawBoard(-1)
    },
    close(): void {
      isOpen = false
      object.visible = false
    },
    pointerDown(point: DesignPoint, event: PointerEvent): boolean {
      if (!isOpen) return false
      const control = controls.find((item) => rectContains(item.rect, point))
      if (control) {
        event.preventDefault()
        control.setState('pressed')
        return true
      }
      const index = cardAt(point)
      if (index < 0 || !boardAt(point)) return true
      event.preventDefault()
      actions.replay(ANIMAL_CATALOG[index].id)
      drawBoard(index)
      return true
    },
    pointerMove(point: DesignPoint): boolean {
      if (!isOpen) return false
      const index = cardAt(point)
      if (index !== hoverIndex) {
        hoverIndex = index
        drawBoard(hoverIndex)
      }
      controls.forEach((control) => control.setState(rectContains(control.rect, point) ? 'hover' : 'idle'))
      return true
    },
    cursor(point: DesignPoint): UiCursorKind | undefined {
      if (!isOpen) return undefined
      const overControl = controls.some((control) => rectContains(control.rect, point))
      if (overControl) return 'point'
      return cardAt(point) >= 0 ? 'point' : 'hand'
    },
    pointerUp(point: DesignPoint): boolean {
      if (!isOpen) return false
      controls.forEach((control) => {
        if (control.state === 'pressed') control.setState(rectContains(control.rect, point) ? 'hover' : 'idle')
      })
      return true
    },
    keyDown(event: KeyboardEvent): boolean {
      if (!isOpen) return false
      if (event.key === 'Escape') {
        event.preventDefault()
        actions.exit()
        return true
      }
      const key = event.key.toLowerCase()
      if (key === 'p') {
        event.preventDefault()
        actions.playAll()
        return true
      }
      if (key === 'r') {
        event.preventDefault()
        actions.resetAll()
        return true
      }
      return false
    },
    update(delta: number): void {
      if (!isOpen) return
      for (const control of controls) control.update(delta)
      // Repaint the bars while a capture is running, but not every frame.
      repaintTimer -= delta
      if (repaintTimer > 0) return
      repaintTimer = REPAINT_INTERVAL
      const running = actions.getAnimals().some((animal) => animal.isCapturing)
      if (running) drawBoard(hoverIndex)
    },
    resize(width: number, height: number): void {
      viewport.resize(width, height)
      layout()
    },
    dispose(): void {
      for (const control of controls) control.dispose()
      boardMaterial.map?.dispose()
      boardMaterial.dispose()
      boardMesh.geometry.dispose()
    },
    describe() {
      return {
        isOpen,
        board: {
          x: boardMesh.position.x - TRAY_WIDTH / 2,
          y: boardMesh.position.y - TRAY_HEIGHT / 2,
          width: TRAY_WIDTH,
          height: TRAY_HEIGHT,
        },
        cards: ANIMAL_CATALOG.map((item, index) => ({
          id: item.id,
          ...cardRect(index),
        })),
        controls: controls.map((control) => ({ title: control.rect, rect: control.rect })),
        viewport,
      }
    },
  }
}
