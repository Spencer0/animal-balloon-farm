# Animal pipeline

How a new animal gets from "add an X" to a reviewed, playable species. The goal: you say
**"Add a new animal X, use the animal pipeline"** and the agent can do the whole thing without
hand-holding, including any plant, prop or house the animal needs.

Current catalog: **13 species** (pig, sheep, cow, chicken, duck, goose, frog, owl, raccoon, mouse, rat,
snake, mole).

**Reference animals.** Copy the closest one instead of starting cold.

| Animal | Copy it for |
|--------|-------------|
| **raccoon** | The default template: a ground walker, a night shift, two shop props (a garbage can and a house), a lying-down sleep animation, curled-ball sleeping by its house. Start here. |
| **frog** | A species lured and settled by *plants* (water lilies). |
| **mouse / rat / snake** | The tall-grass animals: settled by *meadow* (`meadowArea`). The mouse and rat are small quadrupeds with a shared `add_rodent_head` / `add_rodent_tail`; the rat is a night animal with a `SLEEP` clip; the snake is the legless body plan (see *A body with no legs*). |
| **pig / sheep / cow / chicken / duck / goose** | Plain day animals settled by terrain (grass, water, flat ground), a resident friend, or a barn / coop. |
| **owl** | Only if the animal flies, hunts, or eats another species. The complex case; see *Predators and fliers*. |

---

## 0 · The brief: decide before you build

Write these down in the PR description first. Most of them are one line, and every later step follows
from them.

1. **Identity.** `id` (lowercase, one word), display name, a one-line personality, the colours of its
   balloon.
2. **Body plan.** Quadruped (copy `make_raccoon` / `make_sheep`), biped bird (`make_chicken`,
   `make_duck`), or something new. A truly new body plan costs the most; say so.
3. **Shift.** Day animal (default) or **night-only** (raccoon, owl). A night animal also *sleeps by
   day*.
4. **Lure.** What the farm must look like before it wanders up to the carnival tents
   (`DISCOVERY`). Without one it never appears.
5. **The four rungs** (below). Each of the two player-facing rungs needs a requirement chosen from the
   menu. **Pick what makes sense for the animal, and build whatever is missing:**

   | Requirement | Use it when the animal... | Exists today | If it does not exist, add it |
   |-------------|---------------------------|--------------|------------------------------|
   | **Plants** (`plantCount`) | eats or nests in something the player *grows* | clover, dandelion, poppy, water-lily | a plant: see *Adding a plant* |
   | **Animals it likes** (`residentSpecies` / `residentCount`) | is social, or lives off another species | cow, chicken, ... | nothing: any catalog species works |
   | **A prop** (`propCount`) | needs furniture: a roost, a feeder, something to raid | barn, coop, oak, garbage can | a prop: see *Adding a shop prop* |
   | **A house** (`propCount` of a house prop) | has somewhere to live; **required** on the breeding rung | barn, coop, sty, goose house, frog house, owl box, dumpster, hollow log, rock pile | a house is a prop, plus a `HOUSE_SPECIES` entry: see *Adding a shop prop (and a house)* |
   | **Terrain** (`grassArea` / `waterArea` / `flatArea`) | needs land, not objects | all | nothing |
   | **Tall meadow** (`meadowArea`) | lives in long grass (the green seed pack), not on a lawn | all | nothing |
   | **Tool owned** (`toolOwned`) | is lured by the farmer's kit, not the land (the mole comes once the shovel is bought) | `shovel`, `water` (the seed bag is always owned) | add the upgrade to `TOOL_UPGRADES` in `tool-unlocks.ts` |
| **Terrain share** (`terrainShare`) | needs the farm to *be* a kind of ground, by percent (a mole: 50% dirt to visit, 90% to settle) | `dirt` (bare soil; `snow` is reserved) | add the terrain to `TerrainKind` and measure it in `farm-state.ts` |
| **Prey eaten** (`preyEaten`) | is a predator | chicken, for the owl; mouse, for the snake | see *Predators and fliers* |

   A good ladder asks for **something different at each rung** and ends on a house for breeding. The
   raccoon: appears when a cow lives on the farm, settles for a garbage can, breeds at a dumpster.
   Never ask for more than the player can have: a plant requirement above 5 is unreachable (the
   seed supply), and a prop that is not in the shop is unbuyable.
   **Keeping residency.** Set `holdsResidency: true` on a species' `SPECIES_CONDITIONS` entry and a settled adult only stays
   while its "Call the farm home" requirement stays met: otherwise it loses helium (about two minutes from full), warns
   the player, and slowly deflates and vanishes when flat. Meeting the requirement again refills it. Off by default; the owl keeps its own oak rule.
6. **Anything special.** Flight, hunting, a signature animation. If there is none, it is a plain
   animal and this document covers all of it.

---

## 1 · The whole job, in order

> **Every animal must have a house. No exceptions.** A species without one can never breed (babies
> are born indoors), has no space indoors, and keeps every member out on the farm, where it eats
> into the 40-animal outdoor limit. Either share an existing house that fits (chickens and ducks
> share the coop, cows and sheep the barn) or build a new one in Blender. Register it in
> `HOUSE_SPECIES` (`src/game/animal-housing.ts`) and ask for it on the species' "Love the farm"
> rung. `tests/animal-housing.test.mjs` reads the catalog and fails for any species without exactly
> one house.

Do these in order; each is detailed below. Work in a worktree (see `AGENTS.md`).

1. **Brief** (above).
2. **Art.** The animal's `make_<id>()` in `art/blender/balloon_friends.py`, three clips (`WALK`,
   `IDLE`, plus `SLEEP` for a night animal), exported. New props: a Blender script and a thumbnail.
3. **Register.** Catalog entry, then fix the compiler errors (four records).
4. **Register what the compiler cannot see** (the silent list, below).
5. **Conditions.** `SPECIES_CONDITIONS`, `DISCOVERY`, and `NIGHT_ONLY_SPECIES` if it is nocturnal.
6. **Build the house** (required, see above) and the other ingredients the ladder asks for (plant /
   prop) and, for a night animal, the `SLEEP_PROPS` entry.
7. **Scenarios + tests.**
8. **Verify** in the browser from several angles, awake and asleep, plus its journal page.
9. **Ship** (`npm run check`, PR, merge) when Spencer says so.

### Definition of done

- [ ] `npm run check` is green (tests, asset budget, typecheck, build, scenario leak guard)
- [ ] Art: review PNG looks right; GLB lists every clip with every animated node; **awake and asleep
      both look right in the game from the side** (angle sheet)
- [ ] **It has a house:** listed in `HOUSE_SPECIES`, asked for on its "Love the farm" rung, buyable
      in the shop, and animals walk in and out of its door in the game
- [ ] Every compiler-enforced record and every silent registration below is filled
- [ ] The ladder's ingredients exist, are buyable or growable, and are covered by tests
- [ ] Journal page opened and looked at
- [ ] At least one scenario that jumps straight to the interesting state
- [ ] This document still true: update it if the work taught you something

---

## 2 · Art: Blender

### One-time environment check

```sh
blender --version   # 4.2.3 LTS is the known-good version
```

If `blender` is not on `PATH`, use
`C:\Users\Spencer\Documents\Playground\tools\blender\blender-4.2.3-windows-x64\blender.exe` (check it
exists). Scripts run under Blender's **embedded** Python; do not `import bpy` from system Python. All
assets are authored by script and rendered headless; never hand-edit binaries.

### Adding a species to `balloon_friends.py`

Copy the closest `make_<id>()` (the raccoon for a quadruped). Five edits:

1. **`materials(name)`**: an `elif` branch with a distinct palette; this is what makes the capture
   reveal worth watching.
2. **`make_<id>()`**: build the animal with the shared helpers:
   - `sphere(name, position, size, material, parent)`: UV sphere, parented, smooth-shaded
   - `curve(name, points, width, material, parent)`: bevelled Bezier (legs, tails, seams, rings)
   - `pivot(name, position, parent)`: an Empty that acts as a rig joint
   - `add_face_details(head, m, animal)`: eyes, pupils, catchlights, brows, cheeks. Faces point **+X**
   - `make_legs(...)` / `add_waterfowl_legs(...)`: quadruped or biped leg sets
   - `add_collar(body, neck, m, animal)`: the signature bell, returns a pivot
3. **Root custom properties**: `root["asset_id"] = "animal_balloon_<id>"` and a `root["description"]`.
4. **Animation**: `animate(...)` (WALK + IDLE) and, for a night animal, `animate_sleep(...)`; see below.
5. **`portrait(name, m)`** then **`export_asset(root, name)`** as the last two lines, and add the maker to
   `MAKERS`.

```sh
# Regenerate only the animals you name (approved assets are preserved)
blender --background --factory-startup --python art/blender/balloon_friends.py -- raccoon
```

This is a destructive, file-writing command: it overwrites the `.blend`, `.glb` and review PNG of each
named animal. Check `git status` first. The bare invocation regenerates only duck + goose.

### The clips (the runtime contract)

The runtime finds clips by **substring on the uppercased clip name** (`balloon-animal.ts`): `WALK`,
`IDLE`, and optionally `SLEEP`. Any other name is ignored, and a flier uses `WALK` for flight and
`IDLE` for perched. `finish_action()` pushes each action into an NLA track named after the clip; the
exporter uses `NLA_TRACKS`, so **an action that never reaches an NLA track is not exported.**

- `FRAMES = (1, 7, 13, 19, 25)` / `PHASES`: five keys per loop; first and last must match.
- `animate()` writes a real gait (body bob/roll, head counter-motion, tail follow-through, bell swing,
  diagonal leg pairs, hoof hinge), not a mesh bob. Birds pass `forward_gait=True`.
- **`SLEEP` (optional).** A night animal that has it lies down by day; without it the game crouches
  the `IDLE` pose, which reads as a shrunken standing animal and is only a fallback. The raccoon's
  `animate_sleep()` is the recipe: a **curled ball**. The body is rounder and sits low (underside at
  z = 0), the head tucks round onto one flank, the tail wraps along that flank to meet the nose, the
  legs fold under, the ears droop, and eyelid pivots swell shut. Call it **before** `animate()` so its
  NLA track sits underneath and the review portrait still shows the standing pose.

### Three silent exporter traps

1. **The glTF exporter drops any channel that never changes.** A pose you hold constant never reaches
   the game, and that node stays in its rest pose. Give every channel in every clip a hair of motion
   (a breath, a tremor of 0.5 degrees).
2. **If one clip animates a property that the others do not, the exported rest pose is that clip's
   pose.** `SLEEP` moved the head and tail *position*, which `WALK`/`IDLE` never keyed, so the awake
   raccoon walked around with its head sunk into its body. Anything `SLEEP` animates must also be keyed
   in `WALK` and `IDLE`: `animate(..., held=lids, pinned=[(head, rest_location), (tail, rest_location)])`.
3. **A node whose location is keyed exports with a zero rest translation.** The runtime sizes a model
   from its *rest* pose (`size` is the rest pose's longest side), so the first snake, whose 13 body
   segments were each keyed in place, collapsed to 1.3 m at rest, was scaled up almost 2x, and then
   stretched to 8 m once WALK spread it out. Hang a location-keyed joint from an **unkeyed anchor** at
   its rest spot and key only an offset from it (`make_snake`). Check the console's
   `<name> asset {"dimensions": ...}`: it is the rest pose's size, and it should match the model.

After every export count the channels per clip in the GLB JSON (all three clips should list every
animated node) and look at the animal **awake and asleep, from the side, in the game**.

### A body with no legs (the snake)

`make_snake` is a chain of overlapping segment balloons, each an anchor (unkeyed, its rest spot along
a lazy S) with a keyed `SNAKE RIG · body segment N` under it. `WALK` passes a travelling wave down the
chain (each segment lags the one ahead and swings wider toward the tail); `IDLE` is a slow sway and a
tongue flick. The face is custom, without brows: on a snake they read as feelers. The ground walker in
`balloon-animal.ts` needs nothing special; it only plays `WALK` and `IDLE`.

### The rig naming contract

The capture flourish finds joints by **object-name substrings** (`buildRigPose` in `balloon-capture.ts`),
for example `DUCK RIG · bright emerald head` and `CHICKEN RIG · near flapping wing`.

- Joints contain `RIG` plus the descriptive phrase the TS side looks for.
- Laterals are labelled `near` / `far`; that is how the side is derived.
- **Renaming a rig pivot silently breaks the capture animation.** A species with no `buildRigPose`
  branch still works; it just gets no secondary head/wing motion. It is an enhancement.

### Outputs

```
public/assets/animals/balloon-<id>.blend          editable source (keep in git)
public/assets/animals/balloon-<id>-review.png     1200x1000 art-review portrait
public/assets/animals/balloon-<id>.glb            runtime asset (no cameras, no lights)
```

Blender also drops `balloon-<id>.blend1` backups; they are ignored.

### Review gate

Inspect the **exported GLB**, not the Blender viewport:

- `[Animal Balloon Farm] <name> asset` in the browser console logs dimensions and
  `clips: [{name, duration}]`; both must be present and sane (~1-2 s per clip).
- `<name> ground clearance` logs `finalBounds.min.y`; it should be `0.0000`.
- Open the review PNG for silhouette, expression, attachment, balloon sheen.
- Watch it in the game from the side (angle sheet, below). Three.js is authoritative.

---

## 3 · Register the species in TypeScript

### One file declares an animal

`src/animals/animal-catalog.ts` holds `ANIMAL_CATALOG`. Append one object and the animal gets a type
id, a showcase plinth, a capture card, a journal page and a species count for free.

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
  carnivalSpawn: [-20, 8],                        // first stands among the tents; REQUIRED
  showcaseSpawn: [-4, 3.2],                       // plinth position in ?showcase=1
  seed: 777,                                      // any int; fixes the wander pattern
  size: 2.4,                                      // LONGEST SIDE in world units
  speed: 0.9,                                     // garden units/second
  bounds: { x: 10.5, z: 6.1 },                    // wander rectangle, roughly the lawn
  // flier: true,                                 // only for birds the sim places itself (the owl)
}
```

Field notes:

- `size` is not the raw Blender scale: the runtime measures the GLB, scales the longest side to `size`
  and grounds it at `min.y = 0`. Author at any comfortable scale.
- `assetUrl` / `spriteUrl` must stay document-relative (`assets/...`, not `/assets/...`) or the GitHub
  Pages subpath breaks.
- `bounds` is roughly the lawn half-extents; shrink slightly so animals do not clip the fence.
- `speed` is what makes a species read as a species.
- `carnivalSpawn`: pick a spot among the tents (existing entries sit at |x| 18-26).
- `showcaseSpawn` must not collide with another plinth. Taken: a 3x2 ring at `[-7, 0, 7] x [-3.2, 3.2]`,
  frog `[-11, 0]`, owl `[11, 0]`, raccoon `[-11, 3.2]`, mouse `[11, 3.2]`, rat `[-11, -3.2]`, snake `[11, -3.2]`.
  Free next: `[-15, 0]`.

### Compiler-enforced records

Adding the entry produces **exactly these errors** (verified by adding a throwaway species):

| File | Symbol | What it is |
|------|--------|-----------|
| `animal-catalog.ts` | `carnivalSpawn` | required field |
| `balloon-animal.ts` | `BODY_MATERIALS` | placeholder colour, used only if the GLB fails to load |
| `balloon-capture.ts` | `PAINT_PALETTES` | `[primary, secondary]` paint colours for the capture pour |
| `balloon-capture.ts` | `captureGesture` | exhaustive `switch` with no `default`; add a `case` returning a `CapturePose` (copy a neighbour) |
| `src/game/sales.ts` | `ANIMAL_SALE_PRICES` | what it sells for (12-16 common, 22 raccoon, 30 owl) |
| `tests/sales.test.mjs` | the expected-prices object | **a test, not the compiler**: it fails `npm test` until you add the price |

`main.ts` also reports "carnivalSpawn does not exist"; it is the same missing field.

### Registrations the compiler cannot see (they fail silently)

| Where | What | Symptom if forgotten |
|-------|------|----------------------|
| `animal-conditions.ts` `DISCOVERY` | the lure | the species sits at stage 0 forever |
| `animal-conditions.ts` `SPECIES_CONDITIONS` | the ladder | an invented default four-rung ladder with made-up numbers |
| `animal-conditions.ts` `NIGHT_ONLY_SPECIES` | the shift | a night animal turns up at noon |
| `src/game/animal-housing.ts` `HOUSE_SPECIES` | **its house (required)** | it never breeds, never goes indoors, and crowds the outdoor limit |
| `src/game/sleep.ts` `SLEEP_PROPS` | what a night animal sleeps beside | it sleeps wherever it stands |
| `src/ui/journal-dom.ts` `SPECIES_META` | journal rarity + trait pills | "Common" and no trait pills |
| `animal-conditions.ts` `PROP_PLURALS` | prop wording in the journal | falls back to `<id>s` (fine for regular plurals) |
| `animal-catalog.ts` `VIEWER_CAST` | which models the viewer stages | not in the review booth (deliberate: list only what you are tuning) |
| `balloon-capture.ts` `buildRigPose` | head/wing motion in the capture | no flourish, nothing breaks |
| the `species` of a `plantCount` | a plant id, but typed `string` | a typo reads as zero plants and it never settles |

Cover `DISCOVERY`, `SPECIES_CONDITIONS` and `NIGHT_ONLY_SPECIES` in a test (see
`tests/raccoon.test.mjs`).

---

## 4 · Conditions: the four rungs

Every species climbs four rungs before it belongs to the farm:

| Stage | Condition | Appearance |
|-------|-----------|------------|
| 0 | undiscovered | not in the world |
| 1 | visit the carnival | wild balloon red |
| 2 | visit the farm | wild balloon red |
| 3 | call the farm home | its own colours |
| 4 | love the farm | own colours + heart eyes (ready to breed) |

Three pure modules own this (no Three.js, no DOM), so the loop is covered by tests:
`animal-conditions.ts` (ladder, `SPECIES_CONDITIONS`, `DISCOVERY`), `farm-state.ts` (m² of grass,
water, pasture; counts), `animal-progress.ts` (the state machine and what the journal may reveal).
`main.ts` owns the seam: `measureFarm()` reads the renderer's arrays into plain ones.

### Writing a ladder

`stages[0]` is the carnival rung (nothing asked), `stages[1]` is "visit the farm" (its requirement is
what makes the animal step inside), `stages[2]` is "call the farm home" (**stage 3**), `stages[3]` is
"love the farm" (**stage 4**, breeding). Helpers: `CARNIVAL`, `ENTER_FARM(hint)`, `CALL_HOME`, `LOVE_THE_FARM`
(terrain), `PLANT_HOME` / `PLANT_LOVE` (plants), `REQUIRE_RESIDENT` / `SHARE_LIFE` (a friend),
`COUNT_STAGE(title, hint, requirement, result)` (anything with a count or two requirements).

```ts
raccoon: {
  stages: withStageNumbers([
    { title: 'Appear at the carnival', hint: '...', requirement: null, result: '...' },
    ENTER_FARM('Slips under the fence at night to sniff around.'),
    COUNT_STAGE('Call the farm home', 'Wants a garbage can to raid.',
      { kind: 'propCount', species: 'garbage-can', amount: 1 }, '...'),
    COUNT_STAGE('Love the farm', 'Wants a dumpster to call home, with the can kept close.',
      { kind: 'propCount', species: 'dumpster', amount: 1, and: [{ kind: 'propCount', species: 'garbage-can', amount: 1 }] }, '...'),
  ]),
},
```

`and: [...]` puts two requirements on one rung; the journal shows the extras as further bars.

### The condition kinds

| Kind | Reads | `species` holds |
|------|-------|-----------------|
| `grassArea`, `flatArea`, `waterArea` | m² of mature grass / flat grassy ground / water | n/a |
| `meadowArea` | m² of **tall** meadow: ground where the green seed pack's blades stand over 0.6 m. A lawn never counts | n/a |
| `plantCount` | **mature** plants of one kind | a plant id |
| `residentSpecies` | is any adult of this species a resident | an animal id |
| `residentCount` | how many adult residents | an animal id |
| `preyEaten` | tally of a prey species eaten | an animal id |
| `propCount` | how many of a shop prop are **placed** (owned in the inventory does not count) | a prop id (the field name is historical) |

Rules that are easy to get wrong:

- **A requirement below the current stage reports a null target.** That is the disclosure rule; it
  lives in the model so the UI cannot leak a number.
- **Meadow is measured from the blades, once a second.** `measureMeadow` (pure, in `farm-state.ts`)
  bins blades into 0.58 m cells and counts a cell with three tall blades. It is a pass over every
  blade, so `main.ts` caches it for a second; anything that swaps the grass outright (a load, a harness
  `sowGrass`) calls `remeasureMeadow()`. Ground-cover plants (dandelions, clover) only take root in
  *short* grass, so a ladder that asks for both meadow and dandelions asks for both kinds of lawn.
- **A new condition kind has two labels.** `conditionMetricLabel` in `animal-conditions.ts` and
  `visualForKind` in `src/ui/journal-dom.ts` (the journal's icon and label). Missing the second falls back
  to guessing from the hint text.
- **Pasture means grassy flat ground.** Flatness on bare dirt is satisfied the moment the game starts.
- **The grid pitch must be the most common vertex step**, or areas read ~4x small.
- **Only mature plants count.** Watering and pruning matter because of this.
- **A plant condition implies its substrate.** Lily pads imply a pond; do not also ask for `waterArea`.
- **Keep plant counts inside the seed supply** (`STARTING_SEEDS_PER_PLANT`, 5).
- **`DISCOVERY` is a requirement too.** It takes a species from stage 0 to the carnival. Use a
  cheap, early thing: a resident friend, a plant, some water.
- `conditionMetricLabel` words requirements for the journal; plants fall back to the catalog's name.

### Adding a plant

A plant is a growable ingredient (frog: lilies; sheep: clover). In `src/game/plants.ts` add the id to
`PlantId` and an entry to `PLANT_CATALOG` (substrate `grass` | `soil` | `water`, `spacingRadius`,
`growthSeconds`, a short `care` list of waters and prunes, `groundCover` for lawn patches). Then:

- `src/game/sales.ts` `PLANT_SALE_PRICES` (compiler-enforced; the only error adding one produced)
- `src/game/animal-conditions.ts` `PLANT_METRIC_LABELS` (optional wording)
- `src/scene/garden-plants.ts`: plants are procedural, not Blender. A new id falls back to the generic
  flower using its `color`; special-case the id only if it needs its own shape (clover, dandelion and
  water-lily do).
- a test that the id exists, so a typo in a `plantCount` cannot slip through

### Adding a shop prop (and a house)

A prop is something the shop sells and a `propCount` reads. A **house** is a prop listed in
`HOUSE_SPECIES` (`src/game/animal-housing.ts`). **Every species has exactly one house** (some share:
chickens and ducks the coop, cows and sheep the barn), and its breeding rung asks for it, because
babies are born indoors. Each house holds `HOUSE_CAPACITY` (10) animals, shared by whoever walks in:
nobody owns a bed. At most `OUTDOOR_LIMITS` (5 of a species, 40 in all) are out on the farm; the rest
walk to the nearest house of their kind with room and their models are disposed until they come out.
Selling a house sells the animals inside it (the card asks twice); animals out on the farm stay.
House models face local -Y in Blender (+Z in glTF): the game walks animals to that side of the
footprint to go in and out. `art/blender/animal_houses.py` builds the sty, goose house, frog house,
owl box, hollow log (mice and rats), rock pile (snakes) and molehill (moles).

| Where | What | Enforced? |
|-------|------|-----------|
| `src/game/farm-props.ts` | add to `PropId`, `PROP_CATALOG`, `PROP_ORDER`, and the literal `counts` in `createPropInventory` | yes |
| other `Record<PropId, ...>` tables | run `npm run typecheck`: the compiler lists every table that still needs the new id | yes |
| `src/game/farm-props.ts` `PROP_CATEGORY` | the info card's chip ("Shelter", "Utility", ...) | yes (found when merging `main`) |
| `src/game/tool-unlocks.ts` `PROP_UNLOCK_LEVEL` | the farmer level that stocks it; **it must be reachable before the animal that needs it can settle** (garbage can 2, dumpster 3) | yes |
| `art/blender/<prop>.py` (copy `trash_props.py`) | the model to `public/assets/props/<id>.glb` (+ `.blend`, review PNG) | no |
| `art/blender/prop_thumbs.py` `PROPS` | add `("<id>", "assets/props/<id>.glb")`, run with `-- <id>` for the shop icon `prop-<id>.png` | no |
| `animal-conditions.ts` `PROP_PLURALS` | only for an irregular plural | no |
| `src/ui/shop-dom.ts` `PIP_QUOTES` | optional shop-keeper line | no |
| `src/game/animal-housing.ts` `HOUSE_SPECIES` | **for a house:** which species it takes in. A species missing here can never breed | no |
| `src/game/sleep.ts` `SLEEP_PROPS` | for a night animal: what an animal *without* room indoors sleeps beside | no |
| `tests/farm-props.test.mjs` or the animal's test | footprint, blocking, in `PROP_ORDER`, buyable | no |
| `scripts/check-no-scenarios.mjs` | add a marker only when you add a scenario folder | no |

`PropDefinition.size` is the target **longest side** of the loaded model, so a prop with overflow
(the dumpster's spilled bags) needs a size that keeps its body about the footprint. A non-square
`footprint` is fine and rotates (`footprintExtent`). `GardenProps.placements(id)` returns the world
centre of every placed prop of one id, which is what sleeping uses.

Prices so far: molehill 70, garbage can 45, frog house 70, hollow log 75, owl box 80, rock pile 85, coop 90, sty 95, goose house 100, barn 110,
dumpster 120, oak 140.

Model tips from the raccoon's props: author on `z = 0`, centred in X/Y; do not leave a doorway the
game cannot use (the dumpster has none: the raccoon climbs in over the rim, and a later feature will
let it sleep *inside*); keep triangle counts low: a prop is capped at **8000 triangles and 400 kB**
(`npm run assets:budget`, part of `npm run check`). The first dumpster, with 18x12 spheres for its bag heap, was
14,460 triangles and failed; 12x8 spheres and 2-segment bevels brought it to about 6,200 and looked the same.

---

## 5 · Night animals and sleeping

Add the species to `NIGHT_ONLY_SPECIES` and it arrives, visits and wanders in the dark. Night and day
visitors are paced separately (`animal-life.ts`), and residents are never sent away at dawn. By day it
**sleeps**:

| Concern | Where it lives |
|---------|----------------|
| Who sleeps when | `shouldSleep(species, night)` in `src/game/sleep.ts` (pure, tested) |
| What it sleeps beside | `SLEEP_PROPS[species]`: preferred prop first, with a bed radius; none placed = where it stands |
| Choosing and keeping a bed | `updateSleepers()` in `src/main.ts`: a resident (stage 3+) beds down beside its prop, anything else where it stands; beds are chosen once per sleep and dropped at dusk |
| Bed geometry | `bedBeside(anchor, slot, radius)`: a point `radius` from the prop, facing it; `pickAnchor` takes the least crowded prop, then the nearest |
| The sleeping pose | `setSleepSpot(spot)` / `isSleeping` on `BalloonAnimal`: plays the `SLEEP` clip (or the crouch fallback) |

Rules that are easy to get wrong:

- **Author a real `SLEEP` clip.** The crouch fallback looks like a shrunken standing animal.
- **A bed radius is the animal's half-length plus the prop's reach**, or it sleeps on top of the prop. A
  curled raccoon needs about 1.8 from a can and 2.6 from the centre of the 3.6 m dumpster.
- **Only animals at the farm sleep.** A raccoon still at the carnival by day keeps wandering.
- **Debug:** `animalReport()` carries `sleeping` and `bed`.

---

## 6 · Pacing: who arrives when

The farm fills one animal at a time, and each arrival is earned.

- **Cow and duck** are the only carnival starters (`CARNIVAL_STARTERS`). A cow needs only grass, so it
  is the first win.
- **Sheep** are lured by clover (`DISCOVERY.sheep`) and **chickens** by dandelions. **Raccoons** by a
  resident cow. `DISCOVERY` is the trigger that takes a species from stage 0 to the carnival.
- **Mice** are lured by a little tall meadow, then **rats** (at night) and **snakes** by resident mice.
  This is what the Tall Grass Seed Pack is for: a lawn alone never brings them.
- **Staying and breeding** lean on props: sheep need a barn to settle and chickens a coop, raccoons a
  can. **Every species needs its house to breed** (see `HOUSE_SPECIES`), and a baby is born only
  while that house has room. There are no eggs.
- **Shifts.** Night species arrive and visit only after dark; everyone else only in daylight
  (`isNightOnly`). Residents are never sent away at night: chickens have to be there for the owl.
- Only a visitor that is **ready to walk in** holds the arrival queue.

Ground-cover plants set `groundCover` in `PLANT_CATALOG` and are drawn as a round patch that melts into
the lawn. Care is a short list of stops along the growth curve; a plant that is waiting for you just
waits. It never withers.

---

## 7 · Predators and fliers (only if the animal needs them)

The owl is the first species that does not wander, hunts another species, and only comes out after
dark. None of that is special-cased in the catalog loop; each piece has one home.

| Concern | Where it lives |
|---------|----------------|
| `flier: true` on the catalog entry | `animal-catalog.ts` (passed through `getAnimalSceneOptions`) |
| Who eats whom, the prey floor, the eaten tally | `PREY_OF`, `PREY_FLOOR`, `createPredationLedger` in `src/game/predator.ts` |
| The owl's flight and hunt state machine | `stepOwl` in `predator.ts` (pure, tested in `tests/predator.test.mjs`) |
| Applying flight, panicking prey | `src/scene/owl-hunt.ts` |
| A ground hunter's stalk-and-lunge state machine | `stepGroundHunter` in `src/game/ground-hunt.ts` (pure, tested in `tests/tall-grass-animals.test.mjs`) |
| Steering a ground hunter, panicking prey on the lunge | `src/scene/snake-hunt.ts`, via `BalloonAnimal.setPursuit` |
| The pop and its clean-up | `src/game/pop-animation.ts` (timeline), `src/scene/pop-burst.ts` (meshes) |
| The roost | the `OAK roost` node of `public/assets/props/oak.glb`, read by `GardenProps.roosts()` |

- **A flier is positioned from outside.** `createBalloonAnimal` skips the wander and waits for
  `setFlightPose`. Its clips are still `WALK` (flight) and `IDLE` (perched/dive); do not add others.
- **Ground the pose it will wear.** A flier is grounded on its `IDLE` frame.
- **Fliers are always full models**; the instanced crowd has no low-poly flier.
- **Prey** is a resident, adult, on-farm animal that is not mid-capture, courting or waiting to settle.
  The predator will not take the flock below `PREY_FLOOR` (2).
- **A catch is a removal.** `handlePredatorCatch` forgets the prey from the sim and hands the model to a pop.
- **Two deaths.** Being caught is the **bang** (`popAnimal(prey)`: swell, ring, shards, scrap). Running out of
  helium is the **deflate** (`popAnimal(prey, 'deflate')`): it hisses, sags flat, widens, lies there and
  shrinks away, with puffs of air. Timeline in `src/game/deflate-animation.ts`, meshes in
  `src/scene/deflate-effect.ts`. It only drives the root scale, so it works on every species with no art.
- **A ground hunter stalks, then the dice decide.** The snake creeps up (`stalkSpeedScale`) unnoticed.
  Within `strikeDistance` of its mouth it rolls the strike die (`STRIKE_DIE`, a d6, 4+ catches)
  *before* lunging, so each outcome gets its own animation instead of relying on physics:
  - **Catch:** the prey freezes (a zero-speed `setPursuit`) and the lunge lands; it pops.
  - **Miss:** the snake lunges through the spot the prey left, and `boltHome` (in `main.ts`) sprints
    the prey into the nearest house of its kind with room (`setHomeTrip(door, ESCAPE_SPRINT)`). It
    stays in for `ESCAPE_HIDING_SECONDS`, and its trip is exempt from the outdoor roster. With no
    house it panics in the open for a few seconds.
  Distances run from the snake's **mouth** (`reach`), never centre to centre: the collision pass
  holds two animals' centres a body-width apart, so a centre-to-centre catch can never land. Prey
  indoors is out of the `animals` list, so a house is a refuge. Otherwise a ground hunter is a normal
  walker: its pursuit is a steer target fed to `setPursuit` each frame, and null hands it back.
- **Test hunts with collisions on.** `stepHunt` runs `collideAnimals` like the frame loop does; a
  hunt that only works when animals pass through each other is not a hunt.
- **Helium.** An oak is where a resident owl tops up. Remove the last oak and it sags and pops.
- **Count conditions.** `residentCount`, `preyEaten` and `propCount` read maps on `FarmState`, filled
  in `measureFarm()`.

---

## 8 · Scenarios and tests

Waiting out a ladder is slow, so saved states live in `dev/scenarios/<animal>/`. Open the game with
`?gardenDebug=1&scenario=<animal>/<name>` and it lands in that state. Use the full id: bare names are
shared between animals and no longer resolve.

| Scenario | You land in |
|----------|-------------|
| `owl/first-night` | one chicken, night, the owl just turned up |
| `owl/hunt-now` | five chickens, night, owl visiting with its hunt ready |
| `owl/ready-to-settle` | as above plus an oak, four chickens eaten: the next catch settles it |
| `owl/resident-roosting` | daytime, a resident owl asleep on the oak |
| `owl/breed-ready` | night, two oaks, an owl box, two owls in love: an owlet is born in the box |
| `owl/low-helium` | night, a resident owl with no oak and ~15 s of helium |
| `mole/ready-to-settle` | a bare farm with the shovel bought and a wild mole visiting: it settles at once. Sow a lawn and the journal's dirt bar falls |
| `mole/about-to-go-flat` | as going-flat but with about 12 s of helium left: watch the hiss, sag and flatten |
| `mole/going-flat` | a resident mole on a farm that is under 90% dirt: it leaks helium and pops in about two minutes |
| `raccoon/first-night` | night, a resident cow, a wild raccoon visiting, no garbage can |
| `raccoon/sleeping-by-can` | day, a resident raccoon that walks to its can and curls up |
| `raccoon/sleeping-by-dumpster` | day, a can and a dumpster: its house, so it walks in to sleep |
| `raccoon/breed-ready` | night, a can and a dumpster, two raccoons in love (a kit is born in the dumpster) |
| `meadow/tall-grass-garden` | day: a deep meadow with a hollow log and a rock pile beside a short lawn with dandelions and a can; six mice, two snakes (two mice already eaten) and two rats (asleep in the log), all in love |
| `meadow/snake-hunt` | day: five resident mice and one visiting snake. Each lunge rolls a d6: 4+ and the mouse pops, otherwise it sprints into the hollow log. Two catches and the snake calls the farm home |
| `meadow/tall-grass-night` | the same garden at night, rats awake |
| `meadow/empty-meadow` | the same garden with no animals and the clock running: mice find the meadow first |

To add one: write a `Scenario` in `dev/scenarios/<animal>/` using only the verbs on `ScenarioHarness`
(`dev/scenarios/types.ts`), and list it in `dev/scenarios/index.ts`. Nothing in `dev/` ships: `main.ts`
imports it only inside the `__GARDEN_DEBUG__` branch production builds fold away, and
`scripts/check-no-scenarios.mjs` (part of `npm run check`) fails the build if a scenario name leaks.
Add a marker there for a new animal's scenario.

**Tests** go in `tests/<animal>.test.mjs` and must be added to the `test` script in `package.json`.
Bundle the pure TS with esbuild as the other suites do. Cover: the ladder (`getSpeciesConditions`,
`DISCOVERY`, `NIGHT_ONLY_SPECIES`), each requirement being met by exactly the right farm, the props, and
the sleep rules. `tests/raccoon.test.mjs` is the template.

### Debug verbs (with `?gardenDebug=1`)

```js
const d = window.__gardenDebug
d.closeMenu()
d.grantCoins(2000); d.buy('dumpster'); d.placeProp('dumpster', 2, -3, 0)
d.addAnimal('raccoon', 3)       // a species straight to a rung
d.setStage('duck', 4)           // force a rung, transition and all
d.setTimeOfDay(0.8); d.holdTime(true)   // night is 0.78-0.22; day 0.3-0.7
d.advance(400, 1 / 30)          // run the clock; returns the new stages
d.conditions()                  // every rung with live numbers
d.animalReport()                // species, stage, x, z, sleeping, bed
d.sowGrass(0, 0, 3.4); d.digPond(-6, 4, 3); d.pourAt(-6, 4, 3, 40)
d.plant('water-lily', -6, 4); d.growPlants(90, 1)
d.focusPoint(x, z, height); d.frameAngle(x, z, height, azimuthDeg, elevationDeg)
d.openJournal(); d.openViewer(); d.resetConditions()
```

Predator verbs: `feedOwl(n)`, `feedSnake(n)`, `hurryHunt()`, `stepHunt(seconds)`, `predation()`, `setOwlHelium(0..1)`.
`sowGrass`, `digPond` and `plant` go through the real tool code; do not verify a condition by
hand-dragging the seeder.

---

## 9 · Verify in the browser

```sh
PORT=8771 npm run dev     # pick a port no other worktree uses; AGENTS.md has the rule
```

- The normal garden (main menu, **ENTER**): the animal wanders and the ladder decides when it settles.
- **VIEWER** (main menu, or `openViewer()`): stages only `VIEWER_CAST`, the review booth for new models.
- The journal book, **Animals** chapter: portrait, subtitle, note, traits and the ladder. Verify with
  `setStage('<id>', 3)`, `openJournal()`, then pick the species card.

**Judge a model from the side, not from the game camera.** The game looks down at about 40 degrees,
which hides a lying pose and the face of anything walking away. Use the angle sheet: one animal circled
at a low angle on a single small JPEG (six 480x270 frames), with the perf overlay hidden by `&nohud=1`:

```sh
node scripts/angle-sheet.mjs "http://127.0.0.1:8771/?gardenDebug=1&nohud=1&scenario=raccoon/sleeping-by-dumpster" \
  C:/Users/Spencer/.codex/agent-shots/raccoon-asleep.jpg --species raccoon --min-stage 3 --sleeping --wait 120000
```

`--eval "<js>" --after-eval <ms>` runs setup first (for example nightfall, to wake it); `--angles`,
`--elevation` and `--height` change the framing. Check **awake and asleep**. It needs `playwright-core`
(`NODE_PATH` to a scratch install; see `scripts/screenshot.mjs`). Headless software rendering runs at a
few FPS and the simulation clamps each frame, so give a scenario a minute or two of wall time before an
animal has walked anywhere.

**Screenshots (project rule):** 1280x720 or smaller, one per state change, never `fullPage` on the game
canvas; an oversized image poisons the thread.

**Do not run `npm run check` while a dev server is up on the same branch.** Both write
`dist-<branch>/`, and the production build replaces the dev bundle: the preview then loads an empty
world with no `?gardenDebug`. Run it as `OUTDIR=dist-check PAGES_OUTDIR=dist-check npm run check`.

---

## 10 · Ship

Only when Spencer says it is good (`AGENTS.md`): merge the latest `main` into the branch, run
`npm run check`, commit with a message that explains why, push, open and merge the PR with `gh`, stage
only the paths you changed.

---

## Known friction for a large catalog

1. **Rig matching is by string.** `buildRigPose` couples Blender object names to TypeScript literals,
   with no validation that a pose found its joints. A manifest field like `rigParts: ['head', 'wing']`
   would remove the coupling.
2. **No asset manifest.** `MAKERS` in `balloon_friends.py` is hand-maintained and can drift from
   `ANIMAL_CATALOG`. A shared `animals/manifest.json` would close the loop.
3. **No asset validation script.** Nothing checks that every `assetUrl`/`spriteUrl` exists, that every GLB
   has its clips (a missing channel is exactly how the raccoon broke), or that every id has a maker. A
   `npm run animals:check` is the highest-value addition.
4. **Several registrations are string-keyed tables** (the silent list in section 3). Moving `DISCOVERY`,
   `NIGHT_ONLY_SPECIES`, `SLEEP_PROPS` and `SPECIES_META` onto the catalog entry would make a missing
   one a compile error.
5. **The animal download budget.** `npm run assets:budget` caps every animal GLB together at 50 MB
   (raised from 16 MB so animals can be built at full detail) and each one at 2.5 MB / 100k triangles.
   The first nine and the mole are full detail (1.3-2.2 MB each). The tall-grass animals (mouse, rat,
   snake) are built at `LEAN_DETAIL` (a third of the sphere and curve resolution, no UVs: the animals are
   untextured) and are 0.2-0.3 MB. Either is fine; new animals default to full detail. A lean/full
   toggle that ships both is a planned follow-up.
6. **Capture is 6.8 s per animal** and starts on click, so "Play all" is a parade, not a test.
7. **A night animal's house cannot be entered yet.** Sleepers lie beside their house; a planned
   feature will have animals sleep inside, with an inside-the-home viewer.
