# Animal Balloon Farm — agent instructions

## Before making changes

- Read `SPEC.md` for the agreed pre-production vision and first-playable scope.
- This is a new game, not Zoo Patrol. Zoo Patrol is preserved under `.archive/zoo-patrol/` and is excluded from the project by `.gitignore`. Do not restore/copy its UI, models, gameplay, renderer, or Vite setup unless Spencer asks.
- No destructive cleanup or Git reset. Work only in the new project files. Inspect `git status --short --branch` first; the old checkout has a pre-existing deletion of tracked `elephant-arcade.html`.
- User clarified: main menu is exactly **Continue + Options**; **Resume** is for pausing in-game. Art direction is a whimsical traveling carnival farm.

## Non-negotiable product/tech constraints

- Use Three.js for all game rendering, including game menus, HUD, journal, dialogs, and the Options → Asset Viewer.
- Do **not** add Vite. Do **not** build game UI from HTML/CSS/DOM overlays. `index.html` should stay a minimal boot shell with the game canvas.
- Use a local HTTP development server for browser modules/assets. The spec scaffold intends to use esbuild (not Vite); do not assume no build tool means opening `index.html` with `file://`.
- Pin Three.js and compatible addons/types together. Do not adopt another rendering framework or add dependencies before confirming they fit the spec.
- Keep simulation/data separate from Three.js scene state. Define canonical garden units and tested garden↔world↔screen transforms early.
- Data-drive plant/species conditions and the journal's discovered/missing requirement clues. Provide deterministic seeded test gardens and preserve the user's live save.
- Keep the game original: broad ecosystem-garden inspiration is fine; do not copy Viva Piñata IP (names, art, species designs, writing, audio, or exact content).

## First build milestone

Build the vertical slice in `SPEC.md`, not a full content game: menu → garden/postcard → plant placement and growth → legible animal visitor, plus an Options Asset Viewer that uses the same asset definitions. Establish camera and placement transforms before multiplying assets. Use procedural placeholders only to prove scale, silhouette, lighting, and interaction; review assets in the in-game gallery and garden camera.

## Scope and code quality

- Prefer small, runnable milestones with strict TypeScript and focused tests for simulation, persistence, and coordinate round-trips.
- Avoid broad rewrites and generated/binary output churn. Name and dispose Three.js resources deliberately; instance repeated decorations where useful.
- Use concise, readable code. The root scaffold now has a minimal Three.js scene entry and no-Vite esbuild scripts; install dependencies before running checks. Add focused simulation/persistence tests with the first game milestone.
