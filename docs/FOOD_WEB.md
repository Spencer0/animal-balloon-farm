# The food web

Every animal eats. The farm grows food, the animals eat it down, and a herd
levels off at what its food can carry. This replaces "fill every barn" as the
shape of the late game: a good farm is a *balanced* one, and Harmony scores it.

## The loop

1. **The farm grows meals.** Each food is one rate times one thing the farm
   already measures (`FOOD_YIELDS` in `src/game/animal-diet.ts`): grass from
   grown lawn, pond weed from pond water and lily pads, seeds and nectar from
   grown flowers, scraps from garbage cans, dumpsters and spoiled goods, worms
   from bare dirt. Each food has a larder that regrows toward
   `LARDER_DAYS` of its supply.
2. **Residents eat, oldest first** (`servingOrder`). A shortage lands on the
   newest mouths, not evenly on everyone, so a herd that outgrows its food
   loses its surplus rather than all starving together.
3. **The hunger ladder** (`hungerLevel`):

   | Rung | Fullness | Effect |
   | --- | --- | --- |
   | Full | ≥ 0.7 | Breeds, makes goods at full pace |
   | Fed | ≥ 0.4 | Breeds, makes goods at half pace |
   | Hungry | ≥ 0.12 | **No breeding for the whole species**, no goods |
   | Starving | < 0.12 | Loses helium; flat means it is gone |

   A belly empties in one in-game day (`BELLY_SECONDS`). Hungry stopping a
   species' breeding is what does most of the balancing; deflation is the
   backstop.
4. **Predators eat what they catch** (`CATCH_MEAL`). A fed resident predator
   does not hunt (`PREDATOR_HUNTS_BELOW`); a visitor always hunts, because it
   has to eat on the farm to call it home. A predator with nothing to catch
   starves like anyone else.
5. **Well-fed residents make goods** (`PRODUCE`) into their house: milk in the
   barn, eggs in the coop, truffles in the sty (only with an oak on the farm).
   A house holds `HOUSE_GOODS_CAPACITY`; the rest spoils into **scraps**, which
   is what pigs and raccoons eat. Goods are cheap on purpose.
6. **Feed sacks** are bought food. Every farm animal falls back on feed when
   its field runs short. Feed costs more than the goods it keeps coming, so it
   carries a herd through a shortage but never prints money.
7. **The starhorn** comes only to a farm in harmony, eats nectar, and makes
   **star gems**, the currency for end-game treasures (see below).

## Diets

| Species | Eats (in order) | Appetite (meals/day) | Makes |
| --- | --- | --- | --- |
| Cow | grass, feed | 1.5 | milk |
| Sheep | grass, feed | 1 | wool |
| Goose | pond weed, grass, feed | 1 | down |
| Duck | pond weed, feed | 0.8 | duck eggs |
| Chicken | seeds, feed | 0.6 | eggs |
| Pig | scraps, feed | 1.2 | truffles (needs an oak) |
| Frog | pond weed | 0.4 | |
| Mouse | meadow | 0.4 | |
| Rat | scraps, meadow | 0.5 | |
| Raccoon | scraps | 1 | shiny trinkets |
| Mole | worms | 0.6 | |
| Owl, snake | prey | 1 | |
| Starhorn | nectar | 1.2 | star gems |
| Mountain lion | nothing between raids (it gorges on a crowded herd) | | |

**The mountain lion** (`src/game/apex-raid.ts`) is the check on a runaway herd: any species past six
residents brings it, and it eats that species to the last, indoors too. See *Apex predators* in
`ANIMAL_PIPELINE.md`.

## Harmony

`src/game/harmony.ts`: 0 to 100, from variety (40), balance between species
(20, Pielou evenness), the share of residents fed (25), and predator/prey
links living on the farm (15). Balance and fed count in full only from five
resident species (`HARMONY_FULL_CARE`), so a few well-fed species cannot
reach the starhorn's bar. Forty cows on a lawn for ten scores worse than
a dozen species that are all fed.

## The starhorn and star gems

The starhorn is the end-game goal: a unique pearly lilac balloon pony (horn with
a star tip, rainbow cloud mane, a star on its flank). Its whole ladder is the
farm's **Harmony** (a `harmony` condition, read from `FarmState.harmony`, which
`src/scene/farm-measure.ts` fills from `measureHarmony` over the adult residents):

| Rung | Needs |
| --- | --- |
| Appears at the carnival (`DISCOVERY`) | Harmony 70 |
| Visits the farm | Harmony 75 |
| Calls the farm home | Harmony 80 and 6 grown flowers (`flowerCount`: dandelion, poppy, clover) |
| Loves the farm | Harmony 90 |

- It **holds its residency** (`holdsResidency`): if Harmony drops below 80 or the
  flowers go, it loses helium and deflates like the mole does.
- It is **unique and has no house**. `houseFor('starhorn')` is `null`, so it never
  breeds, never goes indoors, and `isUniqueSpecies` keeps it out of the repeat-guest
  pool. Its last rung means a glow, not young. A houseless species is fine
  everywhere that asks `houseFor`; `tests/animal-housing.test.mjs` lists the one exception.
- It eats `blooms` (nectar, 0.35 meals a day per grown flower) and, when full, makes
  one **star gem** a day (half when merely fed). A gem has no house to be stored in:
  the `produce` event has no `houseId`, and `main.ts`'s `onProduce` credits the gem purse,
  shows "Twinkle found a star gem", and plays a small burst where it stands.
- **Star gems** are a second wallet (`createWallet`, saved as `gems` in the save game;
  old saves load with 0). They show beside the coins in the shop and the shed.

## Treasures

`src/game/treasures.ts` (pure, `tests/treasures.test.mjs`). One of each, bought with
gems on the shop's Treasures tab (it appears with the first gem). `treasureEffects(owned)`
returns the multipliers; `applyTreasureEffects()` in `main.ts` pushes them into the sim at load
and on purchase.

| Treasure | Gems | Effect |
| --- | --- | --- |
| Helium Pump | 3 | Starving balloons leak helium at half speed (`AnimalLife.setStarveLeakFactor`). A farm that no longer suits a resident still leaks at full speed. |
| Clover Charm | 5 | Every grown food +25% (`setFoodBoosts({ all: 1.25 })`) |
| Rain Barrel | 8 | Grass grows +50% (`setFoodBoosts({ grass: 1.5 })`, on top of the charm) |
| Golden Pail | 6 | Goods are worth double when collected: `treasureEffects(...).goodsValueMultiplier` (2, else 1) |

The house card's Collect (`onCollect` in `main.ts`) multiplies the coins by
`treasureEffects(treasures.owned()).goodsValueMultiplier`.

## Where it lives

| What | Where |
| --- | --- |
| Diets, yields, hunger ladder, goods, larders | `src/game/animal-diet.ts` |
| Eating, breeding brake, starvation, goods in houses, save | `src/game/animal-life.ts` |
| Harmony | `src/game/harmony.ts` |
| Starhorn ladder, `harmony` and `flowerCount` conditions | `src/game/animal-conditions.ts`, `src/game/farm-state.ts` |
| Treasures and their effects | `src/game/treasures.ts` |
| Starhorn model | `art/blender/balloon_starhorn.py` |
| Fed predators stop hunting, a catch is a meal | `src/scene/predation.ts`, `src/game/animal-hunt.ts` |
| Hunger notices | `src/scene/farm-lifecycle.ts` |
| Tests | `tests/animal-diet.test.mjs`, `tests/starhorn.test.mjs`, `tests/treasures.test.mjs` |

Debug harness (`?gardenDebug=1`): `grantGems(n)`, `buyTreasure(id)`, `treasures()`, `setHarmony(n|null)`,
`spawnStarhorn()` (a resident starhorn with Harmony pinned high and its residency held).
The scenario `starhorn/gem-farm` lands on a farm with the starhorn and gems.

## In the Farm Journal

Every discovered species page has a "Diet & goods" block (what it eats in
order, appetite, what it makes and where, who hunts it, and a live line for
the player's own residents). A "Food web" chapter explains the hunger ladder
and Harmony, shows which discovered species eat each food and who hunts whom,
and lists every good with its maker and coin value. Undiscovered species show
as "???". The copy is built from `DIETS`, `PRODUCE`, `GOODS` and `PREY_OF` in
`src/game/journal-food-web.ts` (tested in `tests/journal-food-web.test.mjs`),
so a new species with a diet appears with no journal edit.
