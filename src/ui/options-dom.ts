import "./journal-dom.css";
import "./options-dom.css";
import type { GameSettings } from "../game/settings";

/**
 * Options screen, on the journal's chrome (fj-overlay, fj-journal, fj-header,
 * fj-title, fj-close, fj-body from journal-dom.css). Settings live in
 * `game/settings.ts`; this panel only reads and writes them.
 */

export interface OptionsDomCallbacks {
  onClose: () => void;
  settings: () => GameSettings;
  onChange: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
}

export interface OptionsDomPanel {
  readonly isOpen: boolean;
  setOpen(open: boolean): void;
  /** Re-read the settings, e.g. after one changed from somewhere else. */
  refresh(): void;
  dispose(): void;
}

interface ToggleOption {
  readonly key: keyof GameSettings;
  readonly label: string;
  readonly hint: string;
}

const TOGGLES: readonly ToggleOption[] = [
  { key: "showFps", label: "Show FPS", hint: "A frame-rate counter in the corner, so you can see when the game lags." },
];

export function createOptionsDomPanel(callbacks: OptionsDomCallbacks): OptionsDomPanel {
  let open = false;

  const overlay = document.createElement("div");
  overlay.className = "fj-overlay";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.className = "fj-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close options");
  backdrop.addEventListener("click", () => callbacks.onClose());

  const dialog = document.createElement("section");
  dialog.className = "fj-journal op-journal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Options");

  overlay.append(backdrop, dialog);
  document.body.append(overlay);

  function render(): void {
    const settings = callbacks.settings();
    const rows = TOGGLES.map((toggle) => {
      const on = settings[toggle.key] === true;
      return `<div class="op-row">` +
        `<div class="op-text"><div class="op-label" id="op-${toggle.key}">${toggle.label}</div><div class="op-hint">${toggle.hint}</div></div>` +
        `<button type="button" class="op-switch" role="switch" data-toggle="${toggle.key}" aria-checked="${on}" aria-labelledby="op-${toggle.key}"><span class="op-knob"></span></button>` +
        `</div>`;
    }).join("");
    dialog.innerHTML =
      `<header class="fj-header">` +
      `<div class="fj-title">Options</div>` +
      `<button type="button" class="fj-close" data-action="close" aria-label="Close options">&times;</button>` +
      `</header>` +
      `<div class="fj-body"><div class="op-list">${rows}</div></div>`;
  }

  dialog.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-toggle],[data-action]") : null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset["action"] === "close") {
      callbacks.onClose();
      return;
    }
    const key = target.dataset["toggle"] as keyof GameSettings | undefined;
    if (!key) return;
    callbacks.onChange(key, (callbacks.settings()[key] !== true) as GameSettings[typeof key]);
    render();
    dialog.querySelector<HTMLElement>(`[data-toggle="${key}"]`)?.focus({ preventScroll: true });
  });

  /**
   * While the screen is open it owns the keyboard: Escape closes it and no
   * other key reaches the menu underneath (its 1/2/3 hotkeys would otherwise
   * start the game from behind the dialog).
   */
  function onKeyDown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      callbacks.onClose();
    }
    event.stopImmediatePropagation();
  }
  window.addEventListener("keydown", onKeyDown, true);

  return {
    get isOpen() {
      return open;
    },
    setOpen(next: boolean): void {
      if (open === next && overlay.hidden === !next) return;
      open = next;
      overlay.hidden = !next;
      if (next) {
        render();
        dialog.querySelector<HTMLElement>(".op-switch")?.focus({ preventScroll: true });
      } else {
        const canvas = document.getElementById("game");
        if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
      }
    },
    refresh(): void {
      if (open) render();
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
    },
  };
}
