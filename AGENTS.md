# Animal Balloon Farm — agent instructions

## How we work

1. **One task, one worktree.** Every task that changes files runs in its own
   Git worktree and feature branch. Inspect `git worktree list` and
   `git status --short --branch` first. Never switch branches or edit files in
   a checkout another agent or user may be using. Keep all edits for the task
   inside its worktree.
2. **Push when the user is satisficed, through main.** When finished work is
   verified and the user is happy, fetch latest `main` and merge it into the
   task branch first, resolving any conflicts. Run `npm run check`; only push
   when it passes. Then commit and push to the remote so finished work never
   sits around across sessions.
3. **Headless Blender for assets.** Author and render all game assets with
   headless Blender (`blender --background --factory-startup --python ...`),
   never by hand-editing binaries. Details live in
   `skills/blender-asset-pipeline/SKILL.md` and `art/blender/README.md`.

## Adding an animal

Read `ANIMAL_PIPELINE.md` first. It maps the whole path (Blender authoring
script -> `.blend`/`.glb`/review PNG -> one `ANIMAL_CATALOG` entry plus three
compiler-enforced TypeScript records -> browser and journal verification) and
lists the few registration points that are *not* compiler-enforced and fail
silently. Use its checklist rather than rediscovering the wiring.

## Screenshots (do not skip)

- A large screenshot permanently poisons an agent thread: once an oversized
  image is in the transcript, every later request re-uploads it and fails with
  "Downloaded image content cannot exceed 30MB" until the thread is abandoned.
- Take screenshots with headless Chromium via `scripts/screenshot.mjs`, never
  with computer-use (it does not work in this harness) and never fullPage on
  the game canvas. The helper already pins the viewport to 1280x720 and
  JPEG quality 70 so files stay small enough for the transcript.
- One-time setup lives outside the repo: `npm install playwright-core` in a
  scratch dir (browsers already sit in `%LOCALAPPDATA%/ms-playwright`; if
  they are ever missing, `npx playwright install chromium` fetches them).
  Never add playwright to `package.json`.
- Run it against the worktree dev server with output outside the repo:
  `$env:NODE_PATH="<scratch>/node_modules"; node scripts/screenshot.mjs`
  `http://127.0.0.1:<port>/ C:/Users/Spencer/.codex/agent-shots/<name>.jpg`
  `1 9000` (the trailing `1` presses ENTER on the main menu so the shot shows
  the farm, not the menu). Allow ~25s: browser launch plus settle time.
  The helper also prints any page console/page errors.
- Take one screenshot per state change, never in a loop.

## Shipping

- A push to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`,
  so a red build must never reach the branch.
- Inspect `git status --short` immediately before staging. Other threads and
  the editor can edit the same files concurrently; stage only the paths you
  changed and never `git add -A`.
- Keep each commit scoped to one feature, and explain in the message why the
  change was needed rather than restating the diff.
- No force-push, no rewriting pushed history, and no `git reset`. If the push
  is rejected, pull and rebase first.
- If unrelated modifications turn up in the working tree, leave them
  uncommitted and say so in the summary.
- No destructive cleanup. Work only in the new project files. Zoo Patrol is
  preserved under `.archive/zoo-patrol/` and excluded by `.gitignore`; do not
  restore or copy its UI, models, gameplay, renderer, or Vite setup unless
  Spencer asks.

## Tech constraints

- Three.js for all game rendering, including menus, HUD, journal, dialogs,
  and the animal viewer. Do **not** add Vite. Do **not** build game UI from
  HTML/CSS/DOM overlays. `index.html` stays a minimal boot shell and
  `src/style.css` styles only that shell; all game UI goes through the one
  centralized layer in `src/ui/` (`ui-layer.ts`, `ui-viewport.ts`,
  `ui-theme.ts`, `ui-button.ts`, `ui-props.ts`).
- UI is authored at 1600x900 design units with one uniform scale; never scale
  x and y independently. Test layout with the `?gardenDebug=1` harness
  (`window.__gardenDebug.layout()`) instead of eyeballing screenshots.
- Use a local HTTP dev server (esbuild, not Vite); never open `index.html`
  with `file://`. `npm run dev` writes to `dist-<branch>` off `main` so
  agents never share an output directory.
- Pin Three.js and compatible addons/types together.
- Keep simulation/data separate from Three.js scene state. The animal
  condition ladder (`src/game/animal-conditions.ts` + `animal-progress.ts` +
  `farm-state.ts`) is **pure on purpose** -- no Three.js, no DOM -- so it
  stays testable in `tests/animal-conditions.test.mjs`. Keep it pure.
- Keep the game original: broad ecosystem-garden inspiration is fine; do not
  copy Viva Pinata IP (names, art, species designs, writing, audio, or exact
  content).
- Prefer small, runnable milestones with strict TypeScript and focused tests.
  Name and dispose Three.js resources deliberately; instance repeated
  decorations where useful.
