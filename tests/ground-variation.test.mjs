import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const { applyGroundVariation, createGroundVariationBounds, getGroundVariationField, sampleGroundField, GROUND_FIELD_EXTENT } = await load('src/scene/ground-variation.ts')
const { farmEdgeFactor } = await load('src/game/farm-footprint.ts')
const THREE = await import('three')

function compile(options) {
  const material = new THREE.MeshStandardMaterial()
  applyGroundVariation(material, options)
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>\n',
    fragmentShader: '#include <common>\n#include <color_fragment>\n',
  }
  material.onBeforeCompile(shader, {})
  return { material, shader }
}

test('the bounds handle retargets the shared uniform in place', () => {
  const bounds = createGroundVariationBounds({ halfWidth: 10, halfDepth: 9, footprint: 'organic' })
  const { shader } = compile({ kind: 'meadow', bounds })
  assert.equal(shader.uniforms.uGvHalf.value, bounds.half)
  assert.equal(shader.uniforms.uGvOrganic, bounds.organic)
  assert.deepEqual([bounds.half.x, bounds.half.y, bounds.organic.value], [10, 9, 1])

  bounds.set({ halfWidth: 14, halfDepth: 12 })
  assert.deepEqual([bounds.half.x, bounds.half.y, bounds.organic.value], [14, 12, 0])
  assert.equal(shader.uniforms.uGvHalf.value.x, 14, 'compiled shaders see the new size without a recompile')
})

test('the patch hooks world position into the vertex and colour stages', () => {
  const bounds = createGroundVariationBounds({ halfWidth: 10, halfDepth: 9 })
  const { shader } = compile({ kind: 'lawn', bounds })
  assert.match(shader.vertexShader, /vGvWorld = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;/)
  assert.match(shader.fragmentShader, /#include <color_fragment>\n\s*\{/)
  assert.match(shader.fragmentShader, /diffuseColor\.rgb = c;/)
})

test('program cache keys differ by kind and space so programs are not shared', () => {
  const bounds = createGroundVariationBounds({ halfWidth: 10, halfDepth: 9 })
  const keys = [
    compile({ kind: 'meadow', bounds }),
    compile({ kind: 'lawn', bounds }),
    compile({ kind: 'gravel', bounds, localSpace: true }),
  ].map(({ material }) => material.customProgramCacheKey())
  assert.equal(new Set(keys).size, keys.length)
})

test('each kind compiles in only the effects it needs', () => {
  const bounds = createGroundVariationBounds({ halfWidth: 10, halfDepth: 9 })
  const defines = (options) => [...compile(options).shader.fragmentShader.matchAll(/#define (GV_\w+)/g)].map((m) => m[1]).sort()
  assert.deepEqual(defines({ kind: 'meadow', bounds }), ['GV_DISTANCE', 'GV_FIELD'])
  assert.deepEqual(defines({ kind: 'lawn', bounds }), ['GV_FIELD', 'GV_PAINT'])
  assert.deepEqual(defines({ kind: 'soil', bounds }), ['GV_FIELD'])
  assert.deepEqual(defines({ kind: 'gravel', bounds, localSpace: true }), ['GV_DISTANCE', 'GV_FEATHER', 'GV_PEBBLES'])
  assert.equal(compile({ kind: 'meadow', bounds }).shader.uniforms.uGvParams.value.z > 0, true, 'the meadow fades to dust beside the farm')
  assert.equal(compile({ kind: 'gravel', bounds, localSpace: true }).shader.uniforms.uGvLocalSpace.value, 1)
})

test('the baked field is shared, deterministic and in range', () => {
  const first = getGroundVariationField()
  assert.equal(getGroundVariationField(), first, 'one texture serves every ground material')
  assert.equal(first.image.width, 512)
  const again = sampleGroundField(12.5, -7.25)
  assert.deepEqual(again, sampleGroundField(12.5, -7.25))
  for (const value of Object.values(again)) assert.ok(value >= 0 && value <= 1)
  // Texel (column, row) holds the sample at its world centre: row 0 is z = -extent/2.
  const texel = GROUND_FIELD_EXTENT / 512
  const column = 300
  const row = 100
  const expected = sampleGroundField((column + 0.5) * texel - GROUND_FIELD_EXTENT / 2, (row + 0.5) * texel - GROUND_FIELD_EXTENT / 2)
  const offset = (row * 512 + column) * 4
  assert.equal(first.image.data[offset], Math.round(expected.tone * 255))
  assert.equal(first.image.data[offset + 1], Math.round(expected.dry * 255))
  assert.equal(first.image.data[offset + 2], Math.round(expected.lush * 255))
})

test('the field actually varies across the meadow', () => {
  const tones = []
  for (let x = -120; x <= 120; x += 8) tones.push(sampleGroundField(x, 40).tone)
  assert.ok(Math.max(...tones) - Math.min(...tones) > 0.25, 'tone swings across the meadow')
})

test('the GLSL edge factor matches the simulation footprint', () => {
  const bounds = createGroundVariationBounds({ halfWidth: 10, halfDepth: 9 })
  const { shader } = compile({ kind: 'meadow', bounds })
  const match = shader.fragmentShader.match(/\? (0\.93[^;]+?)\s*:\s*1\.0;/s)
  assert.ok(match, 'organic edge factor expression is present in the shader')
  const evaluate = new Function('a', 'sin', 'cos', `return ${match[1]}`)
  for (let step = 0; step < 24; step += 1) {
    const angle = (step / 24) * Math.PI * 2 - Math.PI
    assert.ok(Math.abs(evaluate(angle, Math.sin, Math.cos) - farmEdgeFactor(angle)) < 1e-9, `angle ${angle}`)
  }
})
