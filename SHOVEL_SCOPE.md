# Shovel (Tool #2) — Scope & Technical Plan

Status: **scoped, not started.** Decisions below were made by Spencer on 2026-09-29.
Companion to [`SPEC.md`](SPEC.md) §5.1 (terrain types), §6 (input direction), §11 (guardrails).

## What the shovel is

The second garden tool. It sculpts the garden ground by **digging up dirt into
piles, carrying the pile, and depositing it elsewhere** — dirt is conserved,
movement is physical and readable, and every state change is player-initiated.

### Decisions (locked 2026-09-29)

| Question | Decision |
| --- | --- |
| Controls | **Dig piles, move dirt** — left-click digs, click a pile to pick it up, click ground to deposit. Not continuous raise/lower. |
| Terrain range | **Gentle storybook hills** — max ~+1.2 raised / ~−0.8 sunk, tuned to the miniature diorama camera. |
| Steep slopes | **Always walkable** — deformation clamps slope steepness so cliffs can never form; animals always reach everywhere. |
| First milestone | **Terrain + animals together** — diggable, walkable hills in one slice; animals sample ground height from day one. |

## Player-facing behavior

1. **Select shovel** (hotkey `2`). The circular cursor gains a shovel head; the
   HUD card swaps to shovel copy. Tapping `2` cycles the shared brush sizes 1–5
   exactly like the seeder (0.5×…4× radius).
2. **Left-click-hold on ground digs.** A small mound of dirt gathers under the
   cursor; the ground sinks slightly where you dig. After a short hold (or
   enough depth), a **dirt pile** pops out of the hole and sits on the ground
   as a real object.
3. **Click a pile to pick it up.** The pile rides under the cursor (the shovel
   head carries a visible dirt load), the dig cursor shows a soft "deposit"
   tint over the garden and a red "no" tint over paths/edges.
4. **Click ground to dump.** The pile empties where you stand the cursor,
   raising the ground there. Dirt is conserved: piles are the only way to
   raise ground, digging is the only way to lower it. (Cheap to reason about,
   naturally balances terrain, and the pile-carrying reads as play.)
5. **Right-click** smooths/flattens under the cursor (no dirt created or
   destroyed) — the "undo my lumpy mess" button, held like the seeder's trim.
6. **Undo guardrail:** digging/depositing is chunky (discrete piles) rather
   than continuous, which keeps the height field honest; a later milestone can
   snapshot the height grid before each pile for true undo.

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
- **Cursor ring:** brush size levels scale the dig/deposit/smooth radius; the
  ring already pops on size cycling and will tint per-mode (dig/carry/deposit).

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

- `MIN_H = −0.8`, `MAX_H = +1.2` clamped on every splat.
- Keep-out ring: height edits are faded to zero within ~0.9 m of the garden
  edge so the boundary trim, apron, and cutaway base never tear.
- Dig floor: digging stops producing piles when the cell hits `MIN_H` (the
  cursor shows a "bedrock" tint instead of silently eating clicks).
- One pile = a fixed, modest amount of dirt (≈ 6–10 grid cells' worth) so a
  hill takes a visible, satisfying number of trips rather than one click.
- Max ~12 active piles; oldest pile fades back into the ground (returned to
  its origin cells) if the player abandons it, keeping the garden tidy.

### Piles as entities

- A pile is a small `THREE.Group` (squashed sphere of dirt, same soil palette)
  with a garden-space position and its dirt amount. Registry lives next to the
  height field, not inside the renderer.
- Carrying state lives on the shovel tool: `idle → digging → carrying → (deposit | drop-back)`.
  Dropping (releasing the button mid-carry) returns the pile to where it was
  picked up — no dirt is ever lost by accident.

### Animal ground sampling

- `groundHeightAt(x, z)` bilinear-samples the grid; the balloon-animal update
  adds `sampled − GARDEN_LAWN_Y` to its fixed `groundY` hop, with the height
  delta low-pass filtered (`lerp` toward target at ~8/s) so stepping over a
  mound reads as a gentle bob, not a snap.
- Wander bounds stay as-is for this milestone.

### Testing hooks (following the garden-debug pattern)

- `__gardenDebug.dig(x, y)`, `.deposit(x, y)`, `.smooth(x, y)`,
  `.heightsSummary()` (min/max/changed cells), and `pickReport` gains height
  readout. Deterministic seeds like the grass seeder so checks are repeatable.

## Explicitly out of scope (next milestones)

- Pond/water (needs its own plan: water plane at a level, shore tinting,
  hose tool, animals refusing deep water).
- Paths, tilled-farm-soil variants, dirt-texture blending by height.
- Undo history UI, save persistence of the height grid (schema v2).
- Slope-aware plant rules ("grass won't grow on steep digging sites").
- Perspective/occlusion work if dramatic hills ever hide animals (moot at
  storybook range).

## Milestone 1 acceptance checklist

1. Dig → hole sinks, pile appears; carry → pile follows cursor; deposit →
   ground rises; dirt conserved (heights min/max shift as expected).
2. Repeat deposits can raise terrain to `MAX_H`; repeated digs reach `MIN_H`;
   no combination of edits can produce a slope steeper than the clamp.
3. All six balloon animals walk over a deposited mound smoothly (no snapping,
   no falling through, no getting stuck) and reach every reachable point.
4. Grass inside a deformed radius re-projects correctly; edges keep the clean
   alpha fade (no white halo regression).
5. Right-drag smooths lumps without changing total dirt.
6. `tsc --noEmit` and `npm run build` clean; debug-harness checks pass;
   screenshot per AGENTS.md rules (≤1280×720, never fullPage).
