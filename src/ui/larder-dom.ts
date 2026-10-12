import "./journal-dom.css";
import "./tool-tooltip-dom.css";
import "./larder-dom.css";
import { FEED_CAPACITY, FEED_SACK_MEALS, FEED_SACK_PRICE, HUNGER_LABELS, type FoodReport, type HungerLevel } from "../game/animal-diet";
import { harmonyTier, measureHarmony, type HarmonyReport, type HarmonyResident } from "../game/harmony";
import { buildLarderRows, harmonyParts, oneDecimal, shortageHint, type LarderRow } from "../game/larder";

/**
 * The Harmony chip and the Larder panel.
 *
 * The chip is a small DOM pill on the farm HUD ("Harmony 64 · Settling" with a
 * ring); hovering it explains the four parts of the score, clicking it opens
 * the Larder: one row per food with its stock, what the farm grows and what
 * the animals eat, a hunger summary, the Harmony breakdown, and a button to buy
 * feed. Same Farm Journal look as the shed and the player screen.
 */

export interface LarderSource {
  /** Per food: stock, capacity, supply and demand. */
  report(): readonly FoodReport[];
  /** Adult residents, with how full each is. Matches how the farm counts residents. */
  residents(): readonly HarmonyResident[];
  balance(): number;
}

export interface LarderDomCallbacks {
  source: LarderSource;
  /** "Cow" for "cow". */
  nameOf: (species: string) => string;
  onOpen: () => void;
  onClose: () => void;
  /** Buy a feed sack: the farm debits the wallet and stocks the pantry, or says why not. */
  onBuyFeed: () => { ok: boolean; text: string };
}

export interface LarderDom {
  readonly isOpen: boolean;
  setOpen(open: boolean): void;
  /** Show or hide the chip: it belongs to the bare farm view, not to open panels. */
  setChipVisible(visible: boolean): void;
  /** Cheap enough for the DOM refresh throttle: only writes the DOM when the text changes. */
  refresh(): void;
  dispose(): void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const HUNGER_ORDER: readonly HungerLevel[] = ["full", "fed", "hungry", "starving"];
const CHIP_TOP_GAP = 10;

export function createLarderDom(callbacks: LarderDomCallbacks): LarderDom {
  const { source, nameOf } = callbacks;
  let open = false;
  let chipVisible = false;
  let lastChipText = "";
  let lastChipScore = -1;
  let lastTooltipKey = "";
  let lastSignature = "";
  let feedback: { ok: boolean; text: string } | null = null;
  let pressing = false;

  // ------------------------------------------------------------- the chip --
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "ld-chip";
  chip.hidden = true;
  chip.setAttribute("aria-label", "Harmony. Open the larder");
  const ring = document.createElement("span");
  ring.className = "ld-ring";
  ring.setAttribute("aria-hidden", "true");
  const chipText = document.createElement("span");
  chipText.className = "ld-chip-text";
  chip.append(ring, chipText);

  const tip = document.createElement("section");
  tip.className = "tt-card ld-tip";
  tip.hidden = true;
  tip.dataset["shown"] = "false";
  tip.setAttribute("role", "tooltip");

  let hideTimer: number | undefined;

  function harmonyNow(): HarmonyReport {
    return measureHarmony(source.residents());
  }

  function tipHtml(report: HarmonyReport): string {
    const rows = harmonyParts(report, nameOf).map((part) =>
      `<li class="ld-tip-row"><span class="ld-tip-name">${part.label}</span>` +
      `<span class="ld-tip-pts">${part.points}/${part.max}</span>` +
      `<span class="ld-tip-note">${escapeHtml(part.note)}</span></li>`,
    ).join("");
    return (
      `<header class="tt-header"><span class="tt-title">Harmony ${report.score}</span>` +
      `<span class="tt-key">${escapeHtml(harmonyTier(report.score))}</span></header>` +
      `<div class="tt-body"><p class="tt-desc">A farm is in harmony when many kinds of animals share it evenly, are fed, and live off each other.</p>` +
      `<ul class="ld-tip-list">${rows}</ul>` +
      `<p class="ld-tip-foot">Click to open the larder</p></div>`
    );
  }

  function showTip(): void {
    window.clearTimeout(hideTimer);
    const report = harmonyNow();
    tip.innerHTML = tipHtml(report);
    lastTooltipKey = String(report.score);
    tip.hidden = false;
    const rect = chip.getBoundingClientRect();
    const width = 320;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(rect.bottom + CHIP_TOP_GAP)}px`;
    tip.dataset["shown"] = "true";
  }

  function hideTip(): void {
    tip.dataset["shown"] = "false";
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { tip.hidden = true; }, 140);
  }

  chip.addEventListener("pointerenter", showTip);
  chip.addEventListener("pointerleave", hideTip);
  chip.addEventListener("focus", showTip);
  chip.addEventListener("blur", hideTip);
  chip.addEventListener("click", () => {
    hideTip();
    callbacks.onOpen();
  });

  // ------------------------------------------------------------ the panel --
  const overlay = document.createElement("div");
  overlay.className = "fj-overlay";
  overlay.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.className = "fj-backdrop";
  backdrop.type = "button";
  backdrop.setAttribute("aria-label", "Close larder");
  backdrop.addEventListener("click", () => callbacks.onClose());

  const panelEl = document.createElement("section");
  panelEl.className = "fj-journal ld-journal";
  panelEl.setAttribute("role", "dialog");
  panelEl.setAttribute("aria-label", "The Larder");

  overlay.append(backdrop, panelEl);
  document.body.append(chip, tip, overlay);

  function eatersText(row: LarderRow): string {
    if (row.eaters.length === 0) return row.food === "feed" ? "Eaten by anyone short of their own food" : "Nobody eats this yet";
    return row.eaters.map((eater) => `${escapeHtml(eater.name)} &times;${eater.count}`).join(", ");
  }

  function rowHtml(row: LarderRow, balance: number): string {
    const letter = escapeHtml(row.label.charAt(0));
    const icon =
      `<span class="ld-icon" data-letter="${letter}"><img src="${row.icon}" alt="" draggable="false" /></span>`;
    const numbers = row.food === "feed"
      ? `<span class="ld-nums">Bought, never regrows &middot; eaten only when a field runs short</span>`
      : `<span class="ld-nums"><b>grows ${oneDecimal(row.supply)}</b> / day &middot; <b>eaten ${oneDecimal(row.demand)}</b> / day</span>`;
    const stockText = `${Math.floor(row.stock)} / ${Math.floor(row.capacity)}`;
    return (
      `<li class="ld-row" data-status="${row.status}" data-food="${row.food}">` +
      icon +
      `<div class="ld-main"><div class="ld-line"><span class="ld-name">${escapeHtml(row.label)}</span>` +
      `<span class="ld-stock">${stockText}</span></div>` +
      `<div class="ld-bar" role="img" aria-label="${stockText} meals"><span style="width:${Math.round(row.fill * 100)}%"></span></div>` +
      numbers +
      `<span class="ld-eaters">${eatersText(row)}</span>` +
      (row.food === "feed" ? feedRowHtml(row, balance) : "") +
      `</div></li>`
    );
  }

  function feedRowHtml(row: LarderRow | undefined, balance: number): string {
    const stock = row?.stock ?? 0;
    const full = stock + FEED_SACK_MEALS > FEED_CAPACITY;
    const poor = balance < FEED_SACK_PRICE;
    const note = feedback
      ? `<span class="ld-feedback" data-ok="${feedback.ok}">${escapeHtml(feedback.text)}</span>`
      : `<span class="ld-feedback">Feed keeps a herd going through a lean spell. It costs more than the goods it makes.</span>`;
    return (
      `<div class="ld-buy"><button type="button" class="ld-btn" data-buy="feed" ${full || poor ? 'aria-disabled="true"' : ""}>` +
      `Buy feed sack <span class="ld-btn-sub">${FEED_SACK_MEALS} meals &middot; ${FEED_SACK_PRICE} coins</span></button>${note}</div>`
    );
  }

  function render(): void {
    const residents = source.residents();
    const rows = buildLarderRows(source.report(), residents, nameOf);
    const harmony = measureHarmony(residents);
    const balance = source.balance();
    const hint = shortageHint(rows);
    const signature = JSON.stringify([
      rows.map((row) => [row.food, Math.floor(row.stock), Math.floor(row.capacity), oneDecimal(row.supply), oneDecimal(row.demand), row.status, row.eaters.map((e) => e.species + e.count)]),
      harmony.score, harmony.hunger, balance, hint, feedback,
    ]);
    if (signature === lastSignature && panelEl.isConnected) return;
    lastSignature = signature;

    const foodRows = rows.map((row) => rowHtml(row, balance)).join("");
    const hungerHtml = HUNGER_ORDER.map((level) =>
      `<li class="ld-hunger" data-level="${level}"><b>${harmony.hunger[level]}</b><span>${HUNGER_LABELS[level]}</span></li>`,
    ).join("");
    const partsHtml = harmonyParts(harmony, nameOf).map((part) =>
      `<li class="ld-part"><span class="ld-part-name">${part.label}</span>` +
      `<span class="ld-bar ld-bar-thin"><span style="width:${Math.round((part.points / part.max) * 100)}%"></span></span>` +
      `<span class="ld-part-pts">${part.points}/${part.max}</span>` +
      `<span class="ld-part-note">${escapeHtml(part.note)}</span></li>`,
    ).join("");

    panelEl.innerHTML =
      `<header class="fj-header">` +
      `<div class="fj-title">The Larder</div>` +
      `<span class="ld-coins" aria-label="${balance} coins"><span class="ld-coin" aria-hidden="true"></span>${balance}</span>` +
      `<button type="button" class="fj-close" data-action="close" aria-label="Close larder">&times;</button>` +
      `</header>` +
      `<div class="ld-scroll">` +
      (hint ? `<p class="ld-hint" role="status">${escapeHtml(hint)}</p>` : "") +
      `<h3 class="ld-h">Food</h3><ul class="ld-rows">${foodRows}</ul>` +
      `<div class="ld-split"><section><h3 class="ld-h">Hunger</h3><ul class="ld-hungers">${hungerHtml}</ul>` +
      `<p class="ld-small">${harmony.residents} resident${harmony.residents === 1 ? "" : "s"} on the farm</p></section>` +
      `<section><h3 class="ld-h">Harmony ${harmony.score} &middot; ${escapeHtml(harmonyTier(harmony.score))}</h3>` +
      `<ul class="ld-parts">${partsHtml}</ul></section></div>` +
      `</div>`;
  }

  panelEl.addEventListener("click", (event) => {
    const target = event.target instanceof HTMLElement
      ? event.target.closest("[data-action],[data-buy]")
      : null;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset["action"] === "close") {
      callbacks.onClose();
      return;
    }
    if (target.dataset["buy"] === "feed") {
      feedback = callbacks.onBuyFeed();
      lastSignature = "";
      render();
    }
  });

  // A row rebuilt between mouse-down and mouse-up would swallow the click.
  panelEl.addEventListener("pointerdown", () => { pressing = true; });
  window.addEventListener("pointerup", () => { pressing = false; }, true);
  window.addEventListener("pointercancel", () => { pressing = false; }, true);

  // A missing icon falls back to a letter chip. Image errors do not bubble, so listen while capturing.
  panelEl.addEventListener("error", (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement) img.remove();
  }, true);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      callbacks.onClose();
    }
  }
  window.addEventListener("keydown", onKeyDown, true);

  // ---------------------------------------------------------------- API --
  function refreshChip(): void {
    if (!chipVisible) return;
    const report = harmonyNow();
    const text = `Harmony ${report.score} · ${harmonyTier(report.score)}`;
    if (text !== lastChipText) {
      lastChipText = text;
      chipText.textContent = text;
    }
    if (report.score !== lastChipScore) {
      lastChipScore = report.score;
      ring.style.setProperty("--ld-fill", `${report.score}%`);
    }
    // A tooltip left open follows the score, but only rewrites when it changed.
    if (!tip.hidden && tip.dataset["shown"] === "true" && lastTooltipKey !== String(report.score)) showTip();
  }

  return {
    get isOpen() {
      return open;
    },
    setOpen(next) {
      if (open === next && overlay.hidden === !next) return;
      open = next;
      overlay.hidden = !next;
      if (next) {
        feedback = null;
        lastSignature = "";
        render();
      } else {
        const canvas = document.getElementById("game");
        if (canvas instanceof HTMLElement) canvas.focus({ preventScroll: true });
      }
    },
    setChipVisible(visible) {
      if (visible === chipVisible) return;
      chipVisible = visible;
      chip.hidden = !visible;
      if (visible) refreshChip();
      else hideTip();
    },
    refresh() {
      refreshChip();
      if (open && !pressing) render();
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(hideTimer);
      chip.remove();
      tip.remove();
      overlay.remove();
    },
  };
}
