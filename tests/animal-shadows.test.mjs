import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({
  entryPoints: ['src/animals/animal-shadows.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const { shadowSizeFactor } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

test('a grounded animal has a full-size contact shadow', () => {
  assert.equal(shadowSizeFactor(0), 1)
  assert.equal(shadowSizeFactor(-0.2), 1)
})

test('the shadow shrinks monotonically and vanishes once the animal is high', () => {
  let previous = 1
  for (let height = 0.2; height <= 3.2; height += 0.2) {
    const factor = shadowSizeFactor(height)
    assert.ok(factor <= previous)
    previous = factor
  }
  assert.equal(shadowSizeFactor(10), 0)
})
