import "./journal-dom.css";
import "./shed-dom.css";
import "./player-dom.css";
import { PROGRESSION_CONFIG } from "../game/farm-progression";
import { FARM_EXPANSION_CONFIG, farmBoundsAtLevel } from "../game/farm-expansion";

export interface PlayerLevelCard {
  readonly parcel: number;
  readonly name: string;
  readonly threshold: number;
  readonly unlocked: boolean;
  readonly current: boolean;
  readonly areaNote: string;
}

export interface PlayerDomStats {
  readonly points: number;
  readonly level: number;
  readonly pointsToNext: number;
  readonly parcel: number;
  readonly population: number;
  readonly capacity: number;
  readonly eggs: number;
  readonly readyEggs: number;
  readonly levels: readonly PlayerLevelCard[];
}

export interface PlayerDomPanel {
  readonly isOpen: boolean;
  setOpen(open: boolean): void;
  refresh(stats: PlayerDomStats): void;
  dispose(): void;
}

const RANKS = [
  "Apprentice Ringmaster",
  "Journeyman Ringmaster",
  "Ringmaster",
  "Grand Ringmaster",
  "Legendary Ringmaster",
];

export function playerRankForLevel(level: number): string {
  const index = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  return RANKS[Math.min(index, RANKS.length - 1)];
}

function parcelName(parcel: number): string {
  const steps = FARM_EXPANSION_CONFIG.steps;
  if (steps.length === 0) return `Parcel ${parcel}`;
  const index = Math.max(0, parcel - 1);
  const base = steps[index % steps.length].name;
  const cycle = Math.floor(index / steps.length);
  return cycle === 0 ? base : `${base} ${cycle + 1}`;
}

function parcelArea(parcel: number): number {
  const bounds = farmBoundsAtLevel(Math.max(0, parcel - 1));
  return Math.round(bounds.halfWidth * 2 * (bounds.halfDepth * 2));
}

function unlockThreshold(parcel: number): number {
  if (parcel <= 1) return 0;
  return PROGRESSION_CONFIG.firstExpansionAt + (parcel - 2) * PROGRESSION_CONFIG.expansionInterval;
}

export function playerLevelCards(points: number, level: number): PlayerLevelCard[] {
  const current = Number.isFinite(level) ? Math.max(0, Math.floor(level)) + 1 : 1;
  return [current, current + 1, current + 2].map((parcel) => {
    const threshold = unlockThreshold(parcel);
    const area = parcelArea(parcel);
    const previous = parcel > 1 ? parcelArea(parcel - 1) : area;
    return {
      parcel,
      name: parcelName(parcel),
      threshold,
      unlocked: points >= threshold,
      current: parcel === current,
      areaNote: parcel <= 1 ? `${area} m² of land` : `+${Math.max(0, area - previous)} m² of land`,
    };
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function eggsCopy(eggs: number, readyEggs: number): string {
  if (readyEggs > 0) return `${readyEggs} ready to hatch`;
  if (eggs > 0) return `${eggs} ${eggs === 1 ? "egg" : "eggs"} incubating`;
  return "No eggs yet";
}

export function createPlayerDomPanel(callbacks: { onClose: () => void }): PlayerDomPanel {
  let open = false;
  let lastSignature = "";
  let stats: PlayerDomStats | null = null;

  const overlay = document.createElement("div");
  overlay.className = "fj-overlay";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.className = "fj-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close player");
  backdrop.addEventListener("click", () => callbacks.onClose());

  const player = document.createElement("section");
  player.className = "fj-journal pl-journal";
  player.setAttribute("role", "dialog");
  player.setAttribute("aria-label", "Player");

  overlay.append(backdrop, player);
  document.body.append(overlay);

  function signature(next: PlayerDomStats): string {
    const levels = next.levels.map((card) => `${card.parcel}:${card.unlocked ? 1 : 0}`).join("|");
    return `${next.points}|${next.level}|${next.pointsToNext}|${next.parcel}|${next.population}|` +
      `${next.capacity}|${next.eggs}|${next.readyEggs}|${levels}`;
  }

  function render(): void {
    if (!stats) return;
    const current = stats;
    const progress = Math.max(1, current.points + current.pointsToNext);
    const pct = Math.max(0, Math.min(1, current.points / progress));
    const levelsHtml = current.levels.map((card) => {
      const state = card.current ? "is-current" : card.unlocked ? "is-open" : "is-locked";
      const sub = card.current
        ? "You are here"
        : card.unlocked
          ? `${card.threshold} pts · ${escapeHtml(card.areaNote)}`
          : `${card.threshold} pts · ${escapeHtml(card.areaNote)}`;
      return `<div class="pl-level ${state}">` +
        `<div class="pl-level-title">Level ${card.parcel} · ${escapeHtml(card.name)}</div>` +
        `<div class="pl-level-sub">${sub}</div></div>`;
    }).join("");
    player.innerHTML =
      `<header class="fj-header">` +
      `<div class="fj-title"><span class="pl-head-icon" aria-hidden="true"></span><span>Player</span></div>` +
      `<button type="button" class="fj-close" data-action="close" aria-label="Close player">&times;</button>` +
      `</header>` +
      `<div class="fj-body"><div class="pl-main">` +
      `<aside class="fj-sidebar pl-side">` +
      `<div class="pl-avatar"><img src="assets/ui/nav-player.png" alt="Balloon player" draggable="false" /></div>` +
      `<div class="pl-name">Player</div>` +
      `<div class="pl-rank">${escapeHtml(playerRankForLevel(current.level))}</div>` +
      `<div class="pl-balloon"><span>${current.level + 1}</span></div>` +
      `<div class="pl-garden-level">Garden Level ${current.level + 1}</div>` +
      `<div class="pl-parcel-pill">Parcel ${current.parcel}</div>` +
      `<div class="pl-residents"><span>Residents &amp; visitors ${current.population}/${current.capacity}</span>` +
      `<span>${escapeHtml(eggsCopy(current.eggs, current.readyEggs))}</span></div>` +
      `</aside>` +
      `<main class="fj-detail pl-detail">` +
      `<div class="pl-growth">` +
      `<div class="pl-growth-top"><span>GARDEN GROWTH</span><span>PARCEL ${current.parcel}</span></div>` +
      `<div class="pl-points">${current.points} points</div>` +
      `<div class="pl-next">${current.pointsToNext} pts to next expansion</div>` +
      `<div class="fj-bar" role="progressbar" aria-valuenow="${current.points}" aria-valuemax="${progress}" aria-label="Garden growth"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>` +
      `<div class="pl-scale"><span>0</span><span>${current.points} / ${progress}</span><span>Parcel ${current.parcel + 1}</span></div>` +
      `</div>` +
      `<h3 class="pl-heading">Garden levels</h3>` +
      `<div class="pl-levels">${levelsHtml}</div>` +
      `</main>` +
      `</div></div>`;
  }

  player.addEventListener("click", (event) => {
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

  const panel: PlayerDomPanel = {
    get isOpen() {
      return open;
    },
    setOpen(next: boolean): void {
      if (open === next && overlay.hidden === !next) return;
      open = next;
      overlay.hidden = !next;
      if (next) {
        lastSignature = "";
        render();
      } else {
        const canvas = document.getElementById("game");
        if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
      }
    },
    refresh(next: PlayerDomStats): void {
      stats = next;
      if (!open) return;
      const nextSignature = signature(next);
      if (nextSignature === lastSignature && player.isConnected) return;
      lastSignature = nextSignature;
      render();
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
    },
  };

  window.addEventListener("keydown", onKeyDown, true);
  return panel;
}
