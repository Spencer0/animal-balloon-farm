import "./care-game-dom.css";
import { CARE_GAME_COPY, type CareGameKind, type CareRoundSnapshot } from "../game/care-minigames";

/**
 * The DOM half of the plant-care minigames: the WarioWare-style command card,
 * the fuse-and-hearts bar, pop-up words, the swatter's reticle, the snip
 * trail's canvas, the result stamp, and the tap ring that follows the rain
 * cloud on the farm. The 3D half lives in `src/scene/care-games/`.
 */

export interface CareGameResultView {
  readonly won: boolean;
  readonly line: string;
  /** Shown on the first win of a chore for a species. */
  readonly ribbon?: { readonly title: string; readonly detail: string } | null;
}

export interface CareGameDom {
  readonly overlay: HTMLElement;
  showIntro(kind: CareGameKind, subject: string): void;
  hideIntro(): void;
  showHud(kind: CareGameKind, subject: string, snapshot: CareRoundSnapshot): void;
  hideHud(): void;
  setRound(snapshot: CareRoundSnapshot): void;
  pop(text: string, x: number, y: number, tone?: "good" | "bad" | "plain", big?: boolean): void;
  /** Swat: the overlay takes the pointer and hides the system cursor. */
  setAiming(aiming: boolean): void;
  /** Snip: the overlay takes the pointer but keeps the cursor. */
  setCapturing(capturing: boolean): void;
  setReticle(x: number, y: number, visible: boolean): void;
  fireReticle(): void;
  trail(): HTMLCanvasElement;
  showResult(view: CareGameResultView, onRetry: () => void, onClose: () => void): void;
  hideResult(): void;
  /** The rain cloud's ring on the farm: where it is, and how the round is going. */
  showTap(x: number, y: number, snapshot: CareRoundSnapshot): void;
  hideTap(): void;
  dispose(): void;
}

const BERRY_SVG =
  `<svg class="cg-heart" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="12" fill="#4a5cb0" stroke="#2a2b52" stroke-width="2.5"/>` +
  `<circle cx="11.5" cy="13.5" r="3" fill="#a9b6ea" opacity=".75"/><path d="M12 8l4 3 4-3-1 4h-6z" fill="#2a2b52"/></svg>`;

const RIBBON_SVG =
  `<svg viewBox="0 0 52 64" aria-hidden="true"><path d="M16 34L8 62l10-6 6 8 4-28zM36 34l8 28-10-6-6 8-4-28z" fill="#c65a3a" stroke="#6b4a33" stroke-width="2.5" stroke-linejoin="round"/>` +
  `<circle cx="26" cy="24" r="20" fill="#79ad58" stroke="#6b4a33" stroke-width="3"/><circle cx="26" cy="24" r="13" fill="#faf3e2" stroke="#6b4a33" stroke-width="2"/>` +
  `<path d="M26 32v-9m0 3c-5 0-7-3-7-7 5 0 7 3 7 7zm0-2c0-5 3-8 7-8 0 5-2 8-7 8z" fill="#79ad58" stroke="#426b3d" stroke-width="1.2"/></svg>`;

const RETICLE_SVG =
  `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="20" fill="none" stroke="#6b4a33" stroke-width="6"/>` +
  `<circle cx="32" cy="32" r="20" fill="none" stroke="#fff6e8" stroke-width="3"/>` +
  `<path d="M32 4v12M32 48v12M4 32h12M48 32h12" stroke="#6b4a33" stroke-width="6" stroke-linecap="round"/>` +
  `<path d="M32 4v12M32 48v12M4 32h12M48 32h12" stroke="#f7d27a" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="3" fill="#c65a3a"/></svg>`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function createCareGameDom(): CareGameDom {
  const overlay = document.createElement("div");
  overlay.className = "cg-overlay";
  overlay.hidden = true;

  const intro = document.createElement("div");
  intro.className = "cg-intro";
  const top = document.createElement("div");
  top.className = "cg-top";
  const reticle = document.createElement("div");
  reticle.className = "cg-reticle";
  reticle.innerHTML = RETICLE_SVG;
  const pops = document.createElement("div");
  const result = document.createElement("div");
  result.className = "cg-result";
  const tap = document.createElement("div");
  tap.className = "cg-tap";
  overlay.append(intro, top, pops, reticle, result, tap);
  document.body.append(overlay);

  let trailCanvas: HTMLCanvasElement | null = null;
  let hudGoal = 0;
  let hudHearts = 0;
  let lastHearts = -1;
  let lastHits = -1;
  let tapGoal = 0;
  let introTimer = 0;

  function reveal(): void {
    overlay.hidden = false;
  }

  function maybeHide(): void {
    const busy = intro.classList.contains("cg-show") || top.classList.contains("cg-show")
      || result.classList.contains("cg-show") || tap.classList.contains("cg-show");
    if (!busy) overlay.hidden = true;
  }

  function pipsHtml(goal: number): string {
    return Array.from({ length: goal }, () => `<span class="cg-pip"></span>`).join("");
  }

  const dom: CareGameDom = {
    overlay,
    showIntro(kind, subject): void {
      reveal();
      const copy = CARE_GAME_COPY[kind];
      intro.innerHTML =
        `<div class="cg-burst"></div><div class="cg-command"><span class="cg-subject">${escapeHtml(subject)}</span>` +
        `<span class="cg-word">${escapeHtml(copy.command)}</span><span class="cg-goal">${escapeHtml(copy.goalLine)}</span></div>`;
      window.clearTimeout(introTimer);
      intro.classList.remove("cg-show", "cg-leave");
      // Restart the animations even when the same card shows twice in a row.
      void intro.offsetWidth;
      intro.classList.add("cg-show");
    },
    hideIntro(): void {
      if (!intro.classList.contains("cg-show")) return;
      intro.classList.add("cg-leave");
      window.clearTimeout(introTimer);
      introTimer = window.setTimeout(() => {
        intro.classList.remove("cg-show", "cg-leave");
        intro.innerHTML = "";
        maybeHide();
      }, 200);
    },
    showHud(kind, subject, snapshot): void {
      reveal();
      hudGoal = snapshot.goal;
      hudHearts = snapshot.hearts;
      lastHearts = -1;
      lastHits = -1;
      top.innerHTML =
        `<div class="cg-label"><b>${escapeHtml(CARE_GAME_COPY[kind].command)}</b><span>${escapeHtml(subject)}</span></div>` +
        `<div class="cg-fuse"><div class="cg-fuse-fill"></div><div class="cg-fuse-spark"></div></div>` +
        `<div class="cg-count">${pipsHtml(hudGoal)}</div>` +
        (hudHearts > 0 ? `<div class="cg-hearts">${BERRY_SVG.repeat(hudHearts)}</div>` : "");
      top.classList.add("cg-show");
      dom.setRound(snapshot);
    },
    hideHud(): void {
      top.classList.remove("cg-show");
      maybeHide();
    },
    setRound(snapshot): void {
      const fill = top.querySelector<HTMLElement>(".cg-fuse-fill");
      const spark = top.querySelector<HTMLElement>(".cg-fuse-spark");
      const fuse = top.querySelector<HTMLElement>(".cg-fuse");
      const percent = `${(snapshot.timeFraction * 100).toFixed(1)}%`;
      if (fill) fill.style.width = percent;
      if (spark) spark.style.left = percent;
      fuse?.classList.toggle("cg-hurry", snapshot.timeFraction < 0.25);
      if (snapshot.hits !== lastHits) {
        lastHits = snapshot.hits;
        top.querySelectorAll(".cg-count .cg-pip").forEach((pip, index) => pip.classList.toggle("cg-on", index < snapshot.hits));
      }
      if (snapshot.hearts !== lastHearts) {
        const hearts = top.querySelectorAll(".cg-heart");
        hearts.forEach((heart, index) => {
          const lost = index >= snapshot.hearts;
          if (lost && !heart.classList.contains("cg-lost") && lastHearts !== -1) heart.classList.add("cg-hit");
          heart.classList.toggle("cg-lost", lost);
        });
        lastHearts = snapshot.hearts;
      }
    },
    pop(text, x, y, tone = "plain", big = false): void {
      reveal();
      const word = document.createElement("div");
      word.className = `cg-pop${tone === "plain" ? "" : ` cg-${tone}`}${big ? " cg-big" : ""}`;
      word.textContent = text;
      word.style.left = `${x}px`;
      word.style.top = `${y}px`;
      pops.append(word);
      word.addEventListener("animationend", () => word.remove(), { once: true });
    },
    setAiming(aiming): void {
      overlay.classList.toggle("cg-aiming", aiming);
      if (!aiming) reticle.classList.remove("cg-show");
    },
    setCapturing(capturing): void {
      overlay.classList.toggle("cg-capturing", capturing);
    },
    setReticle(x, y, visible): void {
      reticle.style.transform = `translate(${x}px, ${y}px)`;
      reticle.classList.toggle("cg-show", visible);
    },
    fireReticle(): void {
      reticle.classList.remove("cg-fire");
      void reticle.offsetWidth;
      reticle.classList.add("cg-fire");
    },
    trail(): HTMLCanvasElement {
      if (!trailCanvas) {
        trailCanvas = document.createElement("canvas");
        trailCanvas.className = "cg-trail";
        overlay.insertBefore(trailCanvas, pops);
      }
      return trailCanvas;
    },
    showResult(view, onRetry, onClose): void {
      reveal();
      const ribbon = view.ribbon
        ? `<div class="cg-ribbon">${RIBBON_SVG}<div><b>${escapeHtml(view.ribbon.title)}</b><span>${escapeHtml(view.ribbon.detail)}</span></div></div>`
        : "";
      const buttons = view.won
        ? `<button type="button" class="cg-btn cg-btn-warm" data-cg="close">Back to the farm</button>`
        : `<button type="button" class="cg-btn cg-btn-warm" data-cg="retry">Try again</button><button type="button" class="cg-btn cg-btn-quiet" data-cg="close">Later</button>`;
      result.innerHTML =
        `<div class="cg-card" role="dialog" aria-label="${view.won ? "Cleared" : "Missed"}">` +
        `<div class="cg-stamp ${view.won ? "cg-won" : "cg-lost"}">${view.won ? "CLEARED!" : "OOPS!"}</div>` +
        `<p class="cg-line">${escapeHtml(view.line)}</p>${ribbon}<div class="cg-buttons">${buttons}</div></div>`;
      result.classList.add("cg-show");
      result.querySelector<HTMLButtonElement>("[data-cg=retry]")?.addEventListener("click", onRetry, { once: true });
      result.querySelector<HTMLButtonElement>("[data-cg=close]")?.addEventListener("click", onClose, { once: true });
      // Focus the main button so Enter or Space answers it.
      requestAnimationFrame(() => result.querySelector<HTMLButtonElement>(".cg-btn-warm")?.focus({ preventScroll: true }));
    },
    hideResult(): void {
      result.classList.remove("cg-show");
      result.innerHTML = "";
      maybeHide();
    },
    showTap(x, y, snapshot): void {
      reveal();
      if (tapGoal !== snapshot.goal || !tap.firstChild) {
        tapGoal = snapshot.goal;
        tap.innerHTML = `<div class="cg-tap-ring"></div><div class="cg-tap-word">TAP!</div><div class="cg-tap-pips">${pipsHtml(tapGoal)}</div>`;
      }
      tap.style.transform = `translate(${x}px, ${y}px)`;
      tap.style.setProperty("--cg-left", `${(snapshot.timeFraction * 360).toFixed(1)}deg`);
      tap.classList.toggle("cg-hurry", snapshot.timeFraction < 0.3);
      tap.querySelectorAll(".cg-pip").forEach((pip, index) => pip.classList.toggle("cg-on", index < snapshot.hits));
      tap.classList.add("cg-show");
    },
    hideTap(): void {
      tap.classList.remove("cg-show");
      maybeHide();
    },
    dispose(): void {
      overlay.remove();
    },
  };
  return dom;
}
