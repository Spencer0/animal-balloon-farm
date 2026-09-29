# Animal Balloon Farm

A new Three.js-first garden/animal sandbox with the spirit of a whimsical traveling carnival. See [`SPEC.md`](SPEC.md) for the research-informed design, gameplay loop, first playable scope, and technical direction.

**Live site:** <https://spencer0.github.io/animal-balloon-farm/>

Every push to `main` is typechecked and built by [`.github/workflows/pages.yml`](.github/workflows/pages.yml) and published to GitHub Pages, so the deployed game always matches a green `main`. Asset URLs in `src/` are document-relative rather than root-absolute so they resolve under the Pages subpath as well as on localhost.

## Status

Pre-production scaffold. The previous Zoo Patrol project has been preserved under [`.archive/zoo-patrol/`](.archive/zoo-patrol/) as local history and is not part of this game. The current scene boot is intentionally only a renderer foundation; there are no gameplay systems or game UI yet.

## Direction

- Three.js renders the complete game, including menus, HUD, journal, and the Asset Viewer.
- **No Vite. No HTML/CSS game UI.** `index.html` is only a minimal canvas boot shell.
- The main menu has **Continue** and **Options**. **Resume** belongs to the in-game pause menu.
- Options includes an in-game **Asset Viewer** for rapid model/material/animation iteration.
- A Viva Piñata-inspired garden ecosystem—plant, attract, care, home, court, raise, discover—reimagined with original animals and a festive carnival-farm art direction.

## Development setup

Install the pinned project dependencies, then start the no-Vite esbuild server:

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:8000/`. The esbuild context watches and rebuilds TypeScript; the server serves the compiled files from `dist/`. Run `npm run typecheck` and `npm run build` for checks and production output:

### Garden interaction debug harness

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

The screenshot command only captures a single viewport and refuses very large window sizes; resize to about 1280×720 first. The helper uses Node's built-in WebSocket client to attach over CDP; it adds no dependency. The `window.__gardenDebug` interface works in the browser console too. The command-line helper defaults to localhost port 8000; set `GARDEN_URL`/`GARDEN_CDP_URL` when needed. Normal game sessions do not expose the harness unless the query flag is present.

Run checks with:

```sh
npm run check
```

Dependencies are pinned in `package.json` (Three.js 0.186.1 and type definitions 0.186.0, esbuild, TypeScript, and Node types). `package-lock.json` is committed, so CI installs with `npm ci` and builds are reproducible.

## Preserved old work

Zoo Patrol source, documentation, artwork, Blender project, static build, tests, ignored cache, and local dependency directory are under `.archive/zoo-patrol/`. The archive is ignored by Git so it remains available locally without leaking into Animal Balloon Farm commits. The pre-existing deletion of tracked `elephant-arcade.html` was left untouched.
