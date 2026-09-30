import * as THREE from 'three'
import type { FarmExpansionState } from './farm-expansion'

export interface FarmExpansionUI {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  resize(width: number, height: number): void
  update(state: FarmExpansionState, deltaSeconds: number): void
  dispose(): void
}

const CARD_WIDTH = 404
const CARD_HEIGHT = 112
const DISPLAY_SECONDS = 4.2

function drawCard(context: CanvasRenderingContext2D, state: FarmExpansionState, notice: string | null, noticeProgress: number): void {
  context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  context.save()
  context.shadowColor = 'rgba(72, 46, 30, 0.24)'
  context.shadowBlur = 18
  context.shadowOffsetY = 6
  const card = new Path2D()
  card.roundRect(5, 5, CARD_WIDTH - 10, CARD_HEIGHT - 14, 20)
  context.fillStyle = 'rgba(44, 73, 58, 0.94)'
  context.fill(card)
  context.restore()

  const accent = context.createLinearGradient(18, 0, CARD_WIDTH - 18, 0)
  accent.addColorStop(0, '#e9c66e')
  accent.addColorStop(0.5, '#fff0bd')
  accent.addColorStop(1, '#75c2a7')
  const outline = new Path2D()
  outline.roundRect(6, 6, CARD_WIDTH - 12, CARD_HEIGHT - 16, 19)
  context.strokeStyle = accent
  context.lineWidth = 2
  context.stroke(outline)

  context.textBaseline = 'middle'
  context.textAlign = 'left'
  context.fillStyle = '#f5d98e'
  context.font = '800 12px system-ui, sans-serif'
  context.letterSpacing = '2px'
  context.fillText(notice ? 'NEW ACREAGE REVEALED' : 'CARNIVAL GARDEN', 24, 25)
  context.letterSpacing = '0px'
  context.fillStyle = '#fff8e6'
  context.font = '700 21px Georgia, serif'
  context.fillText(notice ?? state.lastStep?.name ?? 'Starter plot', 24, 51)
  context.fillStyle = 'rgba(255, 248, 230, .72)'
  context.font = '500 11px system-ui, sans-serif'
  const subtitle = notice
    ? state.isAnimating
      ? `Fresh ground is unfolding  ·  ${state.totalLevels - state.level} parcels remain`
      : state.level >= state.totalLevels
        ? 'The whole garden is yours to tend'
        : `New ground is ready to seed  ·  ${state.totalLevels - state.level} parcels remain`
    : state.isAnimating
      ? `Opening ${state.lastStep?.name ?? 'new ground'}  ·  ${state.totalLevels - state.level} parcels remain`
    : state.level >= state.totalLevels
      ? 'Space + drag rotates · WASD / edge pans'
      : `E: ${state.nextStep?.name ?? 'expand'} · Space + drag rotates · WASD / edge pans`
  context.fillText(subtitle, 24, 73)

  const trackX = 24
  const trackY = 88
  const trackWidth = CARD_WIDTH - 48
  const trackHeight = 7
  context.fillStyle = 'rgba(255, 248, 230, .15)'
  context.beginPath()
  context.roundRect(trackX, trackY, trackWidth, trackHeight, 4)
  context.fill()
  const progress = state.isAnimating
    ? (state.level - 1 + state.progress) / Math.max(1, state.totalLevels)
    : state.level / Math.max(1, state.totalLevels)
  context.fillStyle = state.isAnimating ? '#f6d57e' : '#82cdb3'
  context.beginPath()
  context.roundRect(trackX, trackY, trackWidth * THREE.MathUtils.clamp(progress, 0, 1), trackHeight, 4)
  context.fill()
  if (notice) {
    context.fillStyle = `rgba(255, 248, 230, ${0.3 * noticeProgress})`
    context.beginPath()
    context.arc(CARD_WIDTH - 25, 25, 4, 0, Math.PI * 2)
    context.fill()
  }
}

export function createFarmExpansionUI(width: number, height: number, initialState: FarmExpansionState): FarmExpansionUI {
  const scene = new THREE.Scene()
  scene.name = 'Farm expansion progress HUD'
  const camera = new THREE.OrthographicCamera(-640, 640, 360, -360, 0.1, 100)
  camera.position.set(0, 0, 50)
  camera.lookAt(0, 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH * 2
  canvas.height = CARD_HEIGHT * 2
  const drawingContext = canvas.getContext('2d')
  if (!drawingContext) throw new Error('Canvas 2D context is unavailable for the farm progress card')
  const context: CanvasRenderingContext2D = drawingContext
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  function redraw(state: FarmExpansionState, notice: string | null, progress: number): void {
    context.setTransform(2, 0, 0, 2, 0, 0)
    drawCard(context, state, notice, progress)
    context.setTransform(1, 0, 0, 1, 0, 0)
    texture.needsUpdate = true
  }
  redraw(initialState, null, 0)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), material)
  card.name = 'Garden acreage progress card'
  card.renderOrder = 100
  scene.add(card)

  let noticeName: string | null = null
  let noticeTimer = 0
  let previousLevel = initialState.level
  let redrawTimer = 0
  let lastDrawnKey = ''

  function resize(nextWidth: number, nextHeight: number): void {
    camera.left = -nextWidth / 2
    camera.right = nextWidth / 2
    camera.top = nextHeight / 2
    camera.bottom = -nextHeight / 2
    camera.updateProjectionMatrix()
    const scale = THREE.MathUtils.clamp((nextWidth - 36) / CARD_WIDTH, 0.5, 1)
    card.scale.setScalar(scale)
    // Keep the progression plaque in the upper-left, clear of the existing
    // showcase launcher in the upper-right and the tool tray along the bottom.
    card.position.set(-nextWidth / 2 + CARD_WIDTH * scale / 2 + 18, nextHeight / 2 - CARD_HEIGHT * scale / 2 - 18, 8)
  }

  resize(width, height)
  return {
    scene,
    camera,
    resize,
    update(state, deltaSeconds): void {
      if (state.level > previousLevel) {
        previousLevel = state.level
        noticeName = state.lastStep?.name ?? `Parcel ${state.level}`
        noticeTimer = DISPLAY_SECONDS
      }
      noticeTimer = Math.max(0, noticeTimer - deltaSeconds)
      if (noticeTimer <= 0) noticeName = null
      redrawTimer += deltaSeconds
      const noticeProgress = noticeTimer / DISPLAY_SECONDS
      const key = `${state.level}:${state.totalLevels}:${state.lastStep?.name ?? ''}:${state.nextStep?.name ?? ''}:${noticeName ?? ''}:${state.isAnimating}:${Math.floor(state.progress * 24)}:${Math.floor(noticeProgress * 10)}`
      // Update the existing canvas texture only when visible text/progress changes.
      if (key === lastDrawnKey || redrawTimer < 1 / 12) return
      redrawTimer = 0
      lastDrawnKey = key
      redraw(state, noticeName, noticeProgress)
    },
    dispose(): void {
      card.geometry.dispose()
      texture.dispose()
      material.dispose()
      scene.clear()
    },
  }
}
