# The Shop — Scope & Technical Plan

Status: **implemented 2026-09-30** on `feature/shop`; M1 through M4 landed in one
pass. The four decisions in the table below were chosen by Spencer on 2026-09-30,
and the escape-hatch decision in place of the seal guardrail was chosen later the
same day. See [Implementation notes](#implementation-notes) for the handful of
places the build departed from this plan.

Companion to [`SPEC.md`](SPEC.md) §5.6 (economy: seeds, decor, homes),
§5.7 (in-world signboards/market stands as shops), §5.1 (grid or soft-grid
placement with visible previews, occupancy feedback, undo where practical),
§6 (input direction), §10.8 ("one carnival stand; sell produce and buy a
limited set of seeds/decor").

Work lands on branch `feature/shop` in worktree `worktree-shop`.

## What the shop is

A **building in the world**, not a HUD button. It is authored in Blender like
every other prop, it stands on the farm, and clicking it takes the player
inside to a storefront screen. Coins earned from selling plants and settled
animals are spent there. What you buy lands in an **inventory panel** modelled
on the Seedbox, and clicking an item there starts **snap-grid placement** in
the garden.

Four things are for sale: **fountain, fence, statue, chicken coop.**

The chain in one line:

```text
click the building → storefront screen → buy → inventory → click item → snapped ghost → place
```

## Decisions (chosen 2026-09-30)

| Question | Decision | Consequence |
| --- | --- | --- |
| What "inside" is | **Storefront screen** — a full-screen Three.js surface in the `ui-layer`, composed from Blender-authored counter/shelf/crate props, in the same 2.5D style as the main menu | No second scene, no `setMode` change, no walkable room. It is a `UIPanel` above the farm HUD, exactly like the journal |
| Fences | **Auto-joining runs** — drag a run along the lattice; posts are implicit at run ends and de-duplicated where segments meet | Needs run topology (segments → runs → shared posts). A garden fence is a few drags, not forty clicks |
| Chicken coop | **Decorative for now** — a wood coop with a footprint; chickens idle near it | No `animal-conditions.ts` or journal changes. Promoting it to a real home is a later, separable milestone |
| Props and space | **Props occupy space** — plants can't overlap a footprint and animals walk around props | Needs footprint occupancy plus a small avoidance term in animal steering, and a guardrail that no placement can seal an animal in |

## Player-facing flow

1. **Walk up and click the shop.** The building sits on the apron outside the
   plot, near the gate, so it is inside the normal farm framing. With the Hand
   tool selected, clicking it opens the storefront. (Any other tool keeps
   working on the garden; the building is not a shovel target.)
2. **The storefront screen opens** over the farm — the farm keeps running
   behind it like it does behind the journal. It shows the four items with
   prices, the coin balance, and a line of shopkeeper copy. Items you cannot
   afford are visibly unavailable rather than silently inert.
3. **Buying spends coins** from the same wallet the sale panel credits.
   A purchase shows a receipt line and bumps the inventory count. You cannot
   buy past your balance, and the button says why when you cannot.
4. **Escape or a Close board returns to the garden.** Where you were standing
   and where the camera was are unchanged.
5. **The inventory (Propbox) is a launcher next to the Seedbox.** It lists owned
   items with counts, exactly like seed rows list seeds. Clicking a row with a
   count above zero enters placement.
6. **Placement is snapped.** A ghost of the prop sits on the lattice ahead of
   the pointer, green where it is legal and red where it is not, with the
   reason on the ghost ("needs level ground", "too close to the pond",
   "blocked"). Click commits and spends one from the inventory. Escape cancels.
7. **Fences are dragged, not clicked.** Pick the fence row, then drag along the
   ground: the ghost becomes a straight run of 2 m segments with a post at each
   end and at each internal joint. The run previews its total cost in segments,
   and commits only if you own that many.
8. **Rotation** is `R`, cycling 90°, for the statue and the coop. The fountain is
   round and does not rotate.
9. **Picking a prop back up** with the Hand tool returns it to the inventory
   whole — no refund loss, no second delete flow. That single rule is the undo
   story for this milestone.

## Technical design

### The lattice

A **2 m square lattice anchored at the garden origin (0, 0)**, in garden
canonical units, independent of Three.js. It is used only by props; plants keep
their existing free-form raycast placement and are not regressed.

- Cells: a prop with a `1 × 1` footprint snaps to a cell centre; a `2 × 2`
  footprint (the coop) snaps to a 2×2 block of cells.
- Edges: a fence segment belongs to the **edge** between two cells, so posts
  land on lattice **vertices** — which is what makes runs join without
  double-posting.
- The plot is 28 × 19 m, so `x` divides evenly into 14 cells while the far `z`
  trim at 9.5 m falls 1 m past the 8.5 m lattice line. That strip is harmless:
  props keep clear of the plot trim anyway (the terrain keep-out and
  `PLOT_EDGE_INSET` already preserve it), and nothing may be placed there.

The lattice, the footprints, and every validity rule are **pure** and unit
tested — no Three.js, matching `src/game/animal-conditions.ts` and
`src/game/farm-expansion.ts`.

### Pure simulation — `src/game/farm-props.ts`

New module, no Three.js import. Owns:

- `PROP_CATALOG` — one record per item: `id`, `name`, `description`, `color`,
  `price`, `footprint` (`{ width, depth }` in cells), `kind` (`'cell'` or
  `'edge'`), `rotatable`, `blocking`, and `modelUrl`.
- **Prices** (first pass, one table, easy to tune): fence segment `12`,
  statue `40`, fountain `60`, coop `90`. These are scaled against the sale
  values already in `src/game/sales.ts` — a mature clover is worth 5 and a
  resident cow 42, so a fountain is roughly a cow and a half.
- **Inventory** — `counts: Map<PropId, number>`, `add`, `take`, `give`.
- **Placement** — `placementResult(id, cell, rotation, surface, occupancy)`
  returning `{ valid, failure }` with an enumerated failure
  (`'out-of-bounds' | 'in-water' | 'too-steep' | 'occupied' | 'out-of-stock' |
  'would-seal-animal'`), mirroring `PlantPlacementFailure`.
- **Occupancy** — a cell grid plus an edge set, so "is this cell free" and "is
  this edge free" are lookups rather than geometry tests.
- **Fence runs** — `segments → runs` topology: collinear adjacent segments join
  into one run; a run's posts are its endpoints; two runs sharing a post share
  it visually. Placing over an existing run's end extends it; removing a middle
  segment splits it into two runs.
- **Wallet** — spending goes through the existing `createWallet()` from
  `src/game/sales.ts`; this module only asks it for a balance and a debit, so
  there is one source of coin truth.

### Scene — `src/scene/garden-props.ts`

New module modelled on `src/scene/garden-plants.ts`, which already proves this
shape (sim → visuals map → per-frame sync → preview ring → disposals).

- Loads each `modelUrl` through `GLTFLoader`, measures it, scales the **longest
  side** to its catalog `size`, centres it on X/Z and grounds it so `min.y` is
  `0`, with the same document-relative URL rule the animal catalog uses.
- Placed props are positioned from the lattice: `cell → world` via the same
  canonical transforms `containsGardenPoint` and the terrain keep-out use, with
  `y` sampled from `terrain.heightAt()`.
- **Fences are instanced.** `SCALE_TO_THE_MOON.md` measured this scene as
  draw-call-submission bound (~19 µs per call, ~60 meshes per animal); sixty
  fence segments as sixty meshes is exactly the mistake to avoid. Posts are one
  `InstancedMesh`, and segments a second, with the run topology deciding which
  instances are live. That is also why runs — not individual segments — are the
  unit of accounting.
- A snap ghost: a flat lattice-aligned footprint outline plus a translucent
  copy of the model, tinted green/red, with the failure reason on a small
  world-anchored sprite (the plant care markers already establish that pattern).
- `dispose()` walks every loaded material/geometry, per the existing
  convention. Shared catalog models are cached across instances and disposed
  once.

### The building and the click

- **Blender**: `art/blender/shop_building.py` → `public/assets/buildings/farm-shop.blend`
  and `farm-shop.glb`, plus a `farm-shop-review.png` 1200×1000 portrait,
  following `balloon_friends.py`'s deterministic shape (author, review render,
  `export_asset`, named outputs, printed paths). Target ~6 × 5 × 5 m: big
  enough to read as a building at the farm camera's ~39 m view height, small
  enough not to dwarf the 28 × 19 m plot. No cameras or lights in the GLB.
- **Placement in the world**: on the gravel apron outside the fence near the
  gate, added by `fairground.ts` next to the existing stalls, so it belongs to
  the set dressing that is already there rather than floating in the meadow.
- **The click**: a `pickShopBuilding()` raycast alongside `pickAnimal()`, routed
  in `orbitPointerDown` on the Hand tool and gated the same way the sale panel
  is. A short camera settle toward the door plays before the screen opens;
  the farm keeps running.

### The storefront screen — `src/ui/shop-panel.ts`

A `UIPanel` with an `order` above the farm HUD, like `menu-panel.ts` and
`journal-panel.ts`. Its furniture comes from the **existing UI prop pipeline**:
`requestUIProp()` in `src/ui/ui-props.ts` loads Blender props and fits each to a
declared design box, so the counter, shelves and crates are literally the same
treatment as the menu's signboard and the journal launcher's barn board.

New props for it (`ui-counter`, `ui-shelf`, `ui-crate`) are authored by a **new**
script `art/blender/shop_interior.py`. `ui_props.py` is deliberately not
extended: it regenerates all four approved props in one destructive run, and the
pipeline rule is not to re-run a generator over art you did not intend to rebuild.

The screen is authored at the 1600 × 900 design space through
`createUIViewport()` and drawn with `ui-theme.ts` primitives, using the one
`FarmButton` for the buy row. Prices, the coin balance, and the receipt line are
drawn as text on the surface, the same as the sale panel does today.

### The inventory — `src/ui/propbox-panel.ts`

A near-copy of `src/ui/seedbox-panel.ts`: a launcher board that hides when the
panel opens, a card of rows with counts, hover states, row gating when the count
is zero, `setPlacementActive`, `setInteractEnabled`, `contains`, and `describe()`
for the harness. Differences: rows are props rather than seeds, each row shows
the price and the count, and clicking a row enters placement instead of choosing
a species. `refresh()` repaints only when the counts signature changes, exactly
as the seedbox does.

**Launcher layout.** The top-right already holds the Seedbox launcher and the
persistent gold counter. Three surfaces have to share that corner: the counter
stays put, and the Propbox launcher takes a slot directly below the Seedbox
launcher, both inset by the same margin, so the pair reads as one shelf.

### Placement interaction

- Entering placement from the inventory cancels plant placement and takes the
  tools HUD out of the way, the way `selectGardenTool` already coordinates the
  seedbox and the garden tools.
- The ghost snaps to the lattice under the pointer, using the same
  `groundAt()` raycast-plus-bounds check the plants use.
- Commit spends one inventory count and registers occupancy. Out of stock ends
  placement.
- **Steep ground is refused, not levelled.** A footprint whose sampled ground
  heights vary more than ~0.35 m is `'too-steep'`. Props do not deform the
  terrain and do not bulldoze the pond.
- **Hand tool picks a prop up** (returns it to the inventory whole), reusing the
  sale panel's selection affordance rather than adding a second click language.
  The sale panel is for things the farm produces; furniture is not sold, it is
  moved.

### Escape hatch instead of a seal guardrail

The one way "props occupy space" can punish a player is a fence run that walls
an animal into a pocket. The original plan was a flood-fill guardrail that
refused any run that would disconnect an animal's cell from the garden's main
region. **That guardrail is dropped** (Spencer, 2026-09-30): the same risk is
answered more simply by making every placed prop removable, so no state is ever
unrecoverable.

- The **Hand tool picks a prop back up**, returning it to the Propbox whole — a
  whole fence run returns all of its segments, not one rail. No coin is lost, so
  the player can always unwall whatever they walled.
- Nothing is refunded and nothing is destroyed: pick-up is a move, not a sale.
  This is the single undo story for the milestone and the reason no flood fill,
  and no pathfinding, is needed.
- `'would-seal-animal'` is therefore not a failure code. The enumerated failures
  are `'out-of-bounds' | 'in-water' | 'too-steep' | 'occupied' | 'out-of-stock'`
  (plus `'skewed'` for a fence drag that is not a straight line).

## Interaction with existing systems

- **Coins.** One wallet, created in `main.ts` and shared by the sale panel and
  the shop. The shop never invents a second currency and never has a negative
  balance.
- **Plants.** `PlantSimulation.placementResult` gains an occupancy term via the
  caller, so a poppy cannot be planted inside a fountain. Plants stay free-form
  and unsnapped.
- **Animals.** Wander steering gains a small repulsion from blocking footprints
  and cannot cross fence edges. Full pathfinding stays out of scope; the
  seal guardrail above is what makes avoidance-only safe.
- **Terrain.** Props sample `terrain.heightAt()`; the water field is consulted
  so nothing is placed in a pond. Props do not edit the height grid.
- **The dead HUD rectangle.** `isOverGameHUD()` in `main.ts` still reserves the
  deleted expansion card's top-left 404 × 112 rectangle, and that rectangle
  blocks the Hand tool's world clicks — so the top-left of the garden is
  currently unclickable. It has to be cleared before a clickable building is
  added, or a shop in that corner would be silently dead.
- **Draw calls.** Fences instanced, catalog models shared. A garden full of
  props must not repeat the 60-meshes-per-animal mistake.
- **Persistence.** The wallet, the inventory, and placed props are all
  session-only, exactly like the coin balance today. A refresh loses the shop.
  A save schema covering these is a separate milestone, and this doc does not
  pretend otherwise.

## Milestones

**M1 — the chain, end to end, with one item.**
`farm-shop.glb` + the click + the storefront screen + the wallet debit + the
Propbox + the lattice and the snap ghost, proved by buying and placing a
**statue**. Also clears the dead HUD rectangle. Exit test: click the building,
buy, see it in the inventory, place it on the grid, refresh and lose it.

**M2 — the catalog.**
All four items with their real rules: fountain, fence runs with auto-joining and
post sharing, statue rotation, coop's 2×2 footprint. Footprint occupancy and the
seal guardrail land here, with the tests.

**M3 — the storefront, properly.**
`shop_interior.py` counter/shelf/crate props, shopkeeper copy, per-item blurbs,
receipt feedback, sold-out and cannot-afford states, and the Propbox launcher
sharing the corner with the Seedbox cleanly.

**M4 — the world reacts.**
Animal avoidance so props are walked around, hand-tool pick-up returning items
to the inventory, and the fairground re-check that the building's apron corner
reads correctly at the normal camera distance.

## Testing

`tests/farm-props.test.mjs`, wired into the `test` script like every other
suite, against the pure module:

1. A purchase debits exactly the catalog price and increments the inventory.
2. A purchase past the balance is refused and leaves both unchanged.
3. Placing consumes exactly one, and placement with an empty inventory is
   refused with `'out-of-stock'`.
4. A footprint marks its cells occupied; a second prop overlapping it fails
   `'occupied'`; rotation changes which cells a 2×2 footprint occupies.
5. Cell placement is refused in water, out of bounds, and on ground whose
   sampled heights spread past the slope tolerance.
6. Fence runs: two collinear adjacent segments join into one run with two posts;
   removing a middle segment splits a run in two; a run is priced per segment.
7. Pick-up frees the whole run: removing a multi-segment fence returns every
   segment to the inventory and leaves no orphaned posts. (This replaced the
   seal-guardrail test when the guardrail was dropped.)
8. Pick-up returns the prop to the inventory and frees its cells, and a pick-up
   followed by a place round-trips the counts.
9. Determinism: the same purchase-and-place sequence produces identical
   inventory counts and occupancy twice.

Plus, in the browser on the `?gardenDebug` harness:
`__gardenDebug.shop()` (open the storefront), `.buy(id)`, `.propCounts()`,
`.placeProp(id, cellX, cellZ, rotation)` returning the placement result, and
`.propReport()` listing placed props and their footprint cells. Lattice
round-trips are checked through `.placeProp` rather than by clicking, for the
same reason `sowGrass`/`digPond` go through the real tools.

## Out of scope

- A real walk-in interior room with its own camera and navigation.
- The chicken coop as a functioning animal home (a residency condition or a
  destination for a settled chicken). Deliberately separable; it is the natural
  next feature after this one.
- Persistence of the wallet, the inventory, or placed props.
- Gates, fence-driven animal containment as a *mechanic* (herding, pens).
- Selling placed props for a refund, and selling decor to visitors.
- A shopkeeper NPC, an animated sign, opening hours, seasonal stock.
- More items than the four, and any item that changes simulation (a fountain
  that holds water and satisfies the duck's water condition is tempting and
  explicitly not in this milestone).
- Pathfinding, and props that animals can stand on.

## Acceptance checklist

1. `npm run check` clean (tests, `tsc --noEmit`, build).
2. The nine unit tests above pass headless.
3. Clicking the Blender building with the Hand tool opens the storefront; other
   tools do not open it.
4. Buying debits the on-screen coin counter, and the balance refuses a purchase
   it cannot afford.
5. A bought prop appears in the Propbox with a count, and the Propbox launcher
   and the Seedbox launcher coexist in the top-right without overlapping the
   gold counter.
6. A ghost snaps to the lattice, is green on legal ground and red with a reason
   on illegal ground, and placing it commits exactly one from the inventory.
7. A dragged fence run joins into one continuous fence with shared posts, and is
   priced and charged per segment.
8. The coop occupies 2×2 cells and animals visibly go around it.
9. A fence run that would trap an animal is refused with a visible reason.
10. Hand-picking a prop returns it to the inventory.
11. Screenshots per AGENTS.md (≤1280×720, never `fullPage`) for: the building in
    the garden, the storefront open, the Propbox open, a legal vs illegal ghost,
    a finished fence run.

## Resolved questions

1. **"Takes you inside"** — a storefront screen in the UI layer, built from
   Blender-authored interior props. Not a walkable room; not merely a camera
   dolly. Confirmed 2026-09-30.
2. **Fences** — auto-joining runs dragged along the lattice. Confirmed
   2026-09-30.
3. **Chicken coop** — decorative for now. Confirmed 2026-09-30.
4. **Props occupy space** — plants are blocked by footprints and animals walk
   around props. Confirmed 2026-09-30.

## Open questions

1. **Prices.** The four numbers in `PROP_CATALOG` are a first pass scaled
   against `src/game/sales.ts`. They are one table and trivial to retune once
   the shop is playable and the earn rate is felt rather than estimated.
2. **Where the building stands exactly.** The apron near the gate is the
   proposal because it is inside the normal farm framing; if it crowds the
   carousel or the existing stalls, the fairground decides the final spot.

## Implementation notes

Landed 2026-09-30 on `feature/shop`. Everything in the plan above exists; these
are the places the build departed from it, and why.

### What was built

| Piece | File |
| --- | --- |
| Wallet spend (`debit`, `canAfford`) | `src/game/sales.ts` |
| Catalog, inventory, lattice, placement, occupancy, fence runs, purchase | `src/game/farm-props.ts` |
| Pure unit tests (10) | `tests/farm-props.test.mjs` |
| Placed models, instanced fences, shop building, snap ghost | `src/scene/garden-props.ts` |
| Storefront screen | `src/ui/shop-panel.ts` |
| Propbox inventory | `src/ui/propbox-panel.ts` |
| Wiring, tool/panel coordination, debug harness | `src/main.ts` |
| Building / garden props / storefront furniture generators | `art/blender/shop_building.py`, `shop_props.py`, `shop_interior.py` |

### Departures from the plan

1. **The seal guardrail is gone.** Replaced by whole-run hand-tool pick-up, as
   described above. `'would-seal-animal'` is not a failure code.
2. **The shop building lives in `garden-props.ts`, not `fairground.ts`.**
   `fairground.ts` is 876 lines of hand-built set dressing with no async loader
   in it; the building needs a `GLTFLoader` and a raycast target, both of which
   the props module already has. One owner for "the shop" is easier to follow
   than two.
3. **The building is anchored outside the *fully expanded* bounds** — at
   `(2.5, 18)`, past the max plot half-depth of 15 m. The gravel apron slides
   outward as the farm grows, so a building parked on the starting apron would
   end up inside the garden after three expansions.
4. **Fences are drawn from instanced procedural geometry, not the fence GLB.**
   Posts are one `InstancedMesh` and rails a second, exactly as planned — but
   the geometry is a plain box rather than meshes lifted out of `fence.glb`.
   Sharing a post between two adjacent runs means two coincident copies of the
   same post mesh, which z-fights; procedural posts are deduplicated by lattice
   vertex instead, so the shared post is drawn once. `fence.glb` still authors
   the look (the box dimensions match it) and drives the placement ghost.
5. **`PropDefinition` gained `size`.** The loader needs a target longest side
   in garden metres, and putting it beside `footprint` in the catalog keeps it
   tunable in the same table as the price.
6. **The new Blender scripts flatten procedural Base Color before export.**
   glTF cannot carry the noise-to-ramp node graph, so a linked `Base Color`
   exports as white; the older `ui_props.py` props ship that way (a pale-plaster
   menu button) and this change does not touch them. `shop_building.py`,
   `shop_props.py` and `shop_interior.py` keep the grain in the `.blend` and the
   review render and fall back to the flat tone only in the GLB.
7. **The dead HUD rectangle is fixed by deletion.** `isOverGameHUD()` no longer
   reserves the removed expansion card's 404 × 112 device-pixel rect, and it now
   asks the Propbox and the storefront as well.
8. **A `grantCoins(n)` harness hook was added.** The wallet starts at zero, so
   without it there is no way to drive a purchase headless.

### Verified

- `tsc --noEmit` clean; `npm test` 84/84 (73 existing + 11 new); `npm run build`
  clean.
- In the browser on `?gardenDebug`, all on a real dev server: a synthetic
  pointer click on the building opens the storefront; the Propbox launcher and
  the gold counter stack without overlapping; buying debits the counter and
  updates the storefront and the Propbox; a ghost is green on free ground and
  red with `blocked` on an occupied cell; a drag along the lattice commits a
  six-segment run that reports as one run with seven posts; the Hand tool picks
  a statue back into the box and returns a whole six-segment fence run.

### Known follow-ups

- The statue reads small and busy at the farm camera's ~39 m view height. It is
  the first thing to enlarge if the shop needs a stronger silhouette.
- Prices are still the first-pass table. They are one object in `farm-props.ts`.
- `ui_props.py`'s white wood is a real (pre-existing) look bug; fixing it means
  re-running that generator over four approved props, which is its own change.
- The chicken coop is decorative. Promoting it to a real home is the natural
  next feature.
