# Animal Balloon Farm — agent instructions

## Workflow

1. **Blender for assets.** Author and render all game assets with headless
   Blender (`blender --background --factory-startup --python ...`). Never
   hand-edit binaries. See `art/blender/README.md`.
2. **New work in a worktree.** Every task that changes files gets its own git
   worktree and feature branch. Check `git worktree list` and
   `git status --short --branch` first. Never edit a checkout another agent or
   Spencer may be using.
3. **Validate in the browser.** Before calling work done, check it in the
   running game with the in-app browser or Playwright, and take screenshots.
   Use `scripts/screenshot.mjs` (1280x720 JPEG), with output outside the repo.
   Take one screenshot per state change, never in a loop, and never fullPage on
   the game canvas. Oversized images break the agent thread.
   Before calling any game change done, run `npm run gate` (tests, production
   no-test-code check, and CPU stress budgets; see TESTING.md). It needs Chrome.
   If it fails, fix the change or measure and justify a new budget. Never
   loosen a check to get green.
4. **Open a live preview for Spencer.** When work is ready to look at, start
   the worktree's dev server (`PORT=<port> npm run dev`, with a port no other
   worktree uses) and open its URL in the in-app browser so Spencer can play
   it. Tell Spencer the URL and the branch. Stop the server once Spencer is done.
5. **Ship only when Spencer says it's good.** Merge the latest `main` into the
   task branch and resolve conflicts. Run `npm run check` and push only if it
   passes. Commit with a message that explains why the change was needed, push,
   and open or merge the PR with the `gh` CLI. A push to `main` deploys to
   GitHub Pages, so a red build must never reach it. Stage only the paths you
   changed, never `git add -A`.
6. **No file deletion from the shell.** Never run `Remove-Item`, `rm`, `del`,
   `rmdir`, or any other recursive delete, on Windows or anywhere else. Git
   commands are fine for undoing and discarding changes, including `git reset`
   and `git clean`. No force-push and no rewriting pushed history. If a push is
   rejected, pull and rebase first.

If unrelated changes appear in the working tree, leave them uncommitted and
mention them in the summary.

## Adding an animal

Read `ANIMAL_PIPELINE.md` first and use its checklist. It lists the
registration points that are not compiler-enforced and fail silently.

## Project rules

- **Rendering:** Three.js for all game rendering, including menus, HUD,
  journal, dialogs, and the animal viewer. Don't add Vite, and don't build
  game UI from HTML/CSS/DOM overlays. `index.html` and `src/style.css` are the
  boot shell only. All game UI goes through `src/ui/` (`ui-layer.ts`,
  `ui-viewport.ts`, `ui-theme.ts`, `ui-button.ts`, `ui-props.ts`).
- **Layout:** UI is authored at 1600x900 design units with one uniform scale.
  Never scale x and y independently. Test with the `?gardenDebug=1` harness
  (`window.__gardenDebug.layout()`) rather than eyeballing screenshots.
- **Dev server:** Use the local esbuild server, never `file://`. `npm run dev`
  writes to `dist-<branch>` so worktrees never share an output directory.
- **Pinned deps:** Pin Three.js and its addons and types together.
- **Pure simulation:** `src/game/animal-conditions.ts`, `animal-progress.ts`,
  and `farm-state.ts` have no Three.js and no DOM. Keep them that way so they
  stay testable in `tests/animal-conditions.test.mjs`.
- **Originality:** Don't copy Viva Pinata names, art, species, audio, or text.
- **Archive:** `.archive/zoo-patrol/` is off limits unless Spencer asks.
- **Code quality:** Prefer small, runnable milestones with strict TypeScript
  and focused tests. Name and dispose Three.js resources deliberately, and
  instance repeated decorations where useful.
