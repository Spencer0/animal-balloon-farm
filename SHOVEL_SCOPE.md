# Shovel (Tool #2) — Scope & Technical Plan

Status: **milestone 2 shipped** (2026-09-29): dig=down / fill=up with depth
rings. Decisions below were made by Spencer on 2026-09-29; the 2026-09-29
"scrap the piles" decision supersedes the original pile-carrying controls.
Companion to [`SPEC.md`](SPEC.md) §5.1 (terrain types), §6 (input direction), §11 (guardrails).

## What the shovel is

The second garden tool. It sculpts the garden ground with two verbs:
**left-hold digs the ground down, right-hold fills it back up** — no dirt
entities, no carrying, no inventory. Depth is made legible by **contour rings**
baked into the soil (one darker band per 0.35 m below grade), so a hole reads
as "down", not "wet dirt", and future pond beds come pre-shaded.

### Decisions

| Question | Decision |
| --- | --- |
| Controls | **Dig = down, fill = up** (2026-09-29, supersedes pile carrying) — left-hold digs down, right-hold fills up. Simple to reason about; no dirt conservation bookkeeping. |
| Terrain range | **Pond-capable depth, storybook hills up** — max +1.2 raised / **−2.6 sunk**, deep enough for large ponds in a later water milestone. |
| Depth legibility | **Contour rings** (2026-09-29) — soil vertex colors step darker/wetter every 0.35 m of depth; under-garden planes were opened (parcel cap hollowed into a rim wall + pit floor) so depth is actually visible rather than capped by a flat brown floor at y≈−0.04. |
| Smoothing | **Dropped** for now — right-click is fill. Revisit a smooth binding (e.g. a modifier key or tool #3) if lumpy terrain becomes a real complaint. |
| Steep slopes | **Always walkable** — deformation clamps slope steepness (≈23°) so cliffs can never form; animals always reach everywhere. |
| First milestone | **Terrain + animals together** — diggable, walkable hills in one slice; animals sample ground height from day one. |

## Player-facing behavior

1. **Select shovel** (hotkey `2`). The circular cursor gains a shovel head; the
   HUD card swaps to shovel copy. Tapping `2` cycles the shared brush sizes 1–5
   exactly like the seeder (0.5×…4× radius).
2. **Left-click-hold digs down.** The ground sinks under the cursor while held;
   the sink rate (~−0.28 m/s center, eased at the rim) is tuned so a full-size
   pond basin takes a satisfying but not exhausting hold.
3. **Depth rings form as you dig.** Every 0.35 m below grade the soil steps one
   contour band darker (dry tan → wet brown), like terraced earth — this is the
   primary "you are going DOWN" signal.
4. **Right-click-hold fills up.** The inverse verb: ground mounds back up
   (~+0.22 m/s), so mistakes are recoverable in place with no inventory.
5. **Undo guardrail:** edits are continuous but slow and radius-bound; a later
   milestone can snapshot the height grid per stroke for true undo.

## Interaction with existing systems

- **Grass seeder:** the paint layer + blades must follow the deformed ground.
  Blades are positioned at spawn time, so each deposit/dig re-projects the
  blades and green alpha inside the affected radius onto the new heights.
- **Soil/lawn meshes:** one of them becomes a displaced height field (below);
  the other follows it. The ivory boundary and gravel apron are untouched.
- **Animals (this milestone):** wanderers sample ground height at their feet
  each frame and add it to `wrapper.position.y`, with slope-smoothing so they
  don't jitter on grades. Bounds stay rectangular; clamped slopes guarantee
  reachability so no pathfinding is needed yet.
- **Cursor ring:** brush size levels scale the dig/fill radius; the ring pops
  on size cycling and tints per-mode (dig amber / fill gold).

## Technical design

### Canonical height field (not mesh surgery)

- A `Float32Array` height grid at fixed garden resolution (target ~0.5–0.7 m
  cell spacing, i.e. roughly 48×32 for the 28×19 m plot) stored in
  **garden-canonical coordinates** per SPEC §9, independent of Three.js.
- The soil mesh's vertices are re-derived from the grid (`grid → world` is a
  pure function we can unit-test both ways, per the spec's transform rule).
  PlaneGeometry(96, 66) already has denser vertices than the grid; each mesh
  vertex samples the grid bilinearly, so deformation is smooth and cheap.
- All edits go through one API: `heights.splat(x, z, radius, amount)` with
  **slope clamping applied as a post-pass** over the affected cells.

### Slope clamp (the "always walkable" guarantee)

- After any splat, walk affected cells and enforce
  `|Δh| ≤ maxSlope × cellSize` between neighbors (max slope ≈ tan 30° ≈ 0.6).
- Clamp order: raise the lower neighbor before lowering the higher one, so a
  single deposit spreads into a smooth mound instead of a spike.
- Because every edit passes through the clamp, **cliffs are unrepresentable** —
  animals never need avoidance logic and can never be stranded. This replaces
  the erosion idea entirely.

### Guardrails (baked into the field, not conventions)

- `MIN_H = −2.6` (pond floor), `MAX_H = +1.2` clamped on every splat; slope
  redistribution also honors the floor.
- Keep-out ring: height edits are faded to zero within ~0.9 m of the garden
  edge so the boundary trim, apron, and cutaway base never tear.
- Dig floor: splat clamps at `MIN_H` (the pond basin simply stops deepening).

### Depth rings & opened under-garden

- The soil mesh gains an RGBA vertex-color attribute; `applyToMeshes` writes one
  contour shade per vertex from its sampled height (bands every 0.35 m, easing
  from dry `#96744e` toward wet `#4c3524`). Flat ground keeps the plain soil
  color; only dug areas band.
- The raised parcel was a solid extrusion whose cap sat at y≈−0.04 — it hid
  anything deeper than 4 cm. It is now a rim wall (`DoubleSide`, garden hole)
  plus a dedicated pit floor at −2.45 m below `MIN_H`, so a full-depth pond is
  visible top to bottom. Meadow/outer-lawn planes got matching garden cutouts.

### Animal ground sampling

- `groundHeightAt(x, z)` bilinear-samples the grid; the balloon-animal update
  adds `sampled − GARDEN_LAWN_Y` to its fixed `groundY` hop, with the height
  delta low-pass filtered (`lerp` toward target at ~8/s) so stepping over a
  mound reads as a gentle bob, not a snap.
- Wander bounds stay as-is for this milestone.

### Testing hooks (following the garden-debug pattern)

- `__gardenDebug.dig(x, y, holdMs)`, `.fill(x, y, holdMs)`,
  `.heightsSummary()` (min/max/changed cells/tool/action), and `pickReport`
  gains height readout. Deterministic seeds like the grass seeder so checks are
  repeatable.

## Explicitly out of scope (next milestones)

- Pond/water (needs its own plan: water plane at a level, shore tinting,
  hose tool, animals refusing deep water).
- Paths, tilled-farm-soil variants, dirt-texture blending by height.
- Undo history UI, save persistence of the height grid (schema v2).
- Slope-aware plant rules ("grass won't grow on steep digging sites").
- Perspective/occlusion work if dramatic hills ever hide animals (moot at
  storybook range).

## Milestone 1 acceptance checklist

1. Dig → hole sinks with visible contour rings forming per 0.35 m band; fill →
   ground rises back; heights min/max shift as expected.
2. Repeated fills can raise terrain to `MAX_H`; repeated digs reach `MIN_H`
   (−2.6); no combination of edits can produce a slope steeper than the clamp.
3. All six balloon animals walk over a deposited mound smoothly (no snapping,
   no falling through, no getting stuck) and reach every reachable point.
4. Grass inside a deformed radius re-projects correctly; edges keep the clean
   alpha fade (no white halo regression).
5. `tsc --noEmit` and `npm run build` clean; debug-harness checks pass;
   screenshot per AGENTS.md rules (≤1280×720, never fullPage).
