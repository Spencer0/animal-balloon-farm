# WebGPU renderer

The farm draws with three's `WebGPURenderer` (TSL node materials) by default.
When the browser has no `navigator.gpu`, no adapter, or the device fails to
start, `createFarmRenderer` falls back to `WebGLRenderer` on its own (and logs
why). The WebGL path is kept as that fallback and as the renderer the
performance gate measures.

```
http://127.0.0.1:<port>/                          # WebGPU, WebGL if unavailable
http://127.0.0.1:<port>/?renderer=webgl           # force WebGL
http://127.0.0.1:<port>/?renderer=webgpu          # same as the default (warns if it falls back)
```

`document.documentElement.dataset.renderer` says which renderer is running, and
the debug FPS overlay / `[Frame Performance]` log carry a `renderer` field.

## Loading

`index.html` ships the loading screen markup so it paints before the bundle
parses (`src/ui/loading-dom.ts`). Boot stages: renderer (fetch the lazy chunk,
`renderer.init()`), models/scene build, then `precompile` (`compileAsync` under
WebGPU, `compile` under WebGL) so the first frames do not hitch. The screen
fades after the first frame is drawn and sets `document.documentElement.dataset.ready`
and resolves `window.__farmReady`.

## How it is put together

| Piece | File |
| --- | --- |
| Backend choice, async init, per-frame stats, precompile | `src/render/backend.ts` |
| Lazy WebGPU chunk: sky, ground variation, CRT, film post, environment (TSL) | `src/render/webgpu/kit.ts` |
| Cutscene post chain for both backends | `src/scene/film-post.ts` |
| Shadow refresh, per light so both renderers honour it | `src/scene/shadow-refresh.ts` |

* `three/webgpu` and `three/tsl` are a separate esbuild chunk (`splitting: true`)
  that is only fetched when WebGPU is chosen. A forced or fallback WebGL session
  never loads it. Never import them statically outside `src/render/webgpu/`.
* Classic materials (`MeshStandardMaterial`, `MeshLambertMaterial`, ...) work
  unchanged: `WebGPURenderer` converts them to node materials on first use.
  Only code that used `onBeforeCompile` or a `ShaderMaterial` needed a port.
* Each GLSL shader keeps its GLSL source for WebGL and has a TSL twin in
  `kit.ts` documented as a port of it (sky, intro sky, CRT, ground variation,
  film grade, heart eyes, capture paint reveal). Shared numbers (ground kinds, dust and
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

## Shader audit

Every GLSL / `onBeforeCompile` / `ShaderMaterial` in `src/` and its WebGPU path:

| Source | WebGPU path |
| --- | --- |
| Sky dome, `fairground.ts` | `kit.createSkyMaterial` |
| Intro sky and CRT, `intro-cutscene.ts` | `kit.createIntroSkyMaterial`, `kit.createCrtMaterial` |
| Storybook grade `createGradeShader`, `cutscene-kit.ts` (used by `film-post.ts` passes) | `kit.createFilmPost` (DoF, bloom, tone map, grade as one `RenderPipeline`) |
| Ground variation, `ground-variation.ts` | `kit.applyGroundVariation` |
| Heart eyes, `animal-eyes.ts` | `kit.applyHeartEyes` (`positionNode`) |
| Capture paint reveal, `balloon-animal.ts` | `kit.applyPaintReveal` (`colorNode`) |
| Room environment | `kit.createRoomEnvironment` |

Everything else uses stock materials, which `WebGPURenderer` converts itself.
Per-material node uniforms (the paint reveal) give each transition material its
own pipeline, so the first reveal of a capture can compile once.

## Remaining

* Props and species that first appear after load can still hitch once while
  their pipelines compile; precompile them as they unlock.
* The GLSL twins and the `WebGLRenderer` code stay as the fallback. Retiring
  them needs a decision that browsers without WebGPU no longer matter.
* Use WebGPU for what motivated the port: compute (crowd steering, grass,
  water), storage buffers, and GPU timestamp queries for real GPU frame cost.
* CI: the performance gate pins `?renderer=webgl` (`scripts/cdp-lib.mjs`);
  `scripts/webgpu-smoke.mjs` covers WebGPU on SwiftShader and skips when the
  runner has no adapter.
* Headless software WebGPU needs `--use-vulkan=swiftshader` as well as
  `--use-webgpu-adapter=swiftshader`. Without it Chrome cannot create the canvas
  swap-chain shared image ("Could not find SharedImageBackingFactory ... WebgpuSwapChainTexture"),
  the GPU channel is lost, and the page then fails with `Instance dropped in
  popErrorScope` and `createBuffer ... too large for the implementation`. That is
  a runner problem, not a game bug.
