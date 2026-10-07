import "./journal-dom.css";
import { ANIMAL_CATALOG } from "../animals/animal-catalog";
import { GARDEN_TOOLS } from "../scene/garden-tool-art";
import { PLANT_CATALOG } from "../game/plants";
import type { JournalConditionSource } from "./journal-panel";

/**
 * Farm Journal as a DOM overlay (feature/journal-redesign-dom).
 *
 * The Three.js journal (`journal-panel.ts`) keeps owning the 3D launcher book
 * and the open/closed state; this panel is purely a reading surface. main.ts
 * suppresses the canvas spread (`setSpreadSuppressed(true)`) and mirrors the
 * open flag into `setOpen`, so every existing `journal.isOpen` check keeps
 * working and the garden keeps ignoring input while the book is open.
 *
 * Portraits reuse the Blender review renders (`balloon-<id>-review.png`), i.e.
 * the actual authored cow asset, and every progress row uses a Blender-made
 * requirement icon from `public/assets/journal/` (see
 * `art/blender/journal_icons.py`). No emoji anywhere.
 */

export type JournalDomCategory = "animals" | "plants" | "tools" | "photos";

export interface JournalDomPanel {
  setConditionsSource(source: JournalConditionSource | null): void;
  setOpen(open: boolean): void;
  /** Jump the reader to a species page; unknown ids keep the current page. */
  selectSpecies(speciesId: string): void;
  refresh(): void;
  dispose(): void;
}

interface SpeciesMeta {
  readonly rarity: string;
  readonly traits: readonly string[];
}

/**
 * Placeholder journal copy. The catalog owns names/descriptions; numbers,
 * rarity and trait pills have no data home yet, so they live here until the
 * design side gives them one (suggested: fields on ANIMAL_CATALOG).
 */
const SPECIES_META: Readonly<Record<string, SpeciesMeta>> = {
  cow: { rarity: "Common", traits: ["Herbivore", "Floaty", "Makes Balloon Milk"] },
  sheep: { rarity: "Common", traits: ["Herbivore", "Bouncy", "Grows Cloud Wool"] },
  pig: { rarity: "Common", traits: ["Omnivore", "Snuffler", "Digs for Color"] },
  chicken: { rarity: "Common", traits: ["Herbivore", "Pecky", "Flaps Skyward"] },
  duck: { rarity: "Common", traits: ["Herbivore", "Paddler", "Loves a Swim"] },
  goose: { rarity: "Uncommon", traits: ["Herbivore", "Proud Stride", "Takes Flight"] },
  frog: { rarity: "Uncommon", traits: ["Carnivore", "Hopper", "Springs Skyward"] },
};

const DEFAULT_META: SpeciesMeta = { rarity: "Common", traits: [] };

const STAGE_SHORT = ["Spotted in wild", "At the circus", "Visited farm", "Lives here"];

const ICON_BASE = "assets/journal";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMetric(value: number, isCount: boolean): string {
  if (isCount) return String(Math.max(0, Math.round(value)));
  return String(parseFloat(value.toFixed(1)));
}

interface RowVisual {
  readonly icon: string;
  readonly label: string;
  readonly isCount: boolean;
}

function rowVisual(metricLabel: string | undefined, hint: string, title: string): RowVisual {
  const hay = `${metricLabel ?? ""} ${hint} ${title}`.toLowerCase();
  if (hay.includes("lily")) return { icon: "lily-pad", label: metricLabel ?? "Lily pads", isCount: true };
  if (hay.includes("bunting") || hay.includes("string")) {
    return { icon: "balloon-bunting", label: metricLabel ?? "Balloon bunting", isCount: true };
  }
  if (hay.includes("tall grass") || hay.includes("grass") || hay.includes("meadow") || hay.includes("lawn")) {
    return { icon: "tall-grass", label: "Tall grass", isCount: false };
  }
  if (hay.includes("pond") || hay.includes("pool") || hay.includes("swim") || hay.includes("water")) {
    return { icon: "pond-water", label: "Pond water", isCount: false };
  }
  if (hay.includes("flat") || hay.includes("level") || hay.includes("pasture") || hay.includes("open") || hay.includes("graze")) {
    return { icon: "open-pasture", label: "Open grass", isCount: false };
  }
  if (metricLabel) return { icon: "sprout", label: metricLabel, isCount: true };
  return { icon: "sprout", label: "Habitat", isCount: false };
}

export function createJournalDomPanel(options: { onClose: () => void }): JournalDomPanel {
  let conditionsSource: JournalConditionSource | null = null;
  let open = false;
  let category: JournalDomCategory = "animals";
  let selectedId: string = ANIMAL_CATALOG.some((entry) => entry.id === "cow")
    ? "cow"
    : (ANIMAL_CATALOG[0]?.id ?? "");
  let lastSignature = "";
  let timer: number | null = null;

  const overlay = document.createElement("div");
  overlay.className = "fj-overlay";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.className = "fj-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close journal");
  backdrop.addEventListener("click", () => options.onClose());

  const journal = document.createElement("section");
  journal.className = "fj-journal";
  journal.setAttribute("role", "dialog");
  journal.setAttribute("aria-modal", "true");
  journal.setAttribute("aria-label", "Farm Journal");

  overlay.append(backdrop, journal);
  document.body.append(overlay);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      options.onClose();
    }
  }
  window.addEventListener("keydown", onKeyDown, true);

  function stageOf(species: string): number {
    try {
      return conditionsSource?.get(species)?.stage ?? 0;
    } catch {
      return 0;
    }
  }

  function signature(): string {
    const parts = [category, selectedId, open ? "1" : "0"];
    for (const entry of ANIMAL_CATALOG) {
      const data = conditionsSource?.get(entry.id) ?? null;
      if (!data) {
        parts.push(`${entry.id}:?`);
        continue;
      }
      parts.push(`${entry.id}:${data.stage}:` + data.rows.map((row) => `${row.stage},${row.revealed ? 1 : 0},${row.current ?? "x"},${row.target ?? "x"},${row.met ? 1 : 0}`).join(";"));
    }
    return parts.join("|");
  }

  function bookSvg(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v13H4z M13 4h7v13h-7z" fill="#fffdf6" stroke="#6b4a33" stroke-width="1.8"/><path d="M11 4h2v13h-2z" fill="#c65a3a"/></svg>`;
  }

  function renderChrome(): string {
    const tabs: JournalDomCategory[] = ["animals", "plants", "tools", "photos"];
    const labels: Record<JournalDomCategory, string> = {
      animals: "Animals",
      plants: "Plants",
      tools: "Tools",
      photos: "Photos",
    };
    return `<header class="fj-header">
      <div class="fj-title">${bookSvg()}<span>Farm Journal</span></div>
      <nav class="fj-tabs" aria-label="Journal chapters">${tabs
        .map(
          (tab) =>
            `<button type="button" class="fj-tab" data-tab="${tab}" aria-selected="${tab === category}">${labels[tab]}</button>`,
        )
        .join("")}</nav>
      <button type="button" class="fj-close" data-action="close" aria-label="Close journal">&times;</button>
    </header>
    <div class="fj-body">
      <aside class="fj-sidebar" aria-label="Entries"></aside>
      <main class="fj-detail" aria-live="polite"></main>
    </div>`;
  }

  function renderSidebar(sidebar: Element): void {
    if (category === "animals") {
      const found = ANIMAL_CATALOG.filter((entry) => stageOf(entry.id) >= 1).length;
      sidebar.innerHTML =
        ANIMAL_CATALOG.map((entry, index) => {
          const stage = stageOf(entry.id);
          const known = stage >= 1;
          const name = known ? `Balloon ${entry.name}` : "???";
          const thumb = known
            ? `<img src="${escapeHtml(entry.spriteUrl)}" alt="" draggable="false">`
            : `<span class="fj-q">?</span>`;
          void index;
          return `<button type="button" class="fj-row" data-select="${escapeHtml(entry.id)}" aria-current="${entry.id === selectedId}">${thumb}<span>${escapeHtml(name)}</span></button>`;
        }).join("") +
        `<div class="fj-found">&#9733; ${found} / ${ANIMAL_CATALOG.length} found. Finish a page for a golden sticker!</div>`;
      return;
    }
    if (category === "plants") {
      sidebar.innerHTML =
        PLANT_CATALOG.map((plant) => {
          const dot = `<span class="fj-q" style="background:${escapeHtml(plant.color)};color:#fff;font-size:16px;">${escapeHtml(plant.name.slice(0, 1))}</span>`;
          return `<button type="button" class="fj-row" data-select="plant:${escapeHtml(plant.id)}" aria-current="${selectedId === `plant:${plant.id}`}">${dot}<span>${escapeHtml(plant.name)}</span></button>`;
        }).join("") || `<div class="fj-found">No seeds discovered yet.</div>`;
      return;
    }
    if (category === "tools") {
      sidebar.innerHTML = GARDEN_TOOLS.map((tool) => {
        const dot = `<span class="fj-q" style="background:${escapeHtml(tool.tint)};color:#5a3d2b;font-size:16px;">${escapeHtml(tool.label.slice(0, 1))}</span>`;
        return `<button type="button" class="fj-row" data-select="tool:${escapeHtml(tool.id)}" aria-current="${selectedId === `tool:${tool.id}`}">${dot}<span>${escapeHtml(tool.label)}</span></button>`;
      }).join("");
      return;
    }
    sidebar.innerHTML = `<div class="fj-found">Snapshots you take out in the garden will live here.</div>`;
  }

  function renderAnimalDetail(detail: Element): void {
    const entry = ANIMAL_CATALOG.find((item) => item.id === selectedId) ?? ANIMAL_CATALOG[0];
    if (!entry) {
      detail.innerHTML = `<div class="fj-empty">No animals in the catalog yet.</div>`;
      return;
    }
    const data = conditionsSource?.get(entry.id) ?? null;
    const stage = data?.stage ?? 0;
    const index = ANIMAL_CATALOG.indexOf(entry);
    if (stage < 1) {
      detail.innerHTML = `<div class="fj-locked">
        <div class="fj-q-big">?</div>
        <h2 class="fj-name">???</h2>
        <p class="fj-desc">No. ${String(index + 1).padStart(3, "0")} &middot; Species &middot; ???</p>
        <p class="fj-desc">Something out there has not shown itself yet. Keep tending the garden and check the fairground.</p>
      </div>`;
      return;
    }
    const meta = SPECIES_META[entry.id] ?? DEFAULT_META;
    const pills = STAGE_SHORT.map((label, step) => {
      const stepStage = step + 1;
      const cls = stepStage === stage ? "is-current" : stepStage < stage ? "is-past" : "is-future";
      return `<span class="fj-stage ${cls}">${stepStage} ${escapeHtml(label)}</span>`;
    }).join("");
    const cards = (data?.rows ?? []).map((row) => {
      if (!row.revealed) {
        return `<div class="fj-card fj-sealed">??? &mdash; win it over further to reveal this page.</div>`;
      }
      const badge = row.met
        ? `<span class="fj-badge">&#10003; Achieved</span>`
        : row.stage === stage
          ? `<span class="fj-badge is-pending">In progress</span>`
          : "";
      const head = `<div class="fj-card-head"><span class="fj-bubble">${row.stage}</span>
        <div><div class="fj-card-title">${escapeHtml(row.title)}</div>
        <div class="fj-card-sub">${escapeHtml(row.result || row.hint)}</div></div>${badge}</div>`;
      if (row.waitingOn) {
        const status = row.waitingOn.resident ? "Already lives here &#10003;" : "Not on the farm yet";
        return `<div class="fj-card">${head}
          <div class="fj-req"><img src="${ICON_BASE}/journal-icon-friend-paw.png" alt="" draggable="false">
          <span class="fj-req-label">Wants a ${escapeHtml(row.waitingOn.name)}</span>
          <span class="fj-note">${status}</span></div>
          <div class="fj-note">${escapeHtml(row.hint)}</div></div>`;
      }
      if (row.current === null || row.target === null || row.target <= 0) {
        return `<div class="fj-card">${head}<div class="fj-note">${escapeHtml(row.hint)}</div></div>`;
      }
      const visual = rowVisual(row.metricLabel, row.hint, row.title);
      const pct = Math.max(0, Math.min(1, row.current / row.target));
      const unit = row.metricUnit ?? (visual.isCount ? "" : " m&sup2;");
      return `<div class="fj-card">${head}
        <div class="fj-req"><img src="${ICON_BASE}/journal-icon-${visual.icon}.png" alt="" draggable="false">
        <span class="fj-req-label">${escapeHtml(visual.label)}</span>
        <span class="fj-bar" role="progressbar" aria-valuenow="${row.current}" aria-valuemax="${row.target}" aria-label="${escapeHtml(visual.label)}"><i style="width:${(pct * 100).toFixed(1)}%"></i></span>
        <span class="fj-numbers">${formatMetric(row.current, visual.isCount)} / ${formatMetric(row.target, visual.isCount)}${unit}</span></div></div>`;
    }).join("");
    detail.innerHTML = `<div class="fj-hero">
      <div class="fj-portrait"><img src="${escapeHtml(entry.spriteUrl)}" alt="Balloon ${escapeHtml(entry.name)}"></div>
      <div><div class="fj-id"><span class="fj-number">No. ${String(index + 1).padStart(3, "0")} &middot; Species &middot; ${escapeHtml(meta.rarity)}</span></div>
      <h2 class="fj-name">Balloon ${escapeHtml(entry.name)}</h2>
      <p class="fj-desc">${escapeHtml(entry.description)}</p>
      <div class="fj-traits">${meta.traits.map((trait) => `<span class="fj-trait"><i></i>${escapeHtml(trait)}</span>`).join("")}</div></div>
    </div>
    <div class="fj-stages">${pills}</div>
    <h3 class="fj-how">How to win it over</h3>
    ${cards || `<div class="fj-empty">No pages yet for this friend.</div>`}
    <p class="fj-note">${escapeHtml(entry.note)}</p>`;
  }

  function renderSimpleDetail(detail: Element): void {
    if (category === "plants") {
      const id = selectedId.startsWith("plant:") ? selectedId.slice("plant:".length) : "";
      const plant = PLANT_CATALOG.find((item) => item.id === id) ?? PLANT_CATALOG[0];
      if (!plant) {
        detail.innerHTML = `<div class="fj-empty">No plants discovered yet.</div>`;
        return;
      }
      detail.innerHTML = `<h2 class="fj-name" style="color:#5a7a3a;">${escapeHtml(plant.name)}</h2>
        <p class="fj-desc">${escapeHtml(plant.subtitle)}</p>
        <div class="fj-card"><div class="fj-card-sub">${escapeHtml(plant.description)}</div></div>`;
      return;
    }
    if (category === "tools") {
      const id = selectedId.startsWith("tool:") ? selectedId.slice("tool:".length) : "";
      const tool = GARDEN_TOOLS.find((item) => item.id === id) ?? GARDEN_TOOLS[0];
      if (!tool) {
        detail.innerHTML = `<div class="fj-empty">No tools yet.</div>`;
        return;
      }
      detail.innerHTML = `<h2 class="fj-name" style="color:#5a7a3a;">${escapeHtml(tool.label)}</h2>
        <p class="fj-desc">${escapeHtml(tool.subtitle)}</p>
        <div class="fj-card"><div class="fj-card-sub">${escapeHtml(tool.description)}</div>
        <div class="fj-note">${escapeHtml(tool.note)}</div></div>`;
      return;
    }
    detail.innerHTML = `<div class="fj-empty">No photos yet &mdash; spot animals in the wild to fill this page.</div>`;
  }

  function render(): void {
    const next = signature();
    if (next === lastSignature && journal.isConnected) return;
    lastSignature = next;
    const detail = journal.querySelector(".fj-detail");
    const scrollTop = detail instanceof HTMLElement ? detail.scrollTop : 0;
    journal.innerHTML = renderChrome();
    const sidebar = journal.querySelector(".fj-sidebar");
    const fresh = journal.querySelector(".fj-detail");
    if (sidebar) renderSidebar(sidebar);
    if (fresh) {
      if (category === "animals") renderAnimalDetail(fresh);
      else renderSimpleDetail(fresh);
      if (fresh instanceof HTMLElement) fresh.scrollTop = scrollTop;
    }
  }

  journal.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest("[data-tab],[data-select],[data-action]") : null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset["action"] === "close") {
      options.onClose();
      return;
    }
    const tab = target.dataset["tab"] as JournalDomCategory | undefined;
    if (tab) {
      category = tab;
      if (tab === "plants" && PLANT_CATALOG[0]) selectedId = `plant:${PLANT_CATALOG[0].id}`;
      else if (tab === "tools" && GARDEN_TOOLS[0]) selectedId = `tool:${GARDEN_TOOLS[0].id}`;
      else if (tab === "animals") selectedId = selectedId.startsWith("plant:") || selectedId.startsWith("tool:") ? "cow" : selectedId;
      lastSignature = "";
      render();
      return;
    }
    const select = target.dataset["select"];
    if (select) {
      selectedId = select;
      lastSignature = "";
      render();
    }
  });

  function stopTimer(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  const panel: JournalDomPanel = {
    setConditionsSource(source: JournalConditionSource | null): void {
      conditionsSource = source;
      lastSignature = "";
      if (open) render();
    },
    selectSpecies(speciesId: string): void {
      if (!ANIMAL_CATALOG.some((entry) => entry.id === speciesId)) return;
      category = "animals";
      selectedId = speciesId;
      lastSignature = "";
      if (open) render();
    },
    setOpen(next: boolean): void {
      if (open === next && overlay.hidden === !next) return;
      open = next;
      overlay.hidden = !next;
      if (next) {
        lastSignature = "";
        render();
        stopTimer();
        timer = window.setInterval(render, 500);
      } else {
        stopTimer();
        const canvas = document.getElementById("game");
        if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
      }
    },
    refresh(): void {
      lastSignature = "";
      if (open) render();
    },
    dispose(): void {
      stopTimer();
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
    },
  };

  return panel;
}
