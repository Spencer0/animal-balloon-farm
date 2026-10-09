import * as THREE from 'three'
import { createSurface, fillRoundRect, strokeRoundRect, UI_THEME } from './ui-theme'
import { createUIViewport, type UIViewport } from './ui-viewport'
import type { UIPanel } from './ui-layer'

export interface ProgressionHudState {
  readonly points: number
  readonly level: number
  readonly pointsToNextLevel: number
  /** Every animal on the farm and at the carnival, indoors or out. */
  readonly population: number
  /** How many are out on the farm right now; the rest are in their houses. */
  readonly outside: number
  /** Room across every house, and how many animals are inside. */
  readonly houseRoom: number
  readonly houseUsed: number
}

export interface ProgressionHud extends UIPanel {
  setState(state: ProgressionHudState): void
  setVisible(visible: boolean): void
}

const CARD_WIDTH = 410
const CARD_HEIGHT = 124

export function createProgressionHud(width: number, height: number): ProgressionHud {
  const viewport: UIViewport = createUIViewport()
  viewport.resize(width, height)
  const surface = createSurface(CARD_WIDTH * 2, CARD_HEIGHT * 2)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false })
  const object = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), material)
  object.name = 'Garden progression and animal capacity'
  object.renderOrder = 6
  let visible = true
  let signature = ''

  function layout(): void {
    object.position.set(viewport.left + CARD_WIDTH / 2 + 24, viewport.top - CARD_HEIGHT / 2 - 22, 6)
  }

  function draw(state: ProgressionHudState): void {
    const next = Math.max(1, state.points + state.pointsToNextLevel)
    const progress = THREE.MathUtils.clamp(state.points / next, 0, 1)
    const context = surface.context
    context.clearRect(0, 0, CARD_WIDTH * 2, CARD_HEIGHT * 2)
    context.save()
    context.scale(2, 2)
    fillRoundRect(context, 3, 4, CARD_WIDTH - 6, CARD_HEIGHT - 7, 18, 'rgba(45, 30, 20, .24)')
    fillRoundRect(context, 1, 1, CARD_WIDTH - 6, CARD_HEIGHT - 8, 18, UI_THEME.paper)
    strokeRoundRect(context, 2, 2, CARD_WIDTH - 8, CARD_HEIGHT - 12, 16, UI_THEME.gilt, 2)
    context.fillStyle = UI_THEME.inkSoft
    context.font = 'bold 12px Georgia, "Times New Roman", serif'
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillText('FARMER PROGRESS', 20, 25)
    context.fillStyle = UI_THEME.meadowDeep
    context.font = 'bold 25px Georgia, "Times New Roman", serif'
    context.fillText(`${state.points} points`, 20, 55)
    context.textAlign = 'right'
    context.fillStyle = UI_THEME.inkSoft
    context.font = 'bold 13px Georgia, "Times New Roman", serif'
    context.fillText(`FARMER LEVEL ${state.level + 1}`, CARD_WIDTH - 22, 25)
    context.fillStyle = UI_THEME.ink
    context.font = '16px Georgia, "Times New Roman", serif'
    context.fillText(`${state.pointsToNextLevel} pts to next level`, CARD_WIDTH - 22, 49)
    fillRoundRect(context, 20, 66, CARD_WIDTH - 42, 11, 6, '#d7c49b')
    fillRoundRect(context, 20, 66, (CARD_WIDTH - 42) * progress, 11, 6, UI_THEME.meadow)
    context.textAlign = 'left'
    context.fillStyle = UI_THEME.inkSoft
    context.font = '14px Georgia, "Times New Roman", serif'
    context.fillText(`Animals ${state.population} (${state.outside} outside)   ·   Indoors ${state.houseUsed}/${state.houseRoom}`, 20, 101)
    context.restore()
    texture.needsUpdate = true
  }

  layout()
  return {
    name: 'progression-hud',
    object,
    order: 6,
    setState(state): void {
      const nextSignature = `${state.points}|${state.level}|${state.pointsToNextLevel}|${state.population}|${state.outside}|${state.houseRoom}|${state.houseUsed}`
      if (nextSignature === signature) return
      signature = nextSignature
      draw(state)
    },
    setVisible(next): void { visible = next; object.visible = visible },
    pointerDown: () => false,
    pointerMove: () => false,
    pointerUp: () => false,
    update: () => {},
    resize(cssWidth, cssHeight): void { viewport.resize(cssWidth, cssHeight); layout() },
    dispose(): void { texture.dispose(); material.dispose(); object.geometry.dispose() },
  }
}
