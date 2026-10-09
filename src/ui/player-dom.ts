import "./journal-dom.css";
import "./shed-dom.css";
import "./player-dom.css";
import { PROGRESSION_CONFIG } from "../game/farm-progression";
import { unlocksAtFarmerLevel } from "../game/tool-unlocks";
import {
  filterAccomplishmentRows,
  sortAccomplishmentRows,
  type AccomplishmentDef,
  type AccomplishmentFilter,
  type AccomplishmentRow,
  type AccomplishmentSort,
} from "../game/accomplishments";

export interface PlayerLevelCard {
  /** Farmer level, counted from zero (the screen shows it plus one). */
  readonly level: number;
  readonly name: string;
  readonly threshold: number;
  readonly unlocked: boolean;
  readonly current: boolean;
  /** What the shop starts selling at this level. */
  readonly unlocksNote: string;
}

export interface PlayerDomStats {
  readonly points: number;
  readonly level: number;
  readonly pointsToNext: number;
  readonly parcel: number;
  readonly population: number;
  readonly outside: number;
  readonly houseRoom: number;
  readonly houseUsed: number;
  readonly levels: readonly PlayerLevelCard[];
  readonly accomplishments: readonly AccomplishmentRow[];
  readonly recentAccomplishments: readonly AccomplishmentDef[];
}

export interface PlayerDomPanel {
  readonly isOpen: boolean;
  setOpen(open: boolean): void;
  refresh(stats: PlayerDomStats): void;
  dispose(): void;
}

type PlayerTab = "overview" | "accomplishments";

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

function unlockThreshold(level: number): number {
  if (level <= 0) return 0;
  return PROGRESSION_CONFIG.firstExpansionAt + (level - 1) * PROGRESSION_CONFIG.expansionInterval;
}

/** The current farmer level and the two after it, each with what the shop adds. */
export function playerLevelCards(points: number, level: number): PlayerLevelCard[] {
  const current = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  return [current, current + 1, current + 2].map((target) => {
    const threshold = unlockThreshold(target);
    const unlocks = unlocksAtFarmerLevel(target);
    return {
      level: target,
      name: playerRankForLevel(target),
      threshold,
      unlocked: points >= threshold,
      current: target === current,
      unlocksNote: unlocks.length > 0 ? `Shop adds: ${unlocks.join(", ")}` : "No new stock",
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

function houseCopy(room: number, used: number): string {
  if (room === 0) return "No houses yet: build one to raise young";
  return `${used}/${room} indoors`;
}

function accomplishmentRowHtml(row: AccomplishmentRow): string {
  if (row.state === "hidden") {
    return `<div class="pl-acc is-hidden">` +
      `<div class="pl-acc-title">???</div>` +
      `<div class="pl-acc-sub">A hidden accomplishment. Keep exploring.</div>` +
      `<div class="pl-acc-pts">???</div></div>`;
  }
  const body = row.state === "accomplished" ? row.def.detail : row.def.hint;
  return `<div class="pl-acc is-${row.state === "accomplished" ? "done" : "todo"}">` +
    `<div class="pl-acc-title">${row.state === "accomplished" ? "⭐ " : ""}${escapeHtml(row.def.title)}</div>` +
    `<div class="pl-acc-sub">${escapeHtml(body)}</div>` +
    `<div class="pl-acc-pts">+${row.def.points} pts</div></div>`;
}

export function createPlayerDomPanel(callbacks: { onClose: () => void }): PlayerDomPanel {
  let open = false;
  let lastSignature = "";
  let stats: PlayerDomStats | null = null;
  let tab: PlayerTab = "overview";
  let filter: AccomplishmentFilter = "all";
  let sort: AccomplishmentSort = "recent";

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
    const levels = next.levels.map((card) => `${card.level}:${card.unlocked ? 1 : 0}`).join("|");
    const accs = next.accomplishments.map((row) => `${row.def.id}:${row.state}:${row.completedAt ?? ""}`).join("|");
    const recent = next.recentAccomplishments.map((def) => def.id).join(",");
    return `${next.points}|${next.level}|${next.pointsToNext}|${next.parcel}|${next.population}|` +
      `${next.outside}|${next.houseRoom}|${next.houseUsed}|${levels}|${accs}|${recent}|${tab}|${filter}|${sort}`;
  }

  function overviewHtml(current: PlayerDomStats, levelsHtml: string, progress: number, pct: number): string {
    const recentHtml = current.recentAccomplishments.length === 0
      ? `<div class="pl-recent-empty">No accomplishments yet — grow a plant or welcome an animal.</div>`
      : current.recentAccomplishments.map((def) =>
        `<div class="pl-recent-row"><span>${escapeHtml(def.title)}</span><span class="pl-acc-pts">+${def.points} pts</span></div>`,
      ).join("");
    return `<div class="pl-growth">` +
      `<div class="pl-growth-top"><span>FARMER PROGRESS</span><span>FARMER LEVEL ${current.level + 1}</span></div>` +
      `<div class="pl-points">${current.points} points</div>` +
      `<div class="pl-next">${current.pointsToNext} pts to next farmer level</div>` +
      `<div class="fj-bar" role="progressbar" aria-valuenow="${current.points}" aria-valuemax="${progress}" aria-label="Farmer progress"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>` +
      `<div class="pl-scale"><span>0</span><span>${current.points} / ${progress}</span><span>Level ${current.level + 2}</span></div>` +
      `</div>` +
      `<h3 class="pl-heading">Farmer levels</h3>` +
      `<div class="pl-levels">${levelsHtml}</div>` +
      `<h3 class="pl-heading">Recent accomplishments</h3>` +
      `<div class="pl-recent">${recentHtml}</div>`;
  }

  function accomplishmentsHtml(current: PlayerDomStats): string {
    const done = current.accomplishments.filter((row) => row.state === "accomplished").length;
    const todo = current.accomplishments.filter((row) => row.state === "unaccomplished").length;
    const hidden = current.accomplishments.filter((row) => row.state === "hidden").length;
    const rows = sortAccomplishmentRows(filterAccomplishmentRows(current.accomplishments, filter), sort);
    const listHtml = rows.length === 0
      ? `<div class="pl-recent-empty">Nothing here yet.</div>`
      : rows.map(accomplishmentRowHtml).join("");
    const chip = (value: AccomplishmentFilter, label: string, count: number): string =>
      `<button type="button" class="pl-chip${filter === value ? " is-active" : ""}" data-action="filter" data-filter="${value}">${label} (${count})</button>`;
    return `<div class="pl-acc-tools">` +
      `<div class="pl-chips">${chip("all", "All", current.accomplishments.length)}${chip("accomplished", "Done", done)}${chip("unaccomplished", "To do", todo)}</div>` +
      `<label class="pl-sort">Sort <select data-sort>` +
      `<option value="recent"${sort === "recent" ? " selected" : ""}>Recent</option>` +
      `<option value="points"${sort === "points" ? " selected" : ""}>Points</option>` +
      `<option value="name"${sort === "name" ? " selected" : ""}>Name</option>` +
      `</select></label>` +
      `</div>` +
      (hidden > 0 ? `<div class="pl-hidden-note">${hidden} hidden — keep exploring to reveal them.</div>` : ``) +
      `<div class="pl-acc-list">${listHtml}</div>`;
  }

  function render(): void {
    if (!stats) return;
    const current = stats;
    const progress = Math.max(1, current.points + current.pointsToNext);
    const pct = Math.max(0, Math.min(1, current.points / progress));
    const levelsHtml = current.levels.map((card) => {
      const state = card.current ? "is-current" : card.unlocked ? "is-open" : "is-locked";
      const sub = card.current
        ? `You are here · ${escapeHtml(card.unlocksNote)}`
        : `${card.threshold} pts · ${escapeHtml(card.unlocksNote)}`;
      return `<div class="pl-level ${state}">` +
        `<div class="pl-level-title">Level ${card.level + 1} · ${escapeHtml(card.name)}</div>` +
        `<div class="pl-level-sub">${sub}</div></div>`;
    }).join("");
    player.innerHTML =
      `<header class="fj-header">` +
      `<div class="fj-title"><span class="pl-head-icon" aria-hidden="true"></span><span>Player</span></div>` +
      `<div class="pl-tabs" role="tablist">` +
      `<button type="button" role="tab" aria-selected="${tab === "overview"}" class="pl-tab${tab === "overview" ? " is-active" : ""}" data-action="tab" data-tab="overview">Overview</button>` +
      `<button type="button" role="tab" aria-selected="${tab === "accomplishments"}" class="pl-tab${tab === "accomplishments" ? " is-active" : ""}" data-action="tab" data-tab="accomplishments">Accomplishments</button>` +
      `</div>` +
      
      `<button type="button" class="fj-close" data-action="close" aria-label="Close player">&times;</button>` +
      `</header>` +
      
      `<div class="fj-body"><div class="pl-main">` +
      `<aside class="fj-sidebar pl-side">` +
      `<div class="pl-profile">` +
      `<div class="pl-avatar"><img src="assets/ui/nav-player.png" alt="Balloon player" draggable="false" /></div>` +
      `<div class="pl-name">Player</div>` +
      `<div class="pl-rank">${escapeHtml(playerRankForLevel(current.level))}</div>` +
      `</div>` +
      `<div class="pl-levelcard">` +
      `<div class="pl-levelnum"><span>${current.level + 1}</span></div>` +
      `<div class="pl-levelmeta">` +
      
      `<div class="pl-garden-level">Farmer Level ${current.level + 1}</div>` +
      `<div class="pl-parcel-pill">Parcel ${current.parcel}</div>` +
      `</div>` +
      `</div>` +
      `<div class="pl-residents">` +
      `<div class="pl-stat"><i class="pl-dot"></i><span>Animals ${current.population} (${current.outside} outside)</span></div>` +
      `<div class="pl-stat is-dim"><i class="pl-dot is-gold"></i><span>${escapeHtml(houseCopy(current.houseRoom, current.houseUsed))}</span></div>` +
      `</div>` +
      `</aside>` +
      `<main class="fj-detail pl-detail">` +
      (tab === "overview" ? overviewHtml(current, levelsHtml, progress, pct) : accomplishmentsHtml(current)) +
      `</main>` +
      `</div></div>`;
  }

  function rerender(): void {
    if (!stats) return;
    lastSignature = signature(stats);
    render();
  }

  player.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-action]")
      : null;
    if (!(target instanceof HTMLElement)) return;
    const action = target.dataset["action"];
    if (action === "close") callbacks.onClose();
    else if (action === "tab" && (target.dataset["tab"] === "overview" || target.dataset["tab"] === "accomplishments")) {
      tab = target.dataset["tab"];
      rerender();
    } else if (action === "filter" && (target.dataset["filter"] === "all" || target.dataset["filter"] === "accomplished" || target.dataset["filter"] === "unaccomplished")) {
      filter = target.dataset["filter"];
      rerender();
    }
  });

  player.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.dataset["sort"] !== undefined) {
      const value = target.value;
      if (value === "recent" || value === "points" || value === "name") {
        sort = value;
        rerender();
      }
    }
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
