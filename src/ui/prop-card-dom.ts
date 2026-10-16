import './journal-dom.css'
import './prop-card-dom.css'
import { armSellConfirm, cancelSellConfirm, createAnimalCardState, placeInfoCard, resetAnimalCardState } from '../game/animal-card'
import { HOUSE_GOODS_CAPACITY, type GoodId } from '../game/animal-diet'
import { propCardChip, type PropId } from '../game/farm-props'
import { goodsFill, goodsFull, goodsRows, goodsSignature, goodsTotal, goodsValue, type GoodsCounts } from '../game/house-goods'
import { createUIViewport, type DesignPoint } from './ui-viewport'

/**
 * The prop info card: a small pinned note beside a placed prop the player
 * clicked, with Move, Store and Sell. A house also shows who lives inside and
 * the goods waiting there, with a Collect button.
 *
 * A DOM card in the Farm Journal look (`prop-card-dom.css`), replacing the old
 * canvas card. It is pinned beside the prop with the same pure `placeInfoCard`
 * the animal card uses, so it prefers the right of the prop, flips left at the
 * screen edge and always stays on screen. The rules it shows live in
 * `farm-props.ts`, `animal-card.ts` and `house-goods.ts`; the scene work
 * (lifting, storing, selling, collecting) is done by the caller through
 * `PropCardActions`, so this file only draws and routes clicks.
 */

/** Who is inside a house, and what it is holding: shown in place of the blurb on a house's card. */
export interface PropResidents {
  readonly capacity: number
  readonly used: number
  /** One row per species the house takes in, e.g. "Cows" with 3 inside. */
  readonly rows: readonly { readonly name: string; readonly inside: number }[]
  /** Selling the house sells the animals inside it: how many, and for how much. */
  readonly saleCount: number
  readonly saleValue: number
  /** Goods waiting in the house, by kind. */
  readonly goods: GoodsCounts
  /** Coins per coin of value when collected: 2 with the Golden Pail treasure. Absent reads 1. */
  readonly goodsMultiplier?: number
  /** "Fed cows make milk here." for a house whose residents make goods; null when none do. */
  readonly makes: string | null
}

export interface PropCardTarget {
  readonly id: PropId
  readonly name: string
  readonly blurb: string
  readonly sections: number
  readonly salePrice: number
  /** Cell props can be lifted and set down elsewhere; a fence run cannot. */
  readonly movable: boolean
  readonly rotatable: boolean
  /** Set for an animal house. */
  readonly residents?: PropResidents | null
}

export interface PropCardActions {
  readonly onMove: () => void
  readonly onStore: () => void
  /** Second Sell press. Return false to refuse (the card stands the confirm down). */
  readonly onSell: () => boolean
  /** Empty the house's goods into the wallet. Returns the line to show ("Collected 3 milk · +6 coins"), or null if nothing was taken. */
  readonly onCollect: () => string | null
  readonly onToggle?: (isOpen: boolean) => void
}

export interface PropCardPanel {
  readonly isOpen: boolean
  /** `anchor` is the prop's position in CSS pixels (client space). */
  open(target: PropCardTarget, anchor?: { readonly x: number; readonly y: number }): void
  /** Refresh a house's residents and goods while its card is open. */
  setResidents(residents: PropResidents | null): void
  close(): void
  resize(cssWidth: number, cssHeight: number): void
  /** Whether a design-space point is over the card (the farm ignores clicks there). */
  hitTest(point: DesignPoint): boolean
  describe(): unknown
  dispose(): void
}

const CARD_WIDTH = 320
const NOTICE_SECONDS = 4

/** What shows in place of an icon whose image has not been rendered (or 404s). */
const GOOD_FALLBACK: Readonly<Record<GoodId, string>> = {
  milk: '\u{1F95B}',
  wool: '\u{1F9F6}',
  egg: '\u{1F95A}',
  'duck-egg': '\u{1FABA}',
  down: '\u{1FAB6}',
  truffle: '\u{1F344}',
  trinket: '✨',
  gem: '\u{1F48E}',
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function coinsPhrase(coins: number): string {
  return `${coins} ${coins === 1 ? 'coin' : 'coins'}`
}

export function createPropCardDom(actions: PropCardActions, cssWidth: number, cssHeight: number): PropCardPanel {
  const viewport = createUIViewport()
  viewport.resize(cssWidth, cssHeight)
  let screen = { width: cssWidth, height: cssHeight }

  const card = document.createElement('section')
  card.className = 'pc-card'
  card.hidden = true
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', 'Prop details')
  card.style.width = `${CARD_WIDTH}px`
  document.body.append(card)

  const state = createAnimalCardState()
  /**
   * A house with residents asks twice: the usual "Sure?", then a warning that
   * its animals are sold with it. True while that second warning is showing.
   */
  let residentWarning = false
  let target: PropCardTarget | null = null
  let anchor = { x: 0, y: 0 }
  let lastSignature = ''
  /** The line after a collect, shown for a few seconds. */
  let notice: { text: string; until: number } | null = null
  let noticeTimer = 0

  const pxPerDesignX = (): number => screen.width / viewport.width
  const pxPerDesignY = (): number => screen.height / viewport.height

  /** Pin beside the anchor with the shared pure placement, in design units, then back to pixels. */
  function place(): void {
    if (!target) return
    const rect = { width: card.offsetWidth, height: card.offsetHeight }
    const sx = pxPerDesignX()
    const sy = pxPerDesignY()
    const anchorDesign = { x: viewport.left + anchor.x / sx, y: viewport.top - anchor.y / sy }
    const placed = placeInfoCard(
      anchorDesign,
      { width: rect.width / sx, height: rect.height / sy },
      { left: viewport.left, right: viewport.right, top: viewport.top, bottom: viewport.bottom },
      20 / sx,
    )
    card.style.left = `${Math.round((placed.x - viewport.left) * sx - rect.width / 2)}px`
    card.style.top = `${Math.round((viewport.top - placed.y) * sy - rect.height / 2)}px`
  }

  function signature(): string {
    if (!target) return ''
    const residents = target.residents
    return [
      target.id, target.name, target.sections, target.salePrice, target.movable, target.rotatable,
      state.mode, residentWarning,
      residents ? `${residents.used}/${residents.capacity}|${residents.saleCount}|${residents.saleValue}|${residents.rows.map((row) => `${row.name}:${row.inside}`).join(',')}|${goodsSignature(residents.goods)}|${residents.makes ?? ''}` : '',
      notice?.text ?? '',
    ].join('~')
  }

  function residentsHtml(residents: PropResidents): string {
    const share = residents.capacity > 0 ? Math.min(1, residents.used / residents.capacity) : 0
    const rows = residents.rows.map((row) =>
      `<li class="pc-species"><span class="pc-species-name">${escapeHtml(row.name)}</span>` +
      `<span class="pc-species-count">${row.inside === 0 ? 'none inside' : `${row.inside} inside`}</span></li>`,
    ).join('')
    const hint = residents.used < residents.capacity
      ? 'Babies are born here while there is room.'
      : 'Full: build another to raise more young.'
    return `<div class="pc-block" data-block="residents">` +
      `<div class="pc-meter-row"><span class="pc-label">Inside ${residents.used} / ${residents.capacity}</span>` +
      `<span class="pc-meter" role="presentation"><span class="pc-meter-fill" style="width:${Math.round(share * 100)}%"></span></span></div>` +
      `<ul class="pc-species-list">${rows}</ul><p class="pc-note">${hint}</p></div>`
  }

  function goodsHtml(residents: PropResidents): string {
    const rows = goodsRows(residents.goods)
    const total = goodsTotal(residents.goods)
    // A house whose residents make nothing never shows the block.
    if (rows.length === 0 && !residents.makes) return ''
    const full = goodsFull(residents.goods)
    const value = goodsValue(residents.goods) * (residents.goodsMultiplier ?? 1)
    const meter = `<div class="pc-meter-row"><span class="pc-label">Stored goods</span>` +
      `<span class="pc-count${full ? ' is-full' : ''}">${total} / ${HOUSE_GOODS_CAPACITY}</span></div>` +
      `<span class="pc-meter pc-goods-meter${full ? ' is-full' : ''}" role="meter" aria-label="Stored goods" aria-valuemin="0" aria-valuemax="${HOUSE_GOODS_CAPACITY}" aria-valuenow="${total}">` +
      `<span class="pc-meter-fill" style="width:${Math.round(goodsFill(residents.goods) * 100)}%"></span></span>`
    if (rows.length === 0) {
      return `<div class="pc-block pc-goods" data-block="goods">${meter}<p class="pc-note">${escapeHtml(residents.makes ?? '')}</p></div>`
    }
    const chips = rows.map((row) =>
      `<li class="pc-good" title="${escapeHtml(row.name)}">` +
      `<span class="pc-good-icon" data-fallback="${escapeHtml(GOOD_FALLBACK[row.good])}"><img src="${escapeHtml(row.icon)}" alt="" width="28" height="28" draggable="false"></span>` +
      `<span class="pc-good-count">&times;${row.count}</span><span class="pc-good-name">${escapeHtml(row.name)}</span></li>`,
    ).join('')
    const collectLabel = value > 0 ? `Collect · +${value}` : 'Collect'
    return `<div class="pc-block pc-goods" data-block="goods">${meter}<ul class="pc-goods-list">${chips}</ul>` +
      (full ? `<p class="pc-note pc-warn">Full: new goods spoil into scraps</p>` : '') +
      `<div class="pc-collect-row"><span class="pc-worth">Worth ${coinsPhrase(value)}</span>` +
      `<button type="button" class="pc-button pc-collect" data-action="collect">${collectLabel}</button></div></div>`
  }

  function buttonsHtml(current: PropCardTarget): string {
    if (state.mode === 'confirm' && residentWarning) {
      const total = current.salePrice + (current.residents?.saleValue ?? 0)
      return `<button type="button" class="pc-button pc-sell pc-wide" data-action="confirm">Sell all · ${total}</button>` +
        `<button type="button" class="pc-button" data-action="keep">Keep</button>`
    }
    if (state.mode === 'confirm') {
      return `<button type="button" class="pc-button pc-sell pc-wide" data-action="confirm">Sure? Sell for ${current.salePrice}</button>` +
        `<button type="button" class="pc-button" data-action="keep">Keep</button>`
    }
    return (current.movable ? `<button type="button" class="pc-button pc-move" data-action="move">Move</button>` : '') +
      `<button type="button" class="pc-button pc-store" data-action="store">Store</button>` +
      `<button type="button" class="pc-button pc-sell" data-action="sell">Sell · ${current.salePrice}</button>`
  }

  function render(): void {
    if (!target) return
    const current = target
    let body: string
    if (residentWarning && current.residents) {
      const count = current.residents.saleCount
      body = `<p class="pc-warning">This will sell all ${count} ${count === 1 ? 'animal' : 'animals'} in the house, giving you an extra ${current.residents.saleValue} coins. Are you sure?</p>`
    } else if (current.residents) {
      body = residentsHtml(current.residents) + goodsHtml(current.residents)
    } else {
      body = `<p class="pc-blurb">${escapeHtml(current.blurb)}</p>` +
        (current.rotatable ? `<p class="pc-note">Press R while moving to turn it.</p>` : '')
    }
    const toast = notice ? `<p class="pc-toast" role="status">${escapeHtml(notice.text)}</p>` : ''
    card.innerHTML =
      `<header class="fj-header pc-header"><div class="fj-title pc-title"><span>${escapeHtml(current.name)}</span></div>` +
      `<button type="button" class="fj-close" data-action="close" aria-label="Close ${escapeHtml(current.name)} details">&times;</button></header>` +
      `<div class="pc-body"><span class="pc-chip">${escapeHtml(propCardChip(current.id, current.sections))}</span>${toast}${body}</div>` +
      `<footer class="pc-actions">${buttonsHtml(current)}</footer>`
    // An icon that has not been rendered (or fails to load) falls back to a glyph.
    for (const icon of card.querySelectorAll<HTMLElement>('.pc-good-icon')) {
      const image = icon.querySelector('img')
      const fallback = (): void => {
        icon.textContent = icon.dataset['fallback'] ?? '?'
        icon.classList.add('is-glyph')
      }
      image?.addEventListener('error', fallback, { once: true })
    }
    lastSignature = signature()
    place()
  }

  function refresh(): void {
    if (!target) return
    if (signature() === lastSignature) return
    render()
  }

  function expireNotice(): void {
    window.clearTimeout(noticeTimer)
    if (!notice) return
    const remaining = notice.until - performance.now()
    if (remaining <= 0) {
      notice = null
      refresh()
      return
    }
    noticeTimer = window.setTimeout(expireNotice, remaining)
  }

  function reset(): void {
    resetAnimalCardState(state)
    residentWarning = false
    notice = null
    window.clearTimeout(noticeTimer)
  }

  const panel: PropCardPanel = {
    get isOpen(): boolean {
      return target !== null
    },
    open(next, nextAnchor): void {
      anchor = nextAnchor ? { x: nextAnchor.x, y: nextAnchor.y } : { x: screen.width / 2, y: screen.height / 2 }
      const wasOpen = target !== null
      target = next
      reset()
      card.hidden = false
      render()
      if (!wasOpen) actions.onToggle?.(true)
    },
    setResidents(residents): void {
      if (!target) return
      if (JSON.stringify(residents ?? null) === JSON.stringify(target.residents ?? null)) return
      target = { ...target, residents }
      // A fresh stock means the old "Collected" line is stale only once it times out; keep it.
      refresh()
    },
    close(): void {
      if (!target) return
      target = null
      reset()
      lastSignature = ''
      card.hidden = true
      card.textContent = ''
      const canvas = document.getElementById('game')
      if (canvas instanceof HTMLElement && document.activeElement !== canvas) canvas.focus({ preventScroll: true })
      actions.onToggle?.(false)
    },
    resize(width, height): void {
      screen = { width, height }
      viewport.resize(width, height)
      place()
    },
    hitTest(point): boolean {
      if (!target) return false
      const rect = card.getBoundingClientRect()
      const x = (point.x - viewport.left) * pxPerDesignX()
      const y = (viewport.top - point.y) * pxPerDesignY()
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    },
    describe() {
      const rect = card.getBoundingClientRect()
      return {
        open: target !== null,
        id: target?.id ?? null,
        name: target?.name ?? null,
        mode: state.mode,
        residentWarning,
        goods: target?.residents ? goodsRows(target.residents.goods).map((row) => ({ good: row.good, count: row.count })) : null,
        notice: notice?.text ?? null,
        buttons: [...card.querySelectorAll<HTMLElement>('[data-action]')].map((button) => button.dataset['action']),
        card: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      }
    },
    dispose(): void {
      window.clearTimeout(noticeTimer)
      card.remove()
    },
  }

  card.addEventListener('click', (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-action]') : null
    if (!(button instanceof HTMLElement) || !target) return
    event.stopPropagation()
    const action = button.dataset['action']
    if (action === 'close') {
      panel.close()
    } else if (action === 'move') {
      panel.close()
      actions.onMove()
    } else if (action === 'store') {
      panel.close()
      actions.onStore()
    } else if (action === 'sell') {
      armSellConfirm(state)
      render()
    } else if (action === 'confirm') {
      if (!residentWarning && (target.residents?.saleCount ?? 0) > 0) {
        residentWarning = true
        render()
      } else if (actions.onSell()) {
        panel.close()
      } else {
        cancelSellConfirm(state)
        residentWarning = false
        render()
      }
    } else if (action === 'keep') {
      cancelSellConfirm(state)
      residentWarning = false
      render()
    } else if (action === 'collect') {
      const text = actions.onCollect()
      if (text) {
        notice = { text, until: performance.now() + NOTICE_SECONDS * 1000 }
        expireNotice()
      }
      // The house is empty now: draw it that way without waiting for the next refresh.
      if (target.residents) target = { ...target, residents: { ...target.residents, goods: {} } }
      render()
    }
  })

  // The card is a DOM layer above the canvas, so a click on it never reaches the farm; these keep drags and the wheel from leaking too.
  for (const type of ['pointerdown', 'pointerup', 'wheel', 'contextmenu'] as const) {
    card.addEventListener(type, (event) => event.stopPropagation())
  }

  return panel
}
