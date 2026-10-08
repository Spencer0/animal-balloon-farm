/**
 * Pip's balloon arcade store unlocks with farmer level 2 (index 1) and is built on its
 * treeline site over one short sequence: the site goes up, the slab is poured,
 * the walls drop in, the marquee lights, the roof settles, the balloons inflate,
 * and the site packs away.
 *
 * Pure on purpose (no Three.js, no DOM). `src/scene/shop-build.ts` maps each
 * pose onto the named nodes in `public/assets/buildings/farm-shop.glb`, and
 * `tests/shop-construction.test.mjs` checks the timeline.
 */

/**
 * Farmer level (zero-based, shown as level 2) that unlocks the shop. It is the
 * first place upgrades are sold, so it cannot wait on land the player has to buy.
 */
export const SHOP_UNLOCK_LEVEL = 1

/** Real seconds for the whole build, from the site going up to the last balloon. */
export const SHOP_BUILD_SECONDS = 12

export type ShopBuildMotion = 'pop' | 'drop'

export interface ShopBuildPart {
  /** Node name in the GLB, without the `SHOP BUILD ` prefix. */
  readonly name: string
  /** `pop` grows in place with an overshoot; `drop` falls in from above and settles. */
  readonly motion: ShopBuildMotion
  /** Window of the build, as 0..1 progress, over which the part arrives. */
  readonly enter: readonly [number, number]
  /** Metres a dropped part falls from. Ignored for pops. */
  readonly drop: number
  /** Optional window over which the part packs away again. */
  readonly exit?: readonly [number, number]
}

/** Build order. Windows overlap so one part's arrival hands off to the next. */
export const SHOP_BUILD_PARTS: readonly ShopBuildPart[] = [
  { name: 'site', motion: 'pop', enter: [0, 0.1], drop: 0, exit: [0.9, 1] },
  { name: 'foundation', motion: 'pop', enter: [0.08, 0.24], drop: 0 },
  { name: 'walls', motion: 'drop', enter: [0.22, 0.46], drop: 3 },
  { name: 'marquee', motion: 'pop', enter: [0.44, 0.6], drop: 0 },
  { name: 'roof', motion: 'drop', enter: [0.58, 0.78], drop: 3.5 },
  { name: 'balloons', motion: 'pop', enter: [0.76, 0.92], drop: 0 },
]

export interface ShopPartPose {
  readonly visible: boolean
  /** Uniform scale about the part's anchor (its bottom centre). */
  readonly scale: number
  /** Metres above the part's rest position. */
  readonly lift: number
}

const HIDDEN: ShopPartPose = { visible: false, scale: 0, lift: 0 }

const OVERSHOOT = 1.70158

export function easeOutBack(t: number): number {
  const u = clamp01(t) - 1
  return 1 + (OVERSHOOT + 1) * u * u * u + OVERSHOOT * u * u
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t)
  return 1 - u * u * u
}

export function easeInCubic(t: number): number {
  const u = clamp01(t)
  return u * u * u
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function windowProgress(time: number, window: readonly [number, number]): number {
  return clamp01((time - window[0]) / (window[1] - window[0]))
}

export function shopUnlocked(farmerLevel: number): boolean {
  return Number.isFinite(farmerLevel) && farmerLevel >= SHOP_UNLOCK_LEVEL
}

/** Build progress, 0..1, for the seconds elapsed since the build started. */
export function shopBuildProgress(elapsedSeconds: number): number {
  return clamp01(elapsedSeconds / SHOP_BUILD_SECONDS)
}

export function shopPartPose(part: ShopBuildPart, progress: number): ShopPartPose {
  const time = clamp01(progress)
  if (time < part.enter[0]) return HIDDEN
  const arrive = windowProgress(time, part.enter)
  // Drops start appearing a quarter of the way down, so they never pop in midair.
  let scale = part.motion === 'pop' ? easeOutBack(arrive) : easeOutCubic(arrive * 4)
  // Drops ease out without overshoot, so a wall never sinks into the slab it lands on.
  const lift = part.motion === 'drop' ? part.drop * (1 - easeOutCubic(arrive)) : 0
  if (part.exit && time >= part.exit[0]) {
    const leave = windowProgress(time, part.exit)
    if (leave >= 1) return HIDDEN
    scale *= 1 - easeInCubic(leave)
  }
  return { visible: true, scale, lift }
}
