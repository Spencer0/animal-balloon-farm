import * as THREE from 'three'
import { createFarmButton, type FarmButton } from './ui-button'
import { createScrim, fitScrim, type UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createUIViewport, fullViewportRect, rectContains, type DesignPoint } from './ui-viewport'
import { requestUIProp } from './ui-props'
import {
  createSurface,
  fillRoundRect,
  grain,
  roundRectPath,
  strokeRoundRect,
  UI_THEME,
  verticalGradient,
  withTracking,
} from './ui-theme'

/**
 * The main menu.
 *
 * The old version was a neat row of three identical plaques centred under a
 * signboard: tidy, and completely flat. It read as a dialog box that happened to
 * have a farm behind it.
 *
 * This is built the way a toy diorama is. The farm itself is the background and
 * is left bright and uncovered -- no scrim, no sky wash -- because the first
 * thing you should see is the thing you are about to walk into. The menu items
 * are signboards on posts, each leaning by a slightly different amount, hung in
 * a loose cluster down one side rather than centred in a row, and a parchment
 * card at the bottom tells you what the sign you are pointing at will do.
 */

export type MenuChoice = 'enter' | 'viewer' | 'options'

export interface MenuPanel extends UIPanel {
  readonly isOpen: boolean
  open(): void
  close(): void
}

interface MenuButtonSpec {
  readonly choice: MenuChoice
  readonly title: string
  /** Shown on the parchment card, not on the sign. */
  readonly blurb: string
  readonly hotkey: string
  readonly accent: string
  /**
   * Each sign leans by a slightly different amount and never straightens up
   * completely. Three identical plaques in a row read as a UI list; three
   * crooked signs on posts read as a place.
   */
  readonly tilt: number
  /** Vertical offset of this sign in the cluster, before the lean is applied. */
  readonly drop: number
}

const MENU_BUTTONS: readonly MenuButtonSpec[] = [
  {
    choice: 'enter', title: 'Enter', hotkey: '1', accent: UI_THEME.meadow,
    blurb: 'Walk into the garden. Plant, sow and make a friend.', tilt: -0.055, drop: 150,
  },
  {
    choice: 'viewer', title: 'Viewer', hotkey: '2', accent: UI_THEME.gold,
    blurb: 'Every animal on its plinth, waiting for its colour.', tilt: 0.048, drop: -30,
  },
  {
    choice: 'options', title: 'Options', hotkey: '3', accent: '#7f9fb8',
    blurb: 'Sound, controls and everything else.', tilt: -0.028, drop: -210,
  },
]

const MENU_BUTTON_WIDTH = 392
const MENU_BUTTON_HEIGHT = 144
/** The signposts hang down the right-hand side, not across the middle. */
const SIGNPOST_X = 452
const SIGNPOST_TILT_SWAY = 0.014

/** The parchment card at the bottom left that describes the pointed-at sign. */
const CARD_WIDTH = 600
const CARD_HEIGHT = 252
const CARD_X = -396
const CARD_Y = -296
/** The signboard and bunting, in the design units they are fitted into. */
const SIGN_WIDTH = 720
const SIGN_HEIGHT = 265
/** Where the painted lettering sits inside the signboard's box, as a fraction. */
const SIGN_LABEL_Y_OFFSET = -0.19
/**
 * The signboard prop's box is board *plus* post, and the painted cream face is
 * only part of that box. The lettering is authored against the face, not the box,
 * or it spills off the edges.
 */
const SIGN_FACE_WIDTH_RATIO = 0.895
const SIGN_FACE_HEIGHT_RATIO = 0.45
const BUNTING_WIDTH = 1040
const BUNTING_HEIGHT = 176

export function createMenuPanel(
  onChoose: (choice: MenuChoice) => void,
  cssWidth: number,
  cssHeight: number,
  onToggle?: (isOpen: boolean) => void,
): MenuPanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)

  const object = new THREE.Group()
  object.name = 'Main menu'
  object.visible = false

  // Barely there. A heavy scrim turned the farm behind the menu into a murky
  // backdrop; the diorama has to stay bright to be worth looking at.
  const scrim = createScrim(0.12, '#20383a')
  scrim.renderOrder = 0
  object.add(scrim)

  // Painted sky: a warm sunrise wash that lets the farm read through underneath.
  const skySurface = createSurface(1600, 900)
  const skyMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(skySurface.canvas),
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  skyMaterial.map!.colorSpace = THREE.SRGBColorSpace
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMaterial)
  sky.name = 'Main menu · sky wash'
  sky.renderOrder = 1
  object.add(sky)

  const decor = new THREE.Group()
  decor.name = 'Main menu · props'
  object.add(decor)

  // These are `let`, not `const`: they arrive asynchronously, and `layout()` has
  // to see the late ones. Holding `const`s meant a prop that loaded after
  // construction was added to the scene but never positioned, so the mailbox sat
  // dead centre on top of the signboard.
  let bunting = requestUIProp('ui-bunting', { width: BUNTING_WIDTH, height: BUNTING_HEIGHT, anchorBelow: 1 })
  let signboard = requestUIProp('ui-signboard', { width: SIGN_WIDTH, height: SIGN_HEIGHT, anchorBelow: 0.62 })
  const attached = {
    bunting: Boolean(bunting),
    signboard: Boolean(signboard),
  }
  if (bunting) decor.add(bunting.object)
  if (signboard) decor.add(signboard.object)

  const signLabel = createSignLabel(
    Math.round(SIGN_WIDTH * SIGN_FACE_WIDTH_RATIO),
    Math.round(SIGN_HEIGHT * SIGN_FACE_HEIGHT_RATIO),
  )
  decor.add(signLabel.object)

  const buttons: FarmButton[] = MENU_BUTTONS.map((spec) => {
    const button = createFarmButton({
      title: spec.title,
      hotkey: spec.hotkey,
      accent: spec.accent,
      width: MENU_BUTTON_WIDTH,
      height: MENU_BUTTON_HEIGHT,
      onPress: () => onChoose(spec.choice),
    })
    object.add(button.object)
    return button
  })

  // The parchment card. It carries the description, so the signs themselves can
  // stay a single word apiece.
  const cardSurface = createSurface(CARD_WIDTH, CARD_HEIGHT)
  const cardMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(cardSurface.canvas),
    transparent: true,
    depthWrite: false,
    depthTest: false,
  })
  cardMaterial.map!.colorSpace = THREE.SRGBColorSpace
  const card = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), cardMaterial)
  card.name = 'Main menu · description card'
  card.renderOrder = 6
  object.add(card)

  let isOpen = false
  /** Which sign the card is describing: whatever is pointed at, else the first. */
  let activeIndex = 0

  function layout(): void {
    const safe = fullViewportRect(viewport)
    fitScrim(scrim, viewport)
    sky.scale.set(safe.width, safe.height, 1)
    sky.position.set(0, 0, 1)
    drawSky()

    // Everything below is authored against a 1600x900 stage and shrunk together
    // on a small window, so the composition never comes apart.
    const scale = Math.min(
      1,
      safe.width / 1600,
      safe.height / 900,
    )

    // Bunting strung across the very top, the way a fairground strung it.
    if (bunting) {
      // Clear of the logo. The strand hangs *below* its anchor, so it has to be
      // pinned almost to the top edge or its rope draws a white line straight
      // across the signboard.
      bunting.object.position.set(0, safe.y + safe.height - 8 * scale, 0)
      bunting.object.scale.setScalar(scale)
    }

    // The logo, set to the upper left rather than dead centre, so the signposts
    // have room to hang down the right.
    const signX = -300 * scale
    const signY = 128 * scale
    if (signboard) {
      signboard.object.position.set(signX, signY, 0)
      signboard.object.scale.setScalar(scale)
      signboard.object.rotation.z = -0.018
    }
    signLabel.place(signX, signY, scale)

    // The signposts: a loose vertical cluster, each one leaning.
    buttons.forEach((button, index) => {
      const spec = MENU_BUTTONS[index]
      button.setBaseScale(scale)
      button.setCenter(SIGNPOST_X * scale, spec.drop * scale)
      button.object.rotation.z = spec.tilt
    })

    card.position.set(CARD_X * scale, CARD_Y * scale, 6)
    card.scale.setScalar(scale)

    drawCard()
  }

  /** The parchment card's face: a title, a blurb, and the key that picks it. */
  function drawCard(): void {
    const context = cardSurface.context
    const { width, height } = cardSurface
    const spec = MENU_BUTTONS[activeIndex]
    context.clearRect(0, 0, width, height)

    // Parchment with a soft, torn-looking edge.
    context.save()
    context.shadowColor = 'rgba(40, 22, 10, .35)'
    context.shadowBlur = 26
    context.shadowOffsetY = 10
    roundRectPath(context, 6, 6, width - 12, height - 12, 22)
    context.fillStyle = verticalGradient(context, 0, 0, height, [
      [0, '#fbf1d8'],
      [0.6, '#f4e6c6'],
      [1, '#e6d3ad'],
    ])
    context.fill()
    context.restore()
    strokeRoundRect(context, 7, 7, width - 14, height - 14, 21, 'rgba(122, 82, 46, .55)', 3)
    strokeRoundRect(context, 18, 18, width - 36, height - 36, 14, 'rgba(122, 82, 46, .28)', 1.5)
    grain(context, 12, 12, width - 24, height - 24, 4409, 160, 0.05)

    // A painted swatch in the choice's own colour, so the card and the sign it
    // describes are obviously the same thing.
    fillRoundRect(context, 40, 40, 10, height - 92, 5, spec.accent)

    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillStyle = '#5b4227'
    context.font = '700 15px Georgia, "Times New Roman", serif'
    withTracking(context, 2.4, () => {
      context.fillText('WHAT THIS DOES', 72, 62)
    })

    context.fillStyle = UI_THEME.ink
    context.font = 'bold 42px Georgia, "Times New Roman", serif'
    context.fillText(spec.title.toUpperCase(), 72, 110)

    context.fillStyle = '#6b5236'
    context.font = 'italic 21px Georgia, "Times New Roman", serif'
    wrapText(context, spec.blurb, 72, 152, width - 150, 28)

    // A keycap chip rather than a line of small caps, so the hint reads at a
    // glance and cannot be walked over by a third line of blurb.
    const hint = spec.hotkey.toUpperCase()
    context.font = 'bold 18px ui-monospace, SFMono-Regular, Menlo, monospace'
    const keySize = 30
    fillRoundRect(context, 72, height - 62, keySize, keySize, 8, spec.accent)
    context.fillStyle = '#fff8e6'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(hint, 72 + keySize / 2, height - 62 + keySize / 2 + 1)
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillStyle = '#8a6a44'
    context.font = '700 15px Georgia, "Times New Roman", serif'
    withTracking(context, 1.8, () => {
      context.fillText('TO CHOOSE', 72 + keySize + 16, height - 62 + keySize - 8)
    })
    cardMaterial.map!.needsUpdate = true
  }

  function wrapText(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): void {
    const words = text.split(' ')
    let line = ''
    let cursor = y
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (context.measureText(candidate).width > maxWidth && line) {
        context.fillText(line, x, cursor)
        line = word
        cursor += lineHeight
      } else {
        line = candidate
      }
    }
    if (line) context.fillText(line, x, cursor)
  }

  function drawSky(): void {
    const context = skySurface.context
    const { width, height } = skySurface
    context.clearRect(0, 0, width, height)
    context.fillStyle = verticalGradient(context, 0, 0, height, [
      [0, 'rgba(255, 232, 176, .16)'],
      [0.45, 'rgba(255, 255, 255, 0)'],
      [1, 'rgba(24, 52, 46, .20)'],
    ])
    context.fillRect(0, 0, width, height)
    skyMaterial.map!.needsUpdate = true
  }

  function buttonAt(point: DesignPoint): number {
    return buttons.findIndex((button) => rectContains(button.rect, point))
  }

  function setOpen(next: boolean): void {
    if (isOpen === next) return
    isOpen = next
    object.visible = next
    for (const button of buttons) button.setState('idle')
    if (next) {
      activeIndex = 0
      drawCard()
    }
    onToggle?.(next)
  }

  layout()
  drawSky()

  return {
    name: 'menu',
    object,
    order: 10,
    get isOpen(): boolean {
      return isOpen
    },
    open(): void {
      setOpen(true)
    },
    close(): void {
      setOpen(false)
    },
    pointerDown(point: DesignPoint, event: PointerEvent): boolean {
      if (!isOpen) return false
      const index = buttonAt(point)
      if (index < 0) return true
      event.preventDefault()
      buttons[index].setState('pressed')
      return true
    },
    pointerMove(point: DesignPoint): boolean {
      if (!isOpen) return false
      const hovered = buttonAt(point)
      buttons.forEach((button, index) => {
        if (button.state === 'pressed' && index === hovered) return
        button.setState(index === hovered ? 'hover' : 'idle')
      })
      // The card describes whatever the pointer is on, so a sign and its
      // explanation are always obviously a pair.
      const next = hovered >= 0 ? hovered : activeIndex
      if (next !== activeIndex) {
        activeIndex = next
        drawCard()
      }
      return true
    },
    pointerUp(point: DesignPoint, event: PointerEvent): boolean {
      if (!isOpen) return false
      const index = buttonAt(point)
      const wasPressed = index >= 0 && buttons[index].state === 'pressed'
      buttons.forEach((button) => {
        if (button.state === 'pressed') button.setState(buttonAt(point) >= 0 ? 'hover' : 'idle')
      })
      if (!wasPressed) return true
      event.preventDefault()
      onChoose(MENU_BUTTONS[index].choice)
      return true
    },
    cursor(point: DesignPoint): UiCursorKind | undefined {
      if (!isOpen) return undefined
      // The whole screen is the menu, so the diorama itself gets the open hand
      // and only the signs switch to the pointing one.
      return buttonAt(point) >= 0 ? 'point' : 'idle'
    },
    keyDown(event: KeyboardEvent): boolean {
      if (!isOpen) return false
      const index = MENU_BUTTONS.findIndex((item) => item.hotkey === event.key)
      if (index < 0) return false
      event.preventDefault()
      onChoose(MENU_BUTTONS[index].choice)
      return true
    },
    update(delta: number): void {
      if (!isOpen) return
      const elapsed = performance.now() / 1000
      // Keep re-requesting: a prop that was still loading when the menu opened
      // attaches itself the moment it arrives.
      attachPendingProps()
      for (const button of buttons) button.update(delta)
      // The signs breathe on their posts. Dead-still signs read as a UI list no
      // matter how they are tilted.
      for (const [index, button] of buttons.entries()) {
        const spec = MENU_BUTTONS[index]
        const sway = Math.sin(elapsed * 0.7 + index * 1.4) * SIGNPOST_TILT_SWAY
        button.object.rotation.z = spec.tilt + sway
        button.object.position.y = spec.drop * (button.rect.height / MENU_BUTTON_HEIGHT) + Math.sin(elapsed * 0.9 + index) * 3
      }
    },
    resize(width: number, height: number): void {
      viewport.resize(width, height)
      layout()
    },
    describe() {
      return {
        isOpen,
        // Whether each Blender-authored prop has actually arrived, so a missing
        // model is visible in the debug harness instead of just looking empty.
        props: { ...attached },
        // Where each prop actually ended up, so a misplaced or mis-scaled model
        // shows up as numbers instead of only as something looking wrong.
        propBounds: {
          bunting: propBounds(bunting?.object ?? null),
          signboard: propBounds(signboard?.object ?? null),
        },
        buttons: buttons.map((button, index) => ({ title: MENU_BUTTONS[index].title, ...button.rect })),
      }
    },
    dispose(): void {
      for (const button of buttons) button.dispose()
      card.geometry.dispose()
      cardMaterial.map?.dispose()
      cardMaterial.dispose()
      signLabel.dispose()
      sky.geometry.dispose()
      skyMaterial.map?.dispose()
      skyMaterial.dispose()
      scrim.geometry.dispose()
      ;(scrim.material as THREE.Material).dispose()
    },
  }

  function attachPendingProps(): void {
    // requestUIProp is idempotent, so re-asking is how a late arrival gets picked up.
    const lateBunting = requestUIProp('ui-bunting', { width: BUNTING_WIDTH, height: BUNTING_HEIGHT, anchorBelow: 1 })
    if (lateBunting && !attached.bunting) {
      bunting = lateBunting
      decor.add(lateBunting.object)
      attached.bunting = true
      layout()
    }
    const lateSignboard = requestUIProp('ui-signboard', { width: SIGN_WIDTH, height: SIGN_HEIGHT, anchorBelow: 0.62 })
    if (lateSignboard && !attached.signboard) {
      signboard = lateSignboard
      decor.add(lateSignboard.object)
      attached.signboard = true
      layout()
    }
  }

  /** Design-space bounds of an attached prop, for the debug harness. */
  function propBounds(object: THREE.Object3D | null): { x: number; y: number; width: number; height: number } | null {
    if (!object) return null
    object.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    return { x: round(centre.x - size.x / 2), y: round(centre.y - size.y / 2), width: round(size.x), height: round(size.y) }
  }

  function round(value: number): number {
    return Math.round(value * 100) / 100
  }
}

/** The painted lettering that sits on the signboard's cream panel. */
function createSignLabel(width: number, height: number): { object: THREE.Group; place(x: number, y: number, scale: number): void; dispose(): void } {
  const surface = createSurface(width, height)
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(surface.canvas),
    transparent: true,
    depthWrite: false,
    // The board's front face is real geometry sitting in front of z = 0, so a
    // depth-tested label plane was hidden behind it and the sign came out blank.
    depthTest: false,
  })
  material.map!.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  mesh.name = 'Main menu · sign lettering'
  mesh.renderOrder = 4
  const object = new THREE.Group()
  object.add(mesh)

  const context = surface.context
  context.clearRect(0, 0, width, height)
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'

  context.fillStyle = '#3f6b39'
  context.font = `700 ${Math.round(height * 0.093)}px Georgia, "Times New Roman", serif`
  withTracking(context, height * 0.022, () => {
    context.fillText('A CARNIVAL GARDEN EDITION', width / 2, height * 0.2)
  })

  // One line, shrunk to whatever the face can actually hold.
  const title = 'ANIMAL BALLOON FARM'
  let titleSize = Math.round(height * 0.4)
  for (let attempt = 0; attempt < 16; attempt += 1) {
    context.font = `bold ${titleSize}px Georgia, "Times New Roman", serif`
    if (context.measureText(title).width <= width * 0.9) break
    titleSize = Math.floor(titleSize * 0.94)
  }
  context.fillStyle = UI_THEME.ink
  context.fillText(title, width / 2, height * 0.63)

  context.strokeStyle = 'rgba(92, 143, 82, .5)'
  context.lineWidth = Math.max(1.5, height * 0.016)
  context.beginPath()
  context.moveTo(width * 0.34, height * 0.73)
  context.lineTo(width * 0.66, height * 0.73)
  context.stroke()
  context.fillStyle = 'rgba(122, 88, 58, .8)'
  context.font = `italic ${Math.round(height * 0.115)}px Georgia, "Times New Roman", serif`
  context.fillText('plant, play, and make a friend', width / 2, height * 0.9)
  grain(context, 0, 0, width, height, 90210, 90, 0.04)
  material.map!.needsUpdate = true

  return {
    object,
    place(x: number, y: number, scale: number): void {
      // The signboard prop's box includes its post, so the painted face sits well
      // below the box's centre. The offset is a fraction of the sign's height --
      // it has to be scaled by the sign, not just by the layout scale, or it is a
      // fraction of a pixel and the lettering never moves off the roof.
      object.position.set(x, y + SIGN_LABEL_Y_OFFSET * SIGN_HEIGHT * scale, 6)
      object.scale.setScalar(scale)
    },
    dispose(): void {
      mesh.geometry.dispose()
      material.map?.dispose()
      material.dispose()
    },
  }
}
