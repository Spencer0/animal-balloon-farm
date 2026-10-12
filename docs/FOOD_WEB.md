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
   **star gems**, the currency for end-game treasures.

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

## Harmony

`src/game/harmony.ts`: 0 to 100, from variety (35), balance between species
(25, Pielou evenness), the share of residents fed (30), and predator/prey
links living on the farm (10). Forty cows on a lawn for ten scores worse than
a dozen species that are all fed.

## Where it lives

| What | Where |
| --- | --- |
| Diets, yields, hunger ladder, goods, larders | `src/game/animal-diet.ts` |
| Eating, breeding brake, starvation, goods in houses, save | `src/game/animal-life.ts` |
| Harmony | `src/game/harmony.ts` |
| Fed predators stop hunting, a catch is a meal | `src/scene/predation.ts`, `src/game/animal-hunt.ts` |
| Hunger notices | `src/scene/farm-lifecycle.ts` |
| Tests | `tests/animal-diet.test.mjs` |

## In the Farm Journal

Every discovered species page has a "Diet & goods" block (what it eats in
order, appetite, what it makes and where, who hunts it, and a live line for
the player's own residents). A "Food web" chapter explains the hunger ladder
and Harmony, shows which discovered species eat each food and who hunts whom,
and lists every good with its maker and coin value. Undiscovered species show
as "???". The copy is built from `DIETS`, `PRODUCE`, `GOODS` and `PREY_OF` in
`src/game/journal-food-web.ts` (tested in `tests/journal-food-web.test.mjs`),
so a new species with a diet appears with no journal edit.
