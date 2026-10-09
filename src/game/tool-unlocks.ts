/**
 * Tools and land are unlocks, not gifts.
 *
 * Two currencies meet here. Coins buy things at Pip's shop. Farmer level (the
 * old "garden growth" points, now spelled out) decides what the shop is willing
 * to sell: a new farmer sees a few things, and each level opens more. That keeps
 * the first hour small and stops the farm from sprawling before the player has
 * learned what is already on it.
 *
 * Pure on purpose, like `farm-props.ts`: no Three.js, no DOM, so every rule
 * here is tested headless in `tests/tool-unlocks.test.mjs`.
 */

import { PROP_CATALOG, PROP_ORDER, purchaseProp, type PropId, type PropInventory, type ShopPurchase } from './farm-props'
import type { Wallet } from './sales'

// ------------------------------------------------------------------- grass packs --

export type GrassPack = 'short' | 'tall'

/** Short grass stays a lawn: a blade stops growing about ankle high. */
export const SHORT_GRASS_MAX_HEIGHT = 0.34
/** Tall grass is the old meadow, and then some. */
export const TALL_GRASS_MAX_HEIGHT = 0.95
/** A blade taller than this belongs to the tall meadow, not the lawn. */
export const SHORT_GRASS_CEILING = SHORT_GRASS_MAX_HEIGHT + 0.03

export interface GrassPackDefinition {
  readonly id: GrassPack
  readonly label: string
  readonly maxBladeHeight: number
  /** Sack colour on the tool bar and in the hand: blue for lawn, green for meadow. */
  readonly sack: string
  readonly sackShade: string
  readonly sackLight: string
}

export const GRASS_PACKS: Readonly<Record<GrassPack, GrassPackDefinition>> = {
  short: {
    id: 'short',
    label: 'Short grass',
    maxBladeHeight: SHORT_GRASS_MAX_HEIGHT,
    sack: '#6f9fd8',
    sackShade: '#5a89c4',
    sackLight: '#8db6e8',
  },
  tall: {
    id: 'tall',
    label: 'Tall grass',
    maxBladeHeight: TALL_GRASS_MAX_HEIGHT,
    sack: '#6fb260',
    sackShade: '#5a9a4e',
    sackLight: '#90cc7e',
  },
}

// --------------------------------------------------------------------- upgrades --

export type UpgradeId = 'tall-grass' | 'land-deed'

export interface UpgradeDefinition {
  readonly id: UpgradeId
  readonly name: string
  readonly blurb: string
  readonly color: string
  /** How many can ever be bought. */
  readonly maxOwned: number
  /** Coins for the next one, given how many are already owned. */
  price(owned: number): number
  /** Farmer level the shop wants before it will sell the next one. */
  unlockLevel(owned: number): number
}

/** The first land deed asks for farmer level 1; each later parcel asks for one more. */
export const LAND_DEED_LIMIT = 15

export const UPGRADE_ORDER: readonly UpgradeId[] = ['tall-grass', 'land-deed']

export const UPGRADE_CATALOG: Readonly<Record<UpgradeId, UpgradeDefinition>> = {
  'tall-grass': {
    id: 'tall-grass',
    name: 'Tall Grass Seed Pack',
    blurb: 'A green pack of meadow seed. Your lawn seed stays short; this one grows up past the knees. Press E with the bag out to swap packs.',
    color: '#6fb260',
    maxOwned: 1,
    price: () => 40,
    unlockLevel: () => 1,
  },
  'land-deed': {
    id: 'land-deed',
    name: 'Land Deed',
    blurb: 'Pip pays the surveyor and a new strip of land opens up along the fence line.',
    color: '#d9a85f',
    maxOwned: LAND_DEED_LIMIT,
    price: (owned) => 50 + owned * 25,
    unlockLevel: (owned) => owned + 1,
  },
}

export interface UpgradeLedger {
  count(id: UpgradeId): number
  owns(id: UpgradeId): boolean
  grant(id: UpgradeId): number
  /** Set the count outright; the harness uses it to match a fast-forwarded farm. */
  set(id: UpgradeId, count: number): void
  reset(): void
}

export function createUpgradeLedger(): UpgradeLedger {
  const counts = new Map<UpgradeId, number>()
  return {
    count: (id) => counts.get(id) ?? 0,
    owns: (id) => (counts.get(id) ?? 0) > 0,
    grant(id) {
      const next = Math.min(UPGRADE_CATALOG[id].maxOwned, (counts.get(id) ?? 0) + 1)
      counts.set(id, next)
      return next
    },
    set(id, count) {
      counts.set(id, Math.max(0, Math.min(UPGRADE_CATALOG[id].maxOwned, Math.floor(Number.isFinite(count) ? count : 0))))
    },
    reset: () => counts.clear(),
  }
}

export type UpgradeStatus = 'available' | 'locked' | 'maxed'

export interface UpgradeQuote {
  readonly status: UpgradeStatus
  readonly owned: number
  readonly price: number
  readonly requiredLevel: number
}

function safeLevel(level: number): number {
  return Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0
}

export function upgradeQuote(id: UpgradeId, ledger: UpgradeLedger, farmerLevel: number): UpgradeQuote {
  const definition = UPGRADE_CATALOG[id]
  const owned = ledger.count(id)
  if (owned >= definition.maxOwned) return { status: 'maxed', owned, price: 0, requiredLevel: 0 }
  const requiredLevel = definition.unlockLevel(owned)
  return {
    status: safeLevel(farmerLevel) >= requiredLevel ? 'available' : 'locked',
    owned,
    price: definition.price(owned),
    requiredLevel,
  }
}

export type UpgradeFailure = 'locked' | 'maxed' | 'poor'

export interface UpgradePurchase {
  readonly ok: boolean
  readonly failure: UpgradeFailure | null
  readonly price: number
  readonly requiredLevel: number
}

/**
 * Buy an upgrade: level gate first, then coins. Coins leave the wallet only
 * when the upgrade is actually granted, so a refused purchase costs nothing.
 */
export function purchaseUpgrade(wallet: Wallet, ledger: UpgradeLedger, id: UpgradeId, farmerLevel: number): UpgradePurchase {
  const quote = upgradeQuote(id, ledger, farmerLevel)
  if (quote.status === 'maxed') return { ok: false, failure: 'maxed', price: 0, requiredLevel: 0 }
  if (quote.status === 'locked') return { ok: false, failure: 'locked', price: quote.price, requiredLevel: quote.requiredLevel }
  if (wallet.debit(quote.price) === null) return { ok: false, failure: 'poor', price: quote.price, requiredLevel: quote.requiredLevel }
  ledger.grant(id)
  return { ok: true, failure: null, price: quote.price, requiredLevel: quote.requiredLevel }
}

// ---------------------------------------------------------------- shop props --

/**
 * Farmer level the shop wants before it stocks each prop. The barn and the coop
 * arrive with the first level because the cow and the chickens want them; the
 * showpieces wait, and the oak (and the owl that comes with it) comes last.
 */
export const PROP_UNLOCK_LEVEL: Readonly<Record<PropId, number>> = {
  fence: 0,
  coop: 1,
  barn: 1,
  statue: 2,
  fountain: 2,
  oak: 3,
  'garbage-can': 2,
  dumpster: 3,
  sty: 1,
  'goose-house': 2,
  'frog-house': 2,
  'owl-box': 3,
  'hollow-log': 2,
  'rock-pile': 3,
}

export function propUnlockLevel(id: PropId): number {
  return PROP_UNLOCK_LEVEL[id] ?? 0
}

export function propUnlocked(id: PropId, farmerLevel: number): boolean {
  return safeLevel(farmerLevel) >= propUnlockLevel(id)
}

export interface PropPurchaseAtLevel extends Omit<ShopPurchase, 'failure'> {
  readonly failure: ShopPurchase['failure'] | 'locked'
  readonly locked: boolean
  readonly requiredLevel: number
}

/** `purchaseProp`, but the shop only sells what the farmer's level has opened. */
export function purchasePropAtLevel(
  wallet: Wallet,
  inventory: PropInventory,
  id: PropId,
  farmerLevel: number,
): PropPurchaseAtLevel {
  const requiredLevel = propUnlockLevel(id)
  if (!propUnlocked(id, farmerLevel)) {
    return { ok: false, failure: 'locked', balance: wallet.balance, count: inventory.count(id), locked: true, requiredLevel }
  }
  return { ...purchaseProp(wallet, inventory, id), locked: false, requiredLevel }
}

// ----------------------------------------------------------------- farmer level --

/** Names of what a farmer level opens, for the player panel's level cards. */
export function unlocksAtFarmerLevel(level: number): readonly string[] {
  const target = safeLevel(level)
  const names: string[] = []
  for (const id of UPGRADE_ORDER) {
    const definition = UPGRADE_CATALOG[id]
    for (let owned = 0; owned < definition.maxOwned; owned += 1) {
      if (definition.unlockLevel(owned) === target) names.push(id === 'land-deed' ? `Land deed ${owned + 1}` : definition.name)
    }
  }
  for (const id of PROP_ORDER) {
    if (propUnlockLevel(id) === target) names.push(PROP_CATALOG[id].name)
  }
  return names
}
