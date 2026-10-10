import './tool-tooltip-dom.css'
import { GARDEN_TOOLS, type GardenToolId } from '../scene/garden-tool-art'
import type { GrassPack } from '../game/tool-unlocks'

/**
 * The hover tooltip for the garden tool bar: the tool's name and key, what it
 * is for, and every control it answers to.
 *
 * It is a small DOM card in the same look as the Farm Journal and the Farm
 * post (see `tool-tooltip-dom.css`). The bar itself stays Three.js; it only
 * tells this card which tool is hovered and where the tool sits on screen.
 */

export interface ToolTooltipState {
  /** The tall pack is owned, so E has something to swap to. */
  readonly canSwapPack: boolean
  readonly pack: GrassPack
}

export interface ToolTooltipAnchor {
  /** CSS pixels: the horizontal centre of the hovered tool. */
  readonly centreX: number
  /** CSS pixels: the top edge of the hovered tool. */
  readonly top: number
}

export interface ToolTooltipDom {
  show(id: GardenToolId, anchor: ToolTooltipAnchor, state: ToolTooltipState): void
  hide(): void
  dispose(): void
}

interface ToolControl {
  readonly keys: string
  readonly action: string
}

const CARD_WIDTH = 320
const EDGE_MARGIN = 12
const GAP_ABOVE_TOOL = 22

/** What a player can do with each tool, in the order they will reach for it. */
function controlsFor(id: GardenToolId, hotkey: string, state: ToolTooltipState): ToolControl[] {
  const sizeRow: ToolControl = { keys: hotkey, action: 'Tap again to change the brush size' }
  if (id === 'grass') {
    return [
      { keys: 'Left-drag', action: 'Sow grass' },
      { keys: 'Right-drag', action: 'Trim the grass back' },
      sizeRow,
      // E only means something once Pip's tall pack is bought, so the row only
      // shows then, and says which way the next press swaps.
      ...(state.canSwapPack
        ? [{ keys: 'E', action: `Switch to ${state.pack === 'short' ? 'tall' : 'short'} grass` }]
        : []),
    ]
  }
  if (id === 'shovel') {
    return [{ keys: 'Click', action: 'Dig a hole, then plant right into it' }, sizeRow]
  }
  return [
    { keys: 'Hold left', action: 'Pour water' },
    { keys: 'Hold right', action: 'Drain water away' },
    sizeRow,
  ]
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function createToolTooltipDom(): ToolTooltipDom {
  const card = element('section', 'tt-card')
  card.hidden = true
  card.dataset.shown = 'false'
  card.setAttribute('role', 'tooltip')
  document.body.append(card)

  let hideTimer: number | undefined

  function render(id: GardenToolId, state: ToolTooltipState): void {
    const tool = GARDEN_TOOLS.find((item) => item.id === id)
    if (!tool) return

    const header = element('header', 'tt-header')
    header.append(element('span', 'tt-title', tool.label), element('span', 'tt-key', `key ${tool.hotkey}`))

    const body = element('div', 'tt-body')
    body.append(element('p', 'tt-desc', tool.description))

    if (id === 'grass') {
      // What the seeder is loaded with, or what the shop could still sell.
      const status = element('p', 'tt-status')
      if (state.canSwapPack) {
        status.dataset.tone = 'ready'
        status.textContent = state.pack === 'short' ? 'Sowing short grass, a tidy lawn' : 'Sowing tall grass, a wild meadow'
      } else {
        status.dataset.tone = 'locked'
        status.textContent = 'Pip’s shop sells a tall grass pack'
      }
      body.append(status)
    } else {
      body.append(element('p', 'tt-desc', tool.subtitle))
    }

    const list = element('ul', 'tt-controls')
    for (const control of controlsFor(id, tool.hotkey, state)) {
      const row = element('li', 'tt-control')
      row.append(element('kbd', 'tt-chip', control.keys), element('span', 'tt-action', control.action))
      list.append(row)
    }
    body.append(list)
    card.replaceChildren(header, body)
  }

  return {
    show(id, anchor, state): void {
      window.clearTimeout(hideTimer)
      render(id, state)
      card.hidden = false
      const left = Math.min(
        window.innerWidth - CARD_WIDTH - EDGE_MARGIN,
        Math.max(EDGE_MARGIN, anchor.centreX - CARD_WIDTH / 2),
      )
      card.style.left = `${Math.round(left)}px`
      // Anchored by its bottom edge so the card grows upward whatever its height.
      card.style.bottom = `${Math.round(window.innerHeight - anchor.top + GAP_ABOVE_TOOL)}px`
      card.dataset.shown = 'true'
    },
    hide(): void {
      card.dataset.shown = 'false'
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => { card.hidden = true }, 140)
    },
    dispose(): void {
      window.clearTimeout(hideTimer)
      card.remove()
    },
  }
}
