/**
 * Where the balloon arcade store stands: the treeline just outside the farm's
 * outer ring, among the grove trees.
 *
 * Pure on purpose (no Three.js, no DOM). The shop and the backdrop grove both
 * read this, so the grove leaves a clearing where the store is built.
 */

/** About -82 degrees: the back-right of the grove, in view of the default camera. */
export const SHOP_SITE_ANGLE = -Math.PI * 0.456

/** Past the largest farm footprint (GARDEN_MAX_BOUNDS) and inside the grove's inner edge. */
export const SHOP_SITE_RADIUS = 46

/** Grove trees and distant tents closer than this to the shop are left out. */
export const SHOP_CLEARING_RADIUS = 7

export interface ShopSite {
  readonly x: number
  readonly z: number
  /** Turns the building so its storefront (+Z in the model) faces the farm. */
  readonly rotationY: number
}

export function shopSite(): ShopSite {
  const x = Math.cos(SHOP_SITE_ANGLE) * SHOP_SITE_RADIUS
  const z = Math.sin(SHOP_SITE_ANGLE) * SHOP_SITE_RADIUS
  return { x, z, rotationY: Math.atan2(-x, -z) }
}

export function isInShopClearing(x: number, z: number, clearance = SHOP_CLEARING_RADIUS): boolean {
  const site = shopSite()
  return Math.hypot(x - site.x, z - site.z) < clearance
}
