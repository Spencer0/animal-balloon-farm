# Animal Balloon Farm

A new Three.js-first garden/animal sandbox with the spirit of a whimsical traveling carnival. See [`SPEC.md`](SPEC.md) for the research-informed design, gameplay loop, first playable scope, and technical direction.

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

```sh
npm run typecheck
npm run build
```

Dependencies are pinned in `package.json` (Three.js 0.186.1 and type definitions 0.186.0, esbuild, TypeScript, and Node types). The dependency lockfile has not been generated yet; use the project's npm manifest to install and capture the lock before implementation.

## Preserved old work

Zoo Patrol source, documentation, artwork, Blender project, static build, tests, ignored cache, and local dependency directory are under `.archive/zoo-patrol/`. The archive is ignored by Git so it remains available locally without leaking into Animal Balloon Farm commits. The pre-existing deletion of tracked `elephant-arcade.html` was left untouched.
