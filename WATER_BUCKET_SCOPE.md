# Water Bucket (Tool #3) — Scope & Technical Plan

Status: **M1 + flat parcel edge + plain water surface + bucket tool shipped** (2026-09-30). The Blender ripple texture remains.
Companion to [`SHOVEL_SCOPE.md`](SHOVEL_SCOPE.md) (terrain + contour rings),
[`SPEC.md`](SPEC.md) §5.1 (terrain types include "shallow water/pond"),
§5.2 (watering as a low-friction action), §10.3 (plant / water / harvest).
Work lands on branch `feature/water-bucket` in worktree `.worktree-water-bucket`.

## What the bucket is

The third garden tool. It **pours water**, and the water does what water does:
it runs downhill and settles in a basin, filling it **flat to the height of the
lowest rim around it**, then stops. It never sits on a hillside, and it never
rises above a lip it could not spill over.

That single rule — *fill to the spill level, overflow downhill* — is the whole
feature. It automatically produces every behavior asked for:

| Situation | Result |
| --- | --- |
| Ground dug out below grade | Pond forms in the hole, level pinned at the hole's rim. |
| Ground below surface level (h < 0) | Same pond; the pre-shaded wet contour bands read as the pond bed. |
| A dip that is *still above* grade but lower than its surroundings | Water runs to it and pools — the same basin rule, keyed to the local rim, **not** to y = 0. |
| Sloped ground | Water sheets downhill, leaves the slope, and collects at the low end. Nothing is left as a floating film on the hill. |
| Over-poured past the rim | Extra water is runoff (and reseeds the downhill neighbour, so it visibly travels). Level never exceeds the spill height. |

The critical design commitment: **wetness is decided by `groundHeight < basinSpillLevel`,
never by `groundHeight < 0`.** A basin at +0.4 m surrounded by ground at +0.6 m
fills and holds water even though it is above grade. That is the real puddle
rule and it is the test that decides this design.

## Decisions (approved 2026-09-29)

| Question | Proposed |
| --- | --- |
| Controls | **Left-hold pours, right-hold drains.** Mirrors the shovel's dig/fill symmetry, and makes a mis-poured pond recoverable in place with no inventory. |
| Brush | Tapping `3` cycles the shared brush sizes 1–5. Pour **rate scales with disc area** so the water-level rise speed feels the same at every size (mirrors the seeder's area-scaled seed counts and the shovel's nominal per-second rate). |
| Volume | The bucket is **not finite** for this milestone. Water comes from the bucket, not a meter; a resource gauge is a later progression idea. |
| Longevity | Puddles persist (no evaporation yet) so a dug pond stays a pond. A slow seep can come later. |
| Animals | **Balloon animals float.** When water depth > 0 an animal rides the surface instead of the ground, with the existing bob. Thematic, free, and never strands anyone — the terrain slope clamp already guarantees reachability. |
| Scope of "watering" | **Terrain puddles only** for this milestone; a moisture field for plants/grass is a stretch goal (§Stretch). |

## Player-facing behavior

1. **Select bucket** (hotkey `3`). HUD card swaps to bucket copy, the cursor
   gains a bucket model, the ring tints water-blue. Tapping `3` cycles brush
   size 1–5, exactly like the seeder and shovel.
2. **Left-hold pours.** Water streams from the bucket into the disc, a splash
   ring pulses at the cursor, and a surface visibly rises in the hole. The rate
   is per-second at the cursor centre, distributed over the disc.
3. **Water finds its level.** Within a second or two of pouring, the surface is
   dead flat across the whole pond — the single most important cue that this is
   water and not wet dirt.
4. **It stops at the rim.** Keep pouring and the level refuses to rise; extra
   water runs over the low side and creeps downhill to the next low spot.
   Counterpart to the existing depth contour rings: a puddle is flat, a pit is
   banded.
5. **Right-hold drains.** Water under the cursor is removed; the level drops
   and the pond shrinks. Emptying it completely leaves damp soil.
6. **Wet shore.** The soil within ~0.25 m of the waterline darkens, so pond edge
   → wet earth → dry earth is a gradient, not a polygon cut.

## Technical design

### Simulation: a per-cell water field, solved by basin fill

New pure module `src/game/garden-water.ts` — **no Three.js import**, matching the
`src/game/farm-expansion.ts` precedent and AGENTS.md's "simulation separate from
Three.js scene state" rule.

- `depth: Float32Array` over the **same grid** as the terrain (`0.55 m` cells,
  ~81 × 56 at full expansion), metres of water per cell, always ≥ 0.
- Ground heights come in through an injected `cellHeight(gx, gz)` accessor, so
  the field never reaches into the terrain's private state and stays unit-testable.
- Public API:
  - `pour(x, z, radius, metresPerSecond)` → depth added, area-weighted across
    the disc with the same `smoothstep(0.6, 1)` rim easing the shovel uses.
  - `drain(x, z, radius, metresPerSecond)` → the inverse verb.
  - `settle()` → the solver (below).
  - `depthAt(x, z)`, `surfaceAt(x, z)`, `summary()`, `clear()`.

### The solver: flood fill + monotone level solve, bounded per frame

`settle()` runs only when the field is dirty, and only over the dirty bounding
box (padded), so a single hold near the middle of the garden never walks the
whole grid.

1. **Dirty set** — cells changed by `pour`/`drain`, plus a spill frontier that
   grows as the solver finds new low neighbours.
2. **Basin fill (flood fill).** From each dirty cell, expand 4-connected while
   `neighbourGround < currentSurfaceLevel`. This is the standard priority-flood
   basin: the region reached is exactly the puddle at that instant, and its
   boundary is the rim.
3. **Level solve.** Find `L` with `Σ max(0, L − hᵢ) = volume` over the region.
   `F(L)` is continuous and strictly increasing, so ~20 bisection steps on
   `[min hᵢ, max hᵢ + 0.5]` pin it exactly. Cheap, deterministic, no iteration
   count to tune, and it conserves volume by construction.
4. **Overflow.** `L` is then clamped to `min(boundary heights)`. Volume above
   what fits at `L` becomes runoff, which is injected into the lowest boundary
   cell that is inside the garden and below `L`. That is the downhill creep, and
   it is why pouring on a slope produces a moving sheet that eventually pools.
5. **Bounds.** A component budget (e.g. 24 components, 6 depth-of-cascade
   levels) per frame keeps the worst case (pouring onto a long slope) inside a
   millisecond. Whatever is deferred simply continues next frame — the eye
   reads it as flow.

`settle()` is idempotent for a static terrain: running it twice changes nothing,
which is a direct test.

### Rendering: one transparent plane, alpha-where-dry

The soil and lawn are already displaced planes re-derived from the grid
(`TerrainMeshBinding`). Water gets a third one — same `PlaneGeometry(96, 66)`,
bound with a small positive offset so it never z-fights the lawn paint.

- Per-vertex `y` comes from a **shore field**, not the raw cell depth: the pool's
  own surface level is carried outward past the waterline while opacity falls
  off with horizontal distance. Sampling raw depth instead put dry shore
  vertices at terrain height — well above the water — which tore the shoreline
  into a spike fringe. One draw call, and a soft organically shaped edge.
- The sheet is deliberately *not* clamped up to the surrounding bank. The soil
  is drawn first and writes depth, so a bank occludes whatever has sunk into it.
- Material: `MeshStandardMaterial`, transparent, drawn after ground. Because
  ground sheets are transparent and do not write depth, vertex coverage is
  suppressed when the pool level sits under a raised bank.
- Surface heights propagate over the full field even at alpha-zero vertices;
  pool level/coverage are bilinearly sampled from a rounded shore-distance field
  to soften the shoreline contour.

### Interaction with existing systems

- **Grass.** Blades scale by `1 − smoothstep(0.05, 0.35, depth)`: shallow water
  leaves the meadow standing (reeds at the edge), deep water flattens it.
  Continuous and self-reversing — drain the pond and the grass stands back up.
- **Shovel.** Because water is stored as depth against a moving ground, digging
  deeper under a pond makes it deeper, and filling a pond in shrinks and then
  removes it. No special-casing in the terrain code.
- **Animals.** `groundSampler` becomes `height + min(depth, float)`, so they
  ride the surface. Existing low-pass smoothing (`lerp` at 8/s) already turns
  the step onto the water into a gentle bob.
- **HUD hit-testing.** `isOverGameHUD` in `main.ts` hardcodes `2 * 360 + 10` for
  two tool cards; it must be derived from `GARDEN_TOOLS.length` so the third card
  is clickable at any viewport width.
- **Cursor.** Bucket model on the ring, water-blue tint, a splash/ripple ring
  while pouring and a draining tint while right-holding.

## Milestones

**M1 — the puddle logic, provable, no pixels.**
`src/game/garden-water.ts` + `tests/garden-water.test.mjs`. A new test file
bundled through esbuild exactly like `tests/farm-expansion.test.mjs`. This
milestone is the feature; everything after it is presentation.

**M2 — water you can see.**
Water plane + shoreline alpha + wet shore band, grass drowning, empty garden
with a hand-dug pond to look at.

**M3 — the tool.**
Bucket model, HUD card + hotkey, pour/drain verbs, splash feedback, cursor
states, `isOverGameHUD` card-count fix.

**M4 — the world reacts.**
Animals float on the surface; debug harness; SPEC/README touch-up; screenshots
per AGENTS.md (≤1280×720, never fullPage).

## Testing

`tests/garden-water.test.mjs`, unit-level against synthetic height fields — a
flat plate, a bowl, a slope into a basin, a two-basin ridge:

1. Pouring into a flat plate leaves no water (it runs off) — "nothing floats."
2. Pouring into a bowl pins the level at the bowl's rim and **not above**, no
   matter how much is poured.
3. A basin whose floor is at **+0.4 m** and rim at +0.6 m fills and holds —
   the above-grade puddle, the exact case that rules out a `h < 0` design.
4. The solved surface is flat across the region to within 1e-4.
5. Pouring on a slope ends with all water in the basin and **zero** water on
   the slope.
6. `settle()` is idempotent: a second call changes nothing.
7. Volume is conserved up to recorded runoff, and a bounded number of runoff
   steps empties a plate completely.
8. Digging deeper under a pond increases depth at the same level; filling a
   pond in removes it.
9. `drain` empties a pond to zero depth and leaves the ground untouched.
10. Determinism: same pours → identical grids, twice.

Plus, in-browser on the debug harness: `__gardenDebug.pourAt(x, z, ms)`,
`.drainAt(x, z, ms)`, `.waterSummary()` (wet cells, total volume, max depth,
component count), and `state()` gains `waterCells` / `waterMaxDepth`.

## Out of scope (later milestones)

- Evaporation / seep / a finite water meter.
- Watering **plants**: a `moisture` field that grass growth and plant health
  read from. This is the SPEC §10.3 "water" action and the natural follow-up —
  the bucket and the moisture field share a brush.
- Deep water as a habitat gate (animals *prefer* ponds; SPEC §5.3), and
  waterfowl actually swimming.
- Water reflections, caustics, rain, a hose tool, boats.
- Save persistence of the water field (schema v2, alongside the height grid).
- Undo per stroke.

## Acceptance checklist

1. `npm run check` clean (tests, `tsc --noEmit`, build).
2. The ten unit tests above pass, run headless.
3. Dig a hole with the shovel, pour with the bucket → a flat, still, legible
   pond whose level stops at the rim; keep pouring and it runs downhill instead
   of rising.
4. A hand-dug dip that never goes below grade still holds water.
5. Right-hold drains the pond; the grass stands back up as it empties.
6. An animal walks into the pond and floats, then re-grounds on the far bank
   without a snap.
7. No z-fighting between water, lawn, and soil at any brush size or zoom.
8. Screenshot per AGENTS.md rules for: pond filled, pond at rim mid-overpour,
   pond drained.

## Resolved questions

1. **Right-click:** drain/bail the water under the cursor. Confirmed.
2. **Animals:** float on the surface. Confirmed.
3. **Scope:** terrain puddles only — the plant `moisture` field stays a later
   milestone. Confirmed.
4. **Water surface texture:** to be authored in Blender (ripple/normal map) and
   iterated against the in-browser pond, same pipeline as the animals.
5. **Garden border:** the full plot edge stays flat at grade; ordinary water
   poured onto the unsculpted ground drains instead of encountering a hidden
   depression or raised lip. The player can dig basins right into parcel corners;
   the surrounding grade contains water below zero until it reaches the ground
   level and spills outward. Pinned by `tests/garden-edge-water.test.mjs`.
