# Animal sim / view split

Status: all five slices are implemented. The sim owns position, steering, collision, hunts, sleep, stage and residency; `balloon-animal.ts` blends the sim's last two ticks, maps motion to clips, and plays events and effects. Two decisions deliberately stayed on the view side; see slice 4 below.

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
  (`setHomeTrip`, `setPursuit`, `setSleepSpot`, `setAlarmed`, `placeAt`,
  `stage = ...`) that write the record, which the sim acts on at its next tick;
  state flows out as snapshots. The collision pass is the one other writer
  (`pushSim`, current tick only).
- The sim never calls an effect. It emits an event; the view (or a presenter
  subscribed to the event list) plays it.
- No `Math.random` in the sim. Every animal owns a seeded stream
  (`src/game/seeded-random.ts`), so a seeded run replays exactly.

## Data shapes

`src/game/animal-sim.ts`. The record is plain data; the groups below are what
each slice added.

```ts
type AnimalMotion = 'walk' | 'idle' | 'sleep'

interface AnimalSimRecord {
  // slice 1: wander and walk
  x: number; z: number          // current tick
  prevX: number; prevZ: number  // previous tick, for the view to blend from
  heading: number               // yaw about +Y, +X-forward model
  motion: AnimalMotion          // intent; the view maps it to a clip
  targetX: number; targetZ: number
  paused: number                // standing-about time left (Infinity = held)
  nextDecision: number
  longWalk: boolean
  // slice 2: collision, home trip, gate route
  radius: number
  home: { x; z; speedScale } | null; atDoor: boolean
  visit: { route; direction; side; cooldown }
  // slice 3: hunts (hunter state lives in the hunt sims, see animal-hunt.ts)
  pursuit: { x; z; speedScale } | null; alarmed: boolean
  // slice 4: sleep, stage, residency
  sleepSpot: { x; z; heading } | null; asleep: boolean
  stage: AnimalStage; pendingStage: AnimalStage | null; dwell: number
  events: AnimalSimEvent[]      // 'stage-up' | 'stage-down', drained by the view
  // slice 5
  held: boolean                 // a flier, or mid paint-reveal: the sim leaves it be
}
```

`WanderContext` (`src/game/animal-wander.ts`) is the world as the system needs
it this tick: leash half-extents, carnival side, alarmed, speed, pack anchor,
garden bounds. The adapter in the view builds it from its options.

Terrain height is a view concern for now (it eases toward `groundSampler(x, z)`).
When something in the sim needs it (a snake in grass, an owl perch), it reads the
heightmap array the way `src/scene/terrain-pick.ts` does: a pure function of
`(x, z)` over the field data, passed in as `heightAt`.

## Tick and interpolation contract

- `SimClock.advance(frameSeconds)` returns 0 to 4 whole 15 Hz steps and keeps the
  remainder. `SimClock.alpha` is `remainder / stepSeconds`, 0..1.
- Per frame in `main.ts`: `runSimTick` once per step, which runs `stepAnimalWorld`
  (every animal's `tickSim`, the crowd fixtures' too, then collision, then the
  hunts), then `animal.update(delta, simClock.alpha)`. The debug hunt stepper
  calls `stepAnimalWorld` directly. The view never steps the sim.
- A system calls `beginSimStep(record)` first (previous := current), then writes
  the new current. The view draws `prev + (cur - prev) * alpha`, so it renders
  one tick behind the sim and never extrapolates.
- Collision runs after the walk of the same tick and pushes only the **current**
  position (`pushAnimalSim`), so the view blends from where the animal walked to
  where it ended up. `placeAt` and the start of a hold **snap** previous and
  current together, so a teleport is never blended across.
- Cosmetic motion stays per frame and is never read back by the sim: facing slerp
  toward `record.heading`, sleep squash and breath, the placeholder bob, the
  flier perch offset, ground-height easing, capture flourish.

### Held animals

Two things still place the animal from outside the walking systems, and the sim
leaves them alone while `record.held` is true (it still opens each tick with
`beginSimStep`, so a collision push on a held animal blends over one tick):

- **Fliers** (owls) are placed per frame by the owl presenter from the hunt
  sim's flight (`setFlightPose`); `held` is true from creation.
- **The paint reveal.** `beginCapture` calls `holdAnimalSim` at the point the
  animal is drawn: it stops there (and picks a fresh wander target when
  released) while the flourish plays; the end of the flourish releases it.

## Events

Emitted by the sim, consumed by the view, audio, journal and notifications.
Built: `caught`, `escaped` and `popped` (a flat `HuntEvent` list from the hunt sims, `src/game/animal-hunt.ts`) and `stage-up` / `stage-down` (the per-record `events` queue, `AnimalSimEvent`). The rest of the table is the target; `arrived-home`, `woke` / `fell-asleep` and `alarmed` / `calmed` stay polled flags (`atDoor`, `asleep`, `alarmed`) because their consumers already poll them.

| Event | Emitted when | Consumers |
| --- | --- | --- |
| `arrived-home` | home trip reaches the door | housing, view (hide) |
| `woke` / `fell-asleep` | sleep spot reached or released | view (squash), housing |
| `alarmed` / `calmed` | predator awareness changes | view (mixer rate) |
| `caught` | owl dive or snake strike lands | pop effect, journal |
| `popped` | prey removed from the farm | effects, progress |
| `escaped` | prey reaches a hide | view |
| `captured` | capture flourish should start | not emitted: the `stage-up` to a resident rung is the trigger (see slice 4) |
| `stage-up` / `stage-down` | ladder moves | view (appearance, heart eyes), journal |
| `sold` | sale confirmed | effects, economy |

Events are plain `{ type, animalId, ...payload }` objects appended to a per-tick
list that the frame drains once.

## Migration plan

Each slice is shippable on its own and changes no gameplay. Order matters: a
slice may rely on the previous one, never on a later one.

The notes under slices 2 to 4 say how each slice landed. They mention pieces of
the interim adapter (`viewDrivesPosition`, the per-frame collision pass,
`nudge`); slice 5 removed all of them.

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

### Slice 3 (done): owl and snake hunts

Landed as `src/game/animal-hunt.ts` (`createSnakeSim`, `createOwlSim`), the
`pursuit` and `alarmed` fields on `AnimalSimRecord`, `stepPursuit` in
`animal-routes.ts`, and `src/scene/owl-hunt.ts` shrunk to a presenter. What
differs from the plan below:

- Hunter state is the existing pure state machines (`OwlFlight`,
  `GroundHunter`), held in the hunt sims keyed by animal id, not fields on the
  record. They are stepped on the tick against the records' positions, after
  walking and collision (`stepAnimalWorld` in `main.ts`), and they write the
  steering **into the records**: a snake's `pursuit`, a frozen mouse's
  `pursuit` with scale 0, a stalked chicken's `alarmed`.
- Pursuit and alarm are sim state: `viewDrivesPosition()` lost its `pursuit`
  clause, `setPursuit` / `setAlarmed` on the view are commands that write the
  record (visitors walking across the meadow still use them), and the view reads
  `record.pursuit` / `record.alarmed` to pick the turn rate, clip fade and mixer
  speed.
- The strike die is seeded per snake (`seed ^ hash(instanceId)`), so a hunt
  replays. It used to be `Math.random`.
- Events: `caught` (+ `popped`, cause `caught`) when an owl's dive or a snake's
  winning lunge lands, `escaped` when the die lets the prey off, `popped` (cause
  `deflated`) when an owl runs out of helium. `playHuntEvents` in
  `scene/predation.ts` turns them into the ledger, the notice, the pop effect and
  the mouse's sprint home. The sim does not call an effect.
- Owls still reach the view through `FlightPose` / `setFlightPose`. The
  presenter blends the last two ticks of the flight by the clock's alpha (never
  from "away" into view), eases the facing and draws the shadow, per frame.
- Hunts pause while the menu or the sale panel is open, as before: the sim tick
  skips `tickHunts` then.
- The harness hunt stepper (`stepHunt`) ticks `stepAnimalWorld` at the sim rate;
  its `secondsPerStep` argument no longer applies.
- `scene/snake-hunt.ts` is gone; its logic is `createSnakeSim`.

Original plan:

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

Progress so far (in landing order):

- **Sleep (done).** `AnimalSimRecord.sleepSpot` / `asleep`, `stepSleep` in
  `animal-routes.ts`. `tickSim` now orders its walks home trip, pursuit, bed,
  then (free animals only) the visit cooldown, gate route and wander, which is
  the order the per-frame update had; the cooldown no longer counts down while
  an animal is on a home trip or a pursuit, as before slice 3. The view keeps
  the crouch squash and breath (`applySleepPose`) and picks the clip, mixer
  speed and the slow turn to the bed heading from `record.motion === 'sleep'`.
  `setAnimation` only mirrors into `record.motion` while the view still moves
  the animal.

Plan:

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

### Slice 5 (done): delete the old paths

- Gone from `balloon-animal.ts`: `viewDrivesPosition`, `adoptViewPosition`,
  `positionOwnedByView`, the `update(delta)` fallback tick (`update` takes the
  alpha), the `setAnimation` mirroring into `record.motion`, `nudge` and
  `simDriven`, the per-frame collision pass (`collideAnimalsFrame`, the harness's
  `collideAnimals`), `scene/snake-hunt.ts` (slice 3) and the dead `wandering`
  option and romance hooks (`setRomancing`, `isRomancing`: nothing had called
  them since breeding moved indoors).
- The crowd fixtures now tick in the sim world like every other animal, so
  collision needs one pass, on the tick.
- `shiftAnimalSim` (previous and current together) went with `nudge`; the sim
  API is `pushAnimalSim`, `snapAnimalSim` and `holdAnimalSim`.
- What the view still does per frame: blend position, turn toward `record.heading`
  (the turn rate follows pursuit and sleep), choose the clip and mixer speed from
  `record.motion` / `pursuit` / `alarmed` / `asleep`, ease ground height, breathe
  and squash a sleeper, run the capture flourish, play `stage-up` / `stage-down`.

## Testing

- Sim files are tested in node: `tests/animal-sim.test.mjs` replays a seeded
  wander, checks the leash and fence, the alarm speed, the infinite-pause hold,
  and the interpolation maths, including a 60 Hz display over a 15 Hz walk.
- Each later slice adds a replay test: seed, N ticks, assert the event list and
  final positions. `tests/animal-hunt.test.mjs` does it for the snake (seeded die,
  caught / escaped / popped, frozen prey, speed bounds) and the owl (dive and
  catch, panicked prey, helium pop, blend continuity), plus 15 Hz against 60 Hz
  parity checks on the first catch and the lunge time.
- `tests/animal-routes.test.mjs` covers the home trip, the sprint, the gate route,
  the visit cooldown and the walk to bed (seeded replay, speed bounds, a nudged
  sleeper getting up); `tests/animal-residency.test.mjs` the settle, the dwell
  and its reset, the margin, demotions and a seeded climb from the tents;
  `tests/animal-collision.test.mjs` adds no-tunnelling and no-jitter checks for
  collision on the 15 Hz tick (a dash through a thin wall, walking into a wall
  every tick, two animals meeting, a seeded wanderer among houses).
- In the game: `?gardenDebug=1&scenario=...` and `scripts/screenshot.mjs`; the
  Performance workflow runs on every PR.
