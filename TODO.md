# TODO

- Add evaporation of water / puddle logic
- Prop for seeder should be a bag of grass seed. Upgrades then make it a rolling tool for seed, then some farm equipment, for its three levels of speed. Shovel, and water behave the same way
- Seeder upgrade system: wire `setSeederLevel` (see `SEEDER_CONFIGS` in `src/scene/garden-tools.ts`) to shop/progression so players earn faster drag speeds

- Add raccoon as a basic nocturnal animal (night-only like the owl, but a ground walker; see NIGHT_ONLY_SPECIES in `src/game/animal-conditions.ts`)

## Bugs

- Plants: with a tool selected, choosing a plant in the shed causes a glitch where it can't be placed. Covers plant logic in general: watering, pruning, placing
- Visitors don't wander in and quickly out; they should stay for a shorter time, not linger
- Carnival spawning in is extremely glitchy
- The "pointer tool" and "default cursor" need an overview. Their behavior is unclear and should be reviewed as a whole
- Camera tool can be removed
- After the first cow came and got sold, no new cows entered the farm
- Chicken coop looks very ugly; needs a visual pass
- Shop icons are a bit wonky, and the text next to them is too
- Seed shouldn't start in the player's inventory; it should go into the shop instead
- The journal is out of sync with the recent changes to animal requirements
