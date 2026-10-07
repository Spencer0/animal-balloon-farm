/**
 * Sell farewell burst: the pure timing behind the placeholder animation that
 * plays where an animal stood when it sells.
 *
 * Selling used to fire the accomplishment banner ("Mabel waved goodbye!"),
 * which reads as a milestone; a sale is routine farm business, so it gets a
 * quick in-world pop instead -- an expanding gold ring, a rising "+N coins"
 * tag and a fizz of sparks. The curves live here (no Three.js, no DOM) so
 * they stay testable in `tests/sell-animation.test.mjs`; the renderer
 * (`src/ui/sell-burst.ts`) only draws them.
 */

/** How long the burst lives, in seconds. */
export const SELL_BURST_DURATION = 1.15;

export interface SellBurstFrame {
  readonly ringScale: number;
  readonly ringAlpha: number;
  readonly textRise: number;
  readonly textAlpha: number;
  readonly sparkSpread: number;
  readonly sparkAlpha: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Frame curves for `elapsed` seconds into the burst; clamps past the ends. */
export function sellBurstFrame(elapsed: number): SellBurstFrame {
  const safe = Number.isFinite(elapsed) ? elapsed : 0;
  const time = clamp01(safe / SELL_BURST_DURATION);
  const easeOut = 1 - Math.pow(1 - time, 3);
  const rawTextAlpha = time < 0.15 ? time / 0.15 : 1 - (time - 0.15) / 0.85;
  return {
    ringScale: 0.6 + easeOut * 2.8,
    ringAlpha: Math.pow(1 - time, 1.5) * 0.9,
    textRise: time * 2.4,
    textAlpha: clamp01(rawTextAlpha),
    sparkSpread: easeOut * 3.4,
    sparkAlpha: Math.pow(1 - time, 2),
  };
}
