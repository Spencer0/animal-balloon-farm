import './animal-card-dom.css'
import {
  armSellConfirm,
  cancelSellConfirm,
  createAnimalCardState,
  heliumLevel,
  heliumStatus,
  hungerView,
  huntingStatus,
  isValidAnimalName,
  MAX_NAME_LENGTH,
  placeInfoCard,
  resetAnimalCardState,
  RESIDENT_STAGE,
  sanitizeAnimalName,
  stageChipLabel,
} from '../game/animal-card'
import type { HungerLevel } from '../game/animal-diet'

/**
 * The animal info card: a small pinned note beside the clicked balloon.
 *
 * A DOM panel in the Farm Journal look (see `animal-card-dom.css`), replacing
 * the old canvas card. The rules (resident sell gate, the Helium and Hunger
 * meters, the two-press confirm, rename limits, placement) live in the pure
 * `src/game/animal-card.ts` model; this file only draws them. The card is
 * pinned, not modal: it is a real DOM node above the canvas, so clicks on it
 * never reach the farm, and clicks anywhere else behave exactly as before.
 */

export interface AnimalCardTarget {
  readonly instanceId: string
  readonly speciesId: string
  readonly name: string
  /** e.g. "Balloon Cow". */
  readonly speciesLabel: string
  /** 1..4 on the condition ladder. */
  readonly stage: number
  readonly price: number
  /** Live `canSell` answer from the animal model. */
  readonly sellable: boolean
  /** Helium left, 0..1. Absent reads full. */
  readonly helium?: number
  /** How full its belly is, 0..1. Absent reads full. */
  readonly fullness?: number
  /** A predator that is out hunting rather than lazing about fed. */
  readonly hunting?: boolean
}

/** The live numbers on the card, refreshed from the sim tick while it is open. */
export interface AnimalCardVitals {
  readonly helium: number
  readonly fullness: number
  readonly hunger?: HungerLevel
  readonly hunting?: boolean
}

export interface AnimalSaleResult {
  readonly balance: number
  readonly price: number
}

export interface AnimalCardActions {
  /** Second Sell press. Return null to refuse (card stands the confirm down). */
  readonly onSell: (target: AnimalCardTarget) => AnimalSaleResult | null
  /** Journal button: main closes the card and deep-links the journal. */
  readonly onJournal: (speciesId: string) => void
  readonly onRename: (instanceId: string, name: string) => void
  readonly onToggle?: (isOpen: boolean) => void
}

/** A point in CSS pixels, y growing downward, measured from the window's top-left. */
export interface AnimalCardAnchor {
  readonly x: number
  readonly y: number
}

export interface AnimalCardPanel {
  readonly isOpen: boolean
  open(target: AnimalCardTarget, anchor?: AnimalCardAnchor): void
  close(): void
  setName(name: string): void
  /**
   * Keep the Helium and Hunger meters live while the card is open. Called from
   * the sim tick; it touches the DOM only when something visible changed.
   */
  setVitals(vitals: AnimalCardVitals): void
  /** Whether a client-space point (CSS px) is over the card. */
  hitTestClient(clientX: number, clientY: number): boolean
  resize(width: number, height: number): void
  describe(): unknown
  dispose(): void
}

const CARD_WIDTH = 400
const EDGE_MARGIN = 10

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(className: string, label: string): HTMLButtonElement {
  const node = element('button', className, label)
  node.type = 'button'
  // Keep keyboard focus (and an open rename) where it is while buttons are pressed.
  node.addEventListener('pointerdown', (event) => event.preventDefault())
  return node
}

export function createAnimalCard(actions: AnimalCardActions, cssWidth: number, cssHeight: number): AnimalCardPanel {
  let viewWidth = cssWidth
  let viewHeight = cssHeight

  const root = element('section', 'ac-card')
  root.hidden = true
  root.setAttribute('aria-label', 'Animal card')
  document.body.append(root)

  const state = createAnimalCardState()
  let target: AnimalCardTarget | null = null
  let anchor: AnimalCardAnchor = { x: viewWidth / 2, y: viewHeight / 2 }
  let editing = false
  let lastHeight = 0

  // Live nodes, rebuilt with the skeleton and then written to by `paintVitals`.
  let nameNode: HTMLElement | null = null
  let nameInput: HTMLInputElement | null = null
  let heliumStatusNode: HTMLElement | null = null
  let heliumFillNode: HTMLElement | null = null
  let hungerWordNode: HTMLElement | null = null
  let hungerFillNode: HTMLElement | null = null
  let hungerMeterNode: HTMLElement | null = null
  let hintNode: HTMLElement | null = null
  let huntNode: HTMLElement | null = null
  let actionsNode: HTMLElement | null = null

  // What was last written, so an unchanged tick costs nothing.
  let shown = { helium: -1, fullness: -1, hunting: false }

  // Pinned beside the balloon that was clicked: right side preferred, flipping
  // left at the screen edge, always fully on screen. Re-solved on every open,
  // resize and height change so a window drag cannot strand the card.
  function layout(): void {
    const width = root.offsetWidth || CARD_WIDTH
    const height = root.offsetHeight
    lastHeight = height
    // `placeInfoCard` works y-up, so flip the window's y-down pixels in and out.
    const placed = placeInfoCard(
      { x: anchor.x, y: -anchor.y },
      { width, height },
      { left: EDGE_MARGIN, right: viewWidth - EDGE_MARGIN, top: -EDGE_MARGIN, bottom: -(viewHeight - EDGE_MARGIN) },
    )
    root.style.left = `${Math.round(placed.x - width / 2)}px`
    root.style.top = `${Math.round(-placed.y - height / 2)}px`
  }

  function paintVitals(helium: number, fullness: number, hunting: boolean): void {
    const level = heliumLevel(helium)
    const hunger = hungerView(fullness)
    if (heliumFillNode && heliumStatusNode) {
      heliumFillNode.style.width = `${Math.round(level * 100)}%`
      heliumFillNode.dataset.low = level < 0.35 ? 'true' : 'false'
      heliumStatusNode.textContent = heliumStatus(level)
      heliumStatusNode.dataset.leaking = level < 1 ? 'true' : 'false'
    }
    if (hungerFillNode && hungerWordNode && hungerMeterNode) {
      hungerFillNode.style.width = `${Math.round(hunger.fill * 100)}%`
      hungerWordNode.textContent = hunger.label
      hungerMeterNode.dataset.tone = hunger.tone
    }
    if (hintNode) {
      hintNode.textContent = hunger.hint ?? ''
      hintNode.hidden = hunger.hint === null
      hintNode.dataset.tone = hunger.tone
    }
    if (huntNode) {
      huntNode.textContent = huntingStatus(hunting)
      huntNode.dataset.hunting = hunting ? 'true' : 'false'
    }
  }

  function meterRow(label: string, className: string): { wrap: HTMLElement; word: HTMLElement; fill: HTMLElement } {
    const wrap = element('div', `ac-meter ${className}`)
    const head = element('div', 'ac-meter-head')
    const word = element('span', 'ac-meter-word')
    head.append(element('span', 'ac-meter-label', label), word)
    const bar = element('div', 'ac-bar')
    const fill = element('div', 'ac-bar-fill')
    bar.append(fill)
    wrap.append(head, bar)
    return { wrap, word, fill }
  }

  function renderActions(current: AnimalCardTarget): void {
    if (!actionsNode) return
    actionsNode.replaceChildren()
    if (!current.sellable) {
      const note = element('p', 'ac-note', `Becomes sellable as a resident (Stage ${RESIDENT_STAGE}).`)
      const journal = button('ac-btn ac-btn-journal ac-btn-wide', 'Journal')
      journal.addEventListener('click', () => {
        stopEditing(false)
        actions.onJournal(current.speciesId)
      })
      actionsNode.append(note, journal)
      return
    }
    const row = element('div', 'ac-btn-row')
    if (state.mode === 'confirm') {
      const confirm = button('ac-btn ac-btn-sell ac-btn-grow', `Sure? Sell for ${current.price}`)
      confirm.addEventListener('click', () => {
        const result = actions.onSell(current)
        if (!result) {
          cancelSellConfirm(state)
          renderActions(current)
          settle()
        }
      })
      const keep = button('ac-btn ac-btn-keep', 'Keep')
      keep.addEventListener('click', () => {
        cancelSellConfirm(state)
        renderActions(current)
        settle()
      })
      row.append(confirm, keep)
    } else {
      const sell = button('ac-btn ac-btn-sell', `Sell · ${current.price}`)
      sell.addEventListener('click', () => {
        stopEditing(false)
        armSellConfirm(state)
        renderActions(current)
        settle()
      })
      const journal = button('ac-btn ac-btn-journal', 'Journal')
      journal.addEventListener('click', () => {
        stopEditing(false)
        actions.onJournal(current.speciesId)
      })
      row.append(sell, journal)
    }
    actionsNode.append(row)
  }

  /** Re-place the card only if its height changed (a hint or the confirm row came or went). */
  function settle(): void {
    if (root.offsetHeight !== lastHeight) layout()
  }

  function startEditing(current: AnimalCardTarget): void {
    if (!nameNode || !nameInput || editing) return
    editing = true
    nameInput.value = current.name
    nameNode.hidden = true
    nameInput.hidden = false
    root.dataset.editing = 'true'
    nameInput.focus()
    nameInput.select()
  }

  function stopEditing(commit: boolean): void {
    if (!editing || !nameNode || !nameInput || !target) return
    editing = false
    if (commit && isValidAnimalName(nameInput.value)) {
      const clean = sanitizeAnimalName(nameInput.value)
      actions.onRename(target.instanceId, clean)
      target = { ...target, name: clean }
      nameNode.textContent = clean
    }
    nameInput.hidden = true
    nameNode.hidden = false
    delete root.dataset.editing
    if (document.activeElement === nameInput) nameInput.blur()
  }

  function build(current: AnimalCardTarget): void {
    // Header: name (or the rename box), pencil, close.
    const header = element('header', 'ac-header')
    nameNode = element('h2', 'ac-name', current.name)
    nameNode.title = current.name
    nameInput = element('input', 'ac-name-input')
    nameInput.type = 'text'
    nameInput.maxLength = MAX_NAME_LENGTH
    nameInput.hidden = true
    nameInput.autocomplete = 'off'
    nameInput.spellcheck = false
    nameInput.setAttribute('aria-label', 'Animal name')
    // The same letters the canvas card let through; nothing else is typed.
    nameInput.addEventListener('input', () => {
      if (nameInput) nameInput.value = nameInput.value.replace(/[^A-Za-z'" \-]/g, '').slice(0, MAX_NAME_LENGTH)
    })
    // Typing a name must never drive the farm (WASD pans, digits pick tools).
    nameInput.addEventListener('keydown', (event) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        stopEditing(true)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        stopEditing(false)
      }
    })
    nameInput.addEventListener('keyup', (event) => event.stopPropagation())
    nameInput.addEventListener('blur', () => stopEditing(false))
    const pencil = button('ac-icon-btn ac-pencil', '✏️')
    pencil.title = 'Rename'
    pencil.setAttribute('aria-label', 'Rename')
    pencil.addEventListener('click', () => {
      if (!target) return
      if (editing) stopEditing(true)
      else startEditing(target)
    })
    const close = button('ac-icon-btn ac-close', '✕')
    close.title = 'Close'
    close.setAttribute('aria-label', 'Close')
    close.addEventListener('click', () => panel.close())
    header.append(nameNode, nameInput, pencil, close)

    // Chips: species and stage.
    const chips = element('div', 'ac-chips')
    chips.append(
      element('span', 'ac-chip ac-chip-species', current.speciesLabel),
      element('span', 'ac-chip ac-chip-stage', stageChipLabel(current.stage)),
    )

    // Meters.
    const body = element('div', 'ac-body')
    const helium = meterRow('Helium', 'ac-helium')
    heliumStatusNode = helium.word
    heliumFillNode = helium.fill
    const hunger = meterRow('Hunger', 'ac-hunger')
    hungerWordNode = hunger.word
    hungerFillNode = hunger.fill
    hungerMeterNode = hunger.wrap
    // What it eats, makes and who hunts it live in the journal (the Journal
    // button below opens its page); the card only shows how it is doing.
    hintNode = null
    huntNode = null
    body.append(helium.wrap, hunger.wrap)

    actionsNode = element('footer', 'ac-actions')
    root.replaceChildren(header, chips, body, actionsNode)
    renderActions(current)
  }

  const panel: AnimalCardPanel = {
    get isOpen(): boolean {
      return target !== null
    },
    open(next, nextAnchor) {
      editing = false
      delete root.dataset.editing
      anchor = nextAnchor ?? { x: viewWidth / 2, y: viewHeight / 2 }
      target = next
      resetAnimalCardState(state)
      build(next)
      shown = { helium: heliumLevel(next.helium), fullness: next.fullness ?? 1, hunting: next.hunting ?? false }
      paintVitals(shown.helium, shown.fullness, shown.hunting)
      root.hidden = false
      layout()
      actions.onToggle?.(true)
    },
    close() {
      if (!target) return
      editing = false
      target = null
      resetAnimalCardState(state)
      delete root.dataset.editing
      if (document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) document.activeElement.blur()
      root.hidden = true
      root.replaceChildren()
      nameNode = nameInput = heliumStatusNode = heliumFillNode = hungerWordNode = hungerFillNode = hungerMeterNode = hintNode = huntNode = actionsNode = null
      actions.onToggle?.(false)
    },
    setName(name) {
      if (!target) return
      target = { ...target, name }
      if (nameNode) {
        nameNode.textContent = name
        nameNode.title = name
      }
    },
    setVitals(vitals) {
      if (!target) return
      const helium = heliumLevel(vitals.helium)
      const fullness = Number.isFinite(vitals.fullness) ? Math.min(1, Math.max(0, vitals.fullness)) : 1
      const hunting = vitals.hunting ?? false
      // The DOM is written only when a visible number moved: a half percent of
      // helium, a percent of belly, a rung, or the hunting flag.
      if (
        Math.abs(helium - shown.helium) < 0.005
        && Math.abs(fullness - shown.fullness) < 0.01
        && hunting === shown.hunting
      ) return
      shown = { helium, fullness, hunting }
      target = { ...target, helium, fullness, hunting }
      paintVitals(helium, fullness, hunting)
      settle()
    },
    hitTestClient(clientX, clientY) {
      if (!target) return false
      const rect = root.getBoundingClientRect()
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    },
    resize(width, height) {
      viewWidth = width
      viewHeight = height
      if (target) layout()
    },
    describe() {
      const rect = root.getBoundingClientRect()
      const view = hungerView(target?.fullness ?? 1)
      return {
        open: target !== null,
        anchor,
        instanceId: target?.instanceId ?? null,
        speciesId: target?.speciesId ?? null,
        name: target?.name ?? null,
        stage: target?.stage ?? null,
        stageChip: target ? stageChipLabel(target.stage) : null,
        sellable: target?.sellable ?? null,
        sellVisible: target ? target.sellable && target.stage >= RESIDENT_STAGE : null,
        mode: state.mode,
        editing,
        helium: { level: heliumLevel(target?.helium), status: heliumStatus(target?.helium) },
        hunger: { fullness: view.fill, level: view.level, label: view.label, hint: view.hint, hunting: target?.hunting ?? null },
        card: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      }
    },
    dispose() {
      root.remove()
    },
  }
  return panel
}
