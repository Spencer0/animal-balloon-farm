import "./journal-dom.css";
import { ANIMAL_CATALOG } from "../animals/animal-catalog";
import { GARDEN_TOOLS } from "../scene/garden-tool-art";
import { PLANT_CATALOG } from "../game/plants";
import { HUNGER_LABELS, hungerLevel } from "../game/animal-diet";
import {
  dietBlock,
  foodOverview,
  goodsList,
  herdLine,
  huntOverview,
  HARMONY_INTRO,
  HARMONY_PARTS,
  HUNGER_INTRO,
  HUNGER_LADDER,
  type HerdAnimal,
  type OverviewEater,
} from "../game/journal-food-web";
import type { JournalAlsoNeeds, JournalConditionSource } from "./journal-panel";
import type { ChapterPage } from "../game/farm-chapters";

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

export type JournalDomCategory = "animals" | "plants" | "tools" | "photos" | "foodweb" | "stages";

export interface JournalDomPanel {
  setConditionsSource(source: JournalConditionSource | null): void;
  /** Where the live "Your 6 cows" lines read the player's herd from. */
  setHerdSource(source: (() => readonly HerdAnimal[]) | null): void;
  setOpen(open: boolean): void;
  /** Jump the reader to a species page; unknown ids keep the current page. */
  selectSpecies(speciesId: string): void;
  /** Jump the reader to a plant page on the Plants tab. */
  selectPlant(plantId: string): void;
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
  owl: { rarity: "Rare", traits: ["Predator", "Night Shift", "Barely Flaps"] },
  raccoon: { rarity: "Uncommon", traits: ["Scavenger", "Night Shift", "Naps by the Can"] },
  mouse: { rarity: "Common", traits: ["Seed Nibbler", "Meadow Dweller", "Tiny Pitter-Patter"] },
  rat: { rarity: "Uncommon", traits: ["Scavenger", "Night Shift", "Shares the Log"] },
  snake: { rarity: "Rare", traits: ["Meadow Hunter", "Slithers", "Basks on Rocks"] },
  squirrel: { rarity: "Uncommon", traits: ["Berry Nibbler", "Bushy Tail", "Daytime Forager"] },
  mole: { rarity: "Uncommon", traits: ["Digs Deep", "Loves Bare Earth", "Poor Eyesight"] },
  starhorn: { rarity: "Legendary", traits: ["One of a Kind", "Sips Nectar", "Makes Star Gems"] },
};

const DEFAULT_META: SpeciesMeta = { rarity: "Common", traits: [] };

const STAGE_SHORT = ["Spotted in wild", "At the circus", "Visited farm", "Lives here"];

const ICON_BASE = "assets/journal";

const FOOD_WEB_PAGES = [
  { id: "ladder", label: "Hunger & Harmony", icon: "assets/goods/hunger-bubble.png" },
  { id: "web", label: "Who eats what", icon: "assets/goods/food-grass.png" },
  { id: "goods", label: "Goods", icon: "assets/goods/good-milk.png" },
] as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Status mark for a chapter row. The lock is drawn in CSS, so the journal stays emoji-free. */
function stageMark(status: ChapterPage["status"]): string {
  if (status === "done") return "&#10003;";
  if (status === "current") return "&#9679;";
  return `<span class="fj-lock"></span>`;
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

/** The icon and label for what a rung measures, straight from its requirement. */
function visualForKind(kind: string, species: string | undefined, metricLabel: string | undefined): RowVisual | null {
  switch (kind) {
    case "shortGrassArea": return { icon: "tall-grass", label: metricLabel ?? "Short lawn grass", isCount: false };
    case "fruitEaten": return { icon: "sprout", label: metricLabel ?? "Berries eaten", isCount: true };
    case "grassArea": return { icon: "tall-grass", label: "Grass", isCount: false };
    case "meadowArea": return { icon: "tall-grass", label: "Tall meadow grass", isCount: false };
    case "waterArea": return { icon: "pond-water", label: "Pond water", isCount: false };
    case "flatArea": return { icon: "open-pasture", label: "Level pasture", isCount: false };
    case "plantCount": return { icon: species === "water-lily" ? "lily-pad" : "sprout", label: metricLabel ?? "Plants", isCount: true };
    case "residentCount": return { icon: "friend-paw", label: metricLabel ?? "Residents", isCount: true };
    case "toolOwned": return { icon: "open-pasture", label: metricLabel ?? "Tool", isCount: true };
    case "harmony": return { icon: "friend-paw", label: metricLabel ?? "Farm harmony", isCount: true };
    case "flowerCount": return { icon: "sprout", label: metricLabel ?? "Grown flowers", isCount: true };
    case "terrainShare": return { icon: "open-pasture", label: metricLabel ?? "Share of the farm", isCount: true };
    case "propCount": return { icon: "circus-tent", label: metricLabel ?? "Props", isCount: true };
    case "preyEaten": return { icon: "friend-paw", label: metricLabel ?? "Eaten", isCount: true };
    default: return null;
  }
}

function rowVisual(row: { readonly requirementKind?: string; readonly requirementSpecies?: string; readonly metricLabel?: string; readonly hint: string; readonly title: string }): RowVisual {
  if (row.requirementKind) {
    const known = visualForKind(row.requirementKind, row.requirementSpecies, row.metricLabel);
    if (known) return known;
  }
  const { metricLabel, hint, title } = row;
  const hay = `${metricLabel ?? ""} ${hint} ${title}`.toLowerCase();
  if (hay.includes("lily")) return { icon: "lily-pad", label: metricLabel ?? "Lily pads", isCount: true };
  if (hay.includes("bunting") || hay.includes("string")) {
    return { icon: "balloon-bunting", label: metricLabel ?? "Balloon bunting", isCount: true };
  }
  if (hay.includes("tall grass") || hay.includes("grass") || hay.includes("meadow") || hay.includes("lawn")) {
    return { icon: "tall-grass", label: "Grass", isCount: false };
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

/** Extra requirements that must hold alongside a rung's main one, each with its own bar. */
function alsoNeeds(extras: readonly JournalAlsoNeeds[] | undefined): string {
  if (!extras?.length) return "";
  return extras.map((extra) => {
    const pct = Math.max(0, Math.min(1, extra.target > 0 ? extra.current / extra.target : 0));
    // An area (meadow, water) reads in m² like a main row; anything else is a count.
    const visual = extra.kind ? visualForKind(extra.kind, extra.species, extra.label) : null;
    const isCount = visual?.isCount ?? true;
    const unit = isCount ? "" : " m&sup2;";
    return `<div class="fj-req"><img src="${ICON_BASE}/journal-icon-${visual?.icon ?? "sprout"}.png" alt="" draggable="false">
        <span class="fj-req-label">${escapeHtml(extra.label)}</span>
        <span class="fj-bar" role="progressbar" aria-valuenow="${extra.current}" aria-valuemax="${extra.target}" aria-label="${escapeHtml(extra.label)}"><i style="width:${(pct * 100).toFixed(1)}%"></i></span>
        <span class="fj-numbers">${formatMetric(extra.current, isCount)} / ${formatMetric(extra.target, isCount)}${unit}</span></div>`;
  }).join("");
}

export interface JournalDomOptions {
  onClose: () => void;
  /** The game's chapters for the Stages tab. Without it the tab is hidden. */
  chapterPages?: () => readonly ChapterPage[];
  /** Diet & goods blocks on animal pages (Animal Care opens them). Shown when absent. */
  dietShown?: () => boolean;
  /** The Food web tab (Ecological Harmony opens it). Shown when absent. */
  foodWebShown?: () => boolean;
}

export function createJournalDomPanel(options: JournalDomOptions): JournalDomPanel {
  const pagesSource = options.chapterPages ?? null;
  const dietShown = (): boolean => options.dietShown?.() ?? true;
  const foodWebShown = (): boolean => options.foodWebShown?.() ?? true;
  let conditionsSource: JournalConditionSource | null = null;
  let herdSource: (() => readonly HerdAnimal[]) | null = null;
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

  function herd(): readonly HerdAnimal[] {
    try {
      return herdSource?.() ?? [];
    } catch {
      return [];
    }
  }

  function discoveredSet(): Set<string> {
    return new Set(ANIMAL_CATALOG.filter((entry) => stageOf(entry.id) >= 1).map((entry) => entry.id));
  }

  function nameOf(id: string): string {
    return ANIMAL_CATALOG.find((entry) => entry.id === id)?.name ?? id;
  }

  function chapterList(): readonly ChapterPage[] {
    try {
      return pagesSource?.() ?? [];
    } catch {
      return [];
    }
  }

  /** The chapter the Stages tab shows: the one picked in the list, else the current one. */
  function selectedChapter(pages: readonly ChapterPage[]): ChapterPage | undefined {
    const picked = selectedId.startsWith("ch:") ? selectedId.slice("ch:".length) : "";
    return pages.find((page) => page.def.id === picked) ?? pages.find((page) => page.status === "current") ?? pages[0];
  }

  function signature(): string {
    if (category === "foodweb" && !foodWebShown()) category = "animals";
    const parts = [category, selectedId, open ? "1" : "0", dietShown() ? "d" : "", foodWebShown() ? "f" : ""];
    // Chapter progress is live: the Stages page re-renders when any of it moves.
    if (category === "stages" && pagesSource) {
      parts.push(JSON.stringify(chapterList().map((page) => [page.def.id, page.status, Math.round(page.progress * 1000), page.parts])));
    }
    // Residents' hunger changes the live herd lines, so it belongs in the signature.
    parts.push(
      herd()
        .filter((animal) => animal.stage >= 3)
        .map((animal) => `${animal.species}:${hungerLevel(animal.fullness)}`)
        .sort()
        .join(","),
    );
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
    const tabs: JournalDomCategory[] = [
      ...(pagesSource ? (["stages"] as JournalDomCategory[]) : []),
      "animals",
      "plants",
      "tools",
      "photos",
      ...(foodWebShown() ? (["foodweb"] as JournalDomCategory[]) : []),
    ];
    const labels: Record<JournalDomCategory, string> = {
      stages: "Stages",
      animals: "Animals",
      plants: "Plants",
      tools: "Tools",
      photos: "Photos",
      foodweb: "Food web",
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
    if (category === "stages") {
      const pages = chapterList();
      const current = selectedChapter(pages);
      const done = pages.filter((page) => page.status === "done").length;
      sidebar.innerHTML =
        pages.map((page) => {
          const title = page.status === "locked" ? "???" : page.def.title;
          return `<button type="button" class="fj-row" data-select="ch:${escapeHtml(page.def.id)}" aria-current="${current?.def.id === page.def.id}"><span class="fj-mark is-${page.status}" aria-hidden="true">${stageMark(page.status)}</span><span>Chapter ${page.def.number} &middot; ${escapeHtml(title)}</span></button>`;
        }).join("") +
        `<div class="fj-found">${done} / ${pages.length} chapters done.</div>`;
      return;
    }
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
    if (category === "foodweb") {
      sidebar.innerHTML = FOOD_WEB_PAGES.map(
        (page) =>
          `<button type="button" class="fj-row" data-select="fw:${page.id}" aria-current="${selectedId === `fw:${page.id}`}"><img src="${escapeHtml(page.icon)}" alt="" draggable="false"><span>${escapeHtml(page.label)}</span></button>`,
      ).join("");
      return;
    }
    sidebar.innerHTML = `<div class="fj-found">Snapshots you take out in the garden will live here.</div>`;
  }

  function chips(foods: readonly { label: string; icon: string | null }[]): string {
    return foods
      .map((food, index) => {
        const art = food.icon ? `<img src="${escapeHtml(food.icon)}" alt="" draggable="false">` : "";
        const arrow = index > 0 ? `<span class="fj-then">then</span>` : "";
        return `${arrow}<span class="fj-food">${art}${escapeHtml(food.label)}</span>`;
      })
      .join("");
  }

  function dietSection(speciesId: string, speciesName: string): string {
    const diet = dietBlock(speciesId, nameOf);
    if (!diet) return "";
    const live = herdLine(speciesId, herd(), speciesName);
    const lines = [
      `<div class="fj-foods">${chips(diet.foods)}</div>`,
      `<div class="fj-card-sub">Eats: ${escapeHtml(diet.eatsText)}</div>`,
      diet.appetiteText ? `<div class="fj-card-sub">${escapeHtml(diet.appetiteText)}</div>` : "",
      diet.huntText ? `<div class="fj-card-sub">${escapeHtml(diet.huntText)}</div>` : "",
      diet.huntedByText ? `<div class="fj-card-sub">${escapeHtml(diet.huntedByText)}</div>` : "",
      diet.makes
        ? `<div class="fj-makes"><img src="${escapeHtml(diet.makes.icon)}" alt="" draggable="false"><span>Makes: ${escapeHtml(diet.makes.text)}</span></div>`
        : "",
      live
        ? `<div class="fj-herd"><b>${escapeHtml(live.text)}</b>${live.hint ? `<span class="fj-herd-hint">${escapeHtml(live.hint)}</span>` : ""}</div>`
        : "",
    ].join("");
    return `<h3 class="fj-how">Diet &amp; goods</h3><div class="fj-card fj-diet">${lines}</div>`;
  }

  function eaterChips(eaters: readonly OverviewEater[]): string {
    return eaters
      .map((eater) =>
        eater.name === null
          ? `<span class="fj-eater is-unknown">???</span>`
          : `<span class="fj-eater">${escapeHtml(eater.name)}</span>`,
      )
      .join("");
  }

  function renderFoodWebDetail(detail: Element): void {
    const page = selectedId.startsWith("fw:") ? selectedId.slice(3) : "ladder";
    const catalog = ANIMAL_CATALOG.map((entry) => entry.id);
    const found = discoveredSet();
    if (page === "web") {
      const foodRows = foodOverview(catalog, found, nameOf)
        .map(
          (row) => `<div class="fj-card fj-fw-row">
          <div class="fj-fw-head">${row.icon ? `<img src="${escapeHtml(row.icon)}" alt="" draggable="false">` : ""}<div><div class="fj-card-title">${escapeHtml(row.label)}</div><div class="fj-card-sub">${escapeHtml(row.source)}</div></div></div>
          <div class="fj-eaters">${eaterChips(row.eaters)}</div></div>`,
        )
        .join("");
      const hunts = huntOverview(catalog, found, nameOf)
        .map(
          (row) => `<div class="fj-card fj-fw-row">
          <div class="fj-fw-head"><img src="${ICON_BASE}/journal-icon-friend-paw.png" alt="" draggable="false"><div><div class="fj-card-title">${row.hunter.name === null ? "???" : escapeHtml(row.hunter.name)}</div><div class="fj-card-sub">Hunts</div></div></div>
          <div class="fj-eaters">${eaterChips(row.prey)}</div></div>`,
        )
        .join("");
      detail.innerHTML = `<h2 class="fj-name">Who eats what</h2>
        <p class="fj-desc">Each animal has a favourite meal and a back-up. Animals you have not met yet show as ???.</p>
        ${foodRows}
        <h3 class="fj-how">Hunters</h3>
        <p class="fj-desc">Hunters eat what they catch. A fed hunter leaves the flock be.</p>
        ${hunts}`;
      return;
    }
    if (page === "goods") {
      const rows = goodsList(catalog, found, nameOf)
        .map(
          (row) => `<div class="fj-card fj-fw-row">
          <div class="fj-fw-head"><img src="${escapeHtml(row.icon)}" alt="" draggable="false"><div><div class="fj-card-title">${escapeHtml(row.name)}</div><div class="fj-card-sub">Worth ${escapeHtml(row.valueText)}</div></div></div>
          <div class="fj-eaters"><span class="fj-eater-label">Made by</span>${eaterChips(row.makers)}</div></div>`,
        )
        .join("");
      detail.innerHTML = `<h2 class="fj-name">Goods</h2>
        <p class="fj-desc">Fed animals make goods in their house. Collect them to earn coins. A full house lets the rest spoil into scraps.</p>
        ${rows}`;
      return;
    }
    const rungs = HUNGER_LADDER.map(
      (rung) => `<div class="fj-rung is-${rung.level}"><b>${escapeHtml(HUNGER_LABELS[rung.level])}</b><span>${escapeHtml(rung.text)}</span></div>`,
    ).join("");
    const parts = HARMONY_PARTS.map(
      (part) => `<div class="fj-rung"><b>${escapeHtml(part.name)} <i>${part.points}</i></b><span>${escapeHtml(part.text)}</span></div>`,
    ).join("");
    detail.innerHTML = `<h2 class="fj-name">Hunger &amp; Harmony</h2>
      <p class="fj-desc">${escapeHtml(HUNGER_INTRO)}</p>
      <div class="fj-card fj-ladder">${rungs}</div>
      <h3 class="fj-how">Harmony</h3>
      <p class="fj-desc">${escapeHtml(HARMONY_INTRO)}</p>
      <div class="fj-card fj-ladder">${parts}</div>`;
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
      const visual = rowVisual(row);
      const pct = Math.max(0, Math.min(1, row.current / row.target));
      const unit = row.metricUnit ?? (visual.isCount ? "" : " m&sup2;");
      return `<div class="fj-card">${head}
        <div class="fj-req"><img src="${ICON_BASE}/journal-icon-${visual.icon}.png" alt="" draggable="false">
        <span class="fj-req-label">${escapeHtml(visual.label)}</span>
        <span class="fj-bar" role="progressbar" aria-valuenow="${row.current}" aria-valuemax="${row.target}" aria-label="${escapeHtml(visual.label)}"><i style="width:${(pct * 100).toFixed(1)}%"></i></span>
        <span class="fj-numbers">${formatMetric(row.current, visual.isCount)} / ${formatMetric(row.target, visual.isCount)}${unit}</span></div>${alsoNeeds(row.alsoNeeds)}${row.requirementKind === "fruitEaten" ? `<div class="fj-note">${escapeHtml(row.hint)}</div>` : ""}</div>`;
    }).join("");
    const dietHtml = dietShown() ? dietSection(entry.id, entry.name) : "";
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
    ${dietHtml}
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

  function renderStagesDetail(detail: Element): void {
    const pages = chapterList();
    const page = selectedChapter(pages);
    if (!page) {
      detail.innerHTML = `<div class="fj-empty">No chapters yet.</div>`;
      return;
    }
    const { def } = page;
    const eyebrow = `Chapter ${def.number}`;
    const unlockList = (heading: string) =>
      `<h3 class="fj-how">${heading}</h3><ul class="fj-unlocks">${def.unlocks.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
    if (page.status === "locked") {
      detail.innerHTML = `<div class="fj-locked">
        <div class="fj-q-big">?</div>
        <h2 class="fj-name">???</h2>
        <p class="fj-desc">${eyebrow} &middot; Locked</p>
        <p class="fj-desc">Finish the chapter before to find out.</p>
      </div>`;
      return;
    }
    const head = `<p class="fj-desc fj-chapter-eyebrow">${eyebrow} &middot; ${page.status === "done" ? "Completed" : "In progress"}</p>
      <h2 class="fj-name">${escapeHtml(def.title)}</h2>
      <p class="fj-desc">${escapeHtml(def.tagline)}</p>`;
    if (page.status === "done") {
      detail.innerHTML = `${head}
        <div class="fj-card fj-chapter-done"><span class="fj-badge">&#10003; Completed</span></div>
        ${unlockList("Unlocked")}`;
      return;
    }
    const pct = Math.round(Math.max(0, Math.min(1, page.progress)) * 100);
    const parts = page.parts
      .map(
        (part) => `<div class="fj-goal-part${part.done ? " is-done" : ""}"><span class="fj-goal-check" aria-hidden="true">${part.done ? "&#10003;" : ""}</span><span class="fj-goal-text">${escapeHtml(part.label)} <span class="fj-goal-dash">&mdash;</span> <b>${escapeHtml(part.value)}</b></span></div>`,
      )
      .join("");
    detail.innerHTML = `${head}
      <div class="fj-card">
        <div class="fj-goal">Goal: ${escapeHtml(def.goal)}</div>
        <div class="fj-req"><span class="fj-req-label">Progress</span>
        <span class="fj-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Chapter progress"><i style="width:${pct}%"></i></span>
        <span class="fj-numbers">${pct}%</span></div>
        ${parts ? `<div class="fj-goal-parts">${parts}</div>` : ""}
      </div>
      <h3 class="fj-how">Pip's letter</h3>
      <p class="fj-letter">${escapeHtml(def.letter)}</p>
      ${unlockList("Unlocks")}`;
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
      else if (category === "stages") renderStagesDetail(fresh);
      else if (category === "foodweb") renderFoodWebDetail(fresh);
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
      if (tab === "stages") {
        // Opening the tab selects the current chapter.
        const pages = chapterList();
        selectedId = `ch:${(pages.find((page) => page.status === "current") ?? pages[0])?.def.id ?? ""}`;
      } else if (tab === "plants" && PLANT_CATALOG[0]) selectedId = `plant:${PLANT_CATALOG[0].id}`;
      else if (tab === "tools" && GARDEN_TOOLS[0]) selectedId = `tool:${GARDEN_TOOLS[0].id}`;
      else if (tab === "foodweb") selectedId = "fw:ladder";
      else if (tab === "animals") selectedId = selectedId.startsWith("plant:") || selectedId.startsWith("tool:") || selectedId.startsWith("fw:") || selectedId.startsWith("ch:") ? "cow" : selectedId;
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
    setHerdSource(source: (() => readonly HerdAnimal[]) | null): void {
      herdSource = source;
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
    selectPlant(plantId: string): void {
      if (!PLANT_CATALOG.some((entry) => entry.id === plantId)) return;
      category = "plants";
      selectedId = `plant:${plantId}`;
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
