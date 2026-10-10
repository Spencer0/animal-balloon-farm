import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false })
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
}

const { applyGroundVariation, createGroundVariationBounds } = await load('src/scene/ground-variation.ts')
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

test('only the gravel feathers its rim and carries pebbles', () => {
  const bounds = createGroundVariationBounds({ halfWidth: 10, halfDepth: 9 })
  const gravel = compile({ kind: 'gravel', bounds, localSpace: true }).shader.uniforms
  const meadow = compile({ kind: 'meadow', bounds }).shader.uniforms
  assert.equal(gravel.uGvFeather.value, 1)
  assert.equal(gravel.uGvLocalSpace.value, 1)
  assert.ok(gravel.uGvParams.value.w > 0)
  assert.equal(meadow.uGvFeather.value, 0)
  assert.equal(meadow.uGvParams.value.w, 0)
  assert.ok(meadow.uGvParams.value.z > 0, 'the meadow fades to dust beside the farm')
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
