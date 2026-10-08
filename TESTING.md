# Testing & performance QA

Run **`npm run gate`** before calling a game change done. It is the one
command that answers "did we break the game?" and it runs the same way on
a laptop and in CI. It takes about 6 minutes and needs Chrome installed.

| Command | What it proves | Needs | Fails when |
|---|---|---|---|
| `npm test` | Pure sim rules are right | node | a sim test fails |
| `npm run assets:budget` | Model triangle and KB caps hold | node | a model is over its cap |
| `npm run typecheck` | The code compiles under strict TS | node | a type error |
| `npm run gate:prod` | No test code is in the production bundle | node | a `dev/` module or harness string reaches `dist` |
| `npm run gate:stress` | The game is not slower than its budget | Chrome | a scenario is over its CPU budget, or cannot run |
| `npm run gate` | All of the above, in order | Chrome | any of the above |

## Gate 1: no test code in production (`npm run gate:prod`)

Builds a production bundle (no debug harness) into `.gate/prod/` and checks
it two ways:

1. **Sourcemap:** no module under `dev/` was compiled in. This is the strong
   check, because it is about what was built, not what strings happen to
   appear.
2. **Strings:** no scenario ids, `runScenario`, `__gardenDebug`, or the
   "scenario ready" log line.

Every run of `gate:stress` first proves the detector can fire, by checking
that the debug bundle *is* flagged. A detector that finds nothing in a debug
build cannot be trusted to clear a production build.

## Gate 2: stress budgets (`npm run gate:stress`)

Builds the debug bundle into `.gate/debug/`, serves it on a free local port,
launches Chrome, sizes the window to exactly 1280x720, runs the scenarios,
and compares each one to `perf/budgets.json`. Results go to
`.gate/results/stress.json`. The exit code is 1 if anything fails.

```
npm run gate:stress                       # work budgets, any machine
npm run gate:stress -- --only shovel,dig  # a subset
npm run gate:stress -- --headed           # watch it run
npm run gate:stress -- --fps 60           # also require wall-clock FPS (real GPU only)
npm run gate:stress -- --gpu              # drop software-rendering flags (real GPU)
npm run gate:stress -- --budgets <file>   # compare to a different budget file
```

Chrome is found automatically (Windows, macOS, Linux). Set `CHROME_BIN` to
override it.

### What is gated, and why

- **Gated: `p95 workMs`**, the CPU time the game spends per frame. It means
  the same thing on any machine, so one budget works on a laptop and in CI.
- **Not gated by default: FPS** (wall clock). It is set by the GPU, and on
  software rendering a frame can take about 0.7 s. Run with `--fps 60` on a
  machine with a real GPU to check it.
- **Sample counts are frame-driven.** A scenario keeps sampling past its
  time window until it has the frames it needs (capped at 60 s), so a slow
  machine gives a noisy result, not a false pass.

### Scenarios

| Name | What it stresses |
|---|---|
| `shovel` | Terrain rebuild while dragging the shovel across a grassed, ponded garden |
| `dig` | Holding the shovel in one spot (deep hole, water settling) |
| `plant` | Seed rules, growth ticks, grass and water simulation |
| `expand` | Parcel expansion mid-animation (bounds, terrain and water regrid) |
| `crowd-ramp` | Sustained instanced crowd. Gated on its smallest step. |

Every scenario checks its own fixture before it scores anything (for example,
that the pond actually holds water). A broken fixture fails the gate, so a
scene that silently went empty cannot pass.

### Budgets

`perf/budgets.json` holds one `maxP95WorkMs` per scenario and the minimum
sample count. The file records how it was calibrated. Budgets have
headroom over typical values, because the first run in a fresh browser
profile is slower (shader compile). When a change legitimately costs more,
measure it, record the new number, and raise the budget in the same change.
Do not raise a budget just to get a red gate green.

## Pure sim tests (`tests/`)

`node:test` files that bundle one `src/game/*.ts` module with esbuild
(`platform: node`) and assert on it directly. No Three.js, no DOM, no
browser — this is why the condition ladder, water field, expansion, and
render policy live in `src/game/` and stay pure. If a mechanic can only be
verified by eye, it belongs in `src/game/` first.

## Scenario and crowd tools (`scripts/perf-scenario.mjs`)

The gate drives these scenarios. You can also run one by hand:

```
node scripts/perf-scenario.mjs --list
node scripts/perf-scenario.mjs --scenario shovel --minFps 60 --json out.json
node scripts/perf-scenario.mjs --scenario crowd-ramp --ramp 10,20,30,40,50 --minFps 0
```

`crowd-ramp` prints a curve and a `recommendedAnimals` value: the largest
load whose p95 work and interval both fit the frame budget. That curve is how
we decide how many animals to ship with, so it is recorded, not gated to a
single pass or fail.

The CDP client is `scripts/cdp-lib.mjs`. `scripts/perf-stress.mjs` is a
wrapper kept for old commands. `scripts/garden-drag.mjs` is the manual tool
(`open/state/drag/screenshot`).

## Debug harness (`window.__gardenDebug`)

Only exists in debug builds (`npm run dev`, `GARDEN_DEBUG=1`, branch
previews). Production folds it away. Type `__gardenDebug.help()` in the
console for one-line usage of every command; highlights:

- `focusGarden`, `focusPoint`, `focusSpecies`, `resetCamera` — framing
- `layout()` — every UI panel rect; use instead of screenshots for layout
- `sowGrass`, `digAt`, `pourAt`, `plant`, `growPlants`, `grantSeeds` — fixtures
- `setStage`, `advance`, `simulate`, `resetConditions` — condition ladder
- `expandFarm`, `progression`, `grantCoins`, `buy`, `placeProp` — economy
- `setCrowd(n)` / `clearCrowd()` — sustained crowd load (restored on reset)
- `crowdStressTest(n)` — one render snapshot: draw calls + triangles
- `performanceSamples()` — per-frame work/interval splits behind every gate

Rules: viewport ~1280x720 before measuring, one screenshot per state
change, never in a loop (an oversized capture poisons the thread).

## CI (`.github/workflows/`)

- `performance.yml` runs `npm run gate` on every push and PR, on pinned
  `ubuntu-24.04`, and uploads `.gate/results` as an artifact. Same command,
  same budgets as local.
- `pages.yml` typechecks, builds and publishes `dist/` from `main`, and
  publishes branch previews with the debug harness. It also runs the
  production no-test-code check, so a leak blocks the deploy.

## Adding coverage

- New mechanic → pure module in `src/game/` + `tests/<name>.test.mjs`,
  wired into the `test` script in `package.json`.
- New frame cost → new entry in `SCENARIOS` in `scripts/perf-scenario.mjs`
  with a deterministic fixture, a `check()` asserting the fixture actually
  happened (never gate on an empty scene), and a budget in
  `perf/budgets.json`. Calibrate the budget from at least two runs.
- New model → stays under `scripts/asset-budget.mjs` caps, or lands with
  a crowd-ramp run proving the frame survives. Bumping a cap without that
  run is how 60 FPS dies.
- Fixtures drift when mechanics change. If a scenario fails with a fixture
  message (for example "pond never held water"), update its fixture to the
  current mechanic. Do not loosen its `check()`.
