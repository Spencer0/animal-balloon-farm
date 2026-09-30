import * as THREE from 'three'
import { GARDEN_TOOLS, type GardenToolDefinition, type GardenToolId } from '../scene/garden-tool-art'

export interface GardenToolsUI {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly selectedTool: GardenToolId
  resize(width: number, height: number): void
  pointerDown(event: PointerEvent, canvas: HTMLCanvasElement): boolean
  selectTool(id: GardenToolId): void
  dispose(): void
}

const CARD_WIDTH = 360
const CARD_HEIGHT = 84
const CARD_GAP = 10

function drawToolIcon(context: CanvasRenderingContext2D, id: GardenToolId): void {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (id === 'grass') {
    context.translate(58, 44)
    context.strokeStyle = '#a97850'
    context.lineWidth = 5
    context.beginPath()
    context.moveTo(4, 17)
    context.lineTo(17, -15)
    context.stroke()
    context.fillStyle = '#d4b77e'
    context.strokeStyle = '#a17d50'
    context.lineWidth = 1.8
    context.beginPath()
    context.roundRect(-8, 3, 16, 15, 4)
    context.fill()
    context.stroke()
    context.fillStyle = '#f0d58c'
    context.beginPath()
    context.ellipse(0, 4, 8, 2.5, 0, Math.PI, Math.PI * 2)
    context.fill()
    context.fillStyle = '#a9cb74'
    context.strokeStyle = '#6c9252'
    context.lineWidth = 1.6
    for (const [x, y, angle] of [[-12, 1, -0.65], [11, 3, 0.68], [-2, -12, -0.18]] as const) {
      context.save()
      context.translate(x, y)
      context.rotate(angle)
      context.beginPath()
      context.ellipse(0, 0, 7, 3.3, 0, 0, Math.PI * 2)
      context.fill()
      context.stroke()
      context.restore()
    }
  } else {
    context.translate(58, 46)
    context.rotate(-0.5)
    // Blade
    context.fillStyle = '#c8cdd4'
    context.strokeStyle = '#8f98a3'
    context.lineWidth = 1.6
    context.beginPath()
    context.moveTo(-3, -4)
    context.quadraticCurveTo(-14, 2, -12, 12)
    context.quadraticCurveTo(-2, 10, 1, 0)
    context.closePath()
    context.fill()
    context.stroke()
    // Shaft
    context.strokeStyle = '#9c6b45'
    context.lineWidth = 5
    context.beginPath()
    context.moveTo(-1, 0)
    context.lineTo(9, -20)
    context.stroke()
    // Grip
    context.strokeStyle = '#d7b47a'
    context.lineWidth = 4
    context.beginPath()
    context.arc(10, -22, 4.5, Math.PI * 0.9, Math.PI * 1.9)
    context.stroke()
  }
  context.restore()
}

function makeCardTexture(tool: GardenToolDefinition, selected: boolean): THREE.CanvasTexture {
  const scale = 2
  const width = CARD_WIDTH * scale
  const height = CARD_HEIGHT * scale
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for game UI textures')
  context.scale(scale, scale)

  const panel = context.createLinearGradient(0, 0, 0, CARD_HEIGHT)
  if (selected) {
    panel.addColorStop(0, 'rgba(46,86,70,.97)')
    panel.addColorStop(1, 'rgba(31,66,58,.97)')
  } else {
    panel.addColorStop(0, 'rgba(38,66,60,.88)')
    panel.addColorStop(1, 'rgba(25,50,46,.88)')
  }
  context.beginPath()
  context.roundRect(1, 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, 19)
  context.fillStyle = panel
  context.fill()
  context.lineWidth = selected ? 2.4 : 1.5
  context.strokeStyle = selected ? tool.accent : 'rgba(248,225,174,.4)'
  context.stroke()

  context.beginPath()
  context.roundRect(10, 11, 28, 25, 8)
  context.fillStyle = selected ? '#f1d78e' : 'rgba(241,215,142,.55)'
  context.fill()
  context.fillStyle = '#344b3b'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '800 15px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.fillText(tool.hotkey, 24, 23.5)

  drawToolIcon(context, tool.id)

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = selected ? '#fff7e5' : 'rgba(255,247,229,.72)'
  context.font = '750 16px ui-sans-serif, system-ui, sans-serif'
  context.fillText(tool.label.toUpperCase(), 88, 34)
  context.fillStyle = 'rgba(255,246,222,.7)'
  context.font = '600 10.5px ui-sans-serif, system-ui, sans-serif'
  context.letterSpacing = '.25px'
  context.fillText(
    tool.id === 'grass'
      ? 'HOLD TO GROW  ·  RIGHT-CLICK TO SHRINK  ·  DRAG TO SOW'
      : 'DIG: LEFT  ·  FILL: RIGHT  ·  MID: LEVEL  ·  2: SIZE',
    88,
    53,
  )
  context.letterSpacing = '0px'

  context.fillStyle = selected ? 'rgba(235,220,180,.62)' : 'rgba(235,220,180,.32)'
  context.font = '700 9px ui-sans-serif, system-ui, sans-serif'
  context.letterSpacing = '1.15px'
  context.textAlign = 'right'
  context.fillText(selected ? 'GARDEN TOOL · ACTIVE' : 'GARDEN TOOL', CARD_WIDTH - 15, 17)
  context.letterSpacing = '0px'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

interface ToolCard {
  readonly tool: GardenToolDefinition
  readonly mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  texture: THREE.CanvasTexture
}

export function createGardenToolsUI(initialTool: GardenToolId): GardenToolsUI {
  const scene = new THREE.Scene()
  scene.name = 'Garden tools HUD'
  const camera = new THREE.OrthographicCamera(-640, 640, 360, -360, 0.1, 100)
  camera.position.set(0, 0, 50)
  camera.lookAt(0, 0, 0)
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()

  const cards: ToolCard[] = GARDEN_TOOLS.map((tool) => {
    const texture = makeCardTexture(tool, tool.id === initialTool)
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT), material)
    mesh.name = `Tool card · ${tool.label}`
    mesh.position.z = 2
    scene.add(mesh)
    return { tool, mesh, material, texture }
  })

  let viewportWidth = 1280
  let viewportHeight = 720
  let selectedTool = initialTool

  function layout(): void {
    const totalWidth = cards.length * CARD_WIDTH + (cards.length - 1) * CARD_GAP
    const scale = Math.min(1, Math.max(0.62, (viewportWidth - 24) / (totalWidth + 24)))
    const step = (CARD_WIDTH + CARD_GAP) * scale
    const startX = -(totalWidth * scale) / 2 + (CARD_WIDTH * scale) / 2
    cards.forEach((card, index) => {
      card.mesh.scale.setScalar(scale)
      card.mesh.position.set(startX + index * step, -viewportHeight / 2 + 20 + (CARD_HEIGHT * scale) / 2, 2)
    })
  }

  function selectTool(id: GardenToolId): void {
    if (selectedTool === id) return
    selectedTool = id
    for (const card of cards) {
      card.texture.dispose()
      card.texture = makeCardTexture(card.tool, card.tool.id === id)
      card.material.map = card.texture
      card.material.needsUpdate = true
    }
  }

  function dispose(): void {
    for (const card of cards) {
      card.mesh.geometry.dispose()
      card.texture.dispose()
      card.material.dispose()
    }
    scene.clear()
  }

  function resize(width: number, height: number): void {
    viewportWidth = width
    viewportHeight = height
    camera.left = -width / 2
    camera.right = width / 2
    camera.top = height / 2
    camera.bottom = -height / 2
    camera.updateProjectionMatrix()
    layout()
  }

  resize(viewportWidth, viewportHeight)
  return {
    scene,
    camera,
    get selectedTool(): GardenToolId {
      return selectedTool
    },
    resize,
    pointerDown(event, canvas): boolean {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return false
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      for (const card of cards) {
        if (raycaster.intersectObject(card.mesh, false).length) {
          event.preventDefault()
          selectTool(card.tool.id)
          return true
        }
      }
      return false
    },
    selectTool,
    dispose,
  }
}
