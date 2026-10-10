# Cutscene pipeline

The game has two films, built the same way:

| Film | Plays when | Script (pure data) | Player (Three.js) | Blender |
| --- | --- | --- | --- | --- |
| Intro | a new farm starts | `src/game/intro-script.ts` | `src/scene/intro-cutscene.ts` | `art/blender/intro_cutscene.py` |
| Tool unlock | a tool is bought at Pip's shop | `src/game/tool-unlock-script.ts` | `src/scene/tool-unlock-cutscene.ts` | `art/blender/tool_unlock_cutscene.py` |

Shared pieces: `src/game/cutscene-timeline.ts` (camera keys, clip cues,
captions, easing), `src/scene/cutscene-kit.ts` (actor posing, film grade,
the `CutscenePlayer` interface), `src/scene/intro-audio.ts` (synthesised
sound for a list of `SoundCue`s) and `src/ui/intro-captions.ts`.

Every frame is a pure function of seconds since the film started. Never keep
state that accumulates frame to frame. That is what makes skip, seek and the
debug harness work.

## Add a cutscene for a new tool (the common case)

The tool-unlock film is one scene for every tool. The tool itself is the
game's own model (`createGardenToolModel`), carried between Pip's and the
boy's `HAND_GRIP_R` empties. A new tool needs **no Blender work**.

1. Add the upgrade to `UpgradeId`, `UPGRADE_ORDER` and `UPGRADE_CATALOG` in
   `src/game/tool-unlocks.ts` as usual. If it is not a tool (like the land
   deed), add it to `NonToolUpgrade` in `tool-unlock-script.ts` and stop here.
2. `npm run typecheck` now fails on `TOOL_UNLOCK_FILMS`. Add an entry:
   ```ts
   rake: {
     id: 'rake',
     tool: 'rake',                 // a GardenToolId that createGardenToolModel builds
     title: 'The Rake',            // the title card
     titleSpoken: 'Le Râteau',     // French line shown above it
     cheer: 'Tidy as a whistle!',  // the boy's last line
     cheerSpoken: 'Propre comme un sou neuf !',
     grip: { offset: [0, -0.09, 0], rotation: [Math.PI / 2, 0, 0], scale: 0.44 },
   },
   ```
   Keep the lines original. Don't copy Viva Pinata names or text.
3. `buyUpgrade` in `src/main.ts` already calls `startToolFilm(id)` for every
   upgrade. Nothing else to register.
4. Tune the grip by looking, not guessing. With `npm run dev` running, open
   `?gardenDebug=1` and call these from the console:
   ```js
   __gardenDebug.toolFilm('rake', 5.0)   // handover, tool crossing the counter
   __gardenDebug.toolFilm('rake', 7.6)   // inspect close-up, title card
   __gardenDebug.toolFilm('rake', 10.6)  // cheer, tool held overhead
   ```
   Each call holds that moment on screen. Grip axes are the hand's:
   -Y runs down the forearm past the knuckles, so a more negative offset
   pushes the tool out of the fist. The model is centred on the fist before
   the grip applies. In the cheer the tool should sit clear of the beret.
   If the tool is too small to read, raise `scale`, and lower it if it hides his face.
5. `node --test tests/tool-unlock-script.test.mjs` checks that every tool
   upgrade has a film with all its lines. Run `npm run check` before pushing.

## Change the film itself (shots, timing, acting)

- Camera moves, timings, captions and sounds are data in
  `tool-unlock-script.ts`. Change a number, reload, re-check the moments
  above. The tests pin the important ordering (Pip offers before the handoff,
  the boy reaches before it, he faces the camera to cheer). Keep them green.
- Animations (clips `IDLE WALK TAKE INSPECT CHEER` for the boy,
  `IDLE WAVE OFFER CLAP` for Pip) and the shop set live in
  `art/blender/tool_unlock_cutscene.py`. Regenerate:
  ```powershell
  blender --background --factory-startup --python art/blender/tool_unlock_cutscene.py -- boy pip shop
  ```
  Then check `public/assets/cutscenes/tool-*-review.png` and run
  `npm run assets:budget`. Cutscene GLBs are capped at 50k tris and 1000 KB.
  The shop is the closest to the cap.
- Every clip must key every pivot (the `Rig.clip` helper does this), or
  crossfades leave limbs behind. Keep `export_optimize_animation_size=False`
  in the export. See `skills/blender-asset-pipeline/SKILL.md`.

## Make a new film

Copy the tool-unlock trio (script, player, Blender maker) rather than the
intro, which has a TV-within-a-room render that most films don't need.
Implement `CutscenePlayer`, then add a `let` and a branch in `frame()` in
`main.ts` next to `toolFilm`. Add it to `activeFilm()` so Escape and the
double-press skip work. Add `document.body.classList.add('film-playing')`
while it plays so DOM panels hide.
