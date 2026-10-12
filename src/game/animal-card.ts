/**
 * Animal info card: the pure rules behind the click-an-animal popup.
 *
 * The card itself is a DOM panel (`src/ui/animal-card-dom.ts`) and stays a
 * renderer: it draws whatever this module says is true. Stages, sell gating,
 * the Helium and Hunger meters and the rename rules live here so they stay
 * testable in
 * `tests/animal-card.test.mjs` without a browser -- the same split the animal
 * condition ladder uses on purpose.
 */

import {
  dietOf,
  FOOD_LABELS,
  GOODS,
  HUNGER_LABELS,
  hungerLevel,
  isPredatorDiet,
  PRODUCE,
  type FoodId,
  type GoodSpec,
  type HungerLevel,
} from './animal-diet';
import { houseFor } from './animal-housing';

/** The first stage that counts as settled. Matches `canSellAnimal` in sales. */
export const RESIDENT_STAGE = 3;

/** A balloon that has lost nothing reads full. */
export const HELIUM_LEVEL = 1;

/** Status word written beside the Helium meter. */
export const HELIUM_STATUS = 'helium';

/** Longest display name the card accepts when renaming. */
export const MAX_NAME_LENGTH = 24;

/** The Helium meter's fill, 0..1. Only a resident whose farm stopped suiting it ever reads below full. */
export function heliumLevel(level: number = HELIUM_LEVEL): number {
  return Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : HELIUM_LEVEL;
}

/** The status word beside the Helium meter: a leaking balloon says so. */
export function heliumStatus(level: number = HELIUM_LEVEL): string {
  return heliumLevel(level) < HELIUM_LEVEL ? 'leaking' : HELIUM_STATUS;
}

export type AnimalStageGroup = 'Visitor' | 'Resident';

/** Stages below resident are visitors; resident and above are residents. */
export function stageGroup(stage: number): AnimalStageGroup {
  const normalized = Number.isFinite(stage) ? Math.floor(stage) : 0;
  return normalized >= RESIDENT_STAGE ? 'Resident' : 'Visitor';
}

/** Chip copy, e.g. "Stage 3 · Resident". Clamped to the four real stages. */
export function stageChipLabel(stage: number): string {
  const normalized = Number.isFinite(stage)
    ? Math.min(4, Math.max(1, Math.floor(stage)))
    : 1;
  return `Stage ${normalized} · ${stageGroup(normalized)}`;
}

export interface SellVisibility {
  readonly stage: number;
  readonly sellable: boolean;
}

/**
 * The Sell button only exists for settled residents. `sellable` is the live
 * `canSell` answer from the animal model; the stage check keeps the card
 * honest even if a caller passes a stale flag.
 */
export function canShowSellButton(status: SellVisibility): boolean {
  return status.sellable && status.stage >= RESIDENT_STAGE;
}

/** A rename commits only when it leaves 1..24 non-blank characters. */
export function isValidAnimalName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= MAX_NAME_LENGTH;
}

/** Trims a rename for storage; callers check `isValidAnimalName` first. */
export function sanitizeAnimalName(name: string): string {
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

export type AnimalCardMode = 'info' | 'confirm';

export interface AnimalCardState {
  mode: AnimalCardMode;
  editing: boolean;
}

/** Fresh popup state: info mode, not renaming. */
export function createAnimalCardState(): AnimalCardState {
  return { mode: 'info', editing: false };
}

/** First Sell press arms the "Sure?" confirm instead of selling. */
export function armSellConfirm(state: AnimalCardState): void {
  state.mode = 'confirm';
}

/** Keep, close, or a successful sale all stand the confirm down. */
export function cancelSellConfirm(state: AnimalCardState): void {
  state.mode = 'info';
}

/** Closing the card forgets the confirm and any half-typed rename. */
export function resetAnimalCardState(state: AnimalCardState): void {
  state.mode = 'info';
  state.editing = false;
}
export interface InfoCardAnchor {
  readonly x: number;
  readonly y: number;
}

export interface InfoCardBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where the pinned info card sits for a balloon at anchor (design units).
 * The card prefers the right side of the balloon, flips left when the right
 * edge would clip, and always clamps fully on screen. Pure so the garden
 * harness can assert placement without opening a browser.
 */
export function placeInfoCard(
  anchor: InfoCardAnchor,
  card: { readonly width: number; readonly height: number },
  view: InfoCardBounds,
  gap = 28,
): InfoCardAnchor {
  const halfWidth = card.width / 2;
  const halfHeight = card.height / 2;
  let centerX = anchor.x + gap + halfWidth;
  if (centerX + halfWidth > view.right) centerX = anchor.x - gap - halfWidth;
  centerX = Math.min(view.right - halfWidth, Math.max(view.left + halfWidth, centerX));
  const centerY = Math.min(view.top - halfHeight, Math.max(view.bottom + halfHeight, anchor.y));
  return { x: centerX, y: centerY };
}

// ---------------------------------------------------------------- hunger --

/** Meter colour family for each rung: green, olive, amber, red. */
export type HungerTone = 'full' | 'fed' | 'hungry' | 'starving';

export interface HungerView {
  readonly level: HungerLevel;
  /** The rung word beside the meter: Full / Fed / Hungry / Starving. */
  readonly label: string;
  /** The bar's fill, 0..1. */
  readonly fill: number;
  readonly tone: HungerTone;
  /** One plain line for a hungry animal; null when there is nothing to warn about. */
  readonly hint: string | null;
}

const HUNGER_HINTS: Readonly<Record<HungerLevel, string | null>> = {
  full: null,
  fed: null,
  hungry: "Hungry animals don't breed or make goods. Grow more of what it eats, or buy feed sacks on Pip's Feed tab.",
  starving: "Starving: it is losing helium. Buy feed sacks on Pip's Feed tab, or grow more of what it eats.",
};

/** Everything the Hunger meter shows for a fullness (1 = just ate, 0 = empty). */
export function hungerView(fullness: number): HungerView {
  const fill = Number.isFinite(fullness) ? Math.min(1, Math.max(0, fullness)) : 1;
  const level = hungerLevel(fill);
  return { level, label: HUNGER_LABELS[level], fill, tone: level, hint: HUNGER_HINTS[level] };
}

export interface EatsView {
  /** Foods in the order it prefers them (empty when the species has no diet). */
  readonly foods: readonly FoodId[];
  /** Plain text, e.g. "Eats: Grass, then feed sacks". */
  readonly text: string;
  readonly predator: boolean;
}

/** "Grass, then feed sacks": the first food as named, later ones in lower case. */
export function foodListLabel(foods: readonly FoodId[]): string {
  return foods
    .map((food, index) => (index === 0 ? FOOD_LABELS[food] : FOOD_LABELS[food].toLowerCase()))
    .join(', then ');
}

export function eatsView(species: string): EatsView {
  const diet = dietOf(species);
  if (!diet) return { foods: [], text: 'Eats: whatever it finds', predator: false };
  if (isPredatorDiet(species)) return { foods: ['prey'], text: 'Eats: what it catches', predator: true };
  return { foods: diet.foods, text: `Eats: ${foodListLabel(diet.foods)}`, predator: false };
}

export interface MakesView {
  readonly good: GoodSpec;
  /** Plain text, e.g. "Makes: Milk in its barn, when fed". */
  readonly text: string;
}

export function makesView(species: string): MakesView | null {
  const recipe = PRODUCE[species];
  if (!recipe) return null;
  const good = GOODS[recipe.good];
  const house = houseFor(species);
  const where = house ? ` in its ${house.replace(/-/g, ' ')}` : '';
  const needs = recipe.needsProp ? ` (needs ${/^[aeiou]/.test(recipe.needsProp) ? 'an' : 'a'} ${recipe.needsProp} on the farm)` : '';
  return { good, text: `Makes: ${good.name}${where}, when fed${needs}` };
}

/** The predator line: a hungry (or visiting) one hunts, a fed one laze about. */
export function huntingStatus(hunting: boolean): string {
  return hunting ? 'Hunting' : 'Lazing (fed)';
}
