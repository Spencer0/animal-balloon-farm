# Animal Balloon Farm — agent instructions

## Screenshots (do not skip)

- A large screenshot permanently poisons an agent thread: once an oversized image is in the transcript, every later request re-uploads it and fails with "Downloaded image content cannot exceed 30MB" until the thread is abandoned.
- Never take fullPage screenshots of the game canvas.
- Before any screenshot, resize the browser viewport to about 1280x720.
- Take one screenshot per state change, never in a loop.

## Before making changes

- **Every task that changes files must run in its own Git worktree.** Before editing, inspect `git worktree list` and branch/worktree status. Never switch branches or edit files in a checkout another agent or user may be using. Create a dedicated worktree and feature branch for the task; if the worktree/branch is already in use, coordinate before proceeding. Keep all edits for the task inside its worktree.

- Read `SPEC.md` for the agreed pre-production vision and first-playable scope.
- This is a new game, not Zoo Patrol. Zoo Patrol is preserved under `.archive/zoo-patrol/` and is excluded from the project by `.gitignore`. Do not restore/copy its UI, models, gameplay, renderer, or Vite setup unless Spencer asks.
- No destructive cleanup or Git reset. Work only in the new project files. Inspect `git status --short --branch` first; the old checkout has a pre-existing deletion of tracked `elephant-arcade.html`.
- User clarified: main menu is exactly **Continue + Options**; **Resume** is for pausing in-game. Art direction is a whimsical traveling carnival farm.

## Shipping to mainline

- After a feature is complete and verified, commit it and push to `main`. Spencer asked for this explicitly: do not sit on finished work across sessions.
- Run `npm run check` first and only push when it passes. A push to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`, so a red build must never reach the branch and a red push ships a broken game.
- Inspect `git status --short` immediately before staging. Other threads and the editor can be editing the same files at the same time; stage only the paths you changed and never `git add -A`.
- Keep each commit scoped to one feature, and explain in the message why the change was needed rather than restating the diff.
- No force-push, no rewriting pushed history, and no `git reset`. If the branch has moved or a push is rejected, pull and rebase first.
- If unrelated modifications turn up in the working tree, leave them uncommitted and say so in your summary rather than sweeping them into your commit.

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
