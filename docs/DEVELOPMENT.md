# Development

Everything for working on the game. Player-facing intro is in the [README](../README.md); testing and performance gates are in [TESTING.md](../TESTING.md).

## Setup

Install the pinned project dependencies, then start the no-Vite esbuild server:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:8000/` (set `PORT` to run several worktrees side by side). The esbuild context watches and rebuilds TypeScript; the server serves the compiled files from `dist/` on `main` and `dist-<branch>/` elsewhere. Run `npm run typecheck` and `npm run build` for checks and production output.

## Garden interaction debug harness

Append `?gardenDebug=1` to expose a dev-only `window.__gardenDebug` pointer harness. `move`, `down`, `drag`, and `up` dispatch synthetic pointer events through the actual canvas listeners (so input routing, pointer capture, and tool handling get exercised together). Inspect `state()` for cursor world coordinates, active hold duration, grass batches, blade count/capacity, and trimmed blades; `clearGrass()` resets the deterministic grass result and `focusGarden()` restores the starting camera. `pickReport(x, y)` raycasts from screen space and reports what the garden pick hits (lawn distance, occluders) — useful when painted ground fails to show.

In DevTools, `await window.__gardenDebug.drag([{x:520,y:380},{x:580,y:390},{x:640,y:400}], 1800)` is a quick visual check; it holds for 1.8s and releases. `await window.__gardenDebug.sampleGarden(7, 5, 30000)` paints a repeatable coverage grid across the plot for density/performance checks. The harness does not add controls to the shipped HUD and is not available without the query flag.

For browser-driven scripted testing, open the game in Chromium with its remote debugging port enabled (default `9222`), then use:

```sh
npm run dev
npm run garden:drag -- open
npm run garden:drag -- clear
npm run garden:drag -- drag 1800 520,380 560,385 600,390 640,395
npm run garden:drag -- sample 7 5 30000
npm run garden:drag -- state
npm run garden:drag -- trim 600 400
npm run garden:drag -- screenshot
```

The screenshot command only captures a single viewport and refuses very large window sizes; resize to about 1280×720 first. The helper uses Node's built-in WebSocket client to attach over CDP; it adds no dependency. `npm run perf:stress` builds a dense pond/grass fixture, performs a continuous shovel drag through the real pointer handlers, and fails if p95 frame work or frame intervals miss the configured FPS budget (60 FPS by default). Run it against Chromium with remote debugging enabled and the matching branch's debug server/build running; set `GARDEN_URL` / `GARDEN_CDP_URL` to target them. This is separate from `npm run check`; `.github/workflows/performance.yml` runs it as a CI gate. Its headless Chromium timings are runner-specific and have not yet been verified against a real 60 Hz browser session, so use the browser harness for device-level confirmation. `MIN_FPS` sets the threshold. The `window.__gardenDebug` interface works in the browser console too. The command-line helper defaults to localhost port 8000; set `GARDEN_URL`/`GARDEN_CDP_URL` when needed. Normal game sessions do not expose the harness unless the query flag is present.

## Frame timing harness

With `?gardenDebug=1` the game also records a per-stage frame breakdown over a rolling 180-frame window and draws a small FPS panel in the corner of the canvas. Every two seconds it prints one JSON line to the console:

```text
[Frame Performance] {"samples":180,"fps":41.8,"cadenceMs":16.6,"droppedFrames":35,"zoom":1,"renderCalls":1108,"triangles":1728138,"intervalMs":{"p50":16.7,"p95":33.5},"workMs":{"p50":11.6,"p95":13.7},"updateMs":{"p50":0.3},"sceneRenderMs":{"p95":12.6},"overlayRenderMs":{"p95":1.3}}
```

`state().performance` returns the same summary on demand, so the panel can be polled instead of scraping the log. Two fields matter when reading it:

- `updateMs` is the simulation (fairground, animals, tools). If this is small, the frame cost is rendering, not game logic.
- `sceneRenderMs` only covers *submitting* the draw calls. WebGL does that work asynchronously, so a GPU-bound frame shows up as a large `intervalMs` with a small `sceneRenderMs` — the gap between them is time the GPU spent after JavaScript handed off.

`cadenceMs` is the display's own measured frame period (the 10th percentile of recent intervals) and `droppedFrames` counts intervals beyond 1.5x that. Comparing against a fixed 16.7 ms would mark every frame as dropped on a 30 Hz display, so the baseline is measured rather than assumed.

The panel is a debug-only overlay; it adds no controls to the shipped HUD.

## The `GARDEN_DEBUG` build flag

The harness, the frame timing and the FPS panel are compiled out of production builds entirely rather than merely being hidden behind the query string. `scripts/build.mjs` and `scripts/dev.mjs` substitute a `__GARDEN_DEBUG__` boolean at bundle time, and a production bundle contains none of that code (~8 KB smaller, no `__gardenDebug`, no `[Frame Performance]` logging).

| Build | Flag | Harness |
| --- | --- | --- |
| `npm run build` (production, and the Pages root) | off | stripped |
| `npm run build` with `PAGES_BASE_PATH=...` (branch previews) | on | included |
| `npm run dev` | on | included |
| `GARDEN_DEBUG=1 npm run build` / `GARDEN_DEBUG=0 npm run dev` | forced | as forced |

Because a production build has no harness at all, `?gardenDebug=1` on the deployed site does nothing. Debugging a production build locally is `GARDEN_DEBUG=0 npm run dev`.

`__GARDEN_DEBUG__` has to appear literally in each `if` that guards debug code rather than behind one shared boolean — esbuild only tree-shakes a block when it can constant-fold the value at the `if` itself. Check a build with:

```sh
npm run build && grep -c "__gardenDebug" dist*/main-*.js   # expect 0
```

Builds land in `dist/` on `main` and in `dist-<branch>/` on any other branch (see `scripts/outdir.mjs`), so that several agents can run `npm run dev` from different checkouts without overwriting each other's bundle. CI pins `PAGES_OUTDIR=dist`.

## Scaling

[SCALE_TO_THE_MOON.md](../SCALE_TO_THE_MOON.md) records what limits the scene,
measured. Its main finding still holds on `main` (re-checked Oct 2026): each
balloon animal is ~55 separate meshes, so draw calls grow with the herd, and the
frame is dominated by draw submission rather than simulation. Instancing or
merging animal parts per material is the fix with the biggest payoff.

## Branch previews on GitHub Pages

`.github/workflows/pages.yml` deploys `main` to the site root and builds every `debug/*` and `feature/*` branch into its own package under `/previews/<branch-slug>/`, listed at `/previews/`. So a branch is deployed and shareable at:

```text
https://spencer0.github.io/animal-balloon-farm/previews/<branch-slug>/?gardenDebug=1
```

Bundles are content-hashed (`main-<hash>.js`), so a redeploy is never shadowed by a browser that cached the previous build — relevant when reading frame timings, because a stale bundle reports numbers for code that is no longer deployed.

Run checks with:

```sh
npm run check
```

Dependencies are pinned in `package.json` (Three.js 0.186.1 and type definitions 0.186.0, esbuild, TypeScript, and Node types). `package-lock.json` is committed, so CI installs with `npm ci` and builds are reproducible.

## Dead code

`npm run deadcode` runs [knip](https://knip.dev) over the import graph (config in
`knip.json`). Tests load sources through esbuild by path, which knip cannot
follow, so an export used only by a test shows up as unused. Check `tests/`
before deleting one.
