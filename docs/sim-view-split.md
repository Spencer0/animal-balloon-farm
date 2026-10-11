# Animal sim / view split

Status: slices 1 (wander and walk) and 2 (collision and home trip) are implemented; slices 3 to 5 are planned below.

## Why

`src/animals/balloon-animal.ts` (about 1300 lines) mixes three jobs: deciding
(where to go, when to sleep, when a capture starts), moving (position, facing,
ground height) and drawing (clips, materials, squash, capture flourish). PR #42
added a fixed 15 Hz sim clock (`src/game/sim-clock.ts`), but animals, predators
and collisions still ran per frame, so the game had two timing models side by
side and the per-animal closure was the hottest JS in the frame profile.

The fix is a boundary, not a rewrite: **the sim owns facts, the view owns
pictures.** Anything that would still be true with the renderer unplugged is sim.

## The boundary

| Sim (pure, `src/game/`) | View (`src/animals/balloon-animal.ts`) |
| --- | --- |
| Position on the ground plane, heading, motion intent, wander target and timers | `THREE.Group` wrapper, pose pivot, mixer, clips |
| Steering, collision, predator decisions and strikes, sleep, progress | Position blend, facing slerp, ground-height easing, sway, squash, breath |
| Stage and conditions, residency dwell, travel route | Materials, paint-reveal, heart eyes, pop and sell effects |
| Seeded RNG, fixed 15 Hz tick | Per-frame `update`, driven by the sim clock's `alpha` |
| Emits events | Plays effects on events |

Rules:

- `src/game/*` imports no Three.js and no DOM. A sim file must run in node under
  `tests/*.test.mjs`.
- The view is **read-only toward the sim**. Intent flows in as commands
  (`setHomeTrip`, `setPursuit`, `setSleepSpot`, `nudge`, `placeAt`, ...) that the
  sim applies on its next tick; state flows out as snapshots.
- The sim never calls an effect. It emits an event; the view (or a presenter
  subscribed to the event list) plays it.
- No `Math.random` in the sim. Every animal owns a seeded stream
  (`src/game/seeded-random.ts`), so a seeded run replays exactly.

## Data shapes

Implemented in slice 1 (`src/game/animal-sim.ts`):

```ts
type AnimalMotion = 'walk' | 'idle' | 'sleep'

interface AnimalSimRecord {
  x: number; z: number          // current tick
  prevX: number; prevZ: number  // previous tick, for the view to blend from
  heading: number               // yaw about +Y, +X-forward model
  motion: AnimalMotion          // intent; the view maps it to a clip
  targetX: number; targetZ: number
  paused: number                // standing-about time left (Infinity = held)
  nextDecision: number
  longWalk: boolean
}
```

`WanderContext` (`src/game/animal-wander.ts`) is the world as the system needs
it this tick: leash half-extents, carnival side, alarmed, speed, pack anchor,
garden bounds. The adapter in the view builds it from its options; slice 2 moves
the building into the sim world.

Planned additions, one per slice, always plain data:

```ts
// slice 2
radius: number
home: { x; z } | null; homeSpeedScale: number; atDoor: boolean
// slice 3
hunt: { role: 'prey' | 'hunter'; targetId: string | null; ... }
// slice 4
stage: AnimalStage; conditions: ...; asleep: boolean; sleepSpot: {...} | null
captured: boolean; sold: boolean
```

Terrain height is a view concern for now (it eases toward `groundSampler(x, z)`).
When something in the sim needs it (a snake in grass, an owl perch), it reads the
heightmap array the way `src/scene/terrain-pick.ts` does: a pure function of
`(x, z)` over the field data, passed in as `heightAt`.

## Tick and interpolation contract

- `SimClock.advance(frameSeconds)` returns 0 to 4 whole 15 Hz steps and keeps the
  remainder. `SimClock.alpha` is `remainder / stepSeconds`, 0..1.
- Per frame in `main.ts`: `runSimTick` once per step (it calls
  `animal.tickSim(stepSeconds)` first), then `animal.update(delta, simClock.alpha)`.
- A system calls `beginSimStep(record)` first (previous := current), then writes
  the new current. The view draws `prev + (cur - prev) * alpha`, so it renders
  one tick behind the sim and never extrapolates.
- Anything outside a tick that moves a record (`nudge`, `placeAt`) shifts or
  snaps **previous and current together**, so a push-out at 60 Hz never fights
  the blend.
- `update(delta)` without an alpha (the debug hunt stepper, tests) steps the sim
  once itself with `delta`, so a caller that does not own a clock still works.
- Cosmetic motion stays per frame and is never read back by the sim: facing slerp
  toward `record.heading`, sleep squash and breath, the placeholder bob, the
  flier perch offset, ground-height easing, capture flourish.

### Adapter used while behaviours migrate

A behaviour that has not moved yet still drives the wrapper per frame
(`viewDrivesPosition()` in `balloon-animal.ts`: capture, flier, romance, home
trip, pursuit, sleep walk, gate travel, `wandering: false`). While any of those
is active `tickSim` does nothing. When the last one ends, the next tick or frame
**adopts** the wrapper's position and facing into the record
(`adoptViewPosition`), then the sim carries on from there. The clip the legacy
code last chose is mirrored into `record.motion` by `setAnimation`, so wander
resumes from the right state. Each slice deletes one clause of that predicate;
slice 5 deletes the adapter.

## Events

Emitted by the sim, consumed by the view, audio, journal and notifications.
Slice 1 emits none; the list is the target.

| Event | Emitted when | Consumers |
| --- | --- | --- |
| `arrived-home` | home trip reaches the door | housing, view (hide) |
| `woke` / `fell-asleep` | sleep spot reached or released | view (squash), housing |
| `alarmed` / `calmed` | predator awareness changes | view (mixer rate) |
| `caught` | owl dive or snake strike lands | pop effect, journal |
| `popped` | prey removed from the farm | effects, progress |
| `escaped` | prey reaches a hide | view |
| `captured` | capture flourish should start | view, progress |
| `stage-up` / `stage-down` | ladder moves | view (appearance, heart eyes), journal |
| `sold` | sale confirmed | effects, economy |

Events are plain `{ type, animalId, ...payload }` objects appended to a per-tick
list that the frame drains once.

## Migration plan

Each slice is shippable on its own and changes no gameplay. Order matters: a
slice may rely on the previous one, never on a later one.

### Slice 1 (done): wander and walk

`animal-sim.ts`, `animal-wander.ts`, `seeded-random.ts`; `tickSim`, `sim`, the
alpha blend and the adapter in `balloon-animal.ts`; `SimClock.alpha`.
Everything else keeps its per-frame path.

### Slice 2 (done): collision and home trip

Landed as `src/game/animal-routes.ts` (`stepHomeTrip`, the gate route
`beginGateTravel` / `stepGateTravel` / `tickVisitCooldown`), `AnimalSimRecord`
fields `radius`, `home`, `atDoor` and `visit`, and a tick-rate collision pass.
What differs from the plan below:

- The home trip and the gate route now run in `tickSim`. `viewDrivesPosition()`
  lost its `homeTrip` and `travelRoute` clauses; a home trip beats pursuit,
  sleep and `wandering: false`, as it always did.
- Collision runs once per sim tick (`collideAnimalsTick` in `housing.ts`, called
  from `runSimTick`) over the animals the sim moves, reading and pushing their
  records with `pushAnimalSim`: only the **current** position is pushed, so the
  view blends from the walked position to the pushed one and the correction is
  spread over the tick. A body that travels more than half its radius in a tick
  sweeps against boxes (`prevX/prevZ` on `CollisionBody`), so a fast mover cannot
  skip a thin wall.
- Animals the view still moves (sleep walk, capture, romance, pursuit) and the
  crowd fixtures keep a per-frame pass (`collideAnimalsFrame`). It reads every
  animal at its drawn position and moves only those. Slice 4 retires it.
- `collideAnimals(now)` stays for the harness's hand-stepped hunts: everything
  from the drawn position, pushed with `nudge`.
- No events yet. `arrived-home` stays a polled flag (`isAtDoor`, `record.atDoor`)
  because housing already polls it; the event queue arrives with slice 3, whose
  catches need it.

Original plan:

- Move the home trip (`setHomeTrip`, `speedScale` sprint) into a sim system.
- Move `collideAnimals` (`src/scene/housing.ts`) and `animal-collision.ts` usage
  onto the records: push-out writes `shiftAnimalSim`, not `animal.nudge`.
  Collision runs on the tick; the view's blend hides the 15 Hz stepping.
- Move gate travel (`advanceAnimalTravel`) here as well: it is walking along a
  route and only needs `AnimalTravelRoute` on the record.
- Radius and door positions become record fields.

Mechanical enough for a cheaper model: **partly**. Home trip and gate travel are
a straight lift (the maths already lives in `game/`). The collision rewrite needs
care: push-out must not jitter or tunnel at 15 Hz, and `housing.ts` mixes
collision with house occupancy. Give the collision half to the stronger model,
the lifts to a cheaper one.

### Slice 3: owl and snake hunts

- `owl-hunt.ts` and `snake-hunt.ts` (`src/scene/`) read and write records through
  `src/game/predator.ts`; strikes and catches become `caught` / `popped` events.
- Pursuit stops being `setPursuit` on the view: the hunter record holds its
  steering target, the prey record holds `alarmed` and its flee target.
- Fliers (`setFlightPose`) become records with a pose the view copies.
- The hunt stepper in the garden harness ticks the sim directly.

Mechanical: **no**. This is where the two models are most entangled (decision,
steering and effects in one loop), and it is where behaviour can regress quietly.
Needs the stronger model and a replay test per hunt scenario.

### Slice 4: capture, sleep, progress

- Stage and conditions move onto the record; `animal-progress.ts` already is
  pure, so it reads records instead of closures.
- Sleep spot, the walk to bed and `asleep` become sim state; the view keeps the
  crouch squash and breath.
- Capture: the sim decides *that* a capture starts (`captured` event) and the
  pending-residency dwell; the paint-reveal presentation stays in the view.
- Residency dwell and `pendingResidentStage` leave the view's `update`.

Mechanical: **partly**. Sleep and progress are lifts. The capture flow crosses
the async model load (`pendingCapture`) and is the easiest place to break the
first-capture experience; keep it with the stronger model.

### Slice 5: delete the old paths

- Remove `viewDrivesPosition`, `adoptViewPosition`, the `update(delta)` fallback
  tick, `setAnimation` mirroring and any setter that became a command.
- `balloon-animal.ts` is the view only: interpolate, map motion to clips, play
  events, cosmetic motion.
- Replace per-animal `tickSim` calls with one sim world tick.

Mechanical: **yes**, once slices 2 to 4 are merged. It is deletion guided by the
compiler and the tests; a cheaper model can do it.

## Testing

- Sim files are tested in node: `tests/animal-sim.test.mjs` replays a seeded
  wander, checks the leash and fence, the alarm speed, the infinite-pause hold,
  and the interpolation maths, including a 60 Hz display over a 15 Hz walk.
- Each later slice adds a replay test: seed, N ticks, assert the event list and
  final positions.
- In the game: `?gardenDebug=1&scenario=...` and `scripts/screenshot.mjs`; the
  Performance workflow runs on every PR.
