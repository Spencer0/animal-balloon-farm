import "./journal-dom.css";
import "./shed-dom.css";
import { PLANT_CATALOG, SEED_PRICES, type PlantId } from "../game/plants";
import { PROP_CATALOG, PROP_ORDER, type PropId } from "../game/farm-props";
import { seedThumb, propThumb } from "./shed-dom";

export type ShopDomTab = "props" | "seeds" | "animals";

export interface ShopBuyResult {
  readonly ok: boolean;
  readonly text: string;
}

export interface ShopDomCallbacks {
  onClose: () => void;
  onBuy: (id: PropId) => ShopBuyResult;
  onBuySeed: (species: PlantId) => ShopBuyResult;
  countsFor: (id: PropId) => number;
  seedsFor: (species: PlantId) => number;
  balance: () => number;
}

export interface ShopDomPanel {
  readonly isOpen: boolean;
  setOpen(open: boolean): void;
  refresh(): void;
  dispose(): void;
}

const PIP_QUOTES = [
  "Pip here! Fresh paint, sturdy posts, zero checkout lines.",
  "Every coin goes back into the fairground, friend.",
  "That fountain? A classic. The ducks approve.",
  "Statues watch the garden while you sleep. Mostly.",
  "Fences love straight lines. Just saying.",
  "An oak? Lovely. Mind the night shift; something hoots in those branches.",
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createShopDomPanel(callbacks: ShopDomCallbacks): ShopDomPanel {
  let open = false;
  let tab: ShopDomTab = "props";
  let selected: PropId = PROP_ORDER[0] ?? "statue";
  let selectedSeed: PlantId = PLANT_CATALOG[0]?.id ?? "clover";
  let lastSignature = "";
  let feedback = "";
  const quote = PIP_QUOTES[Math.floor(Math.random() * PIP_QUOTES.length)] ?? PIP_QUOTES[0];

  const overlay = document.createElement("div");
  overlay.className = "fj-overlay";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.className = "fj-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close shop");
  backdrop.addEventListener("click", () => callbacks.onClose());

  const shop = document.createElement("section");
  shop.className = "fj-journal sh-journal";
  shop.setAttribute("role", "dialog");
  shop.setAttribute("aria-label", "Pip pop-up shop");

  overlay.append(backdrop, shop);
  document.body.append(overlay);

  function signature(): string {
    const props = PROP_ORDER.map((id) => `${id}:${callbacks.countsFor(id)}`).join("|");
    const seeds = PLANT_CATALOG.map((plant) => `${plant.id}:${callbacks.seedsFor(plant.id)}`).join("|");
    return `${tab}|${selected}|${selectedSeed}|${callbacks.balance()}|${props}|${seeds}|${feedback}`;
  }

  function cardsHtml(): string {
    if (tab === "props") {
      const coins = callbacks.balance();
      return PROP_ORDER.map((id) => {
        const def = PROP_CATALOG[id];
        const owned = Math.max(0, callbacks.countsFor(id));
        const afford = coins >= def.price;
        return (
          `<button type="button" class="sh-card" data-select="${id}" aria-current="${selected === id}">` +
          `<span class="sh-count">${owned}x</span>` +
          `<img src="${propThumb(id)}" alt="" draggable="false" />` +
          `<span>${escapeHtml(def.name)}</span><br />` +
          `<span class="sh-pill"${afford ? "" : ` style="opacity:.55"`}>${def.price} coins</span></button>`
        );
      }).join("");
    }
    if (tab === "seeds") {
      return PLANT_CATALOG.map((plant) => {
        const count = Math.max(0, callbacks.seedsFor(plant.id));
        const afford = callbacks.balance() >= SEED_PRICES[plant.id];
        return (
          `<button type="button" class="sh-card" data-select-seed="${plant.id}" aria-current="${selectedSeed === plant.id}">` +
          `<span class="sh-count">${count}x</span>` +
          `<img src="${seedThumb(plant.id)}" alt="" draggable="false" />` +
          `<span>${escapeHtml(plant.name)}</span><br />` +
          `<span class="sh-pill"${afford ? "" : ` style="opacity:.55"`}>${SEED_PRICES[plant.id]} coins</span></button>`
        );
      }).join("");
    }
    return `<div class="sh-locked">The animal pen opens soon. Pip is still building the fence, and the balloons keep escaping.</div>`;
  }

  function previewHtml(): string {
    if (tab !== "props") {
      if (tab === "seeds") {
        const plant = PLANT_CATALOG.find((entry) => entry.id === selectedSeed) ?? PLANT_CATALOG[0];
        if (!plant) return `<div class="sh-locked">Nothing selected.</div>`;
        const price = SEED_PRICES[plant.id];
        const owned = Math.max(0, callbacks.seedsFor(plant.id));
        const afford = callbacks.balance() >= price;
        return (
          `<img src="${seedThumb(plant.id)}" alt="" draggable="false" />` +
          `<h2>${escapeHtml(plant.name)} seed</h2>` +
          `<div class="sh-pills"><span class="sh-pill">${price} coins</span><span class="sh-pill">${owned} in shed</span></div>` +
          `<p class="sh-blurb">${escapeHtml(plant.description)}</p>` +
          `<button type="button" class="sh-btn sh-btn-warm" data-buy-seed="${plant.id}"${afford ? "" : " disabled"}>${afford ? `Buy (${price} coins)` : `Need ${price} coins`}</button>` +
          `<button type="button" class="sh-btn sh-btn-quiet" data-action="close">Keep browsing</button>` +
          `<p class="sh-feedback">${escapeHtml(feedback)}</p>`
        );
      }
      return `<h2>Animals</h2><p class="sh-blurb">No animals for sale yet. Befriend them at the circus instead.</p><p class="sh-feedback">${escapeHtml(feedback)}</p>`;
    }
    const def = PROP_CATALOG[selected];
    if (!def) return `<div class="sh-locked">Nothing selected.</div>`;
    const owned = Math.max(0, callbacks.countsFor(selected));
    const afford = callbacks.balance() >= def.price;
    const buyLabel = afford ? `Buy (${def.price} coins)` : `Need ${def.price} coins`;
    return (
      `<img src="${propThumb(selected)}" alt="" draggable="false" />` +
      `<h2>${escapeHtml(def.name)}</h2>` +
      `<div class="sh-pills"><span class="sh-pill">${def.price} coins</span><span class="sh-pill">${owned} owned</span></div>` +
      `<p class="sh-blurb">${escapeHtml(def.blurb)}</p>` +
      `<button type="button" class="sh-btn sh-btn-warm" data-buy="${selected}"${afford ? "" : " disabled"}>${buyLabel}</button>` +
      `<button type="button" class="sh-btn sh-btn-quiet" data-action="close">Keep browsing</button>` +
      `<p class="sh-feedback">${escapeHtml(feedback)}</p>`
    );
  }

  function render(): void {
    const next = signature();
    if (next === lastSignature && shop.isConnected) return;
    lastSignature = next;
    const coins = callbacks.balance();
    shop.innerHTML =
      `<header class="fj-header">` +
      `<div class="fj-title">Pip's Pop-Up Shop</div>` +
      `<nav class="fj-tabs" aria-label="Shop">` +
      `<button type="button" class="fj-tab" data-tab="props" aria-selected="${tab === "props"}">Props</button>` +
      `<button type="button" class="fj-tab" data-tab="seeds" aria-selected="${tab === "seeds"}">Seeds</button>` +
      `<button type="button" class="fj-tab" data-tab="animals" aria-selected="${tab === "animals"}">Animals</button>` +
      `</nav>` +
      `<span class="sh-coins" aria-label="${coins} coins"><span class="sh-coin" aria-hidden="true"></span>${coins}</span>` +
      `<button type="button" class="fj-close" data-action="close" aria-label="Close shop">&times;</button>` +
      `</header>` +
      `<p class="sh-pip">${escapeHtml(quote)}</p>` +
      `<div class="fj-body"><div class="sh-main">` +
      `<div class="sh-items"><div class="sh-grid">${cardsHtml()}</div></div>` +
      `<aside class="sh-preview" aria-live="polite">${previewHtml()}</aside>` +
      `</div></div>`;
  }

  shop.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-tab],[data-select],[data-select-seed],[data-action],[data-buy],[data-buy-seed]")
      : null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset["action"] === "close") {
      callbacks.onClose();
      return;
    }
    const nextTab = target.dataset["tab"] as ShopDomTab | undefined;
    if (nextTab) {
      tab = nextTab;
      feedback = "";
      lastSignature = "";
      render();
      return;
    }
    const select = target.dataset["select"] as PropId | undefined;
    if (select) {
      selected = select;
      lastSignature = "";
      render();
      return;
    }
    const selectSeed = target.dataset["selectSeed"] as PlantId | undefined;
    if (selectSeed) {
      selectedSeed = selectSeed;
      lastSignature = "";
      render();
      return;
    }
    const buySeed = target.dataset["buySeed"] as PlantId | undefined;
    if (buySeed) {
      feedback = callbacks.onBuySeed(buySeed).text;
      lastSignature = "";
      render();
      return;
    }
    const buy = target.dataset["buy"] as PropId | undefined;
    if (buy) {
      const result = callbacks.onBuy(buy);
      feedback = result.text;
      lastSignature = "";
      render();
    }
  });

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      callbacks.onClose();
    }
  }

  const panel: ShopDomPanel = {
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
        feedback = "";
        const canvas = document.getElementById("game");
        if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
      }
    },
    refresh(): void {
      lastSignature = "";
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
