import "./journal-dom.css";
import "./shed-dom.css";
import { PLANT_CATALOG, SEED_PRICES, type PlantId } from "../game/plants";
import { PROP_CATALOG, PROP_ORDER, type PropId } from "../game/farm-props";
import { seedThumb, propThumb } from "./shed-dom";
import {
  propUnlockLevel,
  UPGRADE_CATALOG,
  UPGRADE_ORDER,
  type UpgradeId,
  type UpgradeQuote,
} from "../game/tool-unlocks";

export type ShopDomTab = "upgrades" | "props" | "seeds" | "animals";

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
  /** Farmer level, which decides what the shop is willing to sell. */
  farmerLevel: () => number;
  quoteUpgrade: (id: UpgradeId) => UpgradeQuote;
  onBuyUpgrade: (id: UpgradeId) => ShopBuyResult;
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
  "Blue pack for a tidy lawn, green pack for a meadow. Press E with the bag out to swap.",
  "Land? I know a surveyor. Reach the next farmer level and I will make the introduction.",
  "The Snower? Balloon on the outside, blizzard on the inside. Press 4 once it is yours.",
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
  let selected: PropId = "fence";
  let selectedUpgrade: UpgradeId = UPGRADE_ORDER[0] ?? "tall-grass";
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
    const upgrades = UPGRADE_ORDER.map((id) => {
      const quote = callbacks.quoteUpgrade(id);
      return `${id}:${quote.status}:${quote.owned}:${quote.price}`;
    }).join("|");
    const seeds = PLANT_CATALOG.map((plant) => `${plant.id}:${callbacks.seedsFor(plant.id)}`).join("|");
    return `${tab}|${selected}|${selectedUpgrade}|${selectedSeed}|${callbacks.balance()}|${callbacks.farmerLevel()}|${props}|${upgrades}|${seeds}|${feedback}`;
  }

  /** A drawn icon for the upgrades, so they need no baked art: a sack for seed, a scroll for land. */
  function upgradeIcon(id: UpgradeId, locked: boolean): string {
    const color = UPGRADE_CATALOG[id].color;
    const body = id === "tall-grass"
      ? `<path d="M32 20c-12 2-18 14-16 30 1 6 6 9 16 9s15-3 16-9c2-16-4-28-16-30z" fill="${color}"/>` +
        `<path d="M26 20c2-6 4-9 6-9s4 3 6 9" fill="none" stroke="#8a6f3f" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M32 50V37m0 4c-4 0-6-3-6-6m6 6c4 0 6-3 6-6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".85"/>`
      : id === "snower"
      ? `<ellipse cx="38" cy="26" rx="15" ry="17" fill="${color}"/>` +
        `<path d="M36 41l-4 5 6-1z" fill="#6fb6dc"/>` +
        `<path d="M33 45L12 52" stroke="#f4fbff" stroke-width="7" stroke-linecap="round"/>` +
        `<path d="M12 52l-6 3" stroke="#f2796b" stroke-width="6" stroke-linecap="round"/>` +
        `<path d="M38 17v18M30 21l16 10M46 21L30 31" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M32 10c0-4 6-4 6 0" fill="none" stroke="#f2796b" stroke-width="3" stroke-linecap="round"/>`
      : `<rect x="12" y="14" width="40" height="36" rx="5" fill="${color}"/>` +
        `<path d="M19 25h26M19 32h26M19 39h14" stroke="#fff6dc" stroke-width="3" stroke-linecap="round" opacity=".9"/>` +
        `<circle cx="44" cy="42" r="6" fill="#b8503f"/>`;
    return `<svg class="sh-upgrade-icon" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"${locked ? ` style="opacity:.5;filter:grayscale(.6)"` : ""}>${body}</svg>`;
  }

  function upgradePill(quote: UpgradeQuote, coins: number): string {
    if (quote.status === "maxed") return `<span class="sh-pill">all owned</span>`;
    if (quote.status === "locked") return `<span class="sh-pill" style="opacity:.55">Farmer Lv ${quote.requiredLevel + 1}</span>`;
    return `<span class="sh-pill"${coins >= quote.price ? "" : ` style="opacity:.55"`}>${quote.price} coins</span>`;
  }

  function cardsHtml(): string {
    if (tab === "upgrades") {
      const coins = callbacks.balance();
      return UPGRADE_ORDER.map((id) => {
        const def = UPGRADE_CATALOG[id];
        const quote = callbacks.quoteUpgrade(id);
        const label = id === "land-deed" && quote.status !== "maxed" ? `${def.name} ${quote.owned + 1}` : def.name;
        return (
          `<button type="button" class="sh-card" data-select-upgrade="${id}" aria-current="${selectedUpgrade === id}">` +
          `<span class="sh-count">${quote.owned}/${def.maxOwned}</span>` +
          upgradeIcon(id, quote.status === "locked") +
          `<span>${escapeHtml(label)}</span><br />` +
          upgradePill(quote, coins) + `</button>`
        );
      }).join("");
    }
    if (tab === "props") {
      const coins = callbacks.balance();
      const level = callbacks.farmerLevel();
      // What the farmer can buy comes first; the locked showpieces trail behind.
      return [...PROP_ORDER].sort((a, b) => propUnlockLevel(a) - propUnlockLevel(b)).map((id) => {
        const def = PROP_CATALOG[id];
        const owned = Math.max(0, callbacks.countsFor(id));
        const need = propUnlockLevel(id);
        const locked = level < need;
        const afford = coins >= def.price;
        const pill = locked
          ? `<span class="sh-pill" style="opacity:.55">Farmer Lv ${need + 1}</span>`
          : `<span class="sh-pill"${afford ? "" : ` style="opacity:.55"`}>${def.price} coins</span>`;
        return (
          `<button type="button" class="sh-card" data-select="${id}" aria-current="${selected === id}">` +
          `<span class="sh-count">${owned}x</span>` +
          `<img src="${propThumb(id)}" alt="" draggable="false"${locked ? ` style="opacity:.45;filter:grayscale(.7)"` : ""} />` +
          `<span>${escapeHtml(def.name)}</span><br />` + pill + `</button>`
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

  function upgradePreviewHtml(): string {
    const def = UPGRADE_CATALOG[selectedUpgrade];
    const quote = callbacks.quoteUpgrade(selectedUpgrade);
    const coins = callbacks.balance();
    const name = selectedUpgrade === "land-deed" && quote.status !== "maxed" ? `${def.name} ${quote.owned + 1}` : def.name;
    const pills = quote.status === "maxed"
      ? `<span class="sh-pill">${quote.owned} owned</span>`
      : `<span class="sh-pill">${quote.price} coins</span><span class="sh-pill">Farmer Lv ${quote.requiredLevel + 1}</span>`;
    let button: string;
    if (quote.status === "maxed") button = `<button type="button" class="sh-btn sh-btn-warm" disabled>Owned</button>`;
    else if (quote.status === "locked") button = `<button type="button" class="sh-btn sh-btn-warm" disabled>Reach farmer level ${quote.requiredLevel + 1}</button>`;
    else if (coins < quote.price) button = `<button type="button" class="sh-btn sh-btn-warm" disabled>Need ${quote.price} coins</button>`;
    else button = `<button type="button" class="sh-btn sh-btn-warm" data-buy-upgrade="${selectedUpgrade}">Buy (${quote.price} coins)</button>`;
    return (
      upgradeIcon(selectedUpgrade, false) +
      `<h2>${escapeHtml(name)}</h2>` +
      `<div class="sh-pills">${pills}</div>` +
      `<p class="sh-blurb">${escapeHtml(def.blurb)}</p>` +
      button +
      `<button type="button" class="sh-btn sh-btn-quiet" data-action="close">Keep browsing</button>` +
      `<p class="sh-feedback">${escapeHtml(feedback)}</p>`
    );
  }

  function previewHtml(): string {
    if (tab === "upgrades") return upgradePreviewHtml();
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
    const need = propUnlockLevel(selected);
    const locked = callbacks.farmerLevel() < need;
    const buyLabel = locked ? `Reach farmer level ${need + 1}` : afford ? `Buy (${def.price} coins)` : `Need ${def.price} coins`;
    return (
      `<img src="${propThumb(selected)}" alt="" draggable="false" />` +
      `<h2>${escapeHtml(def.name)}</h2>` +
      `<div class="sh-pills"><span class="sh-pill">${def.price} coins</span><span class="sh-pill">${owned} owned</span></div>` +
      `<p class="sh-blurb">${escapeHtml(def.blurb)}</p>` +
      `<button type="button" class="sh-btn sh-btn-warm" data-buy="${selected}"${afford && !locked ? "" : " disabled"}>${buyLabel}</button>` +
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
      `<button type="button" class="fj-tab" data-tab="upgrades" aria-selected="${tab === "upgrades"}">Upgrades</button>` +
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
      ? event.target.closest("[data-tab],[data-select],[data-select-seed],[data-select-upgrade],[data-action],[data-buy],[data-buy-seed],[data-buy-upgrade]")
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
    const selectUpgrade = target.dataset["selectUpgrade"] as UpgradeId | undefined;
    if (selectUpgrade) {
      selectedUpgrade = selectUpgrade;
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
    const buyUpgrade = target.dataset["buyUpgrade"] as UpgradeId | undefined;
    if (buyUpgrade) {
      feedback = callbacks.onBuyUpgrade(buyUpgrade).text;
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
    // A tool-unlock film plays over the open shop; its Escape skips the film.
    if (document.body.classList.contains("film-playing")) return;
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
