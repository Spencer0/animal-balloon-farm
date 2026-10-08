# Animal pipeline

How an animal gets from a Python script to a wandering, catchable creature in the garden — and how to
add the next one. The end goal is that an agent can go from "add a llama" to a reviewed, playable
species without hand-holding.

Current catalog: **8 species** (pig, sheep, cow, chicken, duck, goose, frog, owl).

## The 5 stages

| # | Stage | Lives in | Produces |
|---|-------|----------|----------|
| 1 | Author + rig + animate | `art/blender/balloon_friends.py` | scene in memory |
| 2 | Export | same script | `public/assets/animals/balloon-<id>.{blend,glb}` + `balloon-<id>-review.png` |
| 3 | Register | `src/animals/animal-catalog.ts` + 3 records | new member of `BalloonAnimalId` |
| 4 | Verify | browser | animal wandering the garden, in the showcase, and in the journal |
| 5 | Journal | *derived from the catalog* | discoverable species record |

Stages 1–2 are art. Stage 3 is wiring — and since the catalog refactor it is **one array entry plus
three compiler-enforced records**. Stages 4–5 need no new code at all: the showcase, the capture
card, the journal page, and the species count string all derive from the catalog.

---

## Stage 1–2 · Blender authoring

### One-time environment check

```sh
blender --version   # 4.2.3 LTS is the known-good version
```

If `blender` is not on `PATH`, the historical executable is
`C:\Users\Spencer\Documents\Playground\tools\blender\blender-4.2.3-windows-x64\blender.exe`
(check it still exists before using it).

Scripts run under Blender's **embedded** Python. Do not try to `import bpy` from system Python.

### Adding a species to `balloon_friends.py`

Follow the existing `make_duck()` shape. Five edits:

1. **`materials(name)`** — add an `elif` branch overriding the base palette. Each species needs a
   distinct body/head/material set; this is what makes the capture reveal worth watching.
2. **`make_<id>()`** — build the animal. The shared helpers do the heavy lifting:
   - `sphere(name, position, size, material, parent)` — UV sphere, parented, smooth-shaded
   - `curve(name, points, width, material, parent)` — bevelled Bezier; use for legs, tails, seams, rings
   - `pivot(name, position, parent)` — an Empty that acts as a rig joint
   - `add_face_details(head, m, animal)` — eyes, pupils, catchlights, brows, cheeks. Faces point **+X**
   - `make_legs(...)` / `add_waterfowl_legs(...)` — quadruped or biped leg sets
   - `add_collar(body, neck, m, animal)` — the signature brass bell, returns a pivot
3. **Root custom properties** — `root["asset_id"] = "animal_balloon_<id>"` and a `root["description"]`.
   These are metadata only, but keep them consistent.
4. **`animate(...)`** — pass every pivoted object. See *Animation contract* below.
5. **`portrait(name, m)`** then **`export_asset(root, name)`** as the last two lines.

Then register the maker:

```python
MAKERS = {"sheep": make_sheep, "cow": make_cow, "chicken": make_chicken,
          "duck": make_duck, "goose": make_goose, "llama": make_llama}
```

### Run it

```sh
# Regenerate only the animals you name (safe — approved assets are preserved)
blender --background --factory-startup --python art/blender/balloon_friends.py -- llama

# Bare invocation regenerates only duck + goose, deliberately
blender --background --factory-startup --python art/blender/balloon_friends.py
```

**This is a destructive, file-writing command.** It overwrites the `.blend`, `.glb`, and review PNG
for each named animal. Check `git status` first and never run it on animals you did not intend to
rebuild. The script clears only temporary in-memory scenes, but it writes to `public/assets/animals/`.

### Animation contract

The runtime only looks for two clips, matched by **substring on the uppercased clip name**
(`src/animals/balloon-animal.ts`): a name containing `WALK`, and one containing `IDLE`. The exporter
emits exactly `WALK` and `IDLE` because the NLA tracks are named that way.

- `FRAMES = (1, 7, 13, 19, 25)` / `PHASES = (0, π/2, π, 3π/2, 2π)` — five keyframes per full cycle.
  First and last must match for a clean loop.
- `animate()` writes a **real gait**, not a mesh bob: body bob and roll, head counter-motion, tail
  follow-through, bell swing, diagonal leg pairs offset by π, hoof-hinge lift.
- Birds use `forward_gait=True` (foot plants forward, rolls back, lifts, swings forward).
  Quadrupeds use the default rearward-first cycle.
- Wings/ears are the `ears` argument — for birds these become flapping wing pivots.
- `finish_action()` pushes each action into an NLA track named after the clip, then clears
  `data.action`. The exporter is configured for `NLA_TRACKS`, so **an action that never reaches an
  NLA track will not be exported.**

### Naming contract (do not break this)

The capture flourish finds rig joints by **matching object-name substrings**
(`buildRigPose` in `src/animals/balloon-capture.ts`):

```
DUCK RIG · bright emerald head   → matches 'rig' + 'bright emerald head'
CHICKEN RIG · near flapping wing  → matches 'rig' + 'wing', side from 'near'/'far'
```

So:
- Rig joints must contain `RIG` and the descriptive phrase the TS side looks for.
- Laterals must be labelled `near` / `far` — that is how `side` is derived.
- **Renaming a rig pivot silently breaks the capture animation.** It is not a compile error and
  there is no warning. Keep the phrase, or update `buildRigPose` in the same commit.
- A species with **no** `buildRigPose` branch still works — it simply gets no secondary head/wing
  motion during capture. It is an enhancement, not a registration requirement.

### Stage 2 outputs

Three files, always regenerated together:

```
public/assets/animals/balloon-<id>.blend          editable source (keep in git)
public/assets/animals/balloon-<id>-review.png     1200x1000 art-review portrait
public/assets/animals/balloon-<id>.glb            runtime asset (no cameras, no lights)
```

Blender also drops a `balloon-<id>.blend1` backup next to the `.blend`. Several are already committed; that is expected, not stray output.

### Review gate

Inspect the **exported GLB**, not the Blender viewport:

- `[Animal Balloon Farm] <name> asset` in the browser console logs dimensions and
  `clips: [{name, duration}]` — both must be present and sane (~1–2s per clip).
- `[Animal Balloon Farm] <name> ground clearance` logs `finalBounds.min.y`; it should be `0.0000`.
- Open the review PNG for silhouette, expression, leg/ear/tail attachment, balloon sheen, hoof
  separation.
- Watch it walk in the garden at real camera distance. Blender's render is a reference, not a claim
  about the runtime — Three.js is authoritative.

---

## Stage 3 · Register the species in TypeScript

### One file declares an animal

`src/animals/animal-catalog.ts` holds `ANIMAL_CATALOG`, an array of species objects. It is the
single source of truth, and almost everything else is derived from it:

| Derived from the catalog | Where |
|--------------------------|-------|
| `BalloonAnimalId` (`typeof ANIMAL_CATALOG[number]['id']`) | `animal-catalog.ts` |
| `SHOWCASE_ANIMALS` (plinth spawn + ring/accent color) | `balloon-catalog.ts` |
| scene options for garden **and** viewer | `getAnimalSceneOptions()` |
| the viewer's card list | `viewer-panel.ts` — filtered by `VIEWER_CAST` (the review-booth cast) |
| the journal's animal chapter | `journal-panel.ts` — `ANIMAL_CATALOG.map(...)` |
| the "N personalities" copy string | `viewer-panel.ts` — derived from the cast count |

Append one object to the array and the animal gets a type id, a showcase plinth, a capture card, a
journal page, and a correct species count — for free.

### The catalog entry

```ts
{
  id: 'llama',                                    // becomes part of BalloonAnimalId
  name: 'Llama',                                  // display name (journal + cards)
  label: 'llama',                                 // lowercase label used in-scene
  spriteUrl: 'assets/animals/balloon-llama-review.png',
  subtitle: 'The tall drinker',                   // journal chapter title
  description: 'A long-necked visitor with a very calm outlook.',
  note: 'A gentle hum while it grazes.',           // journal flavour line
  color: '#c98f5a',                               // journal + showcase accent
  gesture: 'Stands tall',                         // shown on the capture card
  assetUrl: 'assets/animals/balloon-llama.glb',   // document-relative, NOT /assets/...
  spawn: [2, -4],                                 // garden [x, z]
  showcaseSpawn: [-4, 3.2],                       // plinth position in ?showcase=1
  seed: 777,                                      // any int; fixes the wander pattern
  size: 2.4,                                      // LONGEST SIDE in world units
  speed: 0.9,                                     // garden units/second
  bounds: { x: 10.5, z: 6.1 },                    // wander rectangle, roughly the lawn
}
```

Per-field notes:

- `size` is **not** the raw Blender scale. `createBalloonAnimal` measures the GLB, scales the longest
  side to `size`, centers it on X/Z, and grounds it so `min.y` is exactly 0. Author the model at any
  comfortable scale; just keep proportions sane.
- `assetUrl` and `spriteUrl` must stay document-relative. Root-absolute `/assets/...` breaks the
  GitHub Pages subpath.
- `bounds` is per-animal and roughly the lawn half-extents (`GARDEN_BOUNDS` is 14 x 9.5). Shrink it
  slightly so animals do not clip the fence. `getAnimalSceneOptions` supplies `groundY:
  GARDEN_LAWN_Y` (0.03) for you — do not add it to the entry.
- `speed` is what makes a species read as a species — a chicken should visibly outpace a cow.
- `showcaseSpawn` must not collide with another species' plinth. The six current ones use a 3x2 ring
  at roughly `[-7, 0, 7] x [-3.2, 3.2]`; a 7th animal needs a new free spot.

### Three compiler-enforced records

These are keyed `Record<BalloonAnimalId, …>` or exhaustive switches, so adding the catalog entry
produces **exactly three errors** — confirmed by experiment on the merged tree (adding a `llama`
entry yields 3 errors and nothing else):

```
src/animals/balloon-animal.ts(55,7): error TS2741: Property 'llama' is missing … Record<…, MeshStandardMaterial>
src/animals/balloon-capture.ts(6,7):  error TS2741: Property 'llama' is missing … Record<…, readonly [string, string]>
src/animals/balloon-capture.ts(164,79): error TS2366: Function lacks ending return statement …
```

That is the whole checklist:

| File | Symbol | What it is |
|------|--------|-----------|
| `src/animals/balloon-animal.ts:55` | `BODY_MATERIALS` | placeholder color, used **only** if the GLB fails to load |
| `src/animals/balloon-capture.ts:6` | `PAINT_PALETTES` | `[primary, secondary]` paint colors for the capture pour |
| `src/animals/balloon-capture.ts:164` | `captureGesture` | exhaustive `switch` with no `default` — TS reports "function lacks ending return statement" |

`captureGesture` returns a `CapturePose`:

```ts
case 'llama':
  return { fill, lift: active * 0.04, pitch: Math.sin(time * 2.2) * 0.06 * active, roll: 0, yaw: 0 }
```

where `fill` is the pre-computed paint-progress term and `active` the in-animation envelope — both
already in scope at the top of the function.

Then `npm run typecheck` until green. Every error mentioning a missing property for your new id is a
registration point you have not filled in yet.

### Registration points that are NOT compiler-enforced

These fail silently:

- **`src/animals/balloon-capture.ts`** — `buildRigPose` name matching (see the naming contract).
  Missing it costs you flourish, not function.
- **`VIEWER_CAST` in `src/animals/animal-catalog.ts`** — the viewer stages only the species listed
  there (it is the review booth for new models). A new catalog entry does not appear in the viewer
  until its id joins the cast; that is deliberate, so a model being tuned can stand alone.
- **The `species` field of a `plantCount` requirement** — it is a `string`, not a `PlantId`, so a
  typo reads as zero plants and the animal simply never settles. Assert the id in a test, the way
  `tests/animal-conditions.test.mjs` does for the frog.

---

## Stage 4 · Verify in the browser

```sh
npm run dev     # http://127.0.0.1:8000/
```

- `http://127.0.0.1:8000/` — normal garden (main menu → **ENTER**). The animal wanders; the condition ladder decides when it settles.
- **VIEWER** from the main menu (or `window.__gardenDebug.openViewer()` under `?gardenDebug=1`) — the capture viewer. It stages only `VIEWER_CAST` (`src/animals/animal-catalog.ts`): the review booth for new models. While tuning a species, list just its id there and it stands alone on the stage, framed close, with a single tray card; click the card (or **Play all**) to replay its reveal.
- Click the journal book in the world → **Animals** chapter. Your species should appear with its
  portrait, subtitle, and note, derived straight from the catalog entry.

**Screenshots (project rule, non-negotiable):** resize the viewport to ~1280x720 first, take **one**
screenshot per state change, and **never** `fullPage` a game canvas. A single oversized image
permanently poisons the agent thread with a 30MB upload error.

---

## Stage 5 · Journal entry

**Nothing to do.** The journal is a Three.js book rendered in-scene (`src/ui/journal-ui.ts`); its
animal chapter maps `ANIMAL_CATALOG` directly. Filling in `subtitle`, `description`, `note`,
`color`, `gesture`, and `spriteUrl` in the catalog entry *is* the journal entry.

The one caveat: the journal is **no longer a static record book**, but the part it draws is not
derived from the catalog. It reads the condition model described below, so filling in `subtitle` and
friends still writes the field notes, while the checklist under them comes from
`src/game/animal-conditions.ts`. A species with no entry in `SPECIES_CONDITIONS` falls back to a
default four-step ladder, so the page still renders — but the numbers on it will be invented rather
than designed. Put the species in `SPECIES_CONDITIONS` as part of stage 3.

---

## Animal conditions

Every species climbs four rungs before it belongs to the farm:

| Stage | Condition | Appearance |
|-------|-----------|------------|
| 0 | undiscovered | not in the world |
| 1 | visit the carnival | wild balloon red |
| 2 | visit the farm | wild balloon red |
| 3 | call the farm home | its own colours |
| 4 | love the farm | own colours + heart eyes |

Three pure modules own this, and none of them import Three.js — which is why the whole loop is
covered by `tests/animal-conditions.test.mjs` rather than only by eye in a browser.

| File | Owns |
|------|------|
| `src/game/animal-conditions.ts` | the ladder, `SPECIES_CONDITIONS`, `DISCOVERY` |
| `src/game/farm-state.ts` | lawn coverage + heights → m² of grass, water, pasture |
| `src/game/animal-progress.ts` | the state machine and what the journal may reveal |

`main.ts` owns the seam: `measureFarm()` reads the renderer's arrays into plain ones, ticks the
model, and applies whatever stage each animal reaches. `balloon-animal.ts` knows nothing about
conditions beyond its own `stage` property.

Three things that are easy to get wrong here:

- **A requirement below the current stage reports a null target.** That is the disclosure rule, and
  it lives in the model so the UI cannot leak a number by accident.
- **Pasture means grassy flat ground.** Measuring flatness on bare dirt is satisfied by a plot the
  moment the game starts, and the sheep settles onto an empty field for free.
- **The grid pitch must be the *most common* vertex step.** The lawn is a rounded rectangle, so its
  first row is a corner bevel; reading the pitch off vertices 0 and 1 under-reports every area ~4x.

### Adding a species to `SPECIES_CONDITIONS`

One entry, four `StageDefinition`s. Stages 1 and 2 have `requirement: null` — they ask nothing of the
player. Stage 3 and 4 each need one, and both are re-checked every frame, so keep them honest:

```ts
duck: {
  stages: withStageNumbers([
    CARNIVAL,
    ENTER_FARM('Heads straight for the low ground and paddles in.'),
    CALL_HOME('waterArea', 8, 'Wants a proper pool to swim in, not just damp soil.', 0.75),
    LOVE_THE_FARM('waterArea', 16, 'Wants a bigger pond and plenty of grass at the waterline.', 0.75),
  ]),
},
```

A social condition uses `REQUIRE_RESIDENT('cow', 'Cow')` instead, which is how the pig is made to
wait on a resident cow. To let a species that is *not* a `CARNIVAL_STARTER` ever appear, give it a
`DISCOVERY` entry — otherwise it sits at stage 0 forever and its conditions are unsatisfiable.

### Conditions answered by plants

The fifth condition kind, `plantCount`, counts **plants of a named species** rather than square
meters. It is what the frog uses, and it is the general answer for any animal whose habitat is
something the player *builds* one plant at a time:

```ts
frog: {
  stages: withStageNumbers([
    CARNIVAL,
    ENTER_FARM('Springs over the fence and sits in the mud to listen.'),
    PLANT_HOME('water-lily', 2, 'Wants lily pads to sit on — a couple of grown ones in the pond.'),
    PLANT_LOVE('water-lily', 4, 'Wants a proper lily pond: twice the pads, and grass along the banks.'),
  ]),
},
```

Three rules that are easy to get wrong:

- **Only *mature* plants count.** A seed dropped in the water is not a lily pad yet, exactly as a
  newly sown patch is not tall grass. The maturity gate is what makes watering and pruning matter to
  an animal condition instead of being decoration. `main.ts` builds the tally in `maturePlantCounts()`
  and the sim owns the truth about growth.
- **A plant condition implies its substrate.** A water lily can only be planted in visible pond
  water, so asking for lily pads quietly asks for a pond first. Do not also add a `waterArea`
  requirement to say the same thing twice.
- **Keep the count inside the seed supply.** A species starts with `STARTING_SEEDS_PER_PLANT` (5)
  seeds, so a stage-4 requirement above 5 is unreachable and the animal silently stops at stage 3.

`conditionMetricLabel` words these for the journal, falling back to the plant catalog's own name, so
a new plant gets a readable label without anyone remembering to update the map beside it.

### Verifying conditions in the browser

With `?gardenDebug=1`, `window.__gardenDebug` grows a few verbs aimed at this system:

```js
const d = window.__gardenDebug
d.closeMenu()
d.sowGrass(0, 0, 3.4)      // a disc of tall grass, straight to full height
d.digPond(-6, 4, 3)        // a basin, for the water conditions
d.pourAt(-6, 4, 3, 40)     // fill it, so there is actual pond water
d.plant('water-lily', -6, 4)   // one seed, through the seedbox's own rules
d.growPlants(90, 1)        // grow them, answering every care marker on the way
d.advance(400, 1 / 30)     // run the clock; returns the new stages
d.conditions()            // every rung, revealed or not, with live numbers
d.setStage('duck', 4)      // force a species up the ladder, transition and all
d.resetConditions()        // back to a bare plot and the carnival
d.focusSpecies('sheep', 6) // frame one closely, to check the heart eyes
```

`sowGrass` and `digPond` go through the real tool code, so the harness grows genuine geometry
instead of writing a coverage array behind the renderer's back. `plant` goes through the same
`plantSurfaceAt` rule the seedbox uses and reports the placement failure rather than doing nothing,
because a rejected seed is the hardest possible thing to debug through a screenshot. `growPlants`
answers care markers for you, because a lily pauses for a drink and a pinch and time alone will
never mature it. Do not verify a condition by hand-dragging the seeder: it is not a repeatable loop,
and every area bug found while building this was found by the harness rather than by looking.

---

## Pacing: who arrives when

The farm fills one animal at a time, and each arrival is earned.

- **Cow and duck** are the only carnival starters (`CARNIVAL_STARTERS`). A cow
  needs nothing but grass, so it is the first win.
- **Sheep** are lured by clover (`DISCOVERY.sheep`: 2 grown patches) and visit at
  3. **Chickens** are lured by dandelions the same way. `DISCOVERY` is the trigger
  that takes a species from stage 0 to the carnival, so a lure is one entry there.
- **Staying and breeding** lean on props: sheep need a small barn to settle, cows
  need one to breed, chickens need a coop to settle and a second to breed. Use
  `COUNT_STAGE` with `and: [{ kind: 'propCount', species: 'barn', amount: 1 }]`.
- **Shifts.** Owls turn up and visit only after dark; every other species turns up
  and steps inside the fence only in daylight (`isNightOnly`). Residents are never
  sent away at night: chickens have to be there for the owl to hunt.
- Only a visitor that is *ready to walk in* holds the arrival queue, so a sheep
  still waiting for its third clover patch does not stop the chickens arriving.

Ground-cover plants (clover, dandelion) set `groundCover` in `PLANT_CATALOG`: they
need real turf under them and are drawn as a round patch that melts into the lawn.
Care is a short list of `care` stops along the growth curve (two waterings for a
patch), so a plant that is waiting for you just waits. It never withers.

## Fliers, predators and the night shift

The owl is the first species that does not wander, hunts another species, and only comes out after
dark. None of that is special-cased in the catalog loop; each piece has one home.

| Concern | Where it lives |
|---------|----------------|
| `flier: true` on the catalog entry | `src/animals/animal-catalog.ts` (passed through `getAnimalSceneOptions`) |
| Night-only arrival and visits | `NIGHT_ONLY_SPECIES` in `src/game/animal-conditions.ts`, honoured by `animal-life.ts` |
| Who eats whom, the prey floor, the eaten tally | `PREY_OF`, `PREY_FLOOR`, `createPredationLedger` in `src/game/predator.ts` |
| The owl's flight and hunt state machine | `stepOwl` in `src/game/predator.ts` (pure, tested in `tests/predator.test.mjs`) |
| Applying flight to the model, panicking prey | `src/scene/owl-hunt.ts` |
| The pop and its clean-up | `src/game/pop-animation.ts` (timeline) and `src/scene/pop-burst.ts` (meshes) |
| The roost | the `OAK roost` node of `public/assets/props/oak.glb`, read by `GardenProps.roosts()` |

Rules that are easy to get wrong:

- **A flier is positioned from outside.** `createBalloonAnimal` skips the wander for `flier` and waits
  for `setFlightPose`. Its clips are still just `WALK` and `IDLE`: `WALK` is the wide-winged flight
  cycle, played well under real time because a balloon barely flaps, and `IDLE` is the folded pose,
  used for perching and for the dive. Do not add a third clip name; the runtime will not find it.
- **Ground the pose it will wear.** The static GLB pose is not the clip pose, so a flier is grounded
  on its `IDLE` frame (see `ensureDetailedModel`). A perched owl has its talons on the `OAK roost`
  node only because of this.
- **Fliers are always full models.** The instanced crowd has no low-poly owl, so `refreshAnimalCrowd`
  keeps a flier out of it. A new flier needs no crowd geometry, but it will not be cheap in a flock.
- **Prey is a resident, adult, on-farm chicken** that is not mid-capture, courting or waiting to
  settle. The owl will not take the flock below `PREY_FLOOR` (2), so there is always a pair to breed.
- **A catch is a removal.** `handleOwlCatch` in `main.ts` forgets the chicken from the sim at once,
  tallies it in the ledger and hands the model to a pop effect, which disposes it when it is done.
- **Helium.** An oak is also where a resident owl tops up. Pick the last oak up and the owl cannot
  roost, so it stays aloft day and night (it only hunts at night), shrinks and sags as `helium` falls
  over `HELIUM_SECONDS` (120), and pops at zero. Placing an oak again refills it six times faster than
  it leaked. Extra owls beyond the oak count share an oak a step apart and are not stranded.
  Debug: `setOwlHelium(0..1)`.
- **Heading follows movement.** `steer` turns the owl toward the way it actually moved this step, so
  it never flies sideways while chasing a moving target.
- **Two requirements on one rung** use `ConditionRequirement.and`. The journal shows the extras as
  further bars (`alsoNeeds`); the stay rung's headline number is the chickens eaten.
- **Count conditions.** `residentCount`, `preyEaten` and `propCount` read the `residentCounts`,
  `preyEaten` and `propCounts` maps on `FarmState`, which `main.ts` fills in `measureFarm()`.
- **Night and day visitors are paced separately** in `animal-life.ts`, so an owl does not queue behind a
  cow that is still waiting for grass.

Debug verbs (with `?gardenDebug=1`): `addAnimal(species, stage)`, `feedOwl(n)`, `hurryHunt()`,
`stepHunt(seconds)` (steps the hunt without rendered frames), `predation()`, and the existing
`setTimeOfDay`, `buy('oak')` and `placeProp('oak', cellX, cellZ)`. The owl takes the visit and stay
rungs through `advance(...)` like any other species.


## Test scenarios: jump straight into a game state

Waiting out an owl's conditions to test it is slow, so saved states live in `dev/scenarios/<animal>/`.
Open the game with `?gardenDebug=1&scenario=<id>` and it lands in that state on load:

| Scenario | You land in |
|----------|-------------|
| `owl/first-night` | one chicken, night, the owl just turned up at the tents |
| `owl/hunt-now` | five chickens, night, owl visiting with its hunt ready |
| `owl/ready-to-settle` | as above plus an oak, four chickens already eaten: the next catch settles it |
| `owl/resident-roosting` | daytime, a resident owl asleep on the oak (`__gardenDebug.holdTime(false)` releases the clock) |
| `owl/breed-ready` | night, two oaks, two owls in love |
| `owl/low-helium` | night, a resident owl with no oak and about 15 s of helium left: it sags, shrinks and pops |

`__gardenDebug.scenarios()` lists them, `runScenario(id)` applies one to a running game (a fresh load
is cleaner), and scenarios hold the day clock so night stays night. To add one: write a
`Scenario` in `dev/scenarios/<animal>/`, using only the verbs on `ScenarioHarness`
(`dev/scenarios/types.ts`), and list it in `dev/scenarios/index.ts`.

Nothing in `dev/` ships. `src/main.ts` imports it only inside the `__GARDEN_DEBUG__` branch that
production builds fold away, and `scripts/check-no-scenarios.mjs` (part of `npm run check`) fails the
build if a scenario name appears in the production bundle. Branch previews on Pages keep the
harness, so scenarios work there too.

## Checklist

Stages 1–2, art:

- [ ] `materials()` branch with a distinct, readable palette
- [ ] `make_<id>()` uses the shared helpers; root has `asset_id` + `description`
- [ ] Rig joints named `... RIG · <phrase>` with `near` / `far` laterals
- [ ] `animate()` called with every pivot; WALK is a real gait, first/last poses match
- [ ] `portrait()` + `export_asset()` called
- [ ] Registered in `MAKERS`
- [ ] Ran with `-- <id>` only; `git status` shows only that animal's three files changed
- [ ] Review PNG inspected; GLB console log shows both clips and `0.0000` ground clearance

Stage 3, code:

- [ ] One object appended to `ANIMAL_CATALOG` in `src/animals/animal-catalog.ts`
- [ ] `assetUrl` / `spriteUrl` are document-relative, not `/assets/...`
- [ ] `showcaseSpawn` does not collide with an existing plinth
- [ ] `BODY_MATERIALS` entry (placeholder color)
- [ ] `PAINT_PALETTES` entry (two paint colors)
- [ ] `captureGesture` `case` added
- [ ] `npm run check` green
- [ ] Added the species to `VIEWER_CAST` (or reviewed it there solo) if it should stand in the booth
- [ ] `buildRigPose` branch added **only if** you want head/wing secondary motion

Stages 4–5, verify:

- [ ] Watched walking in `?showcase=1` and clicked to capture in the garden
- [ ] Species appears in the journal's Animals chapter with its portrait and note

---

## Known friction for a large catalog

These are the things that will bite at 20+ species, recorded now so they are not rediscovered.
Items 1 and 3 are **partly fixed** by the catalog refactor; the rest still stand.

1. ~~**The showcase card grid is still hardcoded to 6.**~~ **Fixed.** The viewer tray is
   canvas-drawn and lays out whatever the cast contains; the stage and tray both follow
   `VIEWER_CAST`, so the review booth shows one model without the rest crowding in.
2. **Rig matching is by string.** `buildRigPose` couples Blender object names to TypeScript literals.
   Every new species either reuses an existing phrase (`wing`, `leg`) or gets a new branch. There is
   no registry and no validation that a signature pose actually found its joints — a typo is silent.
   A manifest field like `rigParts: ['head', 'wing']` would remove the coupling entirely.
3. **No asset manifest.** Registration is now one array, but it does not reach the Python side:
   `MAKERS` in `balloon_friends.py` is still a hand-maintained dict that can drift from
   `ANIMAL_CATALOG`. A shared `animals/manifest.json` read by both would close the loop, per the
   `AGENTS.md` rule about data-driving species conditions.
4. **No asset validation script.** Nothing checks that every `assetUrl`/`spriteUrl` exists on disk,
   that every GLB has both clips, or that every `BalloonAnimalId` has a Blender maker. A
   `npm run animals:check` that does all three is the highest-value addition.
5. **Each `.blend` + `.glb` + PNG is ~1.5–2.2 MB.** Twenty species is ~40 MB of committed binaries and
   a slow `?showcase=1` cold load. Worth a decimation pass or Draco compression before scaling up.
6. **Capture is 6.8s per animal** and starts on click. With a large catalog, "Play all" is a 6.8s
   parade, not a test.
7. ~~**The journal has no progression.**~~ **Fixed.** Every species now climbs four conditions with
   progressive disclosure, so a big catalog reads as a collection rather than a spoiler. The
   remaining version of this problem is that `SPECIES_CONDITIONS` is still hand-written per species
   — the `ANIMAL_CATALOG` entry does not carry its own requirements, so a new species silently falls
   back to a default ladder and gets invented numbers on its journal page.
