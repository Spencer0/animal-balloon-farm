import './farms-panel.css'
import { formatPlayTime, formatSavedAgo, type SlotInfo } from '../game/save-game'

/**
 * The Farms screen: three save slots, each with Save, Load and New.
 *
 * Opened from the main menu, which is also the pause screen, so this is the one
 * place a farm is saved by hand, brought back, or started over. Anything that
 * throws a farm away asks first, inside the slot the player is already looking
 * at.
 *
 * It is a DOM overlay in the Farm Journal's visual language (see
 * `journal-dom.css`), like the shop and the shed. It owns no game state:
 * `FarmsHandlers` is how it reads the slots and asks for an action, and
 * `main.ts` does the saving and the reloading.
 */

export interface FarmsHandlers {
  slots(): readonly SlotInfo[]
  /** The slot the running farm autosaves into, or null when it has none yet. */
  activeSlot(): number | null
  /** False when the browser cannot store saves at all. */
  storageAvailable(): boolean
  /** True when the running farm has changes that no slot holds. */
  hasUnsavedWork(): boolean
  save(slot: number): { readonly ok: boolean; readonly message: string }
  load(slot: number): void
  startNew(slot: number): void
}

export interface FarmsPanel {
  readonly isOpen: boolean
  open(notice?: string): void
  close(): void
  dispose(): void
}

type ActionKind = 'save' | 'load' | 'new'

interface PendingConfirm {
  readonly slot: number
  readonly action: ActionKind
}

const FAILURE_COPY = {
  unreadable: 'This save could not be read.',
  'wrong-app': 'This is not a farm save.',
  'too-new': 'Saved by a newer version of the game.',
  malformed: 'This save is damaged.',
} as const

const ACTIONS: readonly { readonly action: ActionKind; readonly label: string }[] = [
  { action: 'save', label: 'Save here' },
  { action: 'load', label: 'Load' },
  { action: 'new', label: 'New farm' },
]

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function createFarmsPanel(handlers: FarmsHandlers, onToggle?: (isOpen: boolean) => void): FarmsPanel {
  let isOpen = false
  let slots: readonly SlotInfo[] = []
  let message: { readonly text: string; readonly good: boolean } | null = null
  let confirm: PendingConfirm | null = null

  const overlay = document.createElement('div')
  overlay.className = 'fm-overlay'
  overlay.hidden = true
  const backdrop = document.createElement('button')
  backdrop.className = 'fm-backdrop'
  backdrop.type = 'button'
  backdrop.setAttribute('aria-label', 'Close farms')
  const dialog = document.createElement('section')
  dialog.className = 'fm-dialog'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-label', 'Your farms')
  overlay.append(backdrop, dialog)
  document.body.append(overlay)

  const bookIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v13H4z M13 4h7v13h-7z" fill="#fffdf6" stroke="#6b4a33" stroke-width="1.8"/><path d="M11 4h2v13h-2z" fill="#c65a3a"/></svg>'

  function needsConfirm(slot: number, action: ActionKind): boolean {
    const info = slots.find((entry) => entry.slot === slot)
    const occupied = info !== undefined && info.status !== 'empty'
    if (action === 'save') return occupied && handlers.activeSlot() !== slot
    if (action === 'new') return occupied
    return handlers.hasUnsavedWork() && handlers.activeSlot() === null
  }

  function confirmCopy(pending: PendingConfirm): { readonly title: string; readonly body: string; readonly yes: string } {
    if (pending.action === 'save') {
      return { title: `Replace Farm ${pending.slot}?`, body: 'The farm saved here will be written over with the one you are playing.', yes: 'Replace it' }
    }
    if (pending.action === 'new') {
      return { title: `Start over in Farm ${pending.slot}?`, body: 'The farm saved here will be lost as soon as the new one saves.', yes: 'Start over' }
    }
    return { title: 'Leave this farm?', body: 'The farm you are playing has not been saved to a slot. Loading will lose it.', yes: 'Load anyway' }
  }

  function slotBody(info: SlotInfo, now: number): string {
    if (info.status === 'ok') {
      const { summary } = info
      const rows: readonly (readonly [string, string])[] = [
        ['Farmer level', String(summary.farmerLevel)],
        ['Coins', String(summary.coins)],
        ['Day', String(summary.day)],
        ['Residents', String(summary.residents)],
        ['Time played', formatPlayTime(summary.playSeconds)],
      ]
      return `<dl class="fm-stats">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`
        + `<p class="fm-saved">Saved ${formatSavedAgo(info.savedAt, now)}</p>`
    }
    if (info.status === 'damaged') return `<p class="fm-empty is-bad">${FAILURE_COPY[info.failure]}</p>`
    return '<p class="fm-empty">Nothing here yet. A fresh farm is waiting for its first seed.</p>'
  }

  function slotActions(info: SlotInfo): string {
    const storage = handlers.storageAvailable()
    return ACTIONS.map(({ action, label }) => {
      const disabled = !storage || (action === 'load' && info.status !== 'ok')
      const kind = action === 'save' ? 'is-primary' : action === 'new' ? 'is-danger' : ''
      return `<button type="button" class="fm-btn ${kind}" data-action="${action}" data-slot="${info.slot}"${disabled ? ' disabled' : ''}>${label}</button>`
    }).join('')
  }

  function render(): void {
    const now = Date.now()
    const active = handlers.activeSlot()
    const cards = [1, 2, 3].map((slot) => {
      const info: SlotInfo = slots.find((entry) => entry.slot === slot) ?? { slot, status: 'empty' }
      const asking = confirm?.slot === slot ? confirm : null
      const copy = asking ? confirmCopy(asking) : null
      const footer = copy
        ? `<div class="fm-confirm"><strong>${copy.title}</strong><p>${copy.body}</p>`
          + `<div class="fm-confirm-row"><button type="button" class="fm-btn is-danger" data-confirm="yes">${copy.yes}</button>`
          + '<button type="button" class="fm-btn" data-confirm="cancel">Keep it</button></div></div>'
        : `<div class="fm-actions">${slotActions(info)}</div>`
      return `<article class="fm-slot${active === slot ? ' is-active' : ''}" aria-label="Farm ${slot}">`
        + `<header class="fm-slot-head"><h3>Farm ${slot}</h3>${active === slot ? '<span class="fm-chip">Playing now</span>' : ''}</header>`
        + `${slotBody(info, now)}${footer}</article>`
    }).join('')
    const note = message
      ? `<p class="fm-note ${message.good ? 'is-good' : 'is-bad'}" role="status">${escapeHtml(message.text)}</p>`
      : `<p class="fm-note" role="status">${handlers.storageAvailable() ? 'Your farm saves itself as you play.' : 'This browser is not letting the game keep saves.'}</p>`
    dialog.innerHTML = `<header class="fm-header"><div class="fm-title">${bookIcon}<span>Your Farms</span></div>`
      + '<button type="button" class="fm-close" data-close aria-label="Close">×</button></header>'
      + `<div class="fm-body">${cards}</div><footer class="fm-footer">${note}</footer>`
  }

  function refresh(): void {
    slots = handlers.slots()
    render()
  }

  function setOpen(next: boolean): void {
    if (isOpen === next) return
    isOpen = next
    overlay.hidden = !next
    confirm = null
    if (next) refresh()
    onToggle?.(next)
  }

  function runAction(slot: number, action: ActionKind): void {
    if (action === 'save') {
      const result = handlers.save(slot)
      message = { text: result.message, good: result.ok }
      refresh()
    } else if (action === 'load') {
      handlers.load(slot)
    } else {
      handlers.startNew(slot)
    }
  }

  overlay.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    const button = target?.closest<HTMLElement>('button')
    if (!button) return
    if (button === backdrop || button.hasAttribute('data-close')) {
      setOpen(false)
      return
    }
    const answer = button.dataset.confirm
    if (answer) {
      const pending = confirm
      confirm = null
      if (answer === 'yes' && pending) runAction(pending.slot, pending.action)
      else render()
      return
    }
    const action = button.dataset.action as ActionKind | undefined
    const slot = Number(button.dataset.slot)
    if (!action || !Number.isInteger(slot)) return
    if (needsConfirm(slot, action)) {
      confirm = { slot, action }
      message = null
      render()
    } else {
      runAction(slot, action)
    }
  })

  // While the screen is up it owns the keyboard: Escape backs out one step, and
  // nothing leaks through to the menu signs or the farm underneath.
  function onKeyDown(event: KeyboardEvent): void {
    if (!isOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      if (confirm) {
        confirm = null
        render()
      } else {
        setOpen(false)
      }
    } else if (event.key !== 'Tab') {
      event.preventDefault()
    }
    event.stopPropagation()
  }
  window.addEventListener('keydown', onKeyDown, true)

  return {
    get isOpen() { return isOpen },
    open(notice?: string): void {
      message = notice ? { text: notice, good: false } : null
      if (isOpen) refresh()
      else setOpen(true)
    },
    close(): void {
      setOpen(false)
    },
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
    },
  }
}
