# Scaling Animal Balloon Farm to the moon

Findings on how this game scales: what actually limits it, what the numbers
are, and what to change to get to hundreds of thousands of grass blades and
hundreds of animals without dropping frames.

Everything below is grounded in a measurement of the running game (commit
`b166c7e`, three.js 0.186.1, 1280×720) plus the sources listed at the end.

> **Status (2026-10-10).** The draw-call half of the plan is implemented:
> animals and static props are merged at load (3.2 in a different form than
> first proposed, 3.3 as written). Section 9 has the before/after numbers and
> what changed. Grass LOD (3.1), the overdraw pass (3.4) and the shadow policy
> (3.5) are still proposals. The measurements in section 4 predate the merge
> and were taken with a stress harness on the `feature/scale-to-the-moon`
> branch, which is kept for re-measurement and is not intended to ship.

## 1. What actually limits us today

Measured with the `?gardenDebug=1` frame timing harness that *is* on `main`,
by walking the live scene graph:

| Subsystem | Count | Draw calls | Verdict |
| --- | --- | --- | --- |
| Animals | 6 | **360** (60 meshes each) | **the blocker** — scales with animal count |
| Fairground props | 363 meshes over ~40 materials | **363** | static, never merged |
| Grass | 4,428 blades, 5 tris each | **39** | already fine — see below |
| Shadow pass | 406 casters | **406** | duplicates the scene |
| Sky / overlays | — | ~40 | |
| **Total** | | **~1,419** | |

**Animals cost 60 draw calls each.** The GLBs are not skinned — they are
hierarchies of plain `Mesh` nodes (wool curls, feather vanes, webbed toes,
markings), animated by an `AnimationMixer` driving node transforms. So the
draw-call count is `animals × parts`. Two hundred animals is **12,000 draw
calls** in the main pass and as many again in the shadow pass. This is the one
thing that genuinely stops the game scaling, and it is where a render fix
should start.

**Grass is already built the right way.** Worth stating plainly, because it is
the obvious suspect and it is not the problem. Blades are 5 triangles
(two crossed quads), batched into one `InstancedMesh` per **4×4 world-unit
tile** (`GRASS_TILE_SIZE`), and the growth loop only walks blades inside the
brush radius rather than the whole field. 4,428 blades cost 39 draw calls and
grow per-frame only where the player is painting. The 120,000-blade ceiling
would cost on the order of 500 draw calls and 600k triangles — entirely
reasonable. Grass is limited by **fill rate**, not by batching: every blade is
a lit, small triangle, and at high zoom each one covers many pixels.

**The fairground is 363 separate static meshes.** They share roughly 40
materials, so they can be merged by material almost for free.

**The shadow pass duplicates the whole scene.** 406 of the meshes have
`castShadow = true`, so every one of them is submitted again. The fairground
props never move, so almost all of that is wasted.

Separately, at natural content the game is not the bottleneck at all: a settled
15.8×-zoom frame costs ~5 ms of submission and runs at ~53 fps in the
automated browser. What the stress test in section 4 shows is that the moment
content is scaled up, the game becomes **submission bound** — 478 ms of a
483 ms frame at 206 animals. That is the constraint worth optimising, and it
is a different problem from the zoom-in stutter the stutter report describes.

## 2. Where the ceiling comes from

Two hard limits, from three.js' own guidance (McCurdy's "~100 draw calls" is
a *mobile* budget; desktop comfortably handles low thousands because the cost
is CPU submission):

- **Draw calls.** Each one costs a state change on the CPU. 12,000 is far past
  what any renderer will enjoy.
- **Fill rate.** Every pixel shaded more than once costs again. This matters
  for the zoom-in stutter, because the game is orthographic — zooming in makes
  each triangle cover *more* pixels without changing the pixel count. It is not
  what limits the stress test, which is submission bound throughout.

Triangles are nearly free by comparison: 1.15 M triangles render faster than
709 meshes submit, because the cost of a triangle is a few ALU ops while the
cost of a mesh is a driver round-trip.

## 3. The plan

### 3.1 Grass: already batched, so the work is elsewhere

No change to the batching scheme. The tile size, the 5-triangle blade and the
brush-local growth loop are all already right. What grass needs is:

- a **LOD / distance fade** so blades stop being drawn once a single blade is
  sub-pixel (they are currently always drawn, and at high zoom each one
  covers a lot of screen);
- the fill-rate work in 3.4, which is what actually costs.

`MAX_GRASS_BLADES` can then be raised well past 120,000 on hardware that can
take it, which is the cheapest possible "more content".

### 3.2 Animals: one draw call per part, shared across every animal

> **Done, differently (2026-10-10).** Each species is merged into one rigidly
> skinned mesh per material instead of instanced per part. See section 9 for
> why, and for what instancing would still add.

**This is the highest-value change in the document.**

Because the parts are plain meshes animated by node transforms, the transform
for every part of every animal is already computed on the CPU each frame. So
collect them instead of letting three.js draw each node:

- One `InstancedMesh` per `(species, part)` pair, sized to the animal budget.
- Each frame, walk the animated hierarchy once and write each part's
  world matrix into the matching instanced buffer.
- `instanceMatrix.needsUpdate = true` once per frame per part type.

Draw calls become `species × parts` — constant, around 120–360 for the full
cast — and independent of how many animals are alive. Two hundred animals then
cost the same to submit as six.

The CPU cost per animal is the same matrix walk that already happens, so
simulation cost grows linearly while submission cost stays flat.

Watch-outs for whoever implements this:

- The hierarchies contain nested transforms (a curl inside a body inside a
  root), so each part's matrix must be resolved against its **parent chain**,
  not just the root. `root.updateMatrixWorld()` first, then copy
  `part.matrixWorld`.
- Instances must be **hidden** (scaled to zero or moved via a null instance)
  rather than leaving stale transforms in the buffer, so animals that despawn
  do not leave a ghost in the instanced draw.
- Shadow casting has to follow. If all animals share one instanced mesh per
  part, the shadow pass gets the same draw-call saving for free, which is
  where the other half of the 12,000 calls were going.
- Material sharing matters here: if each species has its own wool/feather
  material, that is fine (still one instance per species+part), but do not let
  per-instance material clones creep in, or the instancing buys nothing.

**The far end of this, if we ever need thousands:** bake all animation frames
into a texture and look up per-part matrices in the vertex shader, the
approach from NVIDIA's *GPU Gems 3*, Chapter 2. That moves the per-frame
transform work onto the GPU too. It is a large change and is not needed for
hundreds of animals, so it stays a later milestone.

### 3.3 Fairground: merge the static props

> **Done (2026-10-10).** Carnival props, boundary stakes, garden props and the
> farm shop are merged by material at load. See section 9.

363 static meshes share about 40 materials. Merging by material with
`BufferGeometryUtils.mergeGeometries` (after baking each mesh's transform into
its geometry) collapses them to roughly 40 draw calls, and setting
`matrixAutoUpdate = false` stops three.js recomputing 363 matrices per frame.

This is the cheapest win in the document: pure win, no visual change, and it
also cuts the shadow pass. It is lower risk than the animal work, so it is the
better first PR if the animal change needs to be reviewed carefully.

### 3.4 Overdraw: real cost, but not the zoom-lag culprit we thought

In priority order. Note the caveat in section 5 — item 1 measured as a wash
and is arguably not worth doing at all, while item 4 is still the most likely
real cause of the reported zoom stutter:

1. **Draw the sky dome after opaque geometry.** `createSkyDome()` currently
   sets `renderOrder = -1000` with `depthWrite: false`, so every pixel runs the
   sky shader and is then painted over by the meadow. Removing the override
   lets it sort back-to-front and early-Z discard covered pixels. *Measured as
   a wash (54.2 → 53.4 fps), so this is the weakest item here — the early-Z
   reasoning is sound but the payoff did not materialise at this scene size.*
2. **Stop the ground from being transparent.** The garden soil layer is
   `transparent: true, depthWrite: false` and the lawn is `transparent: true`,
   which disables early-Z on the largest surfaces on screen. The soil is a
   "paint layer that only turns green where the seeder works" — that needs
   alpha, but it can be drawn *after* the lawn instead of being blended into
   it.
3. **Alpha test instead of blending** for anything that is really a cutout
   (`alphaTest`/`alphaToCoverage`/`alphaHash`), so it stays in the opaque pass
   and sorts for free.
4. **Drop MSAA and pixel ratio at high zoom.** `antialias: true` and
   `setPixelRatio(min(dpr, 1.25))` multiply fragment cost by roughly 1.56×;
   that is the multiplier that makes zooming in so much worse.
5. **Tighten the camera depth range.** `near: 0.1, far: 720` — depth precision
   depends far more on the near plane than the far one, and nothing in this
   scene needs 0.1. Prefer `reversedDepthBuffer` (r178+) where available.

### 3.5 Shadows

406 casters for a scene where the fairground never moves. After merging,
the fairground can cast from a single merged mesh, and small props can drop
`castShadow` entirely. A 2048 map over a fixed ±52 frustum is also the wrong
shape for a game whose camera zooms 15× — `CSM` or a tighter, zoom-aware
frustum fits better.

## 4. Stress test results

Measured by cloning animals (sharing geometry and materials, so it adds draw
calls without inventing GPU memory), seeding grass, and reporting the scene
composition. Measured locally at 1280×720, 15.8× zoom, settled over a full
180-frame window:

| Scene | Draw calls | Triangles | fps | `sceneRenderMs` p95 |
| --- | --- | --- | --- | --- |
| Baseline — 6 animals, 4.4k blades | 1,334 | 1.15 M | 23.8 | 15.9 ms |
| **+ 38,246 grass blades** | 1,438 | 1.36 M | 25.2 | 14.0 ms |
| 56 animals | 7,268 | 8.28 M | 14.2 | 138 ms |
| 206 animals | 24,904 | 29.5 M | 7.1 | **478 ms** |

Read the second row carefully: **38,246 grass blades cost 104 extra draw
calls and nothing measurable in frame time.** Seeding took 240 ms. Grass is not
a bottleneck and the batching does not need to change; the 120,000-blade request
came back as 38,246 only because the starter plot cannot hold that many blades
at `GRASS_CELL_SPACING`, which is a *density* limit, not a batching one.

Read the last row: at 206 animals `sceneRenderMs` is 478 ms of a 483 ms frame.
Essentially the whole frame is inside `renderer.render()` — this is submission
cost, not fill rate. It works out to **~19 µs per draw call**, consistent with
the ~17 µs measured at 7,268 calls. That is the number to design against:
every mesh we remove from the scene is worth about 19 µs a frame, and 12,000
meshes of animals is roughly 230 ms of pure CPU submission.

The two regimes are worth stating separately, because they need opposite fixes:

- At natural content the frame is cheap and dominated by whatever the GPU does
  with the pixels.
- Scaled up it is dominated, almost entirely, by how many meshes we submit.

### Reproducing this

The harness is on the `feature/scale-to-the-moon` branch and is gated behind
`GARDEN_DEBUG`, so it does not exist in production bundles:

```js
// branch preview: /previews/feature-scale-to-the-moon/?gardenDebug=1
await window.__gardenDebug.stress({ animals: 200, grass: 120000 })
```

It returns `{ animals, grassBlades, meshes, instancedMeshes, drawCalls, triangles }`.
The production site and the `/previews/` index stay clean of it.

## 5. A correction on the zoom-in lag

An earlier reading suggested the game collapsed to ~5 fps at 15.8× zoom. On
re-measurement — same code, focused tab, full window, at both 1280×720 and
2000×1355 — it does **not** reproduce: 52.9–54.2 fps, 12–21 dropped frames of
180. The 5 fps figure was almost certainly a throttled background tab, and the
adaptive cadence then adapted to that degraded baseline, which made the frame
times look alarming.

So the sky-dome change in 3.4 is a real, theoretically sound overdraw fix
(a full-screen background shader no longer runs before the ground paints over
it) but it is **not** a measured win here — before and after are within noise.
The zoom-in lag itself remains unreproduced and should be chased with real
hardware numbers, which the branch preview harness makes straightforward.

## 6. Honest limits

- The embedded preview browser used for automated checks is **software
  rendered** and throttles when backgrounded, so absolute frame times from it
  are not representative of real hardware. Draw-call counts are exact; timings
  are indicative only.
- `renderer.render()` timing only measures *submission*. Real GPU time is
  invisible without `EXT_disjoint_timer_query_webgl2` (WebGL2) or WebGPU
  timestamp queries; `renderer.waitForGPU()` is the only reliable FPS figure
  in WebGL.
- The stress clones do not animate (a cloned hierarchy has no `AnimationMixer`),
  so `updateMs` stays flat while submission cost grows. That isolates
  submission cost deliberately, but it does not measure the CPU cost of
  animating 200 animals. The instancing plan in 3.2 changes that balance — the
  matrix walk becomes the per-frame cost — so re-measure `updateMs` after it.
- Moving to WebGPU (`WebGPURenderer` + TSL) is the real "moon" move —
  compute-shader simulation and indirect draws, with automatic WebGL2 fallback
  (~87% global support). It is not the right first step for the animal problem,
  because that cost is CPU submission, and WebGPU lowers per-call overhead
  without removing it. The instancing work in 3.2 is.
- BatchedMesh is *not* the answer for the animals. It batches varied
  geometries into one call, but it emulates instancing with repeated
  `multiDraw` parameters rather than `multiDraw*Instanced`, which measures
  roughly 1.5–2× slower. Use `InstancedMesh` when the geometry repeats.

## 7. Suggested order of work

1. ~~**Instance the animal parts** (3.2).~~ Done as rigid skinning: about 17
   calls per animal instead of ~60. True instancing would still make the count
   independent of animal count; see section 9.
2. ~~**Merge the fairground by material** (3.3).~~ Done, along with garden props
   and the farm shop.
3. **Overdraw pass** (3.4), starting with items 2, 4 and 5 — skipping item 1
   unless something else motivates it.
4. **Shadow policy** (3.5), once 1 and 2 have changed what is casting.
5. Re-run the section 4 ladder after each step. `animals × parts` should be flat
   by step 1; grass rows should stay flat throughout.

## 8. Sources

- three.js manual — Optimize Lots of Objects, InstancedMesh, BatchedMesh, LOD
- three.js issue #31935 — BatchedMesh `multiDraw*Instanced` performance
- three.js forum — choosing between InstancedMesh and BatchedMesh
- three.js forum — accurate FPS requires `renderer.waitForGPU()`
- Utsubo, *100 Three.js Tips That Actually Improve Performance* (r186)
- Web Game Dev — Instanced Meshes, instanced skinning
- NVIDIA *GPU Gems 3*, Chapter 2 — Animated Crowd Rendering
- caniuse / GPUWeb — WebGPU support matrix

## 9. Implemented: merged animals and props (2026-10-10)

### What changed

`src/scene/merge-static-meshes.ts` merges meshes that never move relative to
each other into one mesh per material, at load, once per model. The hierarchy is
split at *pivots*, nodes that move on their own, and nothing is merged across
one.

- **Animals** (`src/animals/animal-batching.ts`). Every node an animation clip
  drives, and every `rig` node the capture flourish turns, is a pivot. All of a
  species' parts become one `SkinnedMesh` per material, with each pivot as a
  bone and every vertex weighted fully to its own pivot. That is exactly the
  rigid motion the node hierarchy produced, so the `AnimationMixer` drives the
  same nodes as before. Pupils and catchlights stay separate because heart eyes
  find them by name. Each animal is cloned with `cloneMerged`, so all its meshes
  share one skeleton and one bone-texture upload per frame.
- **Props.** Garden props merge on load. The placement ghost keeps an unmerged
  copy, because it is translucent and blends part over part in draw order. The
  farm shop merges each `SHOP_BUILD_*` piece separately so the build animation
  still works. Carnival props and boundary stakes merge by *look-alike*
  material: the procedural builders create a fresh material per part, so
  materials are compared by their settings. Ride rotors, Ferris cabins and
  carousel mounts are pivots.
- **Exact bounds.** A merged mesh's bounding box is coarser than its parts'
  boxes, which on its own changed animal sizing by up to 1.3% and grounding by
  about 1 cm. Each merged geometry remembers its parts' boxes, and
  `objectBounds` measures those, following bones into their current pose. Model
  sizing, grounding, the paint-reveal range, shop build anchors and carnival
  placement radii read exactly the numbers they read before.
- Transparent, multi-material, instanced, morphing and already-skinned meshes
  are never merged.

### Why skinning rather than instancing (3.2)

Merging within each animated node, as first tried, cut animals only from
50–84 meshes to 27–56. The snake, with 13 animated body segments of 3 materials
each, could not go below 39. Rigid skinning collapses every pivot into one mesh
per material, so the count is set by materials, not by how many parts move.

Instancing per (species, part) would still be the next step for hundreds of
animals, because skinning keeps the count proportional to the number of
animals: about 17 calls each instead of about 60.

### Meshes per model

| Model | Before | After |
| --- | --- | --- |
| Animals | 50–84 (owl 84, cow and sheep 69) | 14–20 (snake and goose 14, owl 20) |
| Coop | 124 | 15 |
| Farm shop | 111 | 29 (pieces merged separately for the build) |
| Hollow log | 60 | 14 |
| Sty | 62 | 13 |
| Dumpster | 56 | 15 |
| Goose house | 56 | 13 |
| Other props | 13–48 | 2–15 |

### Frame numbers

Measured on 2026-10-10 with headless Chrome on Spencer's PC (d3d11 GPU,
1280×720), same harness and same scenarios on `328f730` (before) and this
branch (after). Draw calls are exact; frame times are indicative.

| Scene | Draw calls before | Draw calls after | Triangles |
| --- | --- | --- | --- |
| `crowdStressTest(0)` in meadow/tall-grass-garden | 992 | **316** | 576,621 both |
| `crowdStressTest(10)` | 1,106 | **351** | 598,315 both |
| `crowdStressTest(40)` | 1,514 | **463** | 664,923 both |
| meadow/tall-grass-garden, settled | 907 | **284–315** | 520k–555k* |
| sandbox/farmer-10, carnival set up, wide view | 1,334 | **920** | |
| sandbox/farmer-10, six placed props, garden view | 1,124 | **492** | |

The crowd rows are the cleanest comparison. The scene is identical, the
triangle counts match to the triangle, and only the number of submissions
changed: a 68–69% cut.

\* In the settled meadow the snake hunt changes how many mice are on screen
(8 drawn before, 5–7 after), so its triangle count varies run to run.
`sceneRenderMs` p95 went from 17 ms to 8.6–10.3 ms in the same scene.

### How it was checked

- `tests/merge-meshes.test.mjs` poses every species in five clip frames. For
  every material, it checks that the merged, skinned model puts the same number
  of vertices, with the same centroid and extent, in the same place as the
  original node hierarchy. It also checks that bounds match `Box3.setFromObject`
  exactly. Deliberately breaking the skin weights fails 12 of its 14 cases.
- Browser comparison against `328f730`, using the same scenarios and pixel
  diffs:
  - the carnival, placed props, the shop, wild-red and painted animals;
  - the paint reveal mid-flourish;
  - prop hover glow, prop card and selection highlight, and the placement ghost;
  - animal picking.

  Remaining pixel differences are only in things that move between runs (the
  HUD wheel, the Ferris wheel, walking animals).
