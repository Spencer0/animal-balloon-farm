# Animal Balloon Farm — agent instructions

## Workflow

Spencer works from Claude on the web and desktop (cloud sessions). He does not
code locally, does not run a dev server, and does not use GitHub Pages previews
for testing: they are too slow. The loop is: **change, open a PR, publish an
Artifact to try, iterate on that same PR.**

1. **Blender for assets.** Author and render all game assets with headless
   Blender (`blender --background --factory-startup --python ...`). Never
   hand-edit binaries. See `art/blender/README.md`.
2. **One branch and one PR per task.** Work on a `feature/<name>` branch off
   the latest `main` (the PR needs a branch on GitHub; nothing else does). Check
   `git status --short --branch` first, and never edit a checkout another agent
   may be using. Stage only the paths you changed, never `git add -A`.
3. **Open the PR as soon as the first commit is pushed.** Opening a PR is
   harmless and non-destructive, and CI takes a long time, so start it early.
   Do not wait for Spencer to ask. Run `npm run check` before each push, push
   only if it passes, and write the PR body with the *why* (what Spencer saw,
   the cause, what changed, what you did and did not verify). In cloud sessions
   `gh pr create` fails (GraphQL is blocked); use the REST API:
   `gh api repos/Spencer0/animal-balloon-farm/pulls -f title=... -f head=feature/<name> -f base=main -F body=@<file>`.
   The branch push also triggers a GitHub Pages preview. Ignore it: do not wait
   for it and do not send its link.
4. **Publish a playable Artifact for Spencer to try.** This is how he tests.
   Every change needs both of these, and the Artifact link goes in your reply
   together with the PR link:
   1. **A playable Artifact.** Build a lean debug bundle, not the whole game:
      `GARDEN_DEBUG=1 PAGES_OUTDIR=<scratch dir> node scripts/build.mjs`, then
      copy into a second scratch folder only the files the changed thing
      loads (record them with Playwright's `response` events while you drive
      the changed feature). Constraints:
      - Artifacts serve only pages, CSS, JS, JSON, text, common images, fonts
        and media. `.glb` is not served, so pack the models as base64 in one
        `glb-pack.json` and add a small inline `fetch()` shim in the page that
        answers `*.glb` requests from it.
      - The query string is not passed to the page. Set it first with
        `history.replaceState(null, '', '?gardenDebug=1&...')` in an inline
        script before the module script.
      - Inline `main-*.css` into the page; the page file takes body content
        only (the Artifact tool adds the document skeleton); at most 255
        files and 64 MB per publish, 16 MB per file.
      - Keep this scaffolding in the scratch folder, not in the repo.
      - Test the exact folder you publish (serve it, wrap it in a skeleton,
        drive it with Playwright) before publishing.
      Artifacts are private. Spencer opens his own link; sharing with a friend
      is done from the page's Share menu, which you cannot change.
   2. **A debug scenario that warps to what changed.** Add one in
      `dev/scenarios/<area>/<name>.ts`, register it in `dev/scenarios/index.ts`
      (copy `sandbox/farmer-10.ts`) and reach it with
      `?gardenDebug=1&scenario=<area>/<name>` (for a minigame,
      `?gardenDebug=1&careGame=<kind>` already opens it). It must land Spencer
      on the changed thing (the new animal, plant, tool or UI) with whatever
      stock, coins or farm state it needs. For an Artifact, put that query in
      the page's `replaceState`. Scenarios are debug-only and never reach the
      production build.
5. **Iterate on the same PR.** When Spencer reports back, push more commits to
   the same branch and republish the Artifact to the **same file path** so the
   link stays the same. Do not open a new PR or a new Artifact for feedback.
   Commit messages explain why the change was needed. Merge the latest `main`
   into the branch and resolve conflicts when the PR falls behind.
6. **Validate in a browser before calling work done.** Drive the game with
   Playwright and check the changed behaviour with real input; take
   screenshots with `scripts/screenshot.mjs` (1280x720 JPEG, output outside the
   repo, one per state change, never in a loop, never fullPage on the game
   canvas: oversized images break the agent thread). Say what you did not
   exercise. Don't run `npm run gate` locally: its stress scenarios are heavy,
   and it runs on GitHub CI for every PR (the Performance workflow,
   `.github/workflows/performance.yml`). Read the PR's Performance check before
   merging. If it fails, fix the change or measure and justify a new budget.
   Never loosen a check to get green.
7. **Merge only when Spencer says it's good.** Opening the PR is automatic;
   merging is not. A push to `main` deploys to GitHub Pages, so a red build
   must never reach it.
8. **No file deletion from the shell.** Never run `Remove-Item`, `rm`, `del`,
   `rmdir`, or any other recursive delete, on Windows or anywhere else. Git
   commands are fine for undoing and discarding changes, including `git reset`
   and `git clean`. No force-push and no rewriting pushed history. If a push is
   rejected, pull and rebase first.

If unrelated changes appear in the working tree, leave them uncommitted and
mention them in the summary.

## Command allow list

Spencer keeps Claude Code's allow list in the global settings file,
`C:\Users\Spencer\.claude\settings.json`, so it applies to every project.
You may add a command to its `allow` list when it has **zero ability to wipe
the drive**. In practice that means all of these hold:

- It can't delete, overwrite, or move files outside a git-restorable change.
- It can't kill processes or change permissions (`taskkill`, `icacls`, `takeown`).
- It isn't a shell wrapper that could hide a delete inside a string (`cmd`,
  `powershell`, `bash -c`).
- Its pattern is narrow. Use `git worktree add:*`, not `git:*`.

Never add `rm`, `rmdir`, `rd`, `del`, `erase`, `Remove-Item`, `robocopy`,
`taskkill`, `format`, or `diskpart`. Commands that push, merge to `main`,
remove a worktree, or reset or clean the tree belong on `ask`, not `allow`.

When you add an entry, name it in your final summary and say why it's safe.
If you aren't sure a command meets this bar, don't add it. Ask Spencer.

## Adding an animal

Read `ANIMAL_PIPELINE.md` first and use its checklist. It lists the
registration points that are not compiler-enforced and fail silently.

## Adding a cutscene

Read `CUTSCENE_PIPELINE.md`. A new shop tool gets its unlock film from one
entry in `TOOL_UNLOCK_FILMS`, with no Blender work.

## Project rules

- **Rendering:** Three.js renders the farm and the world-space bits of the HUD
  (the tool bar, the balloon). Don't add Vite.
- **WebGPU:** `WebGPURenderer` is the default; the game falls back to WebGL
  when WebGPU is missing or fails to start, and `?renderer=webgl` forces it
  (the perf gate pins it). A shader that has GLSL for WebGL needs a TSL twin in
  `src/render/webgpu/kit.ts` (the GLSL source stays the reference). Read
  `docs/WEBGPU.md` before touching either renderer path, and never statically import
  `three/webgpu` or `three/tsl` outside `src/render/webgpu/` (it is a lazy chunk).
- **UI toolkit:** Game panels are DOM overlays: one `src/ui/<name>-dom.ts`
  with a sibling `<name>-dom.css`, in the Farm Journal look (cream paper
  `#faf3e2`, `#6b4a33` borders, dashed `#b08c5e` dividers, Trebuchet MS,
  terracotta `#c65a3a` accents). Copy `journal-dom.css` / `notification-dom.css`
  for new UI, including hover tooltips (`tool-tooltip-dom.ts`).
- **Legacy canvas toolkit:** `ui-theme.ts`, `ui-button.ts`, `ui-props.ts`,
  `ui-layer.ts` and the canvas `*-panel.ts` files (Georgia type, gilt rims)
  are the old proof of concept, being replaced by the DOM toolkit. Don't
  extend them and don't copy their style. Only touch them to migrate or
  retire a panel.
- **Layout:** Three.js HUD elements are authored at 1600x900 design units with
  one uniform scale. Never scale x and y independently. Test with the
  `?gardenDebug=1` harness (`window.__gardenDebug.layout()`) rather than
  eyeballing screenshots.
- **Dev server:** For your own checks, use the local esbuild server, never
  `file://`. `npm run dev` writes to `dist-<branch>` so checkouts never share an
  output directory. Spencer does not use it; he tests through the Artifact.
- **Pinned deps:** Pin Three.js and its addons and types together.
- **Pure simulation:** `src/game/animal-conditions.ts`, `animal-progress.ts`,
  and `farm-state.ts` have no Three.js and no DOM. Keep them that way so they
  stay testable in `tests/animal-conditions.test.mjs`.
- **Originality:** Don't copy Viva Pinata names, art, species, audio, or text.
- **Archive:** `.archive/zoo-patrol/` is off limits unless Spencer asks.
- **Code quality:** Prefer small, runnable milestones with strict TypeScript
  and focused tests. Name and dispose Three.js resources deliberately, and
  instance repeated decorations where useful.
