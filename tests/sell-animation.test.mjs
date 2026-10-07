import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

/**
 * The sell farewell burst keeps its timing pure (no Three.js, no DOM) in
 * `src/game/sell-animation.ts`, so the placeholder curves are verified here
 * rather than only by eye in a browser.
 */
const bundle = async (entry) => {
  const { outputFiles } = await build({
    entryPoints: [`src/game/${entry}.ts`],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const burst = await bundle('sell-animation')
const { SELL_BURST_DURATION, sellBurstFrame } = burst

test('the burst starts popped and ends gone', () => {
  assert.equal(SELL_BURST_DURATION, 1.15)
  const first = sellBurstFrame(0)
  assert.equal(first.ringScale, 0.6)
  assert.equal(first.ringAlpha, 0.9)
  assert.equal(first.textRise, 0)
  assert.equal(first.textAlpha, 0)
  assert.equal(first.sparkSpread, 0)
  assert.equal(first.sparkAlpha, 1)
  const last = sellBurstFrame(SELL_BURST_DURATION)
  assert.equal(last.ringScale, 3.4)
  assert.equal(last.ringAlpha, 0)
  assert.equal(last.textAlpha, 0)
  assert.equal(last.sparkAlpha, 0)
})

test('mid-burst every channel is alive but fading', () => {
  const mid = sellBurstFrame(SELL_BURST_DURATION / 2)
  assert.ok(mid.ringScale > 0.6 && mid.ringScale < 3.4)
  assert.ok(mid.ringAlpha > 0 && mid.ringAlpha < 0.9)
  assert.ok(mid.textRise > 0)
  assert.ok(mid.textAlpha > 0 && mid.textAlpha <= 1)
  assert.ok(mid.sparkSpread > 0)
  assert.ok(mid.sparkAlpha > 0 && mid.sparkAlpha < 1)
})

test('frames clamp past the ends', () => {
  assert.deepEqual(sellBurstFrame(-5), sellBurstFrame(0))
  assert.deepEqual(sellBurstFrame(SELL_BURST_DURATION + 5), sellBurstFrame(SELL_BURST_DURATION))
})
