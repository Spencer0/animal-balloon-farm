import "./journal-dom.css";
import "./shed-dom.css";
import { PLANT_CATALOG, type PlantId } from "../game/plants";
import { PROP_CATALOG, PROP_ORDER, type PropId } from "../game/farm-props";

export type ShedDomTab = "seeds" | "props";

export interface ShedDomCallbacks {
  onClose: () => void;
  onPlant: (species: PlantId) => void;
  onPlace: (id: PropId) => void;
  seedsFor: (species: PlantId) => number;
  countsFor: (id: PropId) => number;
  balance: () => number;
}

export interface ShedDomPanel {
  readonly isOpen: boolean;
  setOpen(open: boolean): void;
  refresh(): void;
  dispose(): void;
}

const FAV_KEY = "shed-favourites-v1";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadFavs(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return new Set();
  }
}

export function seedThumb(id: PlantId): string {
  return `assets/seeds/seed-${id}.png`;
}

export function propThumb(id: PropId): string {
  return `assets/props/prop-${id}.png`;
}

export function createShedDomPanel(callbacks: ShedDomCallbacks): ShedDomPanel {
  let open = false;
  let tab: ShedDomTab = "seeds";
  let selected = "seed:clover";
  let lastSignature = "";
  const favs = loadFavs();

  const overlay = document.createElement("div");
  overlay.className = "fj-overlay";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.className = "fj-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close shed");
  backdrop.addEventListener("click", () => callbacks.onClose());

  const shed = document.createElement("section");
  shed.className = "fj-journal sh-journal";
  shed.setAttribute("role", "dialog");
  shed.setAttribute("aria-label", "The Shed inventory");

  overlay.append(backdrop, shed);
  document.body.append(overlay);

  function persistFavs(): void {
    try {
      window.localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
    } catch {
      /* private mode: favourites do not survive */
    }
  }

  function signature(): string {
    const seeds = PLANT_CATALOG.map((p) => `${p.id}:${callbacks.seedsFor(p.id)}`).join("|");
    const props = PROP_ORDER.map((id) => `${id}:${callbacks.countsFor(id)}`).join("|");
    return `${tab}|${selected}|${callbacks.balance()}|${seeds}|${props}|${[...favs].sort().join(",")}`;
  }

  /** Keys of what the shed actually holds on this tab: an empty slot is not shown at all. */
  function stockedKeys(): string[] {
    if (tab === "seeds") return PLANT_CATALOG.filter((plant) => callbacks.seedsFor(plant.id) > 0).map((plant) => `seed:${plant.id}`);
    return PROP_ORDER.filter((id) => callbacks.countsFor(id) > 0).map((id) => `prop:${id}`);
  }

  function emptyHtml(): string {
    return `<div class="sh-locked">Nothing here yet. Pip's shop sells ${tab === "seeds" ? "seeds" : "props"}.</div>`;
  }

  function cardsHtml(): string {
    if (stockedKeys().length === 0) return emptyHtml();
    if (tab === "seeds") {
      return PLANT_CATALOG.filter((plant) => callbacks.seedsFor(plant.id) > 0).map((plant) => {
        const count = Math.max(0, callbacks.seedsFor(plant.id));
        const key = `seed:${plant.id}`;
        const star = favs.has(key) ? `<span class="sh-fav" aria-hidden="true">&#9733;</span>` : "";
        return (
          `<button type="button" class="sh-card" data-select="${key}" aria-current="${selected === key}">` +
          `<span class="sh-count">${count}x</span>${star}` +
          `<img src="${seedThumb(plant.id)}" alt="" draggable="false" />` +
          `<span>${escapeHtml(plant.name)}</span></button>`
        );
      }).join("");
    }
    return PROP_ORDER.filter((id) => callbacks.countsFor(id) > 0).map((id) => {
      const def = PROP_CATALOG[id];
      const count = Math.max(0, callbacks.countsFor(id));
      const key = `prop:${id}`;
      const star = favs.has(key) ? `<span class="sh-fav" aria-hidden="true">&#9733;</span>` : "";
      return (
        `<button type="button" class="sh-card" data-select="${key}" aria-current="${selected === key}">` +
        `<span class="sh-count">${count}x</span>${star}` +
        `<img src="${propThumb(id)}" alt="" draggable="false" />` +
        `<span>${escapeHtml(def.name)}</span></button>`
      );
    }).join("");
  }

  function previewHtml(): string {
    if (stockedKeys().length === 0) return `<div class="sh-locked">Empty shelves.</div>`;
    if (selected.startsWith("seed:")) {
      const id = selected.slice("seed:".length) as PlantId;
      const plant = PLANT_CATALOG.find((entry) => entry.id === id) ?? PLANT_CATALOG[0];
      if (!plant) return `<div class="sh-locked">No seeds yet.</div>`;
      const count = Math.max(0, callbacks.seedsFor(plant.id));
      const favLabel = favs.has(`seed:${plant.id}`) ? "Favourited" : "Favourite";
      const action =
        count <= 0
          ? `<button type="button" class="sh-btn sh-btn-primary" disabled>Out of seeds</button>`
          : `<button type="button" class="sh-btn sh-btn-primary" data-plant="${plant.id}">Plant (${count} left)</button>`;
      return (
        `<img src="${seedThumb(plant.id)}" alt="" draggable="false" />` +
        `<h2>${escapeHtml(plant.name)}</h2>` +
        `<div class="sh-pills"><span class="sh-pill">${escapeHtml(plant.subtitle)}</span><span class="sh-pill">${count} in shed</span></div>` +
        `<p class="sh-blurb">${escapeHtml(plant.description)}</p>` + action +
        `<button type="button" class="sh-btn sh-btn-quiet" data-fav="seed:${plant.id}">${favLabel}</button>` +
        `<p class="sh-feedback" data-feedback></p>`
      );
    }
    const id = selected.slice("prop:".length) as PropId;
    const def = PROP_CATALOG[id];
    if (!def) return `<div class="sh-locked">Nothing selected.</div>`;
    const count = Math.max(0, callbacks.countsFor(id));
    const favLabel = favs.has(`prop:${id}`) ? "Favourited" : "Favourite";
    const action =
      count <= 0
        ? `<button type="button" class="sh-btn sh-btn-primary" disabled>None to place</button>`
        : `<button type="button" class="sh-btn sh-btn-primary" data-place="${id}">Place in garden</button>`;
    return (
      `<img src="${propThumb(id)}" alt="" draggable="false" />` +
      `<h2>${escapeHtml(def.name)}</h2>` +
      `<div class="sh-pills"><span class="sh-pill">${count} owned</span></div>` +
      `<p class="sh-blurb">${escapeHtml(def.blurb)}</p>` + action +
      `<button type="button" class="sh-btn sh-btn-quiet" data-fav="prop:${id}">${favLabel}</button>` +
      `<p class="sh-feedback" data-feedback></p>`
    );
  }

  function render(): void {
    // A shelf that ran out cannot stay selected; fall to the first thing still stocked.
    const stocked = stockedKeys();
    if (!stocked.includes(selected)) selected = stocked[0] ?? selected;
    const next = signature();
    if (next === lastSignature && shed.isConnected) return;
    lastSignature = next;
    const coins = callbacks.balance();
    shed.innerHTML =
      `<header class="fj-header">` +
      `<div class="fj-title">The Shed</div>` +
      `<nav class="fj-tabs" aria-label="Inventory">` +
      `<button type="button" class="fj-tab" data-tab="seeds" aria-selected="${tab === "seeds"}">Seeds</button>` +
      `<button type="button" class="fj-tab" data-tab="props" aria-selected="${tab === "props"}">Props</button>` +
      `</nav>` +
      `<span class="sh-coins" aria-label="${coins} coins"><span class="sh-coin" aria-hidden="true"></span>${coins}</span>` +
      `<button type="button" class="fj-close" data-action="close" aria-label="Close shed">&times;</button>` +
      `</header>` +
      `<div class="fj-body"><div class="sh-main">` +
      `<div class="sh-items"><div class="sh-grid">${cardsHtml()}</div></div>` +
      `<aside class="sh-preview" aria-live="polite">${previewHtml()}</aside>` +
      `</div></div>`;
  }

  shed.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-tab],[data-select],[data-action],[data-plant],[data-place],[data-fav]")
      : null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset["action"] === "close") {
      callbacks.onClose();
      return;
    }
    const nextTab = target.dataset["tab"] as ShedDomTab | undefined;
    if (nextTab) {
      tab = nextTab;
      lastSignature = "";
      render();
      return;
    }
    const select = target.dataset["select"];
    if (select) {
      selected = select;
      lastSignature = "";
      render();
      return;
    }
    const fav = target.dataset["fav"];
    if (fav) {
      if (favs.has(fav)) favs.delete(fav);
      else favs.add(fav);
      persistFavs();
      lastSignature = "";
      render();
      return;
    }
    const plant = target.dataset["plant"] as PlantId | undefined;
    if (plant) {
      callbacks.onPlant(plant);
      return;
    }
    const place = target.dataset["place"] as PropId | undefined;
    if (place) callbacks.onPlace(place);
  });

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      callbacks.onClose();
    }
  }

  const panel: ShedDomPanel = {
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
    refresh(): void {
      if (open) render();
    },
    dispose(): void {
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
    },
  };

  window.addEventListener("keydown", onKeyDown, true);
  return panel;
}
