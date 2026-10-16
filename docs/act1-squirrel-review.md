# Act 1 + squirrel — ready for review

Branch: `feature/act1-squirrel` (isolated worktree, based on origin/main at task start).
No commit, push, PR or merge performed. Existing main-checkout changes were left untouched.

## Play

- Feeding: http://127.0.0.1:8773/?gardenDebug=1&scenario=squirrel/berry-picnic
- Home: http://127.0.0.1:8773/?gardenDebug=1&scenario=squirrel/acorn-home
- Fresh game: http://127.0.0.1:8773/?gardenDebug=1

The debug URLs do not read or write your normal saved farms. The local dev server is kept running for review.

## Acceptance criteria delivered

- Previously unrestricted farm visits (cow, pig, duck, goose, frog, raccoon) require 2 m² of established short lawn. Tall meadow does not count. Existing specialist visit rules stay intact.
- Sheep and chickens are discovered and visit for one mature clover / dandelion patch, rather than two to discover and three to enter. The first gifted dandelion can attract chickens. Residence and breeding requirements remain intact.
- Squirrel: daytime, cinnamon-and-cream balloon, curled tail, WALK / IDLE / EAT animation clips, catalog/journal/capture/sales/housing registrations.
- One mature blueberry bush discovers and admits squirrels.
- A squirrel must finish eating six berries itself to settle. Another squirrel's tally does not unlock residence. The journal reports the best-fed individual, not a summed tally.
- A mature bush has six separately rendered berries. Plucking removes one atomically; its own 60-second timer regrows it. The plant remains mature and does not need additional care. Crop timers and personal eaten tallies survive saves.
- Blueberry seed: 6 coins, bare soil, 75-second growth with water / prune / water stops. Blender model, source, review portrait and seed icon provided.
- Squirrel House: 65 coins, farmer level 1, 1×1 footprint, compact cedar den with an acorn cap roof and blueberry-blue open door. Ten indoor spaces. Breeding requires the house and a mature bush.
- Two playable scenarios and focused tests cover feeding, depletion/regrowth, saves, competing squirrels, interruption, discovery, individual residency, housing and exported animation channels.

## Verification

- Final `OUTDIR=dist-check PAGES_OUTDIR=dist-check npm run check`: **538/538 tests**, asset budgets, TypeScript, production build and scenario leak guard pass.
- Assets: squirrel 22,464 triangles / 476 KB; house 2,680 / 89 KB; bush 5,304 / 173 KB. Existing limits unchanged; plant assets now also enter the budget check.
- Chromium game-interface checks: empty farm keeps visitors outside; short lawn admits cow; first gifted mature dandelion admits chickens; six real completed bites settle squirrel; empty bush remains mature; berries return; journal displays 6/6 and regrowth instructions; house allows love and actual indoor occupancy. No page errors.
- Opened and exercised the default WebGPU in-app preview as well as WebGL Chromium checks.
- Captured 1280×720 JPEGs outside the repository with the project screenshot helper and focused Playwright state checks. Side eating pose, empty bush, journal ladder and acorn home inspected.
- `npm run gate` intentionally not run locally; CI Performance check is still required before any future merge.

Screenshots and browser reports are in `C:/Users/Spencer/.codex/agent-shots/`: `squirrel-eating-side.jpg`, `squirrel-empty-bush.jpg`, `squirrel-journal.jpg`, `squirrel-acorn-home.jpg`, `squirrel-browser-report.json`, `act1-browser-report.json`.

Freebuff global package update also succeeded (`freebuff` 0.2.27 installed). This shell's PATH does not include the global npm launcher directory; its launcher is under `C:/Users/Spencer/AppData/Roaming/npm/`.

Blender generated an untracked `art/blender/__pycache__/` during helper import; it is not a deliverable and must not be staged. Future bush generation disables bytecode output. Generated source assets, thumbnails and contact sheets are intended changes.
