import assert from 'node:assert/strict'
import { build } from 'esbuild'
import test from 'node:test'

const { outputFiles } = await build({ entryPoints: ['src/scene/garden-bursts.ts'], bundle: true, format: 'esm', platform: 'node', write: false })
const { createBurst, warmBurstLooks } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const THREE = await import('three')

const star = { count: 6, colors: ['#ffffff'], size: 0.03, speed: [1, 2], shape: 'star', onTop: true }

test('a finished burst hands its material back, so the next burst of that look reuses it (no recompile)', () => {
  const first = createBurst(new THREE.Vector3(), star)
  const material = first.root.material
  const geometry = first.root.geometry
  let disposed = false
  material.addEventListener('dispose', () => { disposed = true })
  assert.equal(first.update(5), false, 'the burst runs out')
  assert.equal(disposed, false, 'its shared material is not disposed, which would release the shader program')
  const second = createBurst(new THREE.Vector3(), star)
  assert.equal(second.root.material, material)
  assert.equal(second.root.geometry, geometry)
  assert.equal(second.root.material.opacity, 1, 'a reused material starts unfaded')
  second.dispose()
})

test('bursts alive at the same time never share a material (each fades on its own)', () => {
  const a = createBurst(new THREE.Vector3(), star)
  const b = createBurst(new THREE.Vector3(), star)
  assert.notEqual(a.root.material, b.root.material)
  assert.equal(a.root.geometry, b.root.geometry)
  const other = createBurst(new THREE.Vector3(), { ...star, onTop: false })
  assert.notEqual(other.root.material, a.root.material)
  assert.equal(other.root.material.depthTest, true)
  a.dispose(); b.dispose(); other.dispose()
})

test('the warm-up shows every look to a scene, then takes them away', () => {
  const scene = new THREE.Scene()
  const unwarm = warmBurstLooks(scene)
  assert.equal(scene.children.length, 6, 'three shapes, drawn in the scene and on top')
  unwarm()
  assert.equal(scene.children.length, 0)
})
