/**
 * One place decides what Escape means. Panels no longer listen for the key
 * themselves; they hand the router a layer that backs out of themselves, and
 * the router asks the layers top-first until one answers.
 *
 * Escape acts on key-up, never key-down: a held key auto-repeats its key-down,
 * and a repeat landing after a panel closed used to fall through and open the
 * main menu. The key-up only acts when it pairs with a key-down that reached the
 * router, so a press that something above already owned (a film skip, a minigame
 * forfeit, a name being typed) does nothing on release.
 */

/** Backs out of one thing. True when it did, so the router stops asking. */
export type EscapeLayer = () => boolean

export interface EscapeKeyEvent {
  readonly key: string
  readonly repeat?: boolean
  preventDefault(): void
}

export interface EscapeRouter {
  /** Feed every window key-down that reached the bubble phase. */
  keyDown(event: EscapeKeyEvent): void
  /** Feed every window key-up. */
  keyUp(event: EscapeKeyEvent): void
  /** Forget a half-finished press (window blur). */
  reset(): void
}

export function createEscapeRouter(layers: readonly EscapeLayer[]): EscapeRouter {
  let armed = false

  return {
    keyDown(event): void {
      if (event.key !== 'Escape') return
      // The browser's own Escape (leave fullscreen, stop a drag) is not wanted
      // while the game owns the key; the release is what the game answers.
      event.preventDefault()
      if (!event.repeat) armed = true
    },
    keyUp(event): void {
      if (event.key !== 'Escape' || !armed) return
      armed = false
      event.preventDefault()
      for (const layer of layers) {
        if (layer()) return
      }
    },
    reset(): void {
      armed = false
    },
  }
}

/** What the two menu layers read and drive. */
export interface MenuEscapeState {
  readonly isOpen: boolean
  /** False until the player has chosen something from the menu this session. */
  readonly dismissable: boolean
  open(): void
  dismiss(): void
}

/**
 * With the menu up, Escape belongs to it and to nothing underneath. Once the
 * player has chosen something it closes the menu; before that it is ignored, so a
 * fresh boot cannot skip past the menu (or the intro film behind "Enter").
 */
export function menuCloseLayer(menu: MenuEscapeState): EscapeLayer {
  return () => {
    if (!menu.isOpen) return false
    if (menu.dismissable) menu.dismiss()
    return true
  }
}

/** The bottom of the stack: nothing else was open, so Escape opens the menu. */
export function menuOpenLayer(menu: MenuEscapeState): EscapeLayer {
  return () => {
    if (menu.isOpen) return false
    menu.open()
    return true
  }
}
