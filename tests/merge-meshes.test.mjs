import assert from 'node:assert/strict'
import fs from 'node:fs'
import { build } from 'esbuild'
import test from 'node:test'

// One bundle, so the test and the code under test share a single copy of three.
const { outputFiles } = await build({
  stdin: {
    contents: `
      export * as THREE from 'three'
      export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
      export { cloneMerged, mergeStaticMeshes, objectBounds, skeletonsOf } from './src/scene/merge-static-meshes.ts'
      export { mergeAnimalParts } from './src/animals/animal-batching.ts'
      export { clearHeartEyes, heartEyeCount, setHeartEyes } from './src/animals/animal-eyes.ts'
    `,
    resolveDir: '.',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const { THREE, GLTFLoader, cloneMerged, mergeStaticMeshes, objectBounds, skeletonsOf, mergeAnimalParts, clearHeartEyes, heartEyeCount, setHeartEyes } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const ANIMAL_DIR = 'public/assets/animals'
const models = fs.readdirSync(ANIMAL_DIR).filter((name) => /^balloon-.*\.glb$/.test(name))

async function loadGlb(file) {
  const buffer = fs.readFileSync(file)
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer, '', resolve, reject))
}

function drawnMeshes(root) {
  const meshes = []
  root.traverse((object) => { if (object.isMesh && object.visible) meshes.push(object) })
  return meshes
}

/**
 * World-space vertex statistics per colour: count, centroid and extent. Parts
 * are merged into vertex colours, so the key is each vertex's colour, which is
 * the material colour an unmerged part drew with. Two renderings that agree on
 * these for every colour, in several poses, put the same surfaces in the same places.
 */
function surfaceStats(root) {
  root.updateMatrixWorld(true)
  const stats = new Map()
  const vertex = new THREE.Vector3()
  const linear = new THREE.Color()
  for (const mesh of drawnMeshes(root)) {
    const position = mesh.geometry.getAttribute('position')
    const colors = mesh.geometry.getAttribute('color')
    const eyeParts = mesh.geometry.getAttribute('eyePart')
    for (let index = 0; index < position.count; index += 1) {
      // Hearts are kept beside their pupils, and the shader collapses whichever
      // is hidden, so the plain pose's CPU data holds hearts the screen never shows.
      if (eyeParts && eyeParts.getX(index) > 0.5) continue
      const key = colors
        ? linear.setRGB(colors.getX(index), colors.getY(index), colors.getZ(index), THREE.LinearSRGBColorSpace).getHexString()
        : mesh.material.color.getHexString()
      const entry = stats.get(key) ?? { count: 0, sum: new THREE.Vector3(), box: new THREE.Box3() }
      mesh.getVertexPosition(index, vertex)
      vertex.applyMatrix4(mesh.matrixWorld)
      entry.sum.add(vertex)
      entry.box.expandByPoint(vertex)
      entry.count += 1
      stats.set(key, entry)
    }
  }
  return stats
}

function assertSameSurfaces(actual, expected, label) {
  assert.deepEqual([...actual.keys()].sort(), [...expected.keys()].sort(), `${label}: materials`)
  for (const [key, want] of expected) {
    const got = actual.get(key)
    assert.equal(got.count, want.count, `${label} ${key}: vertex count`)
    const centroidError = got.sum.clone().divideScalar(got.count).distanceTo(want.sum.clone().divideScalar(want.count))
    assert.ok(centroidError < 1e-4, `${label} ${key}: centroid moved ${centroidError}`)
    assert.ok(got.box.min.distanceTo(want.box.min) < 1e-4 && got.box.max.distanceTo(want.box.max) < 1e-4, `${label} ${key}: extent changed`)
  }
}

function pose(root, clips, clipIndex, fraction) {
  const mixer = new THREE.AnimationMixer(root)
  if (clips[clipIndex]) {
    const action = mixer.clipAction(clips[clipIndex])
    action.play()
    mixer.setTime(clips[clipIndex].duration * fraction)
  }
  root.updateMatrixWorld(true)
  return mixer
}

for (const model of models) {
  test(`${model}: merged parts draw the same animal in every pose, in far fewer calls`, async () => {
    const original = await loadGlb(`${ANIMAL_DIR}/${model}`)
    const merged = await loadGlb(`${ANIMAL_DIR}/${model}`)
    const report = mergeAnimalParts(merged.scene, merged.animations)
    // Heart siblings join the merge: one per pupil, added before it runs.
    const pupils = drawnMeshes(original.scene).filter((mesh) => /pupil/i.test(mesh.name)).length
    assert.equal(report.before, drawnMeshes(original.scene).length + pupils)
    assert.ok(report.after <= 20, `${model} still draws ${report.after} meshes`)
    assert.ok(report.after * 2.5 < report.before, `${model}: ${report.before} -> ${report.after} is not a real cut`)

    // Heart eyes are one material swap on the merged eye mesh, and clear back to plain.
    const heartCopy = cloneMerged(merged.scene)
    assert.equal(setHeartEyes(heartCopy), pupils)
    assert.equal(heartEyeCount(heartCopy), pupils)
    clearHeartEyes(heartCopy)
    assert.equal(heartEyeCount(heartCopy), 0)

    for (const [clipIndex, fraction] of [[-1, 0], [0, 0.13], [0, 0.61], [1, 0.37], [1, 0.88]]) {
      // Each animal is a skeleton-aware clone of the cached species scene, as in the game.
      const left = original.scene.clone(true)
      const right = cloneMerged(merged.scene)
      pose(left, original.animations, clipIndex, fraction)
      pose(right, merged.animations, clipIndex, fraction)
      const label = `${model} clip ${clipIndex} @ ${fraction}`
      assertSameSurfaces(surfaceStats(right), surfaceStats(left), label)
      // Sizing and grounding read these bounds, so they must match to the bit.
      const want = new THREE.Box3().setFromObject(left)
      const got = objectBounds(right)
      assert.ok(got.min.distanceTo(want.min) < 1e-9 && got.max.distanceTo(want.max) < 1e-9, `${label}: bounds changed`)
    }
  })
}

test('a clone gets one skeleton of its own, bound to its own nodes', async () => {
  const gltf = await loadGlb(`${ANIMAL_DIR}/${models[0]}`)
  mergeAnimalParts(gltf.scene, gltf.animations)
  const copy = cloneMerged(gltf.scene)
  const skinned = drawnMeshes(copy).filter((mesh) => mesh.isSkinnedMesh)
  assert.ok(skinned.length > 1)
  // One skeleton per animal: three.js uploads each skeleton's bones once a frame.
  assert.equal(skeletonsOf(copy).size, 1)
  assert.notEqual([...skeletonsOf(copy)][0], [...skeletonsOf(gltf.scene)][0])
  for (const mesh of skinned) {
    for (const bone of mesh.skeleton.bones) {
      let node = bone
      while (node && node !== copy) node = node.parent
      assert.equal(node, copy, `${mesh.name} is driven by a node outside its clone`)
    }
  }
})

test('static merging keeps pivots moving, look-alike materials batched, and hidden parts hidden', () => {
  const root = new THREE.Group()
  const rotor = new THREE.Group()
  rotor.name = 'rotor'
  root.add(rotor)
  const box = new THREE.BoxGeometry(1, 1, 1)
  const red = () => new THREE.MeshStandardMaterial({ color: '#ff0000', roughness: 0.5 })
  for (let index = 0; index < 3; index += 1) {
    const fixed = new THREE.Mesh(box, red())
    fixed.position.set(index * 2, 0, 0)
    root.add(fixed)
    const spinning = new THREE.Mesh(box, red())
    spinning.position.set(0, index * 2, 0)
    rotor.add(spinning)
  }
  const hidden = new THREE.Mesh(box, red())
  hidden.visible = false
  root.add(hidden)
  // Instances reach well past their base geometry, as tent pennants do.
  const flags = new THREE.InstancedMesh(box, red(), 2)
  flags.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 0, 9))
  root.add(flags)
  const before = objectBounds(root)
  assert.ok(before.equals(new THREE.Box3().setFromObject(root)), 'objectBounds measures what Box3.setFromObject measures')

  const report = mergeStaticMeshes(root, { isPivot: (object) => object === rotor, materialMatch: 'value' })
  assert.deepEqual(report, { before: 7, after: 3 })
  assert.equal(rotor.parent, root)
  assert.equal(rotor.children.length, 1, 'the rotor keeps its own batch')
  assert.equal(hidden.parent, root)
  assert.equal(hidden.visible, false)
  assert.ok(objectBounds(root).equals(before), 'bounds unchanged')

  rotor.rotation.z = Math.PI / 2
  const spun = objectBounds(rotor.children[0])
  assert.ok(Math.abs(spun.min.x - -4.5) < 1e-9 && Math.abs(spun.max.x - 0.5) < 1e-9, 'the rotor batch turns with the rotor')
})
