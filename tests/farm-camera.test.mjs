import assert from 'node:assert/strict'
import * as THREE from 'three'
import { build } from 'esbuild'
import test from 'node:test'

// farm-camera.ts reads `window` for the viewport and calls renderer.setSize, so
// the test stubs just those. Everything else is plain Three.js maths.
globalThis.window = { innerWidth: 1280, innerHeight: 720, location: { search: '' } }

const { outputFiles } = await build({
  entryPoints: ['src/scene/farm-camera.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
})
const { createFarmCamera, NORMAL_VIEW_HEIGHT } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

function makeCamera(overrides = {}) {
  const renderer = { setSize() {} }
  const state = { mode: 'farm', menuOpen: false, tourBlocked: false, reframed: 0, tourStarts: 0 }
  const camera = createFarmCamera({
    renderer,
    inViewer: () => state.mode === 'viewer',
    menuDrifting: () => state.menuOpen && state.mode === 'farm',
    tourBlocked: () => state.tourBlocked || state.mode !== 'farm',
    viewerFocusStand: () => null,
    tourSubjects: () => [],
    onReframed: () => { state.reframed += 1 },
    onTourStart: () => { state.tourStarts += 1 },
    ...overrides,
  })
  return { camera, state }
}

test('the opening shot frames the farm at its normal height', () => {
  const { camera } = makeCamera()
  camera.focus()
  assert.equal(camera.viewHalfHeight * 2, NORMAL_VIEW_HEIGHT)
  assert.ok(Math.abs(camera.zoom - 1) < 1e-9, 'opening zoom is 1')
})

test('zoom is clamped and reported relative to the opening shot', () => {
  const { camera } = makeCamera()
  camera.focus()
  camera.zoomBy(-100000) // wheel in hard
  assert.equal(camera.viewHalfHeight, 1.25)
  camera.zoomBy(100000) // wheel out hard
  assert.equal(camera.viewHalfHeight, 34)
  assert.ok(camera.zoom < 1)
})

test('frameAt keeps the opening angle and distance', () => {
  const { camera } = makeCamera()
  camera.focus()
  const before = camera.camera.position.clone().sub(camera.target)
  camera.frameAt(new THREE.Vector3(4, 0, -3), 9)
  const after = camera.camera.position.clone().sub(camera.target)
  assert.ok(Math.abs(after.length() - before.length()) < 1e-6, 'same eye distance')
  assert.ok(Math.abs(camera.viewHalfHeight * 2 - 9) < 1e-9)
})

test('a tour saves the view and restores it when ended', () => {
  const { camera, state } = makeCamera()
  camera.focus()
  camera.zoomBy(500) // a non-default zoom to restore
  const zoomBefore = camera.viewHalfHeight
  const targetBefore = camera.target.clone()
  assert.equal(camera.beginTour(42), true)
  assert.equal(state.tourStarts, 1)
  assert.equal(camera.tourSeed, 42)
  for (let index = 0; index < 120; index += 1) camera.updateTour(1 / 60)
  camera.endTour(true)
  assert.equal(camera.tour, null)
  assert.ok(Math.abs(camera.viewHalfHeight - zoomBefore) < 1e-9, 'zoom comes back')
  assert.ok(camera.target.distanceTo(targetBefore) < 1e-9, 'look-at comes back')
})

test('a tour will not start while something blocks it', () => {
  const { camera } = makeCamera()
  camera.focus()
  assert.equal(camera.beginTour(1), true)
  camera.endTour(false)
  const blocked = makeCamera()
  blocked.state.tourBlocked = true
  blocked.camera.focus()
  assert.equal(blocked.camera.beginTour(1), false)
  assert.equal(blocked.camera.tour, null)
})

test('a running tour yields to a zoom and stops at the current pose', () => {
  const { camera } = makeCamera()
  camera.focus()
  camera.beginTour(7)
  camera.zoomBy(10)
  assert.equal(camera.tour, null, 'zoom takes the camera back')
})

test('ground movement pans the look-at point and leaves the eye distance unchanged', () => {
  const { camera } = makeCamera()
  camera.focus()
  const targetBefore = camera.target.clone()
  const distanceBefore = camera.camera.position.distanceTo(camera.target)
  camera.moveAlongGround(1, 0, 0, 0.5)
  assert.ok(camera.target.distanceTo(targetBefore) > 0, 'the view moved')
  const distanceAfter = camera.camera.position.distanceTo(camera.target)
  assert.ok(Math.abs(distanceAfter - distanceBefore) < 1e-6, 'eye stays the same distance away')
})

test('the expansion shake settles back to zero, and removing it leaves no drift', () => {
  const { camera } = makeCamera()
  camera.focus()
  const settled = camera.target.clone()
  camera.shakeForExpansion()
  camera.removeShake()
  camera.applyShake(0.1, 1)
  camera.removeShake()
  assert.ok(camera.target.distanceTo(settled) < 1e-9, 'shake is undone every frame')
  camera.applyShake(10, 1) // long past the shake's duration
  assert.ok(camera.target.distanceTo(settled) < 1e-9)
})

test('reset returns the camera to its opening shot after a tour', () => {
  const { camera } = makeCamera()
  camera.focus()
  const opening = camera.target.clone()
  camera.beginTour(3)
  camera.updateTour(2)
  camera.resetToStart()
  assert.equal(camera.tour, null)
  assert.ok(camera.target.distanceTo(opening) < 1e-9)
})

test('player pans stop at the pan limits and keep the view angle', () => {
  const { camera } = makeCamera({ panLimits: () => ({ x: 20, z: 15 }) })
  camera.focus()
  const offsetBefore = camera.camera.position.clone().sub(camera.target)
  for (let step = 0; step < 2000; step += 1) camera.moveAlongGround(1, 1, 1, 0.1)
  assert.ok(Math.abs(camera.target.x) <= 20 + 1e-9 && Math.abs(camera.target.z) <= 15 + 1e-9, 'keys stop at the edge')
  for (let step = 0; step < 2000; step += 1) camera.dragPan(-40, 60)
  assert.ok(Math.abs(camera.target.x) <= 20 + 1e-9 && Math.abs(camera.target.z) <= 15 + 1e-9, 'drags stop at the edge')
  assert.ok(Math.abs(camera.target.y - 1.25) < 1e-9, 'a vertical drag cannot lift the look-at away')
  const offsetAfter = camera.camera.position.clone().sub(camera.target)
  assert.ok(offsetAfter.distanceTo(offsetBefore) < 1e-6, `eye offset unchanged (${offsetAfter.distanceTo(offsetBefore)})`)
})

test('pans default to the meadow around the starting plot', () => {
  const { camera } = makeCamera()
  camera.focus()
  for (let step = 0; step < 5000; step += 1) camera.moveAlongGround(-1, 0, 1, 0.1)
  const reach = Math.hypot(camera.target.x, camera.target.z)
  assert.ok(reach < 80, `look-at stayed near the farm (${reach.toFixed(1)})`)
})
