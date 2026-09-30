import * as THREE from 'three'
import type { BalloonAnimalId } from '../animals/animal-catalog'
import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import { GARDEN_TOOLS } from '../scene/garden-tool-art'
import { createScrim, fitScrim, type UIPanel } from './ui-layer'
import { createUIViewport, fitAspectRect, rectContains, type DesignPoint, type DesignRect } from './ui-viewport'
import {
  createSurface,
  fillRoundRect,
  grain,
  roundRectPath,
  strokeRoundRect,
  UI_THEME,
  UI_TYPE,
  verticalGradient,
  withShadow,
  withTracking,
  wrapText,
} from './ui-theme'

/**
 * The Small Farmer's Journal.
 *
 * The art here is unchanged from the original journal and is still authored in a
 * fixed 1280x720 space. What changed is the plumbing: the spread is now an
 * aspect-locked 16:9 box fitted into the shared design space, and both the
 * parchment and the 3D leather launcher are placed and scaled by that one
 * uniform factor.
 *
 * Previously the launcher was scaled by `min(widthScale, heightScale)` while
 * the page was stretched by `(widthScale, heightScale)`, so the book drifted to
 * a different size and position than the page it opened, and the whole panel
 * was distorted on any window that was not exactly 16:9. One fit, one scale,
 * identical on every display.
 */

export type JournalCategory = 'animals' | 'tools' | 'plants'

const SPREAD_WIDTH = 1280
const SPREAD_HEIGHT = 720
const SPREAD_ASPECT = SPREAD_WIDTH / SPREAD_HEIGHT
/** Design-unit margin between the spread and the window edge. */
const SPREAD_MARGIN = 40

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

/**
 * What the journal needs to draw a species' four conditions.
 *
 * This is a structural copy of `RequirementStatus` from the progression model
 * rather than an import, so the journal keeps rendering the same way whether
 * or not the conditions system is wired in. The model owns the rules; this
 * only reads them.
 */
export interface JournalConditionRow {
  readonly stage: number
  readonly title: string
  /** False until the previous condition is reached. */
  readonly revealed: boolean
  readonly current: number | null
  readonly target: number | null
  readonly met: boolean
  readonly result: string
  /** Plain-language hint, e.g. "Wants 15 m² of tall grass". */
  readonly hint: string
  /** Habitat metric named beside the progress bar. */
  readonly metricLabel?: string
  /** A species this condition is waiting on, if it is a social one. */
  readonly waitingOn?: { readonly species: string; readonly name: string; readonly resident: boolean }
}

export interface JournalSpeciesConditions {
  readonly stage: number
  readonly rows: readonly JournalConditionRow[]
}

export interface JournalConditionSource {
  /** Current conditions for a species, or null if it is not in the world. */
  get(species: string): JournalSpeciesConditions | null
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

// Layout inside the 1280x720 spread, in spread-local pixels.
const PANEL = { x: 616, y: 108, width: 640, height: 504 }
/**
 * The left-hand page. The spread is a 16:9 book, so the text panel only ever
 * covered the right half and the left half showed the farm straight through the
 * scrim, which read as a card floating over the game rather than an open book.
 */
const LEAF = { x: 24, y: 108, width: 568, height: 504 }
/**
 * The header sits below the paper's top edge with room for the tallest cap
 * height. At `PANEL.y + 31` the 30px heading's caps started one pixel above the
 * paper, so the dark brown type disappeared into the leather and the title
 * looked sliced in half.
 */
const HEADER_TITLE_Y = PANEL.y + 48
const HEADER_EYEBROW_Y = PANEL.y + 68
const BUTTON_CLOSE = { x: 1208, y: 126, width: 32, height: 32 }
const BUTTON_BACK = { x: 638, y: 128, width: 116, height: 34 }
const SCROLL_VIEW = { x: 638, y: 190, width: 578, height: 374 }
const SCROLL_TRACK = { x: 1227, y: 197, width: 6, height: 358 }
const HOME_ROW_START_Y = SCROLL_VIEW.y + 112
const HOME_ROW_HEIGHT = 62
const HOME_ROW_GAP = 8
const LIST_ROW_START_Y = SCROLL_VIEW.y + 96
const LIST_ROW_HEIGHT = 48
const LIST_ROW_GAP = 7
const HOME_CATEGORIES: readonly JournalCategory[] = ['animals', 'tools', 'plants']

// The 3D launcher lives at spread-local (574, -280) with the page plane centred
// on the origin, i.e. drawing coordinate (1214, 640).
const BOOK_LOCAL = { x: 574, y: -280 }
const BOOK_SCALE = 1.05

export interface JournalPanel extends UIPanel {
  readonly isOpen: boolean
  /**
   * Live condition data for a species, supplied by main.ts. The journal stays
   * a renderer: it draws whatever the progression model says is currently
   * true, and re-renders when that changes so a progress bar is live while the
   * player is holding the seeder.
   */
  setConditionsSource(source: JournalConditionSource | null): void
  /**
   * Shows or hides the 3D launcher. The main menu calls this so the book does not
   * sit on top of the menu, and so its hit box goes with it.
   */
  setLauncherVisible(visible: boolean): void
  toggle(): void
  close(): void
  open(): void
  /** True while the journal owns the pointer, so the farm ignores input. */
  readonly blocksGarden: boolean
}

export function createJournalPanel(
  viewportWidth: number,
  viewportHeight: number,
  onToggle?: (isOpen: boolean) => void,
): JournalPanel {
  const viewport = createUIViewport()
  viewport.resize(viewportWidth, viewportHeight)

  const surface = createSurface(SPREAD_WIDTH, SPREAD_HEIGHT)
  const texture = new THREE.CanvasTexture(surface.canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const pageMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  })
  const page = new THREE.Mesh(new THREE.PlaneGeometry(SPREAD_WIDTH, SPREAD_HEIGHT), pageMaterial)
  page.name = 'Journal · parchment spread'
  page.renderOrder = 2

  const scrim = createScrim(0.42)
  scrim.renderOrder = 0

  const book = createAntiqueBook()
  book.renderOrder = 1

  const object = new THREE.Group()
  object.name = 'Journal panel'
  object.add(scrim, book, page)

  const animalSprites = new Map<BalloonAnimalId, THREE.Texture>()
  const loadingSprites = new Set<BalloonAnimalId>()
  const textureLoader = new THREE.TextureLoader()

  let spread: DesignRect = { x: 0, y: 0, width: 1, height: 1 }
  let spreadScale = 1
  let isOpen = false
  let launcherVisible = true
  let category: JournalCategory | null = null
  let selectedEntry: JournalEntry | null = null
  let scrollOffset = 0
  let pageContentHeight = SCROLL_VIEW.height
  let dragScrollPointer: number | null = null
  let dragScrollGrabOffset = 0
  let disposed = false
  let hoverClose = false
  /** Set by main.ts; null means the conditions system is not wired in. */
  let conditionsSource: JournalConditionSource | null = null
  /** Last-drawn signature, so live progress only repaints when it changes. */
  let lastConditionsSignature = ''
  /**
   * Where the last-drawn entry page actually ended, in spread-local pixels.
   *
   * A fixed height per page type is a guess, and the conditions checklist makes
   * the guess wrong: the old constant let the player scroll a third of a page
   * into blank paper. Measuring the real bottom and refining the scroll range
   * on the next frame is self-correcting and needs no duplicate layout math.
   */
  let measuredEntryBottom = 0
  let heightCorrectionUsed = false

  // ---------------------------------------------------------------- drawing --

  function maxScroll(): number {
    return Math.max(0, pageContentHeight - SCROLL_VIEW.height)
  }

  function contentHeight(): number {
    if (!category) return SCROLL_VIEW.height
    if (selectedEntry) return Math.max(SCROLL_VIEW.height, measuredEntryBottom || 700)
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

  function drawPanelFrame(context: CanvasRenderingContext2D): void {
    withShadow(context, 25, 10, () => {
      roundRectPath(context, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 14)
      context.fillStyle = UI_THEME.leather
      context.fill()
    })

    roundRectPath(context, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 14)
    context.fillStyle = verticalGradient(context, PANEL.x, PANEL.y, PANEL.height, [
      [0, '#754832'],
      [0.45, '#986345'],
      [1, '#68402d'],
    ])
    context.fill()
    strokeRoundRect(context, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 14, UI_THEME.gilt, 2)
    strokeRoundRect(context, PANEL.x + 5, PANEL.y + 5, PANEL.width - 10, PANEL.height - 10, 11, 'rgba(239, 211, 158, .58)', 0.8)

    const paperBox = { x: PANEL.x + 10, y: PANEL.y + 10, width: PANEL.width - 20, height: PANEL.height - 20 }
    roundRectPath(context, paperBox.x, paperBox.y, paperBox.width, paperBox.height, 8)
    context.fillStyle = verticalGradient(context, paperBox.x, paperBox.y, paperBox.height, [
      [0, '#f4e7c9'],
      [0.54, UI_THEME.paper],
      [1, UI_THEME.paperShade],
    ])
    context.fill()
    strokeRoundRect(context, paperBox.x, paperBox.y, paperBox.width, paperBox.height, 8, 'rgba(120, 79, 52, .66)', 1)
    grain(context, paperBox.x + 5, paperBox.y + 5, paperBox.width - 10, paperBox.height - 10, 1207)

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
  }

  /**
   * The facing page. Without it the spread is a text panel floating over a dimmed
   * farm; with it, the journal reads as an open book on the screen.
   */
  function drawLeafPage(context: CanvasRenderingContext2D): void {
    withShadow(context, 22, 9, () => {
      roundRectPath(context, LEAF.x, LEAF.y, LEAF.width, LEAF.height, 12)
      context.fillStyle = UI_THEME.leather
      context.fill()
    })
    roundRectPath(context, LEAF.x, LEAF.y, LEAF.width, LEAF.height, 12)
    context.fillStyle = verticalGradient(context, LEAF.x, LEAF.y, LEAF.height, [
      [0, '#6f452f'],
      [0.5, '#8d5c40'],
      [1, '#5f3b2a'],
    ])
    context.fill()
    strokeRoundRect(context, LEAF.x, LEAF.y, LEAF.width, LEAF.height, 12, 'rgba(196, 160, 95, .55)', 1.5)

    const paper = { x: LEAF.x + 9, y: LEAF.y + 9, width: LEAF.width - 18, height: LEAF.height - 18 }
    roundRectPath(context, paper.x, paper.y, paper.width, paper.height, 7)
    context.fillStyle = verticalGradient(context, paper.x, paper.y, paper.height, [
      [0, '#efe1c1'],
      [0.55, UI_THEME.paper],
      [1, UI_THEME.paperShade],
    ])
    context.fill()
    strokeRoundRect(context, paper.x, paper.y, paper.width, paper.height, 7, 'rgba(120, 79, 52, .5)', 1)
    grain(context, paper.x + 4, paper.y + 4, paper.width - 8, paper.height - 8, 5507)

    // A pressed sprig, because a blank facing page is just wasted paper.
    const sprigX = paper.x + paper.width / 2
    const sprigY = paper.y + paper.height * 0.29
    context.save()
    context.globalAlpha = 0.9
    drawFlower(context, sprigX, sprigY, 2.1, '#d99592')
    context.restore()
    context.save()
    context.globalAlpha = 0.5
    drawFlower(context, sprigX - 96, sprigY + 74, 1.25, '#cbb27a')
    drawFlower(context, sprigX + 104, sprigY + 92, 1.05, '#b9c48a')
    context.restore()

    // A quiet caption that follows whatever the right-hand page is showing.
    const caption = selectedEntry
      ? selectedEntry.name
      : category
        ? CATEGORY_COPY[category].title
        : 'A little guide'
    const sub = selectedEntry
      ? selectedEntry.subtitle
      : category
        ? CATEGORY_COPY[category].subtitle
        : 'to our garden'

    context.save()
    context.textAlign = 'center'
    context.textBaseline = 'alphabetic'
    context.fillStyle = '#5e402e'
    context.font = UI_TYPE.title
    const size = context.measureText(caption).width
    if (size > paper.width - 60) {
      const shrunk = Math.round(46 * (paper.width - 60) / size)
      context.font = `bold ${shrunk}px Georgia, "Times New Roman", serif`
    }
    context.fillText(caption, sprigX, paper.y + paper.height * 0.76)
    context.fillStyle = 'rgba(122, 88, 58, .78)'
    context.font = UI_TYPE.hint
    context.fillText(sub, sprigX, paper.y + paper.height * 0.83)
    context.strokeStyle = 'rgba(122, 88, 58, .35)'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(sprigX - 60, paper.y + paper.height * 0.875)
    context.lineTo(sprigX + 60, paper.y + paper.height * 0.875)
    context.stroke()
    context.fillStyle = 'rgba(122, 88, 58, .5)'
    context.font = UI_TYPE.eyebrow
    withTracking(context, 1.4, () => {
      context.fillText('KEPT BY THE FARMER', sprigX, paper.y + paper.height * 0.955)
    })
    context.restore()
  }

  function drawCloseButton(context: CanvasRenderingContext2D, hovered: boolean): void {
    const centerX = BUTTON_CLOSE.x + BUTTON_CLOSE.width / 2
    const centerY = BUTTON_CLOSE.y + BUTTON_CLOSE.height / 2
    context.save()
    context.beginPath()
    context.arc(centerX, centerY, 13, 0, Math.PI * 2)
    context.fillStyle = hovered ? 'rgba(196, 72, 60, .30)' : 'rgba(183, 140, 81, .22)'
    context.fill()
    context.strokeStyle = hovered ? 'rgba(150, 60, 46, .78)' : 'rgba(128, 75, 52, .52)'
    context.lineWidth = 1
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

  function drawBackButton(context: CanvasRenderingContext2D): void {
    context.save()
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillStyle = '#956744'
    context.font = 'italic 15px Georgia, "Times New Roman", serif'
    context.fillText('‹', BUTTON_BACK.x + 4, BUTTON_BACK.y + BUTTON_BACK.height / 2)
    context.fillStyle = '#80553b'
    context.font = '700 9px Georgia, "Times New Roman", serif'
    withTracking(context, 0.8, () => {
      context.fillText(selectedEntry ? 'CHAPTER' : 'JOURNAL', BUTTON_BACK.x + 20, BUTTON_BACK.y + BUTTON_BACK.height / 2 + 0.5)
    })
    context.restore()
  }

  function drawHeader(context: CanvasRenderingContext2D): void {
    context.save()
    context.textAlign = 'center'
    context.textBaseline = 'alphabetic'
    if (!category) {
      context.fillStyle = '#5e402e'
      context.font = UI_TYPE.heading
      context.fillText('Small Farmer’s Journal', PANEL.x + PANEL.width / 2, HEADER_TITLE_Y)
      context.fillStyle = '#9a704b'
      context.font = UI_TYPE.eyebrow
      withTracking(context, 1.45, () => {
        context.fillText('FIELD NOTES FROM A CARNIVAL GARDEN', PANEL.x + PANEL.width / 2, HEADER_EYEBROW_Y)
      })
    } else {
      const active = category
      context.fillStyle = '#a1744c'
      context.font = UI_TYPE.eyebrow
      withTracking(context, 1.45, () => {
        context.fillText(selectedEntry ? `${active.toUpperCase()}  ·  FIELD NOTE` : 'SMALL FARMER’S JOURNAL  ·  FIELD GUIDE', PANEL.x + PANEL.width / 2, PANEL.y + 20)
      })
      context.fillStyle = '#5e402e'
      context.font = UI_TYPE.heading
      context.fillText(selectedEntry ? 'A page from the farm' : CATEGORY_COPY[active].title, PANEL.x + PANEL.width / 2, PANEL.y + 43)
    }
    context.restore()
    if (category) drawBackButton(context)
    drawCloseButton(context, hoverClose)
  }

  function drawScrollBar(context: CanvasRenderingContext2D): void {
    const limit = maxScroll()
    if (limit <= 0) return
    const thumbHeight = Math.max(34, SCROLL_TRACK.height * SCROLL_VIEW.height / pageContentHeight)
    const travel = SCROLL_TRACK.height - thumbHeight
    const thumbY = SCROLL_TRACK.y + (scrollOffset / limit) * travel
    context.save()
    fillRoundRect(context, SCROLL_TRACK.x, SCROLL_TRACK.y, SCROLL_TRACK.width, SCROLL_TRACK.height, 3, 'rgba(126, 89, 58, .16)')
    fillRoundRect(context, SCROLL_TRACK.x - 1, thumbY, SCROLL_TRACK.width + 2, thumbHeight, 4, dragScrollPointer === null ? '#a57c53' : '#795239')
    strokeRoundRect(context, SCROLL_TRACK.x - 1, thumbY, SCROLL_TRACK.width + 2, thumbHeight, 4, 'rgba(248, 231, 197, .66)', 0.8)
    context.restore()
  }

  function drawHomePage(context: CanvasRenderingContext2D): void {
    context.save()
    context.textAlign = 'center'
    context.fillStyle = '#a1764e'
    context.font = UI_TYPE.eyebrow
    withTracking(context, 1.55, () => {
      context.fillText('A LITTLE GUIDE TO OUR GARDEN', PANEL.x + PANEL.width / 2, SCROLL_VIEW.y + 18)
    })
    context.fillStyle = '#59402f'
    context.font = 'italic 14px Georgia, "Times New Roman", serif'
    context.fillText('Turn to a chapter and meet the neighbors.', PANEL.x + PANEL.width / 2, SCROLL_VIEW.y + 42)
    context.restore()

    for (const [index, id] of HOME_CATEGORIES.entries()) {
      const row = homeRow(id)
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

  function homeRow(categoryId: JournalCategory) {
    const index = HOME_CATEGORIES.indexOf(categoryId)
    return { x: SCROLL_VIEW.x + 12, y: HOME_ROW_START_Y + index * (HOME_ROW_HEIGHT + HOME_ROW_GAP), width: SCROLL_VIEW.width - 30, height: HOME_ROW_HEIGHT }
  }

  function listRow(index: number, applyScroll = true) {
    return {
      x: SCROLL_VIEW.x + 8,
      y: LIST_ROW_START_Y + index * (LIST_ROW_HEIGHT + LIST_ROW_GAP) - (applyScroll ? scrollOffset : 0),
      width: SCROLL_VIEW.width - 30,
      height: LIST_ROW_HEIGHT,
    }
  }

  function drawListPage(context: CanvasRenderingContext2D): void {
    if (!category) return
    const active = category
    const copy = CATEGORY_COPY[active]
    context.save()
    context.textAlign = 'left'
    context.fillStyle = '#9b704a'
    context.font = UI_TYPE.eyebrow
    withTracking(context, 1.45, () => {
      context.fillText(`CHAPTER  ·  ${active.toUpperCase()}`, SCROLL_VIEW.x + 8, SCROLL_VIEW.y + 15)
    })
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

  function drawSprite(context: CanvasRenderingContext2D, entry: JournalEntry, x: number, y: number, width: number, height: number): void {
    context.save()
    roundRectPath(context, x, y, width, height, 8)
    context.fillStyle = verticalGradient(context, x, y, height, [[0, '#f8efd9'], [1, '#e8d7b6']])
    context.fill()
    strokeRoundRect(context, x, y, width, height, 8, 'rgba(131, 89, 57, .48)', 1)
    strokeRoundRect(context, x + 5, y + 5, width - 10, height - 10, 5, 'rgba(164, 128, 86, .3)', 0.75)

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

  function drawToolPlate(context: CanvasRenderingContext2D, entry: JournalEntry, x: number, y: number, width: number, height: number): void {
    context.save()
    roundRectPath(context, x, y, width, height, 8)
    context.fillStyle = '#eee0c1'
    context.fill()
    strokeRoundRect(context, x, y, width, height, 8, 'rgba(131, 89, 57, .48)', 1)
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

  function drawEntryPage(context: CanvasRenderingContext2D, entry: JournalEntry): void {
    if (!category) return
    const imageBox = { x: SCROLL_VIEW.x + 10, y: SCROLL_VIEW.y + 8, width: SCROLL_VIEW.width - 32, height: 218 }
    if (entry.spriteUrl && category === 'animals') drawSprite(context, entry, imageBox.x, imageBox.y, imageBox.width, imageBox.height)
    else drawToolPlate(context, entry, imageBox.x, imageBox.y, imageBox.width, imageBox.height)

    context.save()
    context.textAlign = 'left'
    context.fillStyle = '#9a704a'
    context.font = '700 8px Georgia, "Times New Roman", serif'
    let y = imageBox.y + imageBox.height + 18
    withTracking(context, 1.35, () => {
      context.fillText(category === 'animals' ? 'A FRIEND FROM THE FAIRGROUND' : 'FROM THE GARDEN SHED', imageBox.x + 3, y)
    })
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
    withTracking(context, 1.25, () => {
      context.fillText('FIRST IMPRESSION', imageBox.x + 3, y)
    })
    y += 27
    context.fillStyle = '#604732'
    context.font = '15px Georgia, "Times New Roman", serif'
    y = wrapText(context, entry.description, imageBox.x + 3, y, imageBox.width - 14, 22)

    y += 13
    context.fillStyle = '#a1744c'
    context.font = '700 8px Georgia, "Times New Roman", serif'
    withTracking(context, 1.25, () => {
      context.fillText(category === 'animals' ? 'A NOTE FROM THE FIELD' : 'A NOTE FROM THE SHED', imageBox.x + 3, y)
    })
    y += 26
    context.fillStyle = '#604732'
    context.font = '15px Georgia, "Times New Roman", serif'
    y = wrapText(context, entry.note, imageBox.x + 3, y, imageBox.width - 14, 22)

    if (entry.gesture && category === 'animals') {
      y += 13
      context.fillStyle = '#a1744c'
      context.font = '700 8px Georgia, "Times New Roman", serif'
      withTracking(context, 1.25, () => {
        context.fillText('A CARNIVAL MOMENT', imageBox.x + 3, y)
      })
      y += 26
      context.fillStyle = '#604732'
      context.font = 'italic 15px Georgia, "Times New Roman", serif'
      y = wrapText(context, entry.gesture, imageBox.x + 3, y, imageBox.width - 14, 22)
    }

    // The four conditions come last: they are the live part of the page, and
    // the field notes read better above them.
    if (category === 'animals' && conditionsSource?.get(entry.id)) {
      y += 22
      y = drawConditions(context, entry, y)
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
    // Record where the page really ended so the scroll range can be corrected.
    measuredEntryBottom = Math.max(measuredEntryBottom, y + 34)
  }

  /**
   * The four conditions, drawn as a checklist.
   *
   * Progressive disclosure is the whole point, so an unrevealed condition is
   * not drawn as a greyed-out line with its number attached: it is a sealed
   * line that says nothing. You are not told what a creature needs to stay
   * until it has already come in to look around, which is the rule SPEC 5.3
   * asks for and the thing the static record book got wrong.
   */
  function drawConditions(context: CanvasRenderingContext2D, entry: JournalEntry, top: number): number {
    const conditions = conditionsSource?.get(entry.id)
    if (!conditions) return top
    const left = imageLeft() + 3
    const width = imageWidth() - 14

    context.textAlign = 'left'
    context.fillStyle = '#a1744c'
    context.font = '700 8px Georgia, "Times New Roman", serif'
    withTracking(context, 1.25, () => {
      context.fillText('FOUR CONDITIONS', left, top)
    })
    let y = top + 24

    for (const row of conditions.rows) {
      const done = row.met && row.revealed
      if (!row.revealed) {
        // Sealed. No title, no number, nothing to read.
        context.strokeStyle = 'rgba(148, 102, 66, .3)'
        context.lineWidth = 0.8
        context.beginPath()
        context.moveTo(left, y + 4)
        context.lineTo(left + width, y + 4)
        context.stroke()
        context.fillStyle = '#b39a7d'
        context.font = 'italic 12px Georgia, "Times New Roman", serif'
        context.fillText('a condition not yet met', left, y)
        y += 22
        continue
      }

      drawPaw(context, left + 5, y - 4, 9, done ? '#c9552f' : '#cbb08d')
      context.fillStyle = done ? '#8a5a2b' : '#604732'
      context.font = `${done ? '700 ' : ''}14px Georgia, "Times New Roman", serif`
      context.fillText(row.title, left + 18, y)

      context.fillStyle = done ? '#7d6a52' : '#8a6b4e'
      context.font = '13px Georgia, "Times New Roman", serif'
      // wrapText returns the y of the line *after* the block it drew.
      y = wrapText(context, done ? row.result : row.hint, left + 18, y + 16, width - 24, 16) + 2

      // A live bar, but only where there is a number to fill. A social
      // condition has nothing to meter, so it gets a plain state line instead.
      if (row.target !== null && row.current !== null) {
        const barWidth = width - 24
        const ratio = Math.max(0, Math.min(1, row.current / Math.max(row.target, 0.0001)))
        context.fillStyle = 'rgba(140, 100, 66, .16)'
        context.fillRect(left + 18, y, barWidth, 6)
        context.fillStyle = done ? '#6f9d54' : '#c99a4e'
        context.fillRect(left + 18, y, barWidth * ratio, 6)
        context.strokeStyle = 'rgba(120, 84, 54, .34)'
        context.lineWidth = 0.6
        context.strokeRect(left + 18, y, barWidth, 6)
        context.fillStyle = '#8a6b4e'
        context.font = '12px Georgia, "Times New Roman", serif'
        context.fillText(`${row.metricLabel ?? 'Habitat'} · ${row.current.toFixed(1)} / ${row.target.toFixed(0)} m²`, left + 18, y + 17)
        y += 24
      } else if (row.waitingOn) {
        context.fillStyle = row.waitingOn.resident ? '#6f9d54' : '#a5713f'
        context.font = 'italic 12px Georgia, "Times New Roman", serif'
        context.fillText(
          row.waitingOn.resident ? `${row.waitingOn.name} lives here` : `no ${row.waitingOn.name} here yet`,
          left + 18,
          y + 14,
        )
        y += 22
      }
      y += 10
    }
    return y
  }

  /** Where the entry page's art column starts, shared by the two callers. */
  function imageLeft(): number {
    return SCROLL_VIEW.x + 10
  }

  function imageWidth(): number {
    return SCROLL_VIEW.width - 32
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

  // ----------------------------------------------------------------- layout --

  /** Positions the parchment, the scrim and the launcher from one fit. */
  /**
   * Repaint the open page if the conditions moved.
   *
   * The journal is a static canvas texture, so a progress bar that only updates
   * when the page is opened would show a stale number while the player sows
   * grass. A cheap signature check keeps this to one comparison per frame.
   */
  function refreshConditions(): void {
    if (!isOpen || !conditionsSource || !selectedEntry) return
    const conditions = conditionsSource.get(selectedEntry.id)
    if (!conditions) return
    const signature = conditions.rows
      .map((row) => `${row.stage}:${row.revealed ? 1 : 0}:${row.met ? 1 : 0}:${row.current ?? '-'}`)
      .join('|')
    if (signature === lastConditionsSignature) return
    lastConditionsSignature = signature
    renderPage()
  }

  function layout(): void {
    spread = fitAspectRect(viewport, SPREAD_ASPECT, SPREAD_MARGIN)
    spreadScale = spread.width / SPREAD_WIDTH
    page.scale.setScalar(spreadScale)
    page.position.set(0, 0, 2)
    book.scale.setScalar(BOOK_SCALE * spreadScale)
    book.position.set(BOOK_LOCAL.x * spreadScale, BOOK_LOCAL.y * spreadScale, 1)
    book.visible = !isOpen && launcherVisible
    fitScrim(scrim, viewport)
    scrim.visible = isOpen
  }

  function renderPage(): void {
    const context = surface.context
    context.clearRect(0, 0, SPREAD_WIDTH, SPREAD_HEIGHT)
    page.visible = isOpen
    if (!isOpen) {
      texture.needsUpdate = true
      return
    }

    const heightBefore = contentHeight()
    pageContentHeight = heightBefore
    scrollOffset = THREE.MathUtils.clamp(scrollOffset, 0, maxScroll())
    drawPanelFrame(context)
    drawLeafPage(context)
    drawHeader(context)
    context.save()
    context.beginPath()
    context.rect(SCROLL_VIEW.x, SCROLL_VIEW.y, SCROLL_VIEW.width, SCROLL_VIEW.height)
    context.clip()
    context.translate(0, -scrollOffset)
    if (selectedEntry) drawEntryPage(context, selectedEntry)
    else if (category) drawListPage(context)
    else drawHomePage(context)
    context.restore()
    drawScrollBar(context)

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

    // One correction pass: the checklist's height is only known after it has
    // been drawn, so re-render once with the real scroll range. Guarded so a
    // layout that oscillates cannot spin.
    if (selectedEntry && !heightCorrectionUsed && Math.abs(contentHeight() - heightBefore) > 1) {
      heightCorrectionUsed = true
      scrollOffset = THREE.MathUtils.clamp(scrollOffset, 0, maxScroll())
      renderPage()
    }
  }

  /** Design space -> spread-local drawing pixels. */
  function toSpreadPoint(point: DesignPoint): DesignPoint {
    return {
      x: (point.x - (spread.x + spread.width / 2)) / spreadScale + SPREAD_WIDTH / 2,
      y: (spread.y + spread.height / 2 - point.y) / spreadScale + SPREAD_HEIGHT / 2,
    }
  }

  function currentThumb(): DesignRect | null {
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

  function openJournal(): void {
    if (isOpen) return
    isOpen = true
    category = null
    selectedEntry = null
    scrollOffset = 0
    hoverClose = false
    layout()
    renderPage()
    onToggle?.(true)
  }

  function closeJournal(): void {
    if (!isOpen) return
    isOpen = false
    category = null
    selectedEntry = null
    scrollOffset = 0
    dragScrollPointer = null
    layout()
    renderPage()
    onToggle?.(false)
  }

  function setCategory(next: JournalCategory | null): void {
    category = next
    selectedEntry = null
    scrollOffset = 0
    renderPage()
  }

  function setEntry(entry: JournalEntry | null): void {
    selectedEntry = entry
    // A different page has a different height; re-measure it from scratch.
    measuredEntryBottom = 0
    heightCorrectionUsed = false
    scrollOffset = 0
    renderPage()
  }

  layout()
  renderPage()

  /** The launcher's hit box, derived from the book so the two can never drift. */
  function bookRect(): DesignRect {
    const centreX = spread.x + spread.width / 2 + BOOK_LOCAL.x * spreadScale
    const centreY = spread.y + spread.height / 2 + BOOK_LOCAL.y * spreadScale
    const halfWidth = 60 * BOOK_SCALE * spreadScale
    const halfHeight = 62 * BOOK_SCALE * spreadScale
    return { x: centreX - halfWidth, y: centreY - halfHeight, width: halfWidth * 2, height: halfHeight * 2 }
  }

  /** Samples the parchment for non-transparent pixels; used by the debug harness. */
  function countInk(): number {
    const data = surface.context.getImageData(0, 0, surface.canvas.width, surface.canvas.height).data
    let count = 0
    for (let index = 3; index < data.length; index += 4 * 97) {
      if (data[index] > 8) count += 1
    }
    return count
  }

  return {
    name: 'journal',
    object,
    order: 20,
    get isOpen(): boolean {
      return isOpen
    },
    setLauncherVisible(visible: boolean): void {
      if (launcherVisible === visible) return
      launcherVisible = visible
      layout()
    },
    setConditionsSource(source) {
      conditionsSource = source
      lastConditionsSignature = ''
      if (isOpen) renderPage()
    },
    get blocksGarden(): boolean {
      return isOpen
    },
    open: openJournal,
    close: closeJournal,
    toggle(): void {
      if (isOpen) closeJournal()
      else openJournal()
    },
    pointerDown(point: DesignPoint, event: PointerEvent): boolean {
      if (!isOpen) {
        if (event.button !== 0) return false
        if (!launcherVisible || !rectContains(bookRect(), point)) return false
        event.preventDefault()
        openJournal()
        return true
      }

      // The farm stays interactive outside the parchment, so only the paper
      // surface captures the pointer.
      const local = toSpreadPoint(point)
      if (!rectContains(PANEL, local)) return false
      event.preventDefault()

      const thumb = currentThumb()
      if (event.button === 0 && thumb && rectContains(thumb, local)) {
        dragScrollPointer = event.pointerId
        dragScrollGrabOffset = local.y - thumb.y
        renderPage()
        return true
      }
      if (event.button !== 0) return true
      if (rectContains(BUTTON_CLOSE, local)) {
        closeJournal()
        return true
      }
      if (category && rectContains(BUTTON_BACK, local)) {
        if (selectedEntry) setEntry(null)
        else setCategory(null)
        return true
      }
      if (!category) {
        const selected = HOME_CATEGORIES.find((id) => rectContains(homeRow(id), local))
        if (selected) setCategory(selected)
        return true
      }
      if (!selectedEntry) {
        const index = categoryEntries().findIndex((_, entryIndex) => rectContains(listRow(entryIndex), local))
        if (index >= 0) setEntry(categoryEntries()[index])
        return true
      }
      return true
    },
    pointerMove(point: DesignPoint, event: PointerEvent): boolean {
      if (!isOpen) return launcherVisible && rectContains(bookRect(), point)
      const local = toSpreadPoint(point)

      // Dragging the scrollbar thumb is the fast way through a long field note.
      if (dragScrollPointer === event.pointerId) {
        const thumb = currentThumb()
        if (thumb && maxScroll() > 0) {
          const travel = SCROLL_TRACK.height - thumb.height
          if (travel > 0) {
            const thumbTop = THREE.MathUtils.clamp(local.y - dragScrollGrabOffset, SCROLL_TRACK.y, SCROLL_TRACK.y + travel)
            scrollOffset = ((thumbTop - SCROLL_TRACK.y) / travel) * maxScroll()
            renderPage()
          }
        }
        return true
      }

      if (!rectContains(PANEL, local)) return false
      const nextHoverClose = rectContains(BUTTON_CLOSE, local)
      if (nextHoverClose !== hoverClose) {
        hoverClose = nextHoverClose
        renderPage()
      }
      return true
    },
    pointerUp(_point: DesignPoint, event: PointerEvent): boolean {
      if (dragScrollPointer !== event.pointerId) return false
      dragScrollPointer = null
      renderPage()
      return true
    },
    // The journal's scrollbar needs pointer capture so a drag that leaves the
    // paper keeps scrolling instead of snapping back.
    wheel(point: DesignPoint, event: WheelEvent): boolean {
      if (!isOpen) return false
      const local = toSpreadPoint(point)
      if (!rectContains(PANEL, local) || maxScroll() <= 0) return false
      event.preventDefault()
      if (!rectContains(SCROLL_VIEW, local)) return false
      scrollOffset = THREE.MathUtils.clamp(scrollOffset + event.deltaY * 0.72, 0, maxScroll())
      renderPage()
      return true
    },
    keyDown(event: KeyboardEvent): boolean {
      if (!isOpen) {
        if (event.key.toLowerCase() !== 'j' || event.altKey || event.ctrlKey || event.metaKey) return false
        event.preventDefault()
        openJournal()
        return true
      }
      if (event.key !== 'Escape') return false
      event.preventDefault()
      if (selectedEntry) setEntry(null)
      else if (category) setCategory(null)
      else closeJournal()
      return true
    },
    update(): void {
      // The journal is canvas-driven; the only thing to advance per frame is
      // the live conditions checklist.
      refreshConditions()
    },
    resize(cssWidth: number, cssHeight: number): void {
      viewport.resize(cssWidth, cssHeight)
      layout()
      renderPage()
    },
    describe() {
      const book = bookRect()
      return {
        isOpen,
        // A non-zero ink count proves the parchment actually drew, which geometry
        // numbers alone cannot: a blank texture would report a perfect layout.
        inkPixels: countInk(),
        // The spread is locked to 16:9, so its height/width ratio must stay
        // exactly 9/16 at every window size. That is the regression this
        // replaced: the old code stretched the panel to the window.
        spread: { ...spread, aspect: round(spread.width / spread.height) },
        spreadScale: round(spreadScale),
        book: { ...book, aspect: round(book.width / book.height) },
        bookCentreFraction: {
          x: round((book.x + book.width / 2) / viewport.width),
          y: round((book.y + book.height / 2) / viewport.height),
        },
        scrim: {
          visible: scrim.visible,
          width: scrim.scale.x,
          height: scrim.scale.y,
          opacity: (scrim.material as THREE.Material).opacity,
        },
        panelFraction: {
          width: round(PANEL.width / SPREAD_WIDTH),
          height: round(PANEL.height / SPREAD_HEIGHT),
        },
      }
    },
    dispose(): void {
      disposed = true
      animalSprites.forEach((sprite) => sprite.dispose())
      animalSprites.clear()
      page.geometry.dispose()
      texture.dispose()
      pageMaterial.dispose()
      scrim.geometry.dispose()
      ;(scrim.material as THREE.Material).dispose()
      book.traverse((item) => {
        if (!(item instanceof THREE.Mesh)) return
        item.geometry.dispose()
        const material = item.material
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
        else material.dispose()
      })
      const coverTexture = book.userData.coverTexture as THREE.Texture | undefined
      coverTexture?.dispose()
    },
  }
}

// ------------------------------------------------------------- journal icons --

/** Rounds for the debug layout report, so numbers are readable in a console. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

function drawPaw(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {  context.save()
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

// ------------------------------------------------------------- journal model --

function makeAntiqueCoverTexture(): THREE.CanvasTexture {
  const cover = createSurface(512, 640)
  const context = cover.context

  const leather = context.createLinearGradient(0, 0, 512, 640)
  leather.addColorStop(0, '#71432d')
  leather.addColorStop(0.46, '#986344')
  leather.addColorStop(1, UI_THEME.leatherDeep)
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
    context.fillRect(random() * 512, random() * 640, 1 + random() * 2.2, 0.5 + random() * 1.4)
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
  return new THREE.CanvasTexture(cover.canvas)
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
  book.add(pageBlock)
  const backCover = new THREE.Mesh(new THREE.BoxGeometry(88, 106, 2.8), leather)
  backCover.position.set(0, 0, -7.8)
  book.add(backCover)
  const frontCover = new THREE.Mesh(new THREE.BoxGeometry(88, 106, 2.8), wornLeather)
  frontCover.position.set(0, 0, 7.8)
  book.add(frontCover)
  const coverFace = new THREE.Mesh(new THREE.PlaneGeometry(82, 100), coverArt)
  coverFace.position.set(0, 0, 9.22)
  book.add(coverFace)

  const spine = new THREE.Mesh(new THREE.BoxGeometry(11, 106, 18), leather)
  spine.position.set(-41, 0, 0)
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

  book.userData.coverTexture = coverTexture
  return book
}

