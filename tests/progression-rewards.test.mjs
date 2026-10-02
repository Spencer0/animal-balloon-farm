import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/game/progression-rewards.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
})
const { startNextEarnedExpansion } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('earned levels start one expansion per completed animation', () => {
  const state = { level: 0, isAnimating: false, expand() { this.level += 1; this.isAnimating = true; return {} } }
  assert.equal(startNextEarnedExpansion(state, 3), true)
  assert.equal(startNextEarnedExpansion(state, 3), false)
  state.isAnimating = false
  assert.equal(startNextEarnedExpansion(state, 3), true)
  state.isAnimating = false
  assert.equal(startNextEarnedExpansion(state, 3), true)
  assert.equal(startNextEarnedExpansion(state, 3), false)
})
