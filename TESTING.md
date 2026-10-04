# Testing & performance QA

Three layers, three different oracles. Pick the right one:

| Layer | Command | Needs | Oracle |
|---|---|---|---|
| Pure sim unit tests | `npm test` | node only | Exact numbers: conditions, water settle, expansion, render policy |
| Asset budgets | `npm run assets:budget` | node only | Per-file tris + KB caps (fails `npm run check`) |
| Browser scenarios | `npm run perf -- --scenario <name>` | Debug build + Chromium CDP | p95 **workMs** everywhere; FPS only on real GPUs |

`npm run check` = tests + asset budgets + typecheck + build. Push to `main`
only when it passes.

## Pure sim tests (`tests/`)

`node:test` files that bundle one `src/game/*.ts` module with esbuild
(`platform: node`) and assert on it directly. No Three.js, no DOM, no
browser — this is why the condition ladder, water field, expansion, and
render policy live in `src/game/` and stay pure. If a mechanic can only be
verified by eye, it belongs in `src/game/` first.

## Browser scenarios (`scripts/perf-scenario.mjs`)

Scripted runs against the compiled-in `window.__gardenDebug` harness over
Chrome DevTools Protocol:

```
node scripts/perf-scenario.mjs --list
node scripts/perf-scenario.mjs --scenario shovel --minFps 60 --json out.json
node scripts/perf-scenario.mjs --scenario crowd-ramp --ramp 10,20,30,40,50 --minFps 0
```

Setup: `npm run dev` (debug harness is on by default), Chromium at
about 1280x720 with `--remote-debugging-port=9222`. The runner refuses to
measure at other sizes — a different viewport is a different scene.

Scenarios: `shovel` (terrain rebuild drag), `dig` (deep-hole hold),
`plant` (seed rules + growth), `expand` (parcel animation),
`crowd-ramp` (sustained instanced-crowd curve → recommended animal count).

Shared CDP client lives in `scripts/cdp-lib.mjs`. `npm run perf:stress`
is a thin wrapper kept for CI compatibility. `scripts/garden-drag.mjs`
is the manual poking tool (`open/state/drag/screenshot`).

### Reading results

- `timing.p95WorkMs` — CPU time the game spent per frame. Meaningful
  everywhere, **including CI**. This is what gates fail on.
- `timing.p95FrameIntervalMs` / `sustainedFps` — wall clock. Only
  meaningful on a real GPU; CI runs SwiftShader software rendering, so
  never treat a CI FPS number as a ship number.
- `crowd-ramp` prints a curve and a `recommendedAnimals` value: the
  largest load whose p95 work *and* interval both fit the frame budget.
  That curve — not a single pass/fail — is how we decide how many
  animals to ship with.

## Debug harness (`window.__gardenDebug`)

Only exists in debug builds (`npm run dev`, `GARDEN_DEBUG=1`, branch
previews). Production folds it away. Type `__gardenDebug.help()` in the
console for one-line usage of every command; highlights:

- `focusGarden`, `focusPoint`, `focusSpecies`, `resetCamera` — framing
- `layout()` — every UI panel rect; use instead of screenshots for layout
- `sowGrass`, `digPond`, `digAt`, `pourAt`, `plant`, `growPlants` — fixtures
- `setStage`, `advance`, `simulate`, `resetConditions` — condition ladder
- `expandFarm`, `progression`, `grantCoins`, `buy`, `placeProp` — economy
- `setCrowd(n)` / `clearCrowd()` — sustained crowd load (restored on reset)
- `crowdStressTest(n)` — one render snapshot: draw calls + triangles
- `performanceSamples()` — per-frame work/interval splits behind every gate

Rules: viewport ~1280x720 before measuring, one screenshot per state
change, never in a loop (an oversized capture poisons the thread).

## CI (`.github/workflows/`)

- `performance.yml`: debug build → headless Chromium (SwiftShader) →
  shovel gate (fails the build) + crowd-ramp measure-only (JSON artifact).
  Shovel gates mostly on work; the ramp curve is recorded, not gated,
  because runner hardware varies.
- `pages.yml`: typecheck + build + publish `dist/`; branch previews keep
  the debug harness so frame timing is reviewable at the preview URL.

## Adding coverage

- New mechanic → pure module in `src/game/` + `tests/<name>.test.mjs`,
  wired into the `test` script in `package.json`.
- New frame cost → new entry in `SCENARIOS` in `scripts/perf-scenario.mjs`
  with a deterministic fixture + a `check()` asserting the fixture
  actually happened (never gate on an empty scene).
- New model → stays under `scripts/asset-budget.mjs` caps, or lands with
  a crowd-ramp run proving the frame survives. Bumping a cap without that
  run is how 60 FPS dies.
