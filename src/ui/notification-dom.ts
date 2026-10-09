import "./journal-dom.css";
import "./notification-dom.css";
import { relativeTimeLabel, type LedgerEntry } from "../game/notifications";

export interface NotificationDomPanel {
  readonly isOpen: boolean;
  setOpen(open: boolean, anchor?: { x: number; y: number }): void;
  refresh(letters: readonly LedgerEntry[], nowSeconds: number): void;
  dispose(): void;
}

const CARD_WIDTH = 320;

const DOT_COLORS: Readonly<Record<string, string>> = {
  resident: "#c65a3a",
  birth: "#c98f2e",
  plantGrown: "#5f8f4e",
  accomplishment: "#c98f2e",
  firstCarnival: "#6b4a33",
  firstFarm: "#6b4a33",
  firstResident: "#6b4a33",
  firstBirth: "#6b4a33",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createNotificationDomPanel(callbacks: { onClose: () => void }): NotificationDomPanel {
  let open = false;
  let lastSignature = "";
  let lastAnchor: { x: number; y: number } | undefined;
  let letters: readonly LedgerEntry[] = [];
  let nowSeconds = 0;

  const card = document.createElement("section");
  card.className = "nt-card";
  card.hidden = true;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Farm post");
  document.body.append(card);

  function signature(): string {
    return `${letters.map((entry) => `${entry.id}:${entry.state}`).join(",")}|${Math.floor(nowSeconds / 20)}`;
  }

  function render(): void {
    const rows = [...letters].reverse().map((entry) => {
      const age = relativeTimeLabel(Math.max(0, nowSeconds - entry.filedAt));
      const dot = DOT_COLORS[entry.kind] ?? "#8a6749";
      return `<li class="nt-row">` +
        `<span class="nt-dot" style="background:${dot}" aria-hidden="true"></span>` +
        `<span class="nt-text"><span class="nt-title">${escapeHtml(entry.title)}</span>` +
        `<span class="nt-detail">${escapeHtml(entry.detail)}</span></span>` +
        `<span class="nt-time">${escapeHtml(age)}</span></li>`;
    }).join("");
    const body = rows.length > 0
      ? `<ul class="nt-list">${rows}</ul>`
      : `<p class="nt-empty">Nothing yet -- mail arrives as the farm grows.</p>`;
    card.innerHTML =
      `<header class="fj-header nt-header">` +
      `<div class="fj-title nt-head-title"><span>Farm post</span></div>` +
      `<button type="button" class="fj-close" data-action="close" aria-label="Close farm post">&times;</button>` +
      `</header>` + body;
  }

  function place(): void {
    if (!lastAnchor) return;
    const width = Math.min(CARD_WIDTH, Math.max(200, window.innerWidth - 16));
    card.style.width = `${width}px`;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, lastAnchor.x - width / 2));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.max(8, Math.round(lastAnchor.y - card.offsetHeight - 14))}px`;
  }

  card.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-action]")
      : null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset["action"] === "close") callbacks.onClose();
  });

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      callbacks.onClose();
    }
  }

  const panel: NotificationDomPanel = {
    get isOpen() {
      return open;
    },
    setOpen(next: boolean, anchor?: { x: number; y: number }): void {
      if (anchor) lastAnchor = anchor;
      if (open === next && card.hidden === !next) return;
      open = next;
      card.hidden = !next;
      if (next) {
        lastSignature = "";
        render();
        place();
      } else {
        const canvas = document.getElementById("game");
        if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
      }
    },
    refresh(next: readonly LedgerEntry[], now: number): void {
      letters = next;
      nowSeconds = now;
      if (!open) return;
      const nextSignature = signature();
      if (nextSignature === lastSignature && card.isConnected) return;
      lastSignature = nextSignature;
      render();
      place();
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown, true);
      card.remove();
    },
  };

  window.addEventListener("keydown", onKeyDown, true);
  return panel;
}
