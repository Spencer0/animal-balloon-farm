import * as THREE from 'three'
import {
  createSurface,
  grain,
  roundRectPath,
  strokeRoundRect,
  UI_THEME,
  verticalGradient,
  withShadow,
  withTracking,
} from './ui-theme'
import { createUIViewport, type DesignPoint, type UIViewport } from './ui-viewport'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { type CalendarDate, type DayPhase } from '../game/day-night'

export interface ClockCalendarHudState {
  readonly timeOfDay: number
  readonly phase: DayPhase
  readonly date: CalendarDate
  /** Weekday name, e.g. "Sunday". The carnival is set up on Sundays. */
  readonly weekday: string
}

export interface ClockCalendarHud extends UIPanel {
  setState(state: ClockCalendarHudState): void
  setVisible(visible: boolean): void
}

/**
 * A tiny day/night dial in the top-right corner. At rest it is only the ring
 * with its sun/moon bead; hovering it opens the full scrapbook date card.
 * The card frame copies the balloon menu: a dark chocolate rim with a thin
 * cream rule over grained paper.
 */

const DIAL_SIZE = 104
const DIAL_RADIUS = 40
const RING_WIDTH = 10

const CARD_WIDTH = 176
const CARD_HEIGHT = 172
const EDGE_MARGIN = 24
const TOP_MARGIN = 22

const CARD_DIAL_X = CARD_WIDTH / 2
const CARD_DIAL_Y = 64
const CARD_DIAL_RADIUS = 42

const CHOCOLATE = '#4a3a2e'
const CHOCOLATE_LIGHT = '#5d4936'
const CREAM_RULE = 'rgba(255, 244, 213, .55)'

const PHASE_DOT: Record<DayPhase, string> = {
  dawn: '#ff9e5e',
  day: '#ffcf5e',
  dusk: '#ff9e5e',
  night: '#f4e9c4',
}

/** Time of day to dial angle: midnight top, sunrise right, noon bottom. */
function dialAngle(timeOfDay: number): number {
  return timeOfDay * Math.PI * 2 - Math.PI / 2
}

export function createClockCalendarHud(width: number, height: number): ClockCalendarHud {
  const viewport: UIViewport = createUIViewport()
  viewport.resize(width, height)
  const dialSurface = createSurface(DIAL_SIZE, DIAL_SIZE)
  const cardSurface = createSurface(CARD_WIDTH, CARD_HEIGHT)
  const dialTexture = new THREE.CanvasTexture(dialSurface.canvas)
  dialTexture.colorSpace = THREE.SRGBColorSpace
  dialTexture.anisotropy = 4
  const cardTexture = new THREE.CanvasTexture(cardSurface.canvas)
  cardTexture.colorSpace = THREE.SRGBColorSpace
  cardTexture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map: dialTexture, transparent: true, depthWrite: false, depthTest: false })
  const object = new THREE.Mesh(new THREE.PlaneGeometry(DIAL_SIZE, DIAL_SIZE), material)
  object.name = 'Farm calendar dial'
  object.renderOrder = 6
  let visible = true
  let expanded = false
  let hovered = false
  let lastHoverAt = 0
  let signature = ''
  let lastState: ClockCalendarHudState | null = null
  let centreX = 0
  let centreY = 0
  let halfWidth = DIAL_SIZE / 2
  let halfHeight = DIAL_SIZE / 2

  function layout(): void {
    if (expanded) {
      halfWidth = CARD_WIDTH / 2
      halfHeight = CARD_HEIGHT / 2
    } else {
      halfWidth = DIAL_SIZE / 2
      halfHeight = DIAL_SIZE / 2
    }
    centreX = viewport.right - EDGE_MARGIN - halfWidth
    centreY = viewport.top - TOP_MARGIN - halfHeight
    object.position.set(centreX, centreY, 6)
  }

  function setExpanded(next: boolean): void {
    if (expanded === next) return
    expanded = next
    signature = ''
    object.geometry.dispose()
    if (expanded) {
      object.geometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT)
      material.map = cardTexture
    } else {
      object.geometry = new THREE.PlaneGeometry(DIAL_SIZE, DIAL_SIZE)
      material.map = dialTexture
    }
    material.needsUpdate = true
    layout()
    redraw()
  }

  function drawRing(context: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
    context.save()
    context.lineWidth = RING_WIDTH + 5
    context.strokeStyle = 'rgba(58, 44, 31, .55)'
    context.beginPath()
    context.arc(cx, cy, radius, 0, Math.PI * 2)
    context.stroke()
    context.lineWidth = RING_WIDTH
    context.lineCap = 'round'
    context.strokeStyle = '#2a3560'
    context.beginPath()
    context.arc(cx, cy, radius, 0, Math.PI * 2)
    context.stroke()
    context.strokeStyle = UI_THEME.gold
    context.beginPath()
    context.arc(cx, cy, radius, dialAngle(0.25), dialAngle(0.75))
    context.stroke()
    context.restore()
  }

  function drawBead(context: CanvasRenderingContext2D, state: ClockCalendarHudState, cx: number, cy: number, radius: number): void {
    const angle = dialAngle(state.timeOfDay)
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    context.save()
    context.shadowColor = 'rgba(38, 24, 16, .45)'
    context.shadowBlur = 4
    context.shadowOffsetY = 1.5
    if (state.phase === 'night') {
      context.fillStyle = PHASE_DOT.night
      context.beginPath()
      context.arc(x, y, 9, 0, Math.PI * 2)
      context.fill()
      context.shadowColor = 'transparent'
      context.fillStyle = '#2a3560'
      context.beginPath()
      context.arc(x + 3.5, y - 2.5, 7, 0, Math.PI * 2)
      context.fill()
    } else {
      context.fillStyle = PHASE_DOT[state.phase]
      context.beginPath()
      context.arc(x, y, 8, 0, Math.PI * 2)
      context.fill()
      context.shadowColor = 'transparent'
      context.strokeStyle = PHASE_DOT[state.phase]
      context.lineWidth = 2
      for (let ray = 0; ray < 8; ray += 1) {
        const rayAngle = (ray / 8) * Math.PI * 2
        context.beginPath()
        context.moveTo(x + Math.cos(rayAngle) * 11, y + Math.sin(rayAngle) * 11)
        context.lineTo(x + Math.cos(rayAngle) * 14, y + Math.sin(rayAngle) * 14)
        context.stroke()
      }
    }
    context.restore()
  }

  function drawDialOnly(): void {
    const context = dialSurface.context
    context.clearRect(0, 0, DIAL_SIZE, DIAL_SIZE)
    drawRing(context, DIAL_SIZE / 2, DIAL_SIZE / 2, DIAL_RADIUS)
    if (lastState) drawBead(context, lastState, DIAL_SIZE / 2, DIAL_SIZE / 2, DIAL_RADIUS)
    dialTexture.needsUpdate = true
  }

  function drawCard(): void {
    const context = cardSurface.context
    const state = lastState
    context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
    withShadow(context, 12, 5, () => {
      roundRectPath(context, 0, 0, CARD_WIDTH, CARD_HEIGHT, 18)
      context.fillStyle = CHOCOLATE
      context.fill()
    })
    roundRectPath(context, 0, 0, CARD_WIDTH, CARD_HEIGHT, 18)
    context.fillStyle = verticalGradient(context, 0, 0, CARD_HEIGHT, [
      [0, CHOCOLATE_LIGHT],
      [1, CHOCOLATE],
    ])
    context.fill()
    strokeRoundRect(context, 1.5, 1.5, CARD_WIDTH - 3, CARD_HEIGHT - 3, 16.5, CREAM_RULE, 1.5)
    const paper = { x: 10, y: 10, width: CARD_WIDTH - 20, height: CARD_HEIGHT - 20 }
    roundRectPath(context, paper.x, paper.y, paper.width, paper.height, 12)
    context.fillStyle = verticalGradient(context, paper.x, paper.y, paper.height, [
      [0, '#f4e7c9'],
      [0.54, UI_THEME.paper],
      [1, UI_THEME.paperShade],
    ])
    context.fill()
    strokeRoundRect(context, paper.x, paper.y, paper.width, paper.height, 12, 'rgba(120, 79, 52, .66)', 1)
    grain(context, paper.x + 4, paper.y + 4, paper.width - 8, paper.height - 8, 917)
    drawRing(context, CARD_DIAL_X, CARD_DIAL_Y, CARD_DIAL_RADIUS)
    if (state) {
      drawBead(context, state, CARD_DIAL_X, CARD_DIAL_Y, CARD_DIAL_RADIUS)
      context.textAlign = 'center'
      context.textBaseline = 'alphabetic'
      context.fillStyle = UI_THEME.ink
      context.font = 'bold 21px Georgia, "Times New Roman", serif'
      context.fillText(state.date.month.name + ' ' + state.date.day, CARD_WIDTH / 2, 134)
      withTracking(context, 1, () => {
        context.fillStyle = UI_THEME.inkSoft
        context.font = 'bold 10px Georgia, "Times New Roman", serif'
        context.fillText(state.weekday.toUpperCase() + ' · YEAR ' + state.date.year + ' · DAY ' + state.date.dayOfYear, CARD_WIDTH / 2, 152)
      })
    }
    cardTexture.needsUpdate = true
  }

  function redraw(): void {
    if (expanded) drawCard()
    else drawDialOnly()
  }

  function hitTestPoint(point: DesignPoint): boolean {
    if (!visible) return false
    return Math.abs(point.x - centreX) <= halfWidth && Math.abs(point.y - centreY) <= halfHeight
  }

  layout()

  return {
    name: 'clock-calendar-hud',
    object,
    order: 6,
    setState(state): void {
      lastState = state
      const step = Math.round(state.timeOfDay * 500)
      const nextSignature = (expanded ? '1' : '0') + '|' + step + '|' + state.phase + '|' + state.date.year + '|' + state.date.monthIndex + '|' + state.date.day + '|' + state.weekday
      if (nextSignature === signature) return
      signature = nextSignature
      redraw()
    },
    setVisible(next): void {
      visible = next
      object.visible = visible
      if (!visible && hovered) {
        hovered = false
        setExpanded(false)
      }
    },
    pointerDown(point): boolean {
      if (!hitTestPoint(point)) return false
      lastHoverAt = performance.now()
      setExpanded(true)
      return false
    },
    pointerMove(point): boolean {
      const inside = hitTestPoint(point)
      hovered = inside
      if (inside) {
        lastHoverAt = performance.now()
        if (!expanded) setExpanded(true)
      }
      return inside
    },
    pointerUp: () => false,
    cursor(point): UiCursorKind | undefined {
      if (!visible) return undefined
      return hitTestPoint(point) ? 'point' : undefined
    },
    hitTest(point): boolean {
      return hitTestPoint(point)
    },
    update(): void {
      if (expanded && hovered) lastHoverAt = performance.now()
      if (expanded && !hovered && performance.now() - lastHoverAt > 200) setExpanded(false)
    },
    resize(cssWidth, cssHeight): void { viewport.resize(cssWidth, cssHeight); layout() },
    describe(): unknown {
      return { center: { x: centreX, y: centreY }, width: halfWidth * 2, height: halfHeight * 2, expanded, hovered }
    },
    dispose(): void {
      dialTexture.dispose()
      cardTexture.dispose()
      material.dispose()
      object.geometry.dispose()
    },
  }
}
