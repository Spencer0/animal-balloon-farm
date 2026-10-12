# Game Vision

**Animal Balloon Farm is charming, fun and about building first, with depth
later.** The core loop never changes: tend the garden and care for what lives
in it. Everything else (economy, husbandry, predators, harmony, myth) arrives
one chapter at a time, roughly when the player starts to tire of the last
one. Each new system has small effects from the start, but its interface and
its sharp edges only show up when its chapter opens.

## Principles

1. **Garden first.** The first minutes are about planting things and
   watching them grow. No meters, no economy, no threat.
2. **A system runs quietly before it is introduced.** Animals eat from the
   first day and herds level off at their food. But nobody starves, nothing
   asks to be collected, and no score is shown until its chapter opens. A
   player never meets a punishment for a rule they haven't been taught.
3. **Introduce, then teach, then deepen.** Each chapter opens with a short
   cutscene and a letter from Pip, adds a journal chapter, and usually a shop
   tab. Later chapters also deepen earlier systems: more plants, more terrain
   tools, more species.
4. **Tradeoffs, not chores.** The interesting decisions are:
   - **Terrain:** dirt for moles, lawn for cows, ponds for ducks, meadow for mice.
   - **Garden size:** land deeds cost coins, and every square meter is spoken for.
   - **Feeding:** grow food, or buy feed at a loss.
   - **Harmony:** variety and balance against the big, easy herd.
5. **Reference lives in the journal.** Cards and the HUD say how something
   is doing. The journal says how it works.
6. **Original and cozy.** Balloon animals, a travelling carnival, Pip's
   pop-up shop. No copied names, art or text.

## The chapters

Chapter state lives in `src/game/farm-chapters.ts` (pure and tested). Each
chapter has an *opens when* rule. The rule is a mastery or saturation signal
the farm already measures, with a calendar day as a fallback so nobody gets
stuck. When a chapter opens, the game plays its cutscene and Pip's letter and
flips its flags.

### 1. The Garden: plants
- **Start:** bare dirt, the seed box and a few starter seeds. No grass seeder
  yet.
- **Visitors:** dirt and plant lovers only, like the mole (who wants bare
  earth) and later flower-seekers.
- **Systems on:** planting, watering, growing, selling plants, the plant
  overhaul (to be designed: more varieties, care, cross-pollinated colours).
- **Ends when:** the garden has **10 grown plants**.

### 2. The Lay of the Land: terrain
- **Unlocks:** the grass seeder (short lawn) with its cutscene, then the
  shovel and water bucket as terraforming tools. More terrain tools come
  later: meadow pack, snower, and others to come.
- **Visitors:** grazers and the creatures of each terrain: cows and sheep on
  lawn, ducks on ponds, mice in meadow.
- **Ends when:** there is enough grown lawn to draw grazers (**cow-sized
  pasture: about 15 m²**) and the first grazer has moved in.

### 3. Animal Care: food and goods
- **Unlocks:** the Hunger meter on the animal card, hunger bubbles, Pip's
  **Feed** tab, goods in houses (milk, eggs, wool) with **Collect**, house
  goods badges, the journal's Diet & goods pages.
- **Systems on:** goods production, a visible larder. Starvation is still
  gentle: no deflation yet.
- **Ends when:** the player has **sold goods worth 100 coins** in total.
  Farmers' market orders can stand in later (see below).

### 4. Husbandry: families and predators
- **Unlocks:** starvation (helium loss for long hunger), breeding pressure
  made visible ("the barn feels crowded"), the Larder panel, predators: owls
  for chickens, snakes for mice.
- **Systems on:** the hunger ladder's sharp end, predator appetites (a fed
  hunter leaves the flock be).
- **Later:** hybrid husbandry, where two species that love the farm can
  raise a hybrid (a goose and a pig make a flying pig).
- **Ends when:** **a predator has become a resident.**

### 5. Ecological Harmony
- **Unlocks:** the Harmony chip and score, the journal's Food web chapter,
  the harmony-gated visitors.
- **Systems on:** Harmony (variety, balance, fed, predator links).
- **Ends when:** **Harmony reaches 70 with at least two predator and prey
  links** on the farm.

### 6. Mythical
- **Unlocks:** the starhorn and star gems, the Treasures tab, and later more
  exquisite, expensive, hard-won creatures.
- **Systems on:** gems, treasures, mythic conditions that combine everything
  above.

## Systems that grow throughout

- **Plants:** new varieties in every chapter. Each unlock gives a new seed
  and a reason to plant it: food for a new animal, a market order, a harmony
  bonus.
- **Terrain editors:** seeder, shovel and bucket at the start of Chapter 2,
  then the meadow pack, snower and future tools (path stones, hedges, a
  river cutter).
- **Species:** each chapter widens the carnival's roster.
- **Hybridization (Husbandry and later):** two loving species of compatible
  houses can have a hybrid with its own diet, goods and look.

## Bonus layers

- **Calendar RNG.** The calendar already has weekdays and months, and the
  carnival already visits on Sundays. Add day-of-week and seasonal
  visitors, market days, and festival nights.
- **Random events, good and bad.** Calm ones first:
  - Good: a rain shower (plants and grass grow faster), a travelling
    trader, a bumper crop, a lost balloon drifts in.
  - Bad: a windy day blows a balloon off-farm, a heatwave dries the pond,
    a fox raid.

  Events are pure data with a weight per chapter, so early chapters only
  roll gentle ones.
- **Farmers' market orders.** "The bakery needs 6 eggs by Friday." Orders
  give coins, points and sometimes seeds, and can count toward a chapter's
  *ends when* rule.

## How it is built

| Piece | Where |
| --- | --- |
| Chapter list, triggers, flags, save state | `src/game/farm-chapters.ts`, `tests/farm-chapters.test.mjs` |
| Food web (diets, hunger, goods, larders) | `src/game/animal-diet.ts`, `docs/FOOD_WEB.md` |
| Harmony | `src/game/harmony.ts` |
| Chapter cutscenes | `CUTSCENE_PIPELINE.md` (chapter films reuse the cutscene kit) |
| Chapter letters | Pip's notification letters (`src/ui/notification-panel.ts`) |

Every system checks its chapter flag (`chapters.flags()`) rather than a
chapter number, so chapters can be reordered or split without touching the
systems. A save from before chapters existed opens every chapter whose
system it already uses, so nothing disappears on load.
