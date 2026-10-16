import "./journal-dom.css";
import "./shed-dom.css";
import { PLANT_CATALOG, SEED_PRICES, type PlantCare, type PlantId } from "../game/plants";
import { PROP_CATALOG, PROP_ORDER, type PropId } from "../game/farm-props";
import { seedThumb, propThumb } from "./shed-dom";
import { TREASURE_CATALOG, TREASURE_ORDER, type TreasureId } from "../game/treasures";
import { armGemIcons, gemIconHtml } from "./gem-icon";
import { FEED_CAPACITY, FEED_SACK_MEALS, FEED_SACK_PRICE } from "../game/animal-diet";
import {
  propUnlockLevel,
  UPGRADE_CATALOG,
  UPGRADE_ORDER,
  type UpgradeId,
  type UpgradeQuote,
} from "../game/tool-unlocks";

export type ShopDomTab = "upgrades" | "props" | "seeds" | "animals" | "treasures";

export interface ShopBuyResult {
  readonly ok: boolean;
  readonly text: string;
}

/** One garden helper as the Seeds tab shows it for a species. */
export interface ShopHelperRow {
  readonly care: PlantCare;
  readonly name: string;
  readonly blurb: string;
  /** What earns the ribbon, shown while it is missing. */
  readonly needs: string;
  readonly status: "needs-ribbon" | "available" | "hired";
  readonly price: number;
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
  /** The helpers a species can hire, or an empty list for tap-care plants. */
  helpersFor: (species: PlantId) => readonly ShopHelperRow[];
  onHireHelper: (species: PlantId, care: PlantCare) => ShopBuyResult;
  /** Star gems in the purse. */
  gems: () => number;
  /** Whether the Treasures tab is shown yet (it waits for the first star gem). */
  treasuresVisible: () => boolean;
  quoteTreasure: (id: TreasureId) => { readonly owned: boolean; readonly price: number };
  onBuyTreasure: (id: TreasureId) => ShopBuyResult;
  /** Meals of bought feed in the pantry, and buying one more sack. */
  feedInPantry: () => number;
  onBuyFeed: () => ShopBuyResult;
  /** What Pip stocks in the farm's current chapter; anything else is not shown at all. */
  offers?: ShopOffers;
}

export interface ShopOffers {
  upgrade(id: UpgradeId): boolean;
  seed(id: PlantId): boolean;
  /** The Feed tab. */
  feed(): boolean;
}

const OFFER_EVERYTHING: ShopOffers = { upgrade: () => true, seed: () => true, feed: () => true };

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
  let selectedTreasure: TreasureId = TREASURE_ORDER[0] ?? "helium-pump";
  const offers = (): ShopOffers => callbacks.offers ?? OFFER_EVERYTHING;
  const upgradesOffered = (): UpgradeId[] => UPGRADE_ORDER.filter((id) => offers().upgrade(id));
  const seedsOffered = () => PLANT_CATALOG.filter((plant) => offers().seed(plant.id));
  /** A selection the chapter no longer offers (or never did) falls back to the first one on the shelf. */
  function settleSelection(): void {
    const upgrades = upgradesOffered();
    if (!upgrades.includes(selectedUpgrade) && upgrades[0]) selectedUpgrade = upgrades[0];
    const seeds = seedsOffered();
    if (!seeds.some((plant) => plant.id === selectedSeed) && seeds[0]) selectedSeed = seeds[0].id;
    if (tab === "animals" && !offers().feed()) tab = "props";
  }
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
    const upgrades = upgradesOffered().map((id) => {
      const quote = callbacks.quoteUpgrade(id);
      return `${id}:${quote.status}:${quote.owned}:${quote.price}`;
    }).join("|");
    const seeds = seedsOffered().map((plant) => `${plant.id}:${callbacks.seedsFor(plant.id)}`).join("|");
    const treasures = TREASURE_ORDER.map((id) => `${id}:${callbacks.quoteTreasure(id).owned}`).join("|");
    const helpers = callbacks.helpersFor(selectedSeed).map((row) => `${row.care}:${row.status}`).join("|");
    return `${tab}|${selected}|${selectedUpgrade}|${selectedSeed}|${selectedTreasure}|${callbacks.gems()}|${callbacks.treasuresVisible()}|${treasures}|${callbacks.balance()}|${callbacks.farmerLevel()}|${props}|${upgrades}|${seeds}|${Math.floor(callbacks.feedInPantry())}|${offers().feed()}|${helpers}|${feedback}`;
  }

  /** A drawn icon for the upgrades, so they need no baked art: a sack for seed, a scroll for land. */
  function upgradeIcon(id: UpgradeId, locked: boolean): string {
    const color = UPGRADE_CATALOG[id].color;
    const body = id === "shovel"
      ? `<path d="M30 6h4v26h-4z" fill="#8a6f3f"/><path d="M24 6h16" stroke="#8a6f3f" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M20 32h24c0 14-5 24-12 26-7-2-12-12-12-26z" fill="${color}"/><path d="M32 36v18" stroke="#fff6dc" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`
      : id === "water-bucket"
      ? `<path d="M16 22h32l-4 32H20z" fill="${color}"/><ellipse cx="32" cy="22" rx="16" ry="5" fill="#b3edf0"/>` +
        `<path d="M18 22c0-12 28-12 28 0" fill="none" stroke="#6b5a45" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M23 34h18M24 43h16" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>`
      : id === "tall-grass"
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

  /** A drawn badge per helper: the raincloud, the ladybug, the hedgehog. */
  function helperIcon(care: PlantCare): string {
    const body = care === "water"
      ? `<ellipse cx="20" cy="18" rx="15" ry="10" fill="#f4f7fb" stroke="#6b4a33" stroke-width="2"/><path d="M13 31v5M20 31v6M27 31v5" stroke="#6fb7c9" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M14 17q2 2 4 0M22 17q2 2 4 0" fill="none" stroke="#6b4a33" stroke-width="1.6" stroke-linecap="round"/>`
      : care === "pest"
      ? `<ellipse cx="20" cy="22" rx="13" ry="12" fill="#e0432f" stroke="#6b4a33" stroke-width="2"/><path d="M20 10v24" stroke="#6b4a33" stroke-width="2"/>` +
        `<circle cx="14" cy="19" r="2.6" fill="#24202a"/><circle cx="26" cy="19" r="2.6" fill="#24202a"/><circle cx="15" cy="28" r="2.2" fill="#24202a"/><circle cx="25" cy="28" r="2.2" fill="#24202a"/><circle cx="20" cy="9" r="5" fill="#24202a"/>`
      : `<path d="M6 30c0-12 7-20 15-20s13 7 13 15l-5 5z" fill="#8a5a3a" stroke="#6b4a33" stroke-width="2"/><path d="M8 18l-3-4M13 13l-1-5M20 10l1-5M27 12l3-4" stroke="#6b4a33" stroke-width="2" stroke-linecap="round"/>` +
        `<ellipse cx="29" cy="27" rx="7" ry="6" fill="#f1d7b0" stroke="#6b4a33" stroke-width="2"/><circle cx="35" cy="27" r="2" fill="#24202a"/><circle cx="28" cy="25" r="1.5" fill="#24202a"/>`;
    return `<svg class="sh-helper-icon" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">${body}</svg>`;
  }

  /** How many of a species' chores have earned their Green Thumb ribbon. */
  function ribbonPill(species: PlantId): string {
    const rows = callbacks.helpersFor(species);
    if (!rows.length) return "";
    const earned = rows.filter((row) => row.status !== "needs-ribbon").length;
    return `<span class="sh-pill sh-ribbons">Ribbons ${earned}/${rows.length}</span>`;
  }

  /** The Seeds tab's helpers for a species: earned by ribbon, then hired for coins. */
  function helpersHtml(species: PlantId): string {
    const rows = callbacks.helpersFor(species);
    if (!rows.length) return "";
    const coins = callbacks.balance();
    return (
      `<div class="sh-helpers"><h3>Garden helpers</h3>` +
      rows.map((row) => {
        const action = row.status === "hired"
          ? `<span class="sh-pill sh-hired">Hired</span>`
          : row.status === "available"
          ? `<button type="button" class="sh-btn sh-btn-warm sh-hire" data-hire-helper="${row.care}"${coins >= row.price ? "" : " disabled"}>${coins >= row.price ? `Hire (${row.price})` : `Need ${row.price}`}</button>`
          : `<span class="sh-pill sh-ribbonless">No ribbon yet</span>`;
        return (
          `<div class="sh-helper" data-status="${row.status}">${helperIcon(row.care)}` +
          `<div class="sh-helper-text"><b>${escapeHtml(row.name)}</b><span>${escapeHtml(row.status === "needs-ribbon" ? row.needs : row.blurb)}</span></div>` +
          `${action}</div>`
        );
      }).join("") +
      `</div>`
    );
  }

  /** A drawn icon for each treasure, in the same hand as the upgrades'. */
  function treasureIcon(id: TreasureId, owned: boolean): string {
    const color = TREASURE_CATALOG[id].color;
    const body = id === "helium-pump"
      ? `<rect x="22" y="30" width="20" height="26" rx="4" fill="${color}"/><rect x="18" y="52" width="28" height="6" rx="3" fill="#6b4a33"/>` +
        `<path d="M32 30V12M24 12h16" stroke="#8a6f3f" stroke-width="5" stroke-linecap="round"/><path d="M42 40c10 0 12 8 12 14" fill="none" stroke="#d96f4a" stroke-width="3.5" stroke-linecap="round"/>` +
        `<circle cx="54" cy="52" r="5" fill="#f2796b"/><path d="M27 38h10M27 45h10" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`
      : id === "clover-charm"
      ? `<g fill="${color}"><circle cx="24" cy="24" r="10"/><circle cx="40" cy="24" r="10"/><circle cx="24" cy="38" r="10"/><circle cx="40" cy="38" r="10"/></g>` +
        `<path d="M32 31c-2 10-2 18 4 26" fill="none" stroke="#4d8a42" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="31" r="4" fill="#e4bd58"/>` +
        `<path d="M24 24l6 5M40 24l-6 5M24 38l6-5M40 38l-6-5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/>`
      : id === "rain-barrel"
      ? `<path d="M16 16h32l3 40H13z" fill="#a8774b"/><ellipse cx="32" cy="16" rx="16" ry="5" fill="${color}"/><path d="M14 26h36M13 46h38" stroke="#6b4a33" stroke-width="3.2"/>` +
        `<path d="M32 4c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="#9fe0f2"/>`
      : `<path d="M14 22h36l-4 34H18z" fill="${color}"/><ellipse cx="32" cy="22" rx="18" ry="5.5" fill="#fff0b7"/>` +
        `<path d="M16 22c0-14 32-14 32 0" fill="none" stroke="#8a6f3f" stroke-width="3.2" stroke-linecap="round"/>` +
        `<path d="M32 30l3 7 7 .6-5.4 4.6 1.8 7-6.4-4-6.4 4 1.8-7L22 37.600l7-.6z" fill="#fff6dc"/>`;
    return `<svg class="sh-upgrade-icon" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"${owned ? ` style="opacity:.55"` : ""}>${body}</svg>`;
  }

  function gemPill(price: number, gems: number): string {
    return `<span class="sh-pill"${gems >= price ? "" : ` style="opacity:.55"`}>${gemIconHtml()}${price} ${price === 1 ? "gem" : "gems"}</span>`;
  }

  function upgradePill(quote: UpgradeQuote, coins: number): string {
    if (quote.status === "maxed") return `<span class="sh-pill">all owned</span>`;
    if (quote.status === "locked") return `<span class="sh-pill" style="opacity:.55">Farmer Lv ${quote.requiredLevel + 1}</span>`;
    return `<span class="sh-pill"${coins >= quote.price ? "" : ` style="opacity:.55"`}>${quote.price} coins</span>`;
  }

  function cardsHtml(): string {
    if (tab === "treasures") {
      const gems = callbacks.gems();
      return TREASURE_ORDER.map((id) => {
        const def = TREASURE_CATALOG[id];
        const quote = callbacks.quoteTreasure(id);
        return (
          `<button type="button" class="sh-card" data-select-treasure="${id}" aria-current="${selectedTreasure === id}">` +
          `<span class="sh-count">${quote.owned ? 1 : 0}/1</span>` +
          treasureIcon(id, false) +
          `<span>${escapeHtml(def.name)}</span><br />` +
          (quote.owned ? `<span class="sh-pill">owned</span>` : gemPill(quote.price, gems)) + `</button>`
        );
      }).join("") + `<p class="sh-hint" style="grid-column:1/-1">Star gems come from the starhorn, a balloon pony that only visits a farm in harmony. Each treasure is one-of-a-kind and lasts for good.</p>`;
    }
    if (tab === "upgrades") {
      const coins = callbacks.balance();
      return upgradesOffered().map((id) => {
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
      return seedsOffered().map((plant) => {
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
    // The Feed tab: one product, bought feed for when the farm grows too little.
    const afford = callbacks.balance() >= FEED_SACK_PRICE;
    return (
      `<button type="button" class="sh-card" aria-current="true">` +
      `<span class="sh-count">${Math.floor(callbacks.feedInPantry())} meals</span>` +
      `<img src="assets/goods/food-feed.png" alt="" draggable="false" />` +
      `<span>Feed sack</span><br />` +
      `<span class="sh-pill"${afford ? "" : ` style="opacity:.55"`}>${FEED_SACK_PRICE} coins</span></button>`
    );
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

  function treasurePreviewHtml(): string {
    const def = TREASURE_CATALOG[selectedTreasure];
    const quote = callbacks.quoteTreasure(selectedTreasure);
    const gems = callbacks.gems();
    const pills = quote.owned ? `<span class="sh-pill">owned</span>` : gemPill(quote.price, gems);
    let button: string;
    if (quote.owned) button = `<button type="button" class="sh-btn sh-btn-warm" disabled>Owned</button>`;
    else if (gems < quote.price) button = `<button type="button" class="sh-btn sh-btn-warm" disabled>Need ${quote.price} star gems</button>`;
    else button = `<button type="button" class="sh-btn sh-btn-warm" data-buy-treasure="${selectedTreasure}">Buy (${quote.price} star gems)</button>`;
    return (
      treasureIcon(selectedTreasure, false) +
      `<h2>${escapeHtml(def.name)}</h2>` +
      `<div class="sh-pills">${pills}</div>` +
      `<p class="sh-blurb">${escapeHtml(def.blurb)}</p>` +
      button +
      `<button type="button" class="sh-btn sh-btn-quiet" data-action="close">Keep browsing</button>` +
      `<p class="sh-feedback">${escapeHtml(feedback)}</p>`
    );
  }

  function previewHtml(): string {
    if (tab === "treasures") return treasurePreviewHtml();
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
          `<div class="sh-pills"><span class="sh-pill">${price} coins</span><span class="sh-pill">${owned} in shed</span>${ribbonPill(plant.id)}</div>` +
          `<p class="sh-blurb">${escapeHtml(plant.description)}</p>` +
          `<button type="button" class="sh-btn sh-btn-warm" data-buy-seed="${plant.id}"${afford ? "" : " disabled"}>${afford ? `Buy (${price} coins)` : `Need ${price} coins`}</button>` +
          `<button type="button" class="sh-btn sh-btn-quiet" data-action="close">Keep browsing</button>` +
          `<p class="sh-feedback">${escapeHtml(feedback)}</p>` +
          helpersHtml(plant.id)
        );
      }
      const afford = callbacks.balance() >= FEED_SACK_PRICE;
      const pantry = Math.floor(callbacks.feedInPantry());
      const full = pantry + FEED_SACK_MEALS > FEED_CAPACITY;
      const label = full ? "Pantry is full" : afford ? `Buy (${FEED_SACK_PRICE} coins)` : `Need ${FEED_SACK_PRICE} coins`;
      return (
        `<img src="assets/goods/food-feed.png" alt="" draggable="false" />` +
        `<h2>Feed sack</h2>` +
        `<div class="sh-pills"><span class="sh-pill">${FEED_SACK_PRICE} coins</span><span class="sh-pill">${FEED_SACK_MEALS} meals</span><span class="sh-pill">${pantry} / ${FEED_CAPACITY} in the pantry</span></div>` +
        `<p class="sh-blurb">Farm animals eat feed when their own food runs out. It costs more than their goods earn, so use it to get a herd through a lean spell. Pigs eat slop first (from a garbage can, or goods spoiling in a full house), then grass.</p>` +
        `<button type="button" class="sh-btn sh-btn-warm" data-buy-feed="1"${afford && !full ? "" : " disabled"}>${label}</button>` +
        `<button type="button" class="sh-btn sh-btn-quiet" data-action="close">Keep browsing</button>` +
        `<p class="sh-feedback">${escapeHtml(feedback)}</p>`
      );
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
    settleSelection();
    const next = signature();
    if (next === lastSignature && shop.isConnected) return;
    lastSignature = next;
    const coins = callbacks.balance();
    const gems = callbacks.gems();
    const showTreasures = callbacks.treasuresVisible() || tab === "treasures";
    shop.innerHTML =
      `<header class="fj-header">` +
      `<div class="fj-title">Pip's Pop-Up Shop</div>` +
      `<nav class="fj-tabs" aria-label="Shop">` +
      `<button type="button" class="fj-tab" data-tab="upgrades" aria-selected="${tab === "upgrades"}">Upgrades</button>` +
      `<button type="button" class="fj-tab" data-tab="props" aria-selected="${tab === "props"}">Props</button>` +
      `<button type="button" class="fj-tab" data-tab="seeds" aria-selected="${tab === "seeds"}">Seeds</button>` +
      (offers().feed() ? `<button type="button" class="fj-tab" data-tab="animals" aria-selected="${tab === "animals"}">Feed</button>` : "") +
      (showTreasures ? `<button type="button" class="fj-tab" data-tab="treasures" aria-selected="${tab === "treasures"}">Treasures</button>` : "") +
      `</nav>` +
      `<span class="sh-purse"><span class="sh-coins" aria-label="${coins} coins"><span class="sh-coin" aria-hidden="true"></span>${coins}</span>` +
      `<span class="sh-coins" aria-label="${gems} star gems">${gemIconHtml()}${gems}</span></span>` +
      `<button type="button" class="fj-close" data-action="close" aria-label="Close shop">&times;</button>` +
      `</header>` +
      `<p class="sh-pip">${escapeHtml(quote)}</p>` +
      `<div class="fj-body"><div class="sh-main">` +
      `<div class="sh-items"><div class="sh-grid">${cardsHtml()}</div></div>` +
      `<aside class="sh-preview" aria-live="polite">${previewHtml()}</aside>` +
      `</div></div>`;
    armGemIcons(shop);
  }

  shop.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-tab],[data-select],[data-select-seed],[data-select-upgrade],[data-select-treasure],[data-action],[data-buy],[data-buy-seed],[data-buy-upgrade],[data-buy-treasure],[data-buy-feed],[data-hire-helper]")
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
    const selectTreasure = target.dataset["selectTreasure"] as TreasureId | undefined;
    if (selectTreasure) {
      selectedTreasure = selectTreasure;
      lastSignature = "";
      render();
      return;
    }
    const buyTreasure = target.dataset["buyTreasure"] as TreasureId | undefined;
    if (buyTreasure) {
      feedback = callbacks.onBuyTreasure(buyTreasure).text;
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
    const hireHelper = target.dataset["hireHelper"] as PlantCare | undefined;
    if (hireHelper) {
      feedback = callbacks.onHireHelper(selectedSeed, hireHelper).text;
      lastSignature = "";
      render();
      return;
    }
    if (target.dataset["buyFeed"]) {
      feedback = callbacks.onBuyFeed().text;
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
      overlay.remove();
    },
  };

  return panel;
}
