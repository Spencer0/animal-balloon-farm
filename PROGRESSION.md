# Progression: coins, farmer level, and what the shop sells

Two numbers decide what a player can have.

- **Coins** buy things at Pip's shop. They come from selling plants and animals.
- **Farmer level** decides what Pip will sell. It comes from progression points
  (visits, residents, litters, grown plants, accomplishments) and is shown as
  "Farmer Level N" on the progress card and in the Player panel. The first level
  is at 50 points and each one after is another 50 (`PROGRESSION_CONFIG`).

Land is no longer a free reward for points. Farmer level only *opens* the next
Land Deed; the player still pays for it.

Pip's shop building itself appears at farmer level 2 (`SHOP_UNLOCK_LEVEL` in
`src/game/shop-construction.ts`), the same level its first upgrades unlock, and does not wait on land.

## Where the rules live

`src/game/tool-unlocks.ts` is pure (no Three.js, no DOM) and is tested in
`tests/tool-unlocks.test.mjs`.

| What | Where | Rule |
| --- | --- | --- |
| Tall Grass Seed Pack | `UPGRADE_CATALOG['tall-grass']` | 40 coins, farmer level 2 on screen (`unlockLevel` 1). One only. |
| Land Deed | `UPGRADE_CATALOG['land-deed']` | `50 + 25 * owned` coins; deed N needs farmer level N+1 on screen. 15 in all. |
| Props | `PROP_UNLOCK_LEVEL` | Fence at the start, coop and barn at level 2, statue and fountain at 3, oak at 4. |

`unlockLevel` values are zero-based; the screen shows them plus one.

To add a tool unlock: add an id to `UpgradeId`, an entry to `UPGRADE_CATALOG` and
`UPGRADE_ORDER`, give `buyUpgrade` in `src/main.ts` its effect, and add its icon to
`upgradeIcon` in `src/ui/shop-dom.ts`. The Upgrades tab and the level cards in the
Player panel pick it up from the catalog.

## Star gems and treasures

A second currency for the end game. **Star gems** are made only by the starhorn, a unique
animal that comes to a farm in harmony (see `docs/FOOD_WEB.md`), a gem a day when it is well
fed. They buy **treasures** on the shop's Treasures tab (it appears with the first gem):
no farmer level gates them, and each is bought once.

| Treasure | Gems | Effect |
| --- | --- | --- |
| Helium Pump | 3 | Starving balloons leak helium at half speed |
| Clover Charm | 5 | Every grown food +25% |
| Rain Barrel | 8 | Grass grows +50% |
| Golden Pail | 6 | Goods are worth double when collected |

The rules live in `src/game/treasures.ts`, not in the coin upgrade catalog, so the
Farmer Level cards never list them. Gems and treasures are saved (`gems`, `treasures`
in the save game; older saves load with none).

## Grass packs

The grass seeder holds one of two packs. A blue sack sows short grass that stops
growing at `SHORT_GRASS_MAX_HEIGHT`; a green sack sows tall grass up to
`TALL_GRASS_MAX_HEIGHT`. Without the upgrade only the blue pack exists. With it,
**E** swaps packs while the seed bag is out.

- Short grass counts as grass for every animal condition. Tall grass is the same
  paint with taller blades.
- Ground cover (clover, dandelions) can only be planted in short grass
  (`PlantSurface.tallGrass`, failure `tall-grass`), and the tall pack never lifts
  blades under a planted patch.
- A blade taller than `SHORT_GRASS_CEILING` counts as meadow.

## Debug harness

With `?gardenDebug=1`: `upgrades()`, `buyUpgrade(id)`, `awardPoints(n)`,
`swapPack()` and `stepTools(seconds)`. For gems: `grantGems(n)`, `buyTreasure(id)`,
`treasures()`, `setHarmony(n)` and `spawnStarhorn()`. `buy(id)` and `grantCoins(n)` deliberately
skip the shop's gates.
