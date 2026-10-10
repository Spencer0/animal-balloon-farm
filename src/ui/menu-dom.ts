import "./journal-dom.css";
import "./menu-dom.css";

/**
 * The main menu, on the journal's chrome (fj-overlay, fj-journal, fj-header
 * from journal-dom.css), like Options, the shed, the shop and Farms. It used to
 * be three Three.js signposts on posts; it is now a plain card over the farm.
 * The farm keeps drifting behind it, and the backdrop is only a light wash so
 * the diorama still reads through.
 *
 * Hotkeys 1-3 pick a sign. The menu owns the keyboard only while it is the top
 * screen: Options and Farms sit above it and take the keys themselves.
 */

export type MenuChoice = 'enter' | 'farms' | 'options'

export interface MenuPanel {
  readonly isOpen: boolean
  open(): void
  close(): void
  dispose(): void
}

export interface MenuHandlers {
  onChoose: (choice: MenuChoice) => void
  /** False while another screen (Options, Farms) sits on top of the menu. */
  keysEnabled: () => boolean
  onToggle?: (isOpen: boolean) => void
}

interface MenuSign {
  readonly choice: MenuChoice
  readonly title: string
  readonly blurb: string
  readonly hotkey: string
  readonly accent: string
}

const SIGNS: readonly MenuSign[] = [
  {
    choice: 'enter', title: 'Enter', hotkey: '1', accent: '#7aa14f',
    blurb: 'Walk into the garden. Plant, sow and make a friend.',
  },
  {
    choice: 'farms', title: 'Farms', hotkey: '2', accent: '#c65a3a',
    blurb: 'Save this farm, bring another back, or start a fresh one.',
  },
  {
    choice: 'options', title: 'Options', hotkey: '3', accent: '#7f9fb8',
    blurb: 'Sound, controls and everything else.',
  },
]

export function createMenuDomPanel(handlers: MenuHandlers): MenuPanel {
  let open = false

  const overlay = document.createElement('div')
  overlay.className = 'fj-overlay mn-overlay'
  overlay.hidden = true

  // Not a button: the menu has no dismiss action, so a click on the backdrop
  // should do nothing rather than look clickable.
  const backdrop = document.createElement('div')
  backdrop.className = 'fj-backdrop mn-backdrop'

  const dialog = document.createElement('section')
  dialog.className = 'fj-journal mn-journal'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', 'Main menu')

  overlay.append(backdrop, dialog)
  document.body.append(overlay)

  const rows = SIGNS.map((sign) =>
    `<button type="button" class="mn-sign" data-choice="${sign.choice}" style="--mn-accent:${sign.accent}">` +
    `<span class="mn-key" aria-hidden="true">${sign.hotkey}</span>` +
    `<span class="mn-text"><span class="mn-name">${sign.title}</span><span class="mn-blurb">${sign.blurb}</span></span>` +
    `</button>`,
  ).join('')

  dialog.innerHTML =
    `<header class="fj-header mn-head">` +
    `<div class="mn-eyebrow">A carnival garden edition</div>` +
    `<h1 class="mn-title">Animal Balloon Farm</h1>` +
    `<div class="mn-tagline">plant, play, and make a friend</div>` +
    `</header>` +
    `<div class="mn-body">` +
    `<div class="mn-list">${rows}</div>` +
    `<div class="mn-hint">Press 1 to 3 to choose</div>` +
    `</div>`

  dialog.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-choice]') : null
    if (!(target instanceof HTMLElement)) return
    handlers.onChoose(target.dataset['choice'] as MenuChoice)
  })

  function onKeyDown(event: KeyboardEvent): void {
    if (!open || !handlers.keysEnabled()) return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const sign = SIGNS.find((entry) => entry.hotkey === event.key)
    if (!sign) return
    event.preventDefault()
    event.stopImmediatePropagation()
    handlers.onChoose(sign.choice)
  }
  window.addEventListener('keydown', onKeyDown, true)

  function setOpen(next: boolean): void {
    if (open === next && overlay.hidden === !next) return
    open = next
    overlay.hidden = !next
    if (next) {
      dialog.querySelector<HTMLElement>('.mn-sign')?.focus({ preventScroll: true })
    } else {
      const canvas = document.getElementById('game')
      if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true })
    }
    handlers.onToggle?.(next)
  }

  return {
    get isOpen() {
      return open
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
    },
  }
}
