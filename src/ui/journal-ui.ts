import * as THREE from 'three'
import type { BalloonAnimalId } from '../animals/animal-catalog'
import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import { GARDEN_TOOLS } from '../scene/garden-tool-art'

export type JournalCategory = 'animals' | 'tools' | 'plants'

export interface CaptureJournalEntry {
  readonly id: string
  readonly name: string
  readonly label: string
  readonly subtitle: string
  readonly description: string
  readonly note: string
  readonly color: string
  readonly gesture: string
  readonly spriteUrl: string
}

interface JournalEntry {
  readonly id: string
  readonly name: string
  readonly subtitle: string
  readonly description: string
  readonly note: string
  readonly color: string
  readonly spriteUrl?: string
  readonly gesture?: string
}

export interface JournalUI {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  readonly isOpen: boolean
  resize(width: number, height: number): void
  pointerDown(event: PointerEvent, canvas: HTMLCanvasElement): boolean
  pointerMove(event: PointerEvent, canvas: HTMLCanvasElement): boolean
  handleKeyDown(event: KeyboardEvent): boolean
  dispose(): void
}

const ANIMALS: readonly JournalEntry[] = ANIMAL_CATALOG.map((animal) => ({
  id: animal.id,
  name: animal.name,
  subtitle: animal.subtitle,
  description: animal.description,
  note: animal.note,
  color: animal.color,
  spriteUrl: animal.spriteUrl,
  gesture: animal.gesture,
}))

const TOOLS: readonly JournalEntry[] = GARDEN_TOOLS.map((tool) => ({
  id: tool.id,
  name: tool.label,
  subtitle: tool.subtitle,
  description: tool.description,
  note: tool.note,
  color: tool.tint,
}))

const ENTRIES: Readonly<Record<JournalCategory, readonly JournalEntry[]>> = {
  animals: ANIMALS,
  tools: TOOLS,
  plants: [],
}

const CATEGORY_COPY: Readonly<Record<JournalCategory, { readonly title: string; readonly subtitle: string; readonly description: string }>> = {
  animals: { title: 'Animals', subtitle: 'Friends of the fairground', description: 'Little visitors make a garden feel like home. Turn a page to meet the balloon-animal neighbors.' },
  tools: { title: 'Tools', subtitle: 'Handy things for happy gardens', description: 'A few trusty tools make every patch of soil a little more welcoming.' },
  plants: { title: 'Plants', subtitle: 'Seeds, leaves & little blooms', description: 'A growing collection of garden discoveries, from the first green blade to a full flower.' },
}

const LOGICAL_WIDTH = 1280
const LOGICAL_HEIGHT = 720
const PANEL = { x: 616, y: 108, width: 640, height: 504 }
const BOOK_BUTTON = { x: 1162, y: 588, width: 108, height: 124 }
const BUTTON_CLOSE = { x: 1208, y: 119, width: 32, height: 32 }
const BUTTON_BACK = { x: 638, y: 119, width: 116, height: 34 }
const SCROLL_VIEW = { x: 638, y: 174, width: 578, height: 390 }
const SCROLL_TRACK = { x: 1227, y: 181, width: 6, height: 374 }
const HOME_ROW_START_Y = SCROLL_VIEW.y + 112
const HOME_ROW_HEIGHT = 62
const HOME_ROW_GAP = 8
const LIST_ROW_START_Y = SCROLL_VIEW.y + 96
const LIST_ROW_HEIGHT = 48
const LIST_ROW_GAP = 7
const HOME_CATEGORIES: readonly JournalCategory[] = ['animals', 'tools', 'plants']

function contains(box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function drawPaw(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  context.save()
  context.fillStyle = color
  context.beginPath()
  context.ellipse(x, y + size * 0.2, size * 0.29, size * 0.23, 0, 0, Math.PI * 2)
  context.fill()
  for (const [dx, dy, radius] of [[-0.28, -0.2, 0.12], [-0.1, -0.4, 0.13], [0.12, -0.4, 0.13], [0.3, -0.19, 0.12]] as const) {
    context.beginPath()
    context.arc(x + dx * size, y + dy * size, radius * size, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawLeaf(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  context.save()
  context.translate(x, y)
  context.fillStyle = color
  context.strokeStyle = '#61794e'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(0, size * 0.42)
  context.bezierCurveTo(-size * 0.5, size * 0.1, -size * 0.38, -size * 0.48, size * 0.18, -size * 0.48)
  context.bezierCurveTo(size * 0.5, -size * 0.4, size * 0.52, size * 0.12, 0, size * 0.42)
  context.fill()
  context.stroke()
  context.beginPath()
  context.moveTo(-size * 0.24, size * 0.22)
  context.quadraticCurveTo(0, 0, size * 0.28, -size * 0.31)
  context.stroke()
  context.restore()
}

function drawToolIcon(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  context.save()
  context.translate(x, y)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#815b40'
  context.lineWidth = Math.max(4, size * 0.075)
  context.beginPath()
  context.moveTo(size * 0.02, size * 0.43)
  context.lineTo(size * 0.22, -size * 0.18)
  context.stroke()
  context.fillStyle = '#c99762'
  context.strokeStyle = '#815b40'
  context.lineWidth = 2
  context.beginPath()
  context.roundRect(-size * 0.2, size * 0.02, size * 0.39, size * 0.3, size * 0.08)
  context.fill()
  context.stroke()
  context.fillStyle = '#9dbb72'
  context.beginPath()
  context.ellipse(-size * 0.06, -size * 0.02, size * 0.13, size * 0.06, -0.4, 0, Math.PI * 2)
  context.ellipse(size * 0.12, size * 0.07, size * 0.12, size * 0.055, 0.55, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

function drawFlower(context: CanvasRenderingContext2D, x: number, y: number, scale: number, petal: string): void {
  context.save()
  context.translate(x, y)
  context.strokeStyle = '#728651'
  context.lineWidth = 4 * scale
  context.beginPath()
  context.moveTo(0, 6 * scale)
  context.lineTo(0, 66 * scale)
  context.stroke()
  context.fillStyle = '#85a45e'
  context.beginPath()
  context.ellipse(-12 * scale, 37 * scale, 15 * scale, 7 * scale, -0.55, 0, Math.PI * 2)
  context.ellipse(13 * scale, 49 * scale, 13 * scale, 6 * scale, 0.5, 0, Math.PI * 2)
  context.fill()
  for (let petalIndex = 0; petalIndex < 6; petalIndex += 1) {
    const angle = petalIndex / 6 * Math.PI * 2
    context.fillStyle = petal
    context.beginPath()
    context.ellipse(Math.cos(angle) * 13 * scale, Math.sin(angle) * 13 * scale, 8 * scale, 12 * scale, angle, 0, Math.PI * 2)
    context.fill()
  }
  context.fillStyle = '#e8bc5b'
  context.beginPath()
  context.arc(0, 0, 8 * scale, 0, Math.PI * 2)
  context.fill()
  context.restore()
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split(/\s+/)
  let line = ''
  let lineY = y
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, lineY)
      line = word
      lineY += lineHeight
    } else {
      line = candidate
    }
  }
  if (line) context.fillText(line, x, lineY)
  return lineY + lineHeight
}

function makeAntiqueCoverTexture(): THREE.CanvasTexture {
  const coverCanvas = document.createElement('canvas')
  coverCanvas.width = 512
  coverCanvas.height = 640
  const coverContext = coverCanvas.getContext('2d')
  if (!coverContext) throw new Error('2D canvas context unavailable for the Journal cover')
  const context: CanvasRenderingContext2D = coverContext

  const leather = context.createLinearGradient(0, 0, 512, 640)
  leather.addColorStop(0, '#71432d')
  leather.addColorStop(0.46, '#986344')
  leather.addColorStop(1, '#583724')
  context.fillStyle = leather
  context.fillRect(0, 0, 512, 640)

  let state = 64127
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  for (let index = 0; index < 6400; index += 1) {
    const alpha = 0.025 + random() * 0.1
    context.fillStyle = random() > 0.52 ? `rgba(244, 210, 157, ${alpha})` : `rgba(38, 22, 14, ${alpha})`
    const px = random() * 512
    const py = random() * 640
    context.fillRect(px, py, 1 + random() * 2.2, 0.5 + random() * 1.4)
  }
  const wornEdges = context.createRadialGradient(256, 315, 160, 256, 315, 440)
  wornEdges.addColorStop(0, 'rgba(0, 0, 0, 0)')
  wornEdges.addColorStop(1, 'rgba(35, 20, 12, .42)')
  context.fillStyle = wornEdges
  context.fillRect(0, 0, 512, 640)

  context.strokeStyle = '#d0ad70'
  context.lineWidth = 5
  context.strokeRect(24, 24, 464, 592)
  context.strokeStyle = 'rgba(235, 207, 151, .74)'
  context.lineWidth = 1.5
  context.strokeRect(34, 34, 444, 572)
  context.strokeStyle = 'rgba(220, 187, 126, .76)'
  context.lineWidth = 2
  for (const [x, y, sx, sy] of [[44, 46, 1, 1], [468, 46, -1, 1], [44, 594, 1, -1], [468, 594, -1, -1]] as const) {
    context.beginPath()
    context.moveTo(x, y + 35 * sy)
    context.quadraticCurveTo(x, y, x + 35 * sx, y)
    context.moveTo(x + 5 * sx, y + 25 * sy)
    context.quadraticCurveTo(x + 5 * sx, y + 5 * sy, x + 25 * sx, y + 5 * sy)
    context.stroke()
  }

  context.textAlign = 'center'
  context.fillStyle = '#e3c895'
  context.shadowColor = 'rgba(37, 21, 12, .8)'
  context.shadowBlur = 5
  context.font = 'small-caps 24px Georgia, "Times New Roman", serif'
  context.fillText('SMALL FARMER’S', 256, 110)
  context.font = 'bold 53px Georgia, "Times New Roman", serif'
  context.fillText('JOURNAL', 256, 164)
  context.shadowBlur = 0
  context.strokeStyle = 'rgba(226, 199, 147, .7)'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(106, 186)
  context.lineTo(406, 186)
  context.stroke()

  // Botanical engraving: thin, imperfect gold ink gives the leather an old
  // illustrated-field-guide finish when the modeled book is viewed at HUD size.
  context.save()
  context.translate(256, 375)
  context.strokeStyle = '#d8bb82'
  context.globalAlpha = 0.86
  context.lineWidth = 4
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(0, 145)
  context.bezierCurveTo(-12, 78, 7, 10, 0, -108)
  context.stroke()
  for (const [side, y, length] of [[-1, 80, 62], [1, 43, 72], [-1, 3, 65], [1, -40, 69], [-1, -75, 55]] as const) {
    context.beginPath()
    context.moveTo(side * 2, y)
    context.quadraticCurveTo(side * length * 0.48, y - 24, side * length, y - 1)
    context.quadraticCurveTo(side * length * 0.42, y + 13, side * 2, y)
    context.moveTo(side * 5, y - 1)
    context.quadraticCurveTo(side * length * 0.45, y - 4, side * (length - 4), y - 1)
    context.stroke()
  }
  context.beginPath()
  context.arc(0, -111, 13, 0, Math.PI * 2)
  context.arc(-21, -111, 10, 0, Math.PI * 2)
  context.arc(21, -111, 10, 0, Math.PI * 2)
  context.stroke()
  context.restore()

  context.fillStyle = '#dec38f'
  context.font = 'italic 23px Georgia, "Times New Roman", serif'
  context.fillText('NOTES FROM THE MEADOW', 256, 535)
  context.font = 'small-caps 16px Georgia, "Times New Roman", serif'
  context.fillText('A CARNIVAL GARDEN EDITION', 256, 568)
  return new THREE.CanvasTexture(coverCanvas)
}

function createAntiqueBook(): THREE.Group {
  const book = new THREE.Group()
  book.name = 'Textured antique leather field journal'
  const pages = new THREE.MeshStandardMaterial({ color: '#d8c393', roughness: 0.88 })
  const leather = new THREE.MeshStandardMaterial({ color: '#73462e', roughness: 0.84 })
  const wornLeather = new THREE.MeshStandardMaterial({ color: '#936143', roughness: 0.78 })
  const gilt = new THREE.MeshStandardMaterial({ color: '#c4a05f', roughness: 0.36, metalness: 0.52 })
  const coverTexture = makeAntiqueCoverTexture()
  coverTexture.colorSpace = THREE.SRGBColorSpace
  coverTexture.anisotropy = 8
  const coverArt = new THREE.MeshStandardMaterial({ map: coverTexture, roughness: 0.81, metalness: 0.03 })

  const pageBlock = new THREE.Mesh(new THREE.BoxGeometry(76, 98, 13), pages)
  pageBlock.position.set(1, 0, 0)
  pageBlock.castShadow = true
  book.add(pageBlock)
  const backCover = new THREE.Mesh(new THREE.BoxGeometry(88, 106, 2.8), leather)
  backCover.position.set(0, 0, -7.8)
  backCover.castShadow = true
  backCover.receiveShadow = true
  book.add(backCover)
  const frontCover = new THREE.Mesh(new THREE.BoxGeometry(88, 106, 2.8), wornLeather)
  frontCover.position.set(0, 0, 7.8)
  frontCover.castShadow = true
  frontCover.receiveShadow = true
  book.add(frontCover)
  const coverFace = new THREE.Mesh(new THREE.PlaneGeometry(82, 100), coverArt)
  coverFace.position.set(0, 0, 9.22)
  coverFace.castShadow = false
  book.add(coverFace)

  const spine = new THREE.Mesh(new THREE.BoxGeometry(11, 106, 18), leather)
  spine.position.set(-41, 0, 0)
  spine.castShadow = true
  book.add(spine)
  for (const y of [-39, -18, 18, 39]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.5, 18.2), gilt)
    rib.position.set(-41, y, 0)
    book.add(rib)
  }

  // Tiny fore-edge rules and raised brass tooling make the icon read as a real
  // closed object rather than a flat cover illustration.
  for (let index = 0; index < 10; index += 1) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.55, 90, 0.36), index % 2 ? wornLeather : gilt)
    line.position.set(39.35, 0, -4.5 + index)
    book.add(line)
  }
  const addGiltStrip = (width: number, height: number, x: number, y: number): void => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.72), gilt)
    strip.position.set(x, y, 9.56)
    book.add(strip)
  }
  addGiltStrip(68, 0.85, 0, 43.1)
  addGiltStrip(68, 0.85, 0, -43.1)
  addGiltStrip(0.85, 83, -34, 0)
  addGiltStrip(0.85, 83, 34, 0)
  for (const x of [-34, 34]) {
    for (const y of [-43, 43]) {
      const stud = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 8), gilt)
      stud.position.set(x, y, 9.8)
      stud.scale.set(1, 1, 0.42)
      book.add(stud)
    }
  }
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(5, 21, 0.65), new THREE.MeshStandardMaterial({ color: '#8d3d31', roughness: 0.8 }))
  ribbon.position.set(20, -51, 8)
  ribbon.rotation.z = -0.08
  book.add(ribbon)

  book.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.renderOrder = 19
      object.material.depthTest = true
      object.material.depthWrite = true
    }
  })
  book.userData.coverTexture = coverTexture
  return book
}

export function createJournalUI(canvas: HTMLCanvasElement): JournalUI {
  const textureCanvas = document.createElement('canvas')
  textureCanvas.width = LOGICAL_WIDTH * 2
  textureCanvas.height = LOGICAL_HEIGHT * 2
  const textureContext = textureCanvas.getContext('2d')
  if (!textureContext) throw new Error('2D canvas context unavailable for Journal textures')
  const context: CanvasRenderingContext2D = textureContext
  context.scale(2, 2)

  const texture = new THREE.CanvasTexture(textureCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide })
  const page = new THREE.Mesh(new THREE.PlaneGeometry(LOGICAL_WIDTH, LOGICAL_HEIGHT), material)
  page.name = 'Transparent right-side Journal panel canvas'
  page.renderOrder = 20
  const root = new THREE.Group()
  root.name = 'Three.js Journal overlay'
  root.add(page)
  const book = createAntiqueBook()
  book.position.set(574, -280, 1.1)
  book.scale.setScalar(1.05)
  book.rotation.set(-0.14, 0.28, -0.1)
  root.add(book)

  const scene = new THREE.Scene()
  scene.name = 'Journal overlay'
  scene.add(root)
  scene.add(new THREE.AmbientLight('#fff0d7', 2.1))
  const bookLight = new THREE.DirectionalLight('#fff4df', 2.8)
  bookLight.position.set(-180, 260, 420)
  scene.add(bookLight)
  const bookFill = new THREE.DirectionalLight('#d5c4a3', 1.3)
  bookFill.position.set(250, -170, 210)
  scene.add(bookFill)
  const camera = new THREE.OrthographicCamera(-640, 640, 360, -360, 0.1, 100)
  camera.position.set(0, 0, 50)
  camera.lookAt(0, 0, 0)

  const animalSprites = new Map<BalloonAnimalId, THREE.Texture>()
  const loadingSprites = new Set<BalloonAnimalId>()
  const textureLoader = new THREE.TextureLoader()
  let viewportWidth = 1280
  let viewportHeight = 720
  let isOpen = false
  let category: JournalCategory | null = null
  let selectedEntry: JournalEntry | null = null
  let scrollOffset = 0
  let pageContentHeight = SCROLL_VIEW.height
  let dragScrollPointer: number | null = null
  let dragScrollGrabOffset = 0
  let disposed = false

  function drawPaperGrain(x: number, y: number, width: number, height: number, seed: number): void {
    let state = seed >>> 0
    const random = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 4294967296
    }
    context.save()
    for (let index = 0; index < 240; index += 1) {
      const px = x + random() * width
      const py = y + random() * height
      context.globalAlpha = 0.025 + random() * 0.065
      context.fillStyle = random() > 0.56 ? '#fff8df' : '#8e6845'
      const radius = 0.35 + random() * 0.9
      context.fillRect(px, py, radius, radius)
    }
    context.globalAlpha = 1
    context.restore()
  }

  function maxScroll(): number {
    return Math.max(0, pageContentHeight - SCROLL_VIEW.height)
  }

  function contentHeight(): number {
    if (!category) return SCROLL_VIEW.height
    if (selectedEntry) return category === 'animals' ? 700 : 650
    if (category === 'animals') return Math.max(SCROLL_VIEW.height, 105 + categoryEntries().length * (LIST_ROW_HEIGHT + LIST_ROW_GAP) + 12)
    return SCROLL_VIEW.height
  }

  function pageNumber(): string {
    if (selectedEntry) {
      const index = categoryEntries().findIndex((entry) => entry.id === selectedEntry?.id)
      return category === 'animals' ? `0${index + 3}` : category === 'tools' ? '09' : '13'
    }
    if (category === 'animals') return '02'
    if (category === 'tools') return '08'
    if (category === 'plants') return '12'
    return '01'
  }

  function drawPanelFrame(): void {
    context.save()
    context.shadowColor = 'rgba(30, 22, 15, .44)'
    context.shadowBlur = 25
    context.shadowOffsetX = -6
    context.shadowOffsetY = 10
    roundRect(context, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 14)
    context.fillStyle = '#69402d'
    context.fill()
    context.restore()

    const leather = context.createLinearGradient(PANEL.x, PANEL.y, PANEL.x + PANEL.width, PANEL.y + PANEL.height)
    leather.addColorStop(0, '#754832')
    leather.addColorStop(0.45, '#986345')
    leather.addColorStop(1, '#68402d')
    roundRect(context, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 14)
    context.fillStyle = leather
    context.fill()
    context.strokeStyle = '#d0a964'
    context.lineWidth = 2
    context.stroke()
    roundRect(context, PANEL.x + 5, PANEL.y + 5, PANEL.width - 10, PANEL.height - 10, 11)
    context.strokeStyle = 'rgba(239, 211, 158, .58)'
    context.lineWidth = 0.8
    context.stroke()

    const paperBox = { x: PANEL.x + 10, y: PANEL.y + 10, width: PANEL.width - 20, height: PANEL.height - 20 }
    const paper = context.createLinearGradient(paperBox.x, paperBox.y, paperBox.x + paperBox.width, paperBox.y + paperBox.height)
    paper.addColorStop(0, '#f4e7c9')
    paper.addColorStop(0.54, '#edddba')
    paper.addColorStop(1, '#e6d1a8')
    roundRect(context, paperBox.x, paperBox.y, paperBox.width, paperBox.height, 8)
    context.fillStyle = paper
    context.fill()
    context.strokeStyle = 'rgba(120, 79, 52, .66)'
    context.lineWidth = 1
    context.stroke()
    drawPaperGrain(paperBox.x + 5, paperBox.y + 5, paperBox.width - 10, paperBox.height - 10, 1207)

    // A narrow leather hinge and fine page rules keep the panel looking like a
    // leaf from the same well-loved book as the 3D launcher.
    const hinge = context.createLinearGradient(PANEL.x + 12, 0, PANEL.x + 27, 0)
    hinge.addColorStop(0, 'rgba(110, 68, 45, .28)')
    hinge.addColorStop(0.5, 'rgba(255, 247, 222, .18)')
    hinge.addColorStop(1, 'rgba(110, 68, 45, .04)')
    context.fillStyle = hinge
    context.fillRect(PANEL.x + 12, PANEL.y + 12, 15, PANEL.height - 24)
    context.strokeStyle = 'rgba(143, 99, 65, .3)'
    context.lineWidth = 0.7
    context.beginPath()
    context.moveTo(PANEL.x + 31, PANEL.y + 65)
    context.lineTo(PANEL.x + PANEL.width - 16, PANEL.y + 65)
    context.moveTo(PANEL.x + 31, PANEL.y + PANEL.height - 31)
    context.lineTo(PANEL.x + PANEL.width - 16, PANEL.y + PANEL.height - 31)
    context.stroke()
    context.restore()
  }

  function drawCloseButton(): void {
    const centerX = BUTTON_CLOSE.x + BUTTON_CLOSE.width / 2
    const centerY = BUTTON_CLOSE.y + BUTTON_CLOSE.height / 2
    context.save()
    context.fillStyle = 'rgba(183, 140, 81, .22)'
    context.strokeStyle = 'rgba(128, 75, 52, .52)'
    context.lineWidth = 1
    context.beginPath()
    context.arc(centerX, centerY, 13, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.strokeStyle = '#7c5138'
    context.lineWidth = 1.8
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(centerX - 3.7, centerY - 3.7)
    context.lineTo(centerX + 3.7, centerY + 3.7)
    context.moveTo(centerX + 3.7, centerY - 3.7)
    context.lineTo(centerX - 3.7, centerY + 3.7)
    context.stroke()
    context.restore()
  }

  function drawBackButton(): void {
    context.save()
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillStyle = '#956744'
    context.font = 'italic 15px Georgia, "Times New Roman", serif'
    context.fillText('‹', BUTTON_BACK.x + 4, BUTTON_BACK.y + BUTTON_BACK.height / 2)
    context.fillStyle = '#80553b'
    context.font = '700 9px Georgia, "Times New Roman", serif'
    context.letterSpacing = '0.8px'
    context.fillText(selectedEntry ? 'CHAPTER' : 'JOURNAL', BUTTON_BACK.x + 20, BUTTON_BACK.y + BUTTON_BACK.height / 2 + 0.5)
    context.restore()
  }

  function drawHeader(): void {
    context.save()
    context.textAlign = 'center'
    context.textBaseline = 'alphabetic'
    if (!category) {
      context.fillStyle = '#5e402e'
      context.font = '21px Georgia, "Times New Roman", serif'
      context.fillText("Small Farmer’s Journal", PANEL.x + PANEL.width / 2, PANEL.y + 31)
      context.fillStyle = '#9a704b'
      context.font = '700 8px Georgia, "Times New Roman", serif'
      context.letterSpacing = '1.45px'
      context.fillText('FIELD NOTES FROM A CARNIVAL GARDEN', PANEL.x + PANEL.width / 2, PANEL.y + 47)
    } else {
      context.fillStyle = '#a1744c'
      context.font = '700 8px Georgia, "Times New Roman", serif'
      context.letterSpacing = '1.45px'
      context.fillText(selectedEntry ? `${category.toUpperCase()}  ·  FIELD NOTE` : 'SMALL FARMER’S JOURNAL  ·  FIELD GUIDE', PANEL.x + PANEL.width / 2, PANEL.y + 20)
      context.letterSpacing = '0px'
      context.fillStyle = '#5e402e'
      context.font = '21px Georgia, "Times New Roman", serif'
      context.fillText(selectedEntry ? 'A page from the farm' : CATEGORY_COPY[category].title, PANEL.x + PANEL.width / 2, PANEL.y + 43)
    }
    context.restore()
    if (category) drawBackButton()
    drawCloseButton()
  }

  function drawScrollBar(): void {
    const limit = maxScroll()
    if (limit <= 0) return
    const thumbHeight = Math.max(34, SCROLL_TRACK.height * SCROLL_VIEW.height / pageContentHeight)
    const travel = SCROLL_TRACK.height - thumbHeight
    const thumbY = SCROLL_TRACK.y + (scrollOffset / limit) * travel
    context.save()
    roundRect(context, SCROLL_TRACK.x, SCROLL_TRACK.y, SCROLL_TRACK.width, SCROLL_TRACK.height, 3)
    context.fillStyle = 'rgba(126, 89, 58, .16)'
    context.fill()
    roundRect(context, SCROLL_TRACK.x - 1, thumbY, SCROLL_TRACK.width + 2, thumbHeight, 4)
    context.fillStyle = dragScrollPointer === null ? '#a57c53' : '#795239'
    context.fill()
    context.strokeStyle = 'rgba(248, 231, 197, .66)'
    context.lineWidth = 0.8
    context.stroke()
    context.restore()
  }

  function drawHomePage(): void {
    context.save()
    context.textAlign = 'center'
    context.fillStyle = '#a1764e'
    context.font = '700 8px Georgia, "Times New Roman", serif'
    context.letterSpacing = '1.55px'
    context.fillText('A LITTLE GUIDE TO OUR GARDEN', PANEL.x + PANEL.width / 2, SCROLL_VIEW.y + 18)
    context.letterSpacing = '0px'
    context.fillStyle = '#59402f'
    context.font = 'italic 14px Georgia, "Times New Roman", serif'
    context.fillText('Turn to a chapter and meet the neighbors.', PANEL.x + PANEL.width / 2, SCROLL_VIEW.y + 42)
    context.restore()

    for (const [index, id] of HOME_CATEGORIES.entries()) {
      const row = { x: SCROLL_VIEW.x + 12, y: HOME_ROW_START_Y + index * (HOME_ROW_HEIGHT + HOME_ROW_GAP), width: SCROLL_VIEW.width - 30, height: HOME_ROW_HEIGHT }
      const copy = CATEGORY_COPY[id]
      const entries = ENTRIES[id]
      const iconColor = id === 'animals' ? '#ca8581' : id === 'tools' ? '#b38b58' : '#88a06b'
      context.save()
      if (index === 0) {
        context.strokeStyle = 'rgba(156, 111, 72, .32)'
        context.lineWidth = 0.8
        context.beginPath()
        context.moveTo(row.x + 45, row.y - 7)
        context.lineTo(row.x + row.width - 4, row.y - 7)
        context.stroke()
      }
      context.fillStyle = `${iconColor}30`
      context.beginPath()
      context.arc(row.x + 25, row.y + row.height / 2, 22, 0, Math.PI * 2)
      context.fill()
      if (id === 'animals') drawPaw(context, row.x + 25, row.y + row.height / 2, 27, iconColor)
      else if (id === 'tools') drawToolIcon(context, row.x + 25, row.y + row.height / 2, 33)
      else drawLeaf(context, row.x + 25, row.y + row.height / 2 + 1, 29, iconColor)

      context.textAlign = 'left'
      context.fillStyle = '#593f2d'
      context.font = 'bold 20px Georgia, "Times New Roman", serif'
      context.fillText(copy.title, row.x + 62, row.y + 27)
      context.fillStyle = '#8a684a'
      context.font = '12px Georgia, "Times New Roman", serif'
      context.fillText(copy.subtitle, row.x + 63, row.y + 46)
      context.textAlign = 'right'
      context.fillStyle = '#9a754f'
      context.font = 'italic 12px Georgia, "Times New Roman", serif'
      context.fillText(id === 'plants' ? 'SOON' : `${entries.length} notes  ›`, row.x + row.width - 8, row.y + 36)
      if (index < HOME_CATEGORIES.length - 1) {
        context.strokeStyle = 'rgba(156, 111, 72, .27)'
        context.lineWidth = 0.7
        context.beginPath()
        context.moveTo(row.x + 45, row.y + row.height + 4)
        context.lineTo(row.x + row.width - 4, row.y + row.height + 4)
        context.stroke()
      }
      context.restore()
    }
  }

  function categoryEntries(): readonly JournalEntry[] {
    return category ? ENTRIES[category] : []
  }

  function homeRow(categoryId: JournalCategory): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
    const index = HOME_CATEGORIES.indexOf(categoryId)
    return { x: SCROLL_VIEW.x + 12, y: HOME_ROW_START_Y + index * (HOME_ROW_HEIGHT + HOME_ROW_GAP), width: SCROLL_VIEW.width - 30, height: HOME_ROW_HEIGHT }
  }

  function listRow(index: number, applyScroll = true): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
    return {
      x: SCROLL_VIEW.x + 8,
      y: LIST_ROW_START_Y + index * (LIST_ROW_HEIGHT + LIST_ROW_GAP) - (applyScroll ? scrollOffset : 0),
      width: SCROLL_VIEW.width - 30,
      height: LIST_ROW_HEIGHT,
    }
  }

  function drawListPage(): void {
    if (!category) return
    const copy = CATEGORY_COPY[category]
    context.save()
    context.textAlign = 'left'
    context.fillStyle = '#9b704a'
    context.font = '700 8px Georgia, "Times New Roman", serif'
    context.letterSpacing = '1.45px'
    context.fillText(`CHAPTER  ·  ${category.toUpperCase()}`, SCROLL_VIEW.x + 8, SCROLL_VIEW.y + 15)
    context.letterSpacing = '0px'
    context.fillStyle = '#60452f'
    context.font = 'italic 13px Georgia, "Times New Roman", serif'
    context.fillText(copy.subtitle, SCROLL_VIEW.x + 8, SCROLL_VIEW.y + 38)
    context.textAlign = 'right'
    context.fillStyle = '#9a754f'
    context.font = 'italic 11px Georgia, "Times New Roman", serif'
    context.fillText(`${categoryEntries().length.toString().padStart(2, '0')} ENTRIES`, SCROLL_VIEW.x + SCROLL_VIEW.width - 27, SCROLL_VIEW.y + 17)
    context.strokeStyle = 'rgba(146, 101, 65, .38)'
    context.lineWidth = 0.8
    context.beginPath()
    context.moveTo(SCROLL_VIEW.x + 8, SCROLL_VIEW.y + 57)
    context.lineTo(SCROLL_VIEW.x + SCROLL_VIEW.width - 30, SCROLL_VIEW.y + 57)
    context.stroke()
    context.restore()

    const entries = categoryEntries()
    if (entries.length === 0) {
      context.save()
      context.fillStyle = 'rgba(149, 105, 70, .12)'
      context.beginPath()
      context.arc(SCROLL_VIEW.x + SCROLL_VIEW.width / 2, SCROLL_VIEW.y + 162, 42, 0, Math.PI * 2)
      context.fill()
      drawFlower(context, SCROLL_VIEW.x + SCROLL_VIEW.width / 2, SCROLL_VIEW.y + 156, 0.52, '#d99592')
      context.textAlign = 'center'
      context.fillStyle = '#684833'
      context.font = 'bold 18px Georgia, "Times New Roman", serif'
      context.fillText('This chapter is waiting to bloom', SCROLL_VIEW.x + SCROLL_VIEW.width / 2, SCROLL_VIEW.y + 233)
      context.fillStyle = '#8a6749'
      context.font = 'italic 13px Georgia, "Times New Roman", serif'
      context.fillText('Plant notes will appear as the garden grows.', SCROLL_VIEW.x + SCROLL_VIEW.width / 2, SCROLL_VIEW.y + 257)
      context.restore()
      return
    }

    for (const [index, entry] of entries.entries()) {
      const row = listRow(index, false)
      context.save()
      const paleAnimal = category === 'animals' && (entry.color === '#fff0d0' || entry.color === '#fff2df')
      context.fillStyle = entry.color
      context.beginPath()
      context.arc(row.x + 24, row.y + row.height / 2, 15, 0, Math.PI * 2)
      context.fill()
      if (paleAnimal) {
        context.strokeStyle = 'rgba(112, 81, 54, .48)'
        context.lineWidth = 1
        context.stroke()
      }
      if (category === 'animals') drawPaw(context, row.x + 24, row.y + row.height / 2, 18, paleAnimal ? '#8b7158' : '#fff2dd')
      else if (category === 'tools') drawToolIcon(context, row.x + 24, row.y + row.height / 2, 28)
      else drawLeaf(context, row.x + 24, row.y + row.height / 2 + 1, 23, '#f4e6c9')
      context.textAlign = 'left'
      context.fillStyle = '#563e2e'
      context.font = 'bold 16px Georgia, "Times New Roman", serif'
      context.fillText(entry.name, row.x + 52, row.y + 22)
      context.fillStyle = '#8d694a'
      context.font = '11px Georgia, "Times New Roman", serif'
      context.fillText(entry.subtitle, row.x + 53, row.y + 38)
      context.textAlign = 'right'
      context.fillStyle = '#a17a54'
      context.font = '19px Georgia, "Times New Roman", serif'
      context.fillText('›', row.x + row.width - 5, row.y + 31)
      context.strokeStyle = 'rgba(146, 101, 65, .26)'
      context.lineWidth = 0.65
      context.beginPath()
      context.moveTo(row.x + 52, row.y + row.height - 1)
      context.lineTo(row.x + row.width - 4, row.y + row.height - 1)
      context.stroke()
      context.restore()
    }
  }

  function drawSprite(entry: JournalEntry, x: number, y: number, width: number, height: number): void {
    context.save()
    roundRect(context, x, y, width, height, 8)
    const paper = context.createLinearGradient(x, y, x + width, y + height)
    paper.addColorStop(0, '#f8efd9')
    paper.addColorStop(1, '#e8d7b6')
    context.fillStyle = paper
    context.fill()
    context.strokeStyle = 'rgba(131, 89, 57, .48)'
    context.lineWidth = 1
    context.stroke()
    roundRect(context, x + 5, y + 5, width - 10, height - 10, 5)
    context.strokeStyle = 'rgba(164, 128, 86, .3)'
    context.lineWidth = 0.75
    context.stroke()

    const sprite = animalSprites.get(entry.id as BalloonAnimalId)
    if (sprite?.image) {
      const source = sprite.image as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }
      const sourceWidth = source.naturalWidth ?? source.width ?? 0
      const sourceHeight = source.naturalHeight ?? source.height ?? 0
      if (sourceWidth > 0 && sourceHeight > 0) {
        const inset = { x: x + 10, y: y + 9, width: width - 20, height: height - 18 }
        const scale = Math.min(inset.width / sourceWidth, inset.height / sourceHeight)
        const drawWidth = sourceWidth * scale
        const drawHeight = sourceHeight * scale
        context.drawImage(source, inset.x + (inset.width - drawWidth) / 2, inset.y + (inset.height - drawHeight) / 2, drawWidth, drawHeight)
      }
    } else {
      drawPaw(context, x + width / 2, y + height / 2 - 9, 62, entry.color)
      context.textAlign = 'center'
      context.fillStyle = '#8a6749'
      context.font = 'italic 12px Georgia, "Times New Roman", serif'
      context.fillText(loadingSprites.has(entry.id as BalloonAnimalId) ? 'Finding this field snapshot…' : 'A little field snapshot is on its way', x + width / 2, y + height - 14)
    }
    context.restore()
  }

  function drawToolPlate(entry: JournalEntry, x: number, y: number, width: number, height: number): void {
    context.save()
    roundRect(context, x, y, width, height, 8)
    context.fillStyle = '#eee0c1'
    context.fill()
    context.strokeStyle = 'rgba(131, 89, 57, .48)'
    context.lineWidth = 1
    context.stroke()
    context.fillStyle = '#e3d1ad'
    context.beginPath()
    context.arc(x + width / 2, y + height / 2, Math.min(74, height * 0.36), 0, Math.PI * 2)
    context.fill()
    if (category === 'tools') drawToolIcon(context, x + width / 2, y + height / 2, 100)
    else drawLeaf(context, x + width / 2, y + height / 2, 92, entry.color)
    context.textAlign = 'center'
    context.fillStyle = '#826044'
    context.font = 'italic 12px Georgia, "Times New Roman", serif'
    context.fillText(category === 'tools' ? 'A handy little garden helper' : 'A green thing for another day', x + width / 2, y + height - 13)
    context.restore()
  }

  function drawEntryPage(entry: JournalEntry): void {
    if (!category) return
    const imageBox = { x: SCROLL_VIEW.x + 10, y: SCROLL_VIEW.y + 8, width: SCROLL_VIEW.width - 32, height: 218 }
    if (entry.spriteUrl && category === 'animals') drawSprite(entry, imageBox.x, imageBox.y, imageBox.width, imageBox.height)
    else drawToolPlate(entry, imageBox.x, imageBox.y, imageBox.width, imageBox.height)

    context.save()
    context.textAlign = 'left'
    context.fillStyle = '#9a704a'
    context.font = '700 8px Georgia, "Times New Roman", serif'
    context.letterSpacing = '1.35px'
    let y = imageBox.y + imageBox.height + 18
    context.fillText(category === 'animals' ? 'A FRIEND FROM THE FAIRGROUND' : 'FROM THE GARDEN SHED', imageBox.x + 3, y)
    y += 44
    context.fillStyle = '#543c2d'
    context.font = '40px Georgia, "Times New Roman", serif'
    context.fillText(entry.name, imageBox.x + 2, y)
    y += 25
    context.fillStyle = '#875f42'
    context.font = 'italic 15px Georgia, "Times New Roman", serif'
    context.fillText(entry.subtitle, imageBox.x + 3, y)
    y += 17
    context.strokeStyle = 'rgba(148, 102, 66, .42)'
    context.lineWidth = 0.8
    context.beginPath()
    context.moveTo(imageBox.x + 2, y)
    context.lineTo(imageBox.x + imageBox.width - 2, y)
    context.stroke()

    y += 27
    context.fillStyle = '#a1744c'
    context.font = '700 8px Georgia, "Times New Roman", serif'
    context.letterSpacing = '1.25px'
    context.fillText('FIRST IMPRESSION', imageBox.x + 3, y)
    y += 27
    context.fillStyle = '#604732'
    context.font = '15px Georgia, "Times New Roman", serif'
    context.letterSpacing = '0px'
    y = wrapText(context, entry.description, imageBox.x + 3, y, imageBox.width - 14, 22)

    y += 13
    context.fillStyle = '#a1744c'
    context.font = '700 8px Georgia, "Times New Roman", serif'
    context.letterSpacing = '1.25px'
    context.fillText(category === 'animals' ? 'A NOTE FROM THE FIELD' : 'A NOTE FROM THE SHED', imageBox.x + 3, y)
    y += 26
    context.fillStyle = '#604732'
    context.font = '15px Georgia, "Times New Roman", serif'
    context.letterSpacing = '0px'
    y = wrapText(context, entry.note, imageBox.x + 3, y, imageBox.width - 14, 22)

    if (entry.gesture && category === 'animals') {
      y += 13
      context.fillStyle = '#a1744c'
      context.font = '700 8px Georgia, "Times New Roman", serif'
      context.letterSpacing = '1.25px'
      context.fillText('A CARNIVAL MOMENT', imageBox.x + 3, y)
      y += 26
      context.fillStyle = '#604732'
      context.font = 'italic 15px Georgia, "Times New Roman", serif'
      context.letterSpacing = '0px'
      y = wrapText(context, entry.gesture, imageBox.x + 3, y, imageBox.width - 14, 22)
    }

    y += 25
    context.strokeStyle = 'rgba(148, 102, 66, .3)'
    context.lineWidth = 0.7
    context.beginPath()
    context.moveTo(imageBox.x + 2, y)
    context.lineTo(imageBox.x + imageBox.width - 2, y)
    context.stroke()
    context.textAlign = 'right'
    context.fillStyle = '#92704f'
    context.font = 'italic 12px Georgia, "Times New Roman", serif'
    context.fillText('FIELD NOTES  ·  ' + pageNumber(), imageBox.x + imageBox.width - 2, y + 21)
    context.restore()
  }

  function loadSprite(entry: JournalEntry): void {
    if (!entry.spriteUrl || category !== 'animals' || disposed) return
    const id = entry.id as BalloonAnimalId
    if (animalSprites.has(id) || loadingSprites.has(id)) return
    loadingSprites.add(id)
    textureLoader.load(entry.spriteUrl, (loadedTexture) => {
      if (disposed) {
        loadedTexture.dispose()
        return
      }
      loadedTexture.colorSpace = THREE.SRGBColorSpace
      loadedTexture.anisotropy = 4
      animalSprites.set(id, loadedTexture)
      loadingSprites.delete(id)
      renderPage()
    }, undefined, () => {
      loadingSprites.delete(id)
      if (!disposed) renderPage()
    })
  }

  function renderPage(): void {
    context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT)
    book.visible = !isOpen
    if (!isOpen) {
      texture.needsUpdate = true
      return
    }

    pageContentHeight = contentHeight()
    scrollOffset = THREE.MathUtils.clamp(scrollOffset, 0, maxScroll())
    drawPanelFrame()
    drawHeader()
    context.save()
    context.beginPath()
    context.rect(SCROLL_VIEW.x, SCROLL_VIEW.y, SCROLL_VIEW.width, SCROLL_VIEW.height)
    context.clip()
    context.save()
    context.translate(0, -scrollOffset)
    if (selectedEntry) drawEntryPage(selectedEntry)
    else if (category) drawListPage()
    else drawHomePage()
    context.restore()
    context.restore()
    drawScrollBar()

    context.save()
    context.textAlign = 'left'
    context.fillStyle = '#94714f'
    context.font = 'italic 11px Georgia, "Times New Roman", serif'
    context.fillText('Small Farmer’s Journal', PANEL.x + 34, PANEL.y + PANEL.height - 17)
    context.textAlign = 'right'
    context.fillText(pageNumber(), PANEL.x + PANEL.width - 25, PANEL.y + PANEL.height - 17)
    context.restore()
    texture.needsUpdate = true
    if (selectedEntry) loadSprite(selectedEntry)
  }

  function resize(width: number, height: number): void {
    viewportWidth = width
    viewportHeight = height
    const widthScale = width / LOGICAL_WIDTH
    const heightScale = height / LOGICAL_HEIGHT
    const uniformBookScale = Math.min(widthScale, heightScale) * 1.05
    root.scale.set(widthScale, heightScale, 1)
    book.scale.set(uniformBookScale * heightScale / widthScale, uniformBookScale, uniformBookScale)
    root.position.set(0, 0, 0)
    camera.left = -width / 2
    camera.right = width / 2
    camera.top = height / 2
    camera.bottom = -height / 2
    camera.updateProjectionMatrix()
  }

  function closeJournal(): void {
    isOpen = false
    category = null
    selectedEntry = null
    scrollOffset = 0
    dragScrollPointer = null
    canvas.style.cursor = 'none'
    renderPage()
  }

  function toLogicalPoint(event: PointerEvent | WheelEvent, targetCanvas: HTMLCanvasElement): { readonly x: number; readonly y: number } | null {
    const bounds = targetCanvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return null
    return {
      x: (event.clientX - bounds.left) * LOGICAL_WIDTH / bounds.width,
      y: (event.clientY - bounds.top) * LOGICAL_HEIGHT / bounds.height,
    }
  }

  function setCategory(nextCategory: JournalCategory | null): void {
    category = nextCategory
    selectedEntry = null
    scrollOffset = 0
    renderPage()
  }

  function setEntry(entry: JournalEntry | null): void {
    selectedEntry = entry
    scrollOffset = 0
    renderPage()
  }

  function currentThumb(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null {
    if (maxScroll() <= 0) return null
    const height = Math.max(34, SCROLL_TRACK.height * SCROLL_VIEW.height / pageContentHeight)
    const travel = SCROLL_TRACK.height - height
    return {
      x: SCROLL_TRACK.x - 2,
      y: SCROLL_TRACK.y + (scrollOffset / maxScroll()) * travel,
      width: SCROLL_TRACK.width + 4,
      height,
    }
  }

  function pointerDown(event: PointerEvent, targetCanvas: HTMLCanvasElement): boolean {
    const point = toLogicalPoint(event, targetCanvas)
    if (!isOpen) {
      if (!point || event.button !== 0 || !contains(BOOK_BUTTON, point.x, point.y)) return false
      event.preventDefault()
      event.stopImmediatePropagation()
      isOpen = true
      category = null
      selectedEntry = null
      scrollOffset = 0
      targetCanvas.style.cursor = 'default'
      renderPage()
      return true
    }

    // Keep the visible farm interactive outside the panel; only the parchment
    // surface captures pointer input while the journal is open.
    if (!point || !contains(PANEL, point.x, point.y)) return false
    event.preventDefault()
    event.stopImmediatePropagation()

    const thumb = currentThumb()
    if (event.button === 0 && thumb && contains(thumb, point.x, point.y)) {
      dragScrollPointer = event.pointerId
      dragScrollGrabOffset = point.y - thumb.y
      if (event.isTrusted && targetCanvas.isConnected) targetCanvas.setPointerCapture(event.pointerId)
      renderPage()
      return true
    }
    if (event.button !== 0) return true
    if (contains(BUTTON_CLOSE, point.x, point.y)) {
      closeJournal()
      return true
    }
    if (category && contains(BUTTON_BACK, point.x, point.y)) {
      if (selectedEntry) setEntry(null)
      else setCategory(null)
      return true
    }
    if (!category) {
      const selectedCategory = HOME_CATEGORIES.find((id) => contains(homeRow(id), point.x, point.y))
      if (selectedCategory) setCategory(selectedCategory)
      return true
    }
    if (!selectedEntry) {
      const index = categoryEntries().findIndex((_, entryIndex) => contains(listRow(entryIndex), point.x, point.y))
      if (index >= 0) setEntry(categoryEntries()[index])
      return true
    }
    return true
  }

  function pointerMove(event: PointerEvent, targetCanvas: HTMLCanvasElement): boolean {
    const point = toLogicalPoint(event, targetCanvas)
    if (!point) return false
    if (!isOpen) {
      targetCanvas.style.cursor = contains(BOOK_BUTTON, point.x, point.y) ? 'pointer' : 'none'
      return false
    }

    if (dragScrollPointer === event.pointerId) {
      const thumb = currentThumb()
      if (thumb) {
        const travel = SCROLL_TRACK.height - thumb.height
        const scrollTravel = maxScroll()
        if (travel > 0) {
          const thumbTop = THREE.MathUtils.clamp(point.y - dragScrollGrabOffset, SCROLL_TRACK.y, SCROLL_TRACK.y + travel)
          scrollOffset = ((thumbTop - SCROLL_TRACK.y) / travel) * scrollTravel
          renderPage()
        }
      }
      targetCanvas.style.cursor = 'grabbing'
      return true
    }

    if (!contains(PANEL, point.x, point.y)) {
      targetCanvas.style.cursor = 'none'
      return false
    }
    const thumb = currentThumb()
    const backHit = Boolean(category && contains(BUTTON_BACK, point.x, point.y))
    const homeHit = !category && HOME_CATEGORIES.some((id) => contains(homeRow(id), point.x, point.y))
    const listHit = Boolean(category && !selectedEntry && categoryEntries().some((_, index) => contains(listRow(index), point.x, point.y)))
    targetCanvas.style.cursor = contains(BUTTON_CLOSE, point.x, point.y) || backHit || homeHit || listHit || Boolean(thumb && contains(thumb, point.x, point.y)) ? 'pointer' : 'default'
    return true
  }

  function handleWheel(event: WheelEvent, targetCanvas: HTMLCanvasElement): void {
    if (!isOpen) return
    const point = toLogicalPoint(event, targetCanvas)
    if (!point || !contains(PANEL, point.x, point.y)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!contains(SCROLL_VIEW, point.x, point.y) || maxScroll() <= 0) return
    scrollOffset = THREE.MathUtils.clamp(scrollOffset + event.deltaY * 0.72, 0, maxScroll())
    renderPage()
  }

  function handleCanvasPointerDown(event: PointerEvent): void {
    pointerDown(event, canvas)
  }

  function handleCanvasPointerUp(event: PointerEvent): void {
    if (dragScrollPointer !== event.pointerId) return
    dragScrollPointer = null
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    renderPage()
  }

  function handleCanvasWheel(event: WheelEvent): void {
    handleWheel(event, canvas)
  }

  function handleKeyDown(event: KeyboardEvent): boolean {
    if (!isOpen) {
      if (event.key.toLowerCase() !== 'j' || event.altKey || event.ctrlKey || event.metaKey) return false
      event.preventDefault()
      isOpen = true
      renderPage()
      return true
    }
    if (event.key !== 'Escape') return false
    event.preventDefault()
    if (selectedEntry) setEntry(null)
    else if (category) setCategory(null)
    else closeJournal()
    return true
  }

  resize(viewportWidth, viewportHeight)
  renderPage()
  // Register ahead of garden hit-testing so clicks on the launcher/page cannot
  // accidentally capture an animal or begin painting underneath the paper.
  canvas.addEventListener('pointerdown', handleCanvasPointerDown)
  canvas.addEventListener('pointerup', handleCanvasPointerUp)
  canvas.addEventListener('pointercancel', handleCanvasPointerUp)
  canvas.addEventListener('wheel', handleCanvasWheel, { passive: false })

  return {
    scene,
    camera,
    get isOpen(): boolean { return isOpen },
    resize,
    pointerDown,
    pointerMove,
    handleKeyDown,
    dispose(): void {
      disposed = true
      canvas.removeEventListener('pointerdown', handleCanvasPointerDown)
      canvas.removeEventListener('pointerup', handleCanvasPointerUp)
      canvas.removeEventListener('pointercancel', handleCanvasPointerUp)
      canvas.removeEventListener('wheel', handleCanvasWheel)
      animalSprites.forEach((sprite) => sprite.dispose())
      animalSprites.clear()
      page.geometry.dispose()
      texture.dispose()
      material.dispose()
      book.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose())
        else object.material.dispose()
      })
      const coverTexture = book.userData.coverTexture as THREE.Texture | undefined
      coverTexture?.dispose()
      scene.clear()
      canvas.style.cursor = ''
    },
  }
}
