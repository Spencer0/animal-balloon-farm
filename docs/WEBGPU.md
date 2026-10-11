# WebGPU renderer

The farm can run on three's `WebGPURenderer` (TSL node materials) instead of
`WebGLRenderer`. WebGL stays the default until the WebGPU path has full visual
parity and a measured win; this is phase 1 of the port.

```
http://127.0.0.1:<port>/?renderer=webgpu          # opt in
http://127.0.0.1:<port>/?renderer=webgpu&gardenDebug=1
```

`document.documentElement.dataset.renderer` says which renderer is running, and
the debug FPS overlay / `[Frame Performance]` log carry a `renderer` field. If
WebGPU is requested but the browser has no adapter, the page logs why and
falls back to WebGL.

## How it is put together

| Piece | File |
| --- | --- |
| Backend choice, async init, per-frame stats, precompile | `src/render/backend.ts` |
| Lazy WebGPU chunk: sky, ground variation, CRT, film post, environment (TSL) | `src/render/webgpu/kit.ts` |
| Cutscene post chain for both backends | `src/scene/film-post.ts` |
| Shadow refresh, per light so both renderers honour it | `src/scene/shadow-refresh.ts` |

* `three/webgpu` and `three/tsl` are a separate esbuild chunk (`splitting: true`)
  that is only fetched for `?renderer=webgpu`. A WebGL session never loads it.
* Classic materials (`MeshStandardMaterial`, `MeshLambertMaterial`, ...) work
  unchanged: `WebGPURenderer` converts them to node materials on first use.
  Only code that used `onBeforeCompile` or a `ShaderMaterial` needed a port.
* Each GLSL shader keeps its GLSL source for WebGL and has a TSL twin in
  `kit.ts` documented as a port of it. Shared numbers (ground kinds, dust and
  lush tints, the baked field) live in `ground-variation.ts` and are imported by
  both.
* Anything that must not be merged into another material because its shading
  is patched marks `material.userData.customShading` (`hasCustomShading` in
  `matte-material.ts`).

## Things that behave differently under WebGPU

* **Draw-call stats.** `renderer.info.render.calls` is a lifetime counter. Use
  `frameRenderStats(renderer)` (it reads `render.drawCalls`, which `info.reset()`
  zeroes each frame). `renderSnapshot` and the frame timer already do.
* **Shadows.** `renderer.shadowMap.needsUpdate` does not exist; set
  `light.shadow.needsUpdate` (shadow-refresh does this for both renderers).
* **Second draw onto the canvas.** WebGPU tone-maps and encodes the canvas in a
  separate output pass, so drawing the HUD scene after a `RenderPipeline` would
  overwrite the picture. The cutscene pipeline composites the HUD itself
  (`FilmPostOptions.overlay`).
* **Pipelines compile lazily**, and the first draw of each stalls a frame. The
  farm is precompiled with `compileAsync` before the first frame, and each
  cutscene before its first shot. Objects that first appear later (a newly
  bought prop, an animal species not yet on screen) can still hitch once.
* **Render-target UVs.** Render targets sample top-down under WebGPU, so the
  CRT shader does not flip `v` the way the GLSL one does.

## Phase 1 status

See the pull request for the parity table, screenshots and measurements.

### Phase 2

* Port the animal `onBeforeCompile` capture reveal in
  `src/animals/balloon-animal.ts` (waits for the animal draw-call merge and the
  sim/view split). Under WebGPU the animals currently draw with the plain
  material and the paint reveal is skipped.
* Review every `customProgramCacheKey` copied across by the Standard to node
  conversion (balloon materials share one key).
* Precompile props and species as they are first unlocked.
* Decide the default (flip when parity and measurements justify it), then
  retire the GLSL twins and `WebGLRenderer` code paths.
* Use WebGPU for what motivated the port: compute (crowd steering, grass,
  water), storage buffers, and GPU timestamp queries for real GPU frame cost.
