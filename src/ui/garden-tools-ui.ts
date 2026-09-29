import * as THREE from 'three'

export interface GardenToolsUI {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  resize(width: number, height: number): void
  pointerDown(event: PointerEvent, canvas: HTMLCanvasElement): boolean
  dispose(): void
}

function makeToolCardTexture(): THREE.CanvasTexture {
  const width = 720
  const height = 168
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for game UI textures')
  context.scale(2, 2)

  const cardWidth = width / 2
  const cardHeight = height / 2
  const panel = context.createLinearGradient(0, 0, 0, cardHeight)
  panel.addColorStop(0, 'rgba(40,75,62,.97)')
  panel.addColorStop(1, 'rgba(27,57,52,.97)')
  context.beginPath()
  context.roundRect(1, 1, cardWidth - 2, cardHeight - 2, 19)
  context.fillStyle = panel
  context.fill()
  context.lineWidth = 1.5
  context.strokeStyle = 'rgba(248,225,174,.74)'
  context.stroke()

  context.beginPath()
  context.roundRect(10, 11, 28, 25, 8)
  context.fillStyle = '#f1d78e'
  context.fill()
  context.fillStyle = '#344b3b'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '800 15px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.fillText('1', 24, 23.5)

  context.save()
  context.translate(58, 44)
  context.lineCap = 'round'
  context.lineJoin = 'round'
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
  context.restore()

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#fff7e5'
  context.font = '750 16px ui-sans-serif, system-ui, sans-serif'
  context.fillText('GRASS SEEDER', 88, 34)
  context.fillStyle = 'rgba(255,246,222,.78)'
  context.font = '600 10.5px ui-sans-serif, system-ui, sans-serif'
  context.letterSpacing = '.25px'
  context.fillText('HOLD TO GROW  ·  RIGHT-CLICK TO SHRINK  ·  DRAG TO SOW', 88, 53)
  context.letterSpacing = '0px'

  context.fillStyle = 'rgba(235,220,180,.58)'
  context.font = '700 9px ui-sans-serif, system-ui, sans-serif'
  context.letterSpacing = '1.15px'
  context.textAlign = 'right'
  context.fillText('GARDEN TOOL', cardWidth - 15, 17)
  context.letterSpacing = '0px'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function createGardenToolsUI(): GardenToolsUI {
  const scene = new THREE.Scene()
  scene.name = 'Grass seeder HUD'
  const camera = new THREE.OrthographicCamera(-640, 640, 360, -360, 0.1, 100)
  camera.position.set(0, 0, 50)
  camera.lookAt(0, 0, 0)
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const texture = makeToolCardTexture()
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  const card = new THREE.Mesh(new THREE.PlaneGeometry(360, 84), material)
  card.name = 'Grass seeder controls · hotkey 1'
  card.position.z = 2
  scene.add(card)
  let viewportWidth = 1280
  let viewportHeight = 720

  function resize(width: number, height: number): void {
    viewportWidth = width
    viewportHeight = height
    camera.left = -width / 2
    camera.right = width / 2
    camera.top = height / 2
    camera.bottom = -height / 2
    camera.updateProjectionMatrix()
    const cardWidth = Math.min(360, Math.max(260, width - 28))
    const scale = cardWidth / 360
    card.scale.setScalar(scale)
    card.position.set(0, -height / 2 + 20 + 42 * scale, 2)
  }

  function dispose(): void {
    card.geometry.dispose()
    texture.dispose()
    material.dispose()
    scene.clear()
  }

  resize(viewportWidth, viewportHeight)
  return {
    scene,
    camera,
    resize,
    pointerDown(event, canvas): boolean {
      const bounds = canvas.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) return false
      pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      if (!raycaster.intersectObject(card, false).length) return false
      event.preventDefault()
      return true
    },
    dispose,
  }
}
