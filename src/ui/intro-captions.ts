import * as THREE from 'three'
import type { UIPanel } from './ui-layer'
import { DESIGN_HEIGHT, type DesignPoint, type UIViewport } from './ui-viewport'
import { createSurface, fillRoundRect, UI_THEME, withShadow, type Surface } from './ui-theme'
import type { Caption } from '../game/intro-script'

/**
 * Subtitles and title cards for the intro cutscene.
 *
 * Speech sits in the lower letterbox bar, film-style: the French line as it is
 * spoken, small and italic, over the English subtitle. Title cards ("The next
 * morning…") are a cream carnival ribbon across the middle of the picture.
 * The letterbox bars themselves are drawn by the cutscene's grade pass, so this
 * panel only has to know how tall they are.
 */

export interface IntroCaptionsState {
  readonly caption: Caption | null
  readonly opacity: number
  /** Letterbox bar height as a fraction of the screen height. */
  readonly letterbox: number
}

export interface IntroCaptions extends UIPanel {
  setState(state: IntroCaptionsState): void
  /** Show the "press again to skip" hint for a moment. */
  flashSkipHint(): void
}

const SPEECH_WIDTH = 1500
const SPEECH_HEIGHT = 104
const CARD_WIDTH = 1100
const CARD_HEIGHT = 230
const HINT_WIDTH = 360
const HINT_HEIGHT = 44
const HINT_SECONDS = 2.6

function texturedPlane(surface: Surface, name: string): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(surface.width, surface.height), material)
  mesh.name = name
  return mesh
}

function drawSpeech(surface: Surface, caption: Caption): void {
  const { context, width, height } = surface
  context.clearRect(0, 0, width, height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  if (caption.spoken) {
    context.font = 'italic 25px Georgia, "Times New Roman", serif'
    context.fillStyle = 'rgba(246, 226, 186, .82)'
    const label = caption.speaker ? `${caption.speaker} — ${caption.spoken}` : caption.spoken
    context.fillText(label, width / 2, 28)
  }
  context.font = 'bold 40px Georgia, "Times New Roman", serif'
  context.fillStyle = UI_THEME.cream
  context.fillText(caption.text, width / 2, caption.spoken ? 72 : height / 2)
}

function drawCard(surface: Surface, caption: Caption): void {
  const { context, width, height } = surface
  context.clearRect(0, 0, width, height)
  // A carnival ribbon: cream band with notched tails and a gilt rule.
  const bandTop = 46
  const bandHeight = 150
  const inset = 70
  withShadow(context, 22, 8, () => {
    context.beginPath()
    context.moveTo(inset, bandTop)
    context.lineTo(width - inset, bandTop)
    context.lineTo(width - inset + 46, bandTop + bandHeight / 2)
    context.lineTo(width - inset, bandTop + bandHeight)
    context.lineTo(inset, bandTop + bandHeight)
    context.lineTo(inset - 46, bandTop + bandHeight / 2)
    context.closePath()
    context.fillStyle = UI_THEME.cream
    context.fill()
  })
  context.strokeStyle = UI_THEME.gilt
  context.lineWidth = 3
  context.strokeRect(inset + 14, bandTop + 12, width - (inset + 14) * 2, bandHeight - 24)
  fillRoundRect(context, width / 2 - 150, bandTop - 22, 300, 40, 20, UI_THEME.barnRed)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'italic 22px Georgia, "Times New Roman", serif'
  context.fillStyle = UI_THEME.cream
  context.fillText(caption.spoken ?? '', width / 2, bandTop - 1)
  context.font = 'bold 64px Georgia, "Times New Roman", serif'
  context.fillStyle = UI_THEME.ink
  context.fillText(caption.text, width / 2, bandTop + bandHeight / 2 + 6)
}

function drawHint(surface: Surface): void {
  const { context, width, height } = surface
  context.clearRect(0, 0, width, height)
  fillRoundRect(context, 0, 0, width, height, height / 2, 'rgba(251, 240, 214, .14)')
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'italic 21px Georgia, "Times New Roman", serif'
  context.fillStyle = 'rgba(251, 240, 214, .9)'
  context.fillText('Press again to skip  ▸', width / 2, height / 2 + 1)
}

export function createIntroCaptions(viewport: UIViewport): IntroCaptions {
  const object = new THREE.Group()
  object.name = 'Intro captions'
  const speechSurface = createSurface(SPEECH_WIDTH, SPEECH_HEIGHT)
  const cardSurface = createSurface(CARD_WIDTH, CARD_HEIGHT)
  const hintSurface = createSurface(HINT_WIDTH, HINT_HEIGHT)
  drawHint(hintSurface)
  const speech = texturedPlane(speechSurface, 'Intro speech subtitle')
  const card = texturedPlane(cardSurface, 'Intro title card')
  const hint = texturedPlane(hintSurface, 'Intro skip hint')
  object.add(speech, card, hint)
  speech.visible = card.visible = hint.visible = false

  let drawn: Caption | null = null
  let letterbox = 0
  let hintSeconds = 0

  function layout(): void {
    const bar = letterbox * DESIGN_HEIGHT
    speech.position.set(0, -DESIGN_HEIGHT / 2 + Math.max(bar, SPEECH_HEIGHT) / 2, 0)
    // Lower third, clear of the faces and the kit the shot is about.
    card.position.set(0, -DESIGN_HEIGHT / 2 + Math.max(bar, SPEECH_HEIGHT) + CARD_HEIGHT / 2 - 10, 0)
    hint.position.set(viewport.right - HINT_WIDTH / 2 - 28, DESIGN_HEIGHT / 2 - Math.max(bar, HINT_HEIGHT) / 2, 0)
  }

  const panel: IntroCaptions = {
    name: 'intro-captions',
    object,
    order: 90,
    setState(state: IntroCaptionsState): void {
      if (state.caption !== drawn) {
        drawn = state.caption
        if (drawn?.style === 'speech') {
          drawSpeech(speechSurface, drawn)
          speech.material.map!.needsUpdate = true
        } else if (drawn?.style === 'card') {
          drawCard(cardSurface, drawn)
          card.material.map!.needsUpdate = true
        }
      }
      speech.visible = drawn?.style === 'speech' && state.opacity > 0
      card.visible = drawn?.style === 'card' && state.opacity > 0
      speech.material.opacity = state.opacity
      card.material.opacity = state.opacity
      // Cards settle in with a little drift, like a ribbon unfurling.
      card.scale.setScalar(0.94 + 0.06 * state.opacity)
      if (state.letterbox !== letterbox) {
        letterbox = state.letterbox
        layout()
      }
    },
    flashSkipHint(): void {
      hintSeconds = HINT_SECONDS
    },
    pointerDown: (_point: DesignPoint) => false,
    pointerMove: (_point: DesignPoint) => false,
    pointerUp: (_point: DesignPoint) => false,
    update(delta: number): void {
      hintSeconds = Math.max(0, hintSeconds - delta)
      hint.visible = hintSeconds > 0
      hint.material.opacity = Math.min(1, hintSeconds / 0.4)
    },
    resize(): void {
      layout()
    },
    dispose(): void {
      for (const mesh of [speech, card, hint]) {
        mesh.geometry.dispose()
        mesh.material.map?.dispose()
        mesh.material.dispose()
      }
    },
  }
  layout()
  return panel
}
