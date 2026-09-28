# Animal Balloon Farm — Game Design & Technical Spec

**Status:** Pre-production direction; ready for prototype planning  
**Genre:** Cozy 3D garden/ecosystem sandbox with light management  
**Target:** Desktop browser, mouse/keyboard first; gamepad-friendly later  
**Rendering:** Three.js, full-screen 3D game presentation  
**Project rule:** No Vite and no HTML-based game UI. Menus, HUD, journal, and tools should be drawn in the game scene (Three.js), not implemented as DOM overlays. `index.html` is a minimal boot shell only.

## 1. High concept

Create and tend a joyful animal garden that feels like a **whimsical traveling carnival** has settled on a farm. Planting and arranging the habitat attracts curious wild animals; caring for their needs turns visitors into residents. Build habitats and little homes, discover food preferences and color forms, help animal pairs raise young, and gradually transform a bare plot into a lively carnival farm.

The inspiration is Viva Piñata's *garden as a systemic toy*: the player's choices change which creatures appear, what they eat, whether they stay, and how the garden develops. Animal Balloon Farm must have its own setting, terminology, species, visual identity, characters, interface, progression, and original expression. Borrow broad genre patterns, not Viva Piñata names, art, sounds, text, creature designs, or exact content.

## 2. Product principles

1. **Garden first:** Planting, landscaping, watching animal behavior, and making a place feel personal should be rewarding even before a goal is completed.
2. **Readable cause and effect:** The journal and in-world reactions hint at what would attract a species and clearly confirm when a condition is met.
3. **A toy, not a chore list:** Gardening should invite experiments; failure is gentle, recoverable, and teaches the system.
4. **A garden that performs:** Carnival accents—bunting, little midway stalls, parade lights, calliope-inspired color, balloons, and festive props—make the world feel celebratory without turning it into a minigame collection.
5. **Spectacle from simulation:** The garden should feel alive through readable routines, interactions, weather, and time-of-day changes, not merely through a crowded static scene.
6. **Originality:** Animal Balloon Farm is not a Zoo Patrol sequel and not a Viva Piñata remake. Reuse only transferable engineering/art workflow learnings.

## 3. Core player fantasy

“I turned an empty patch of land into a one-of-a-kind, thriving animal carnival, and every little visitor has a story.”

## 4. Core loop

1. **Prepare space:** Select a tool, clear obstacles, till or shape the ground, and plan paths, lawns, ponds, beds, and cozy corners.
2. **Plant and decorate:** Buy or find seeds, plant in suitable terrain, water and nurture growth, harvest produce, and add carnival-farm decorations.
3. **Attract visitors:** Plants, terrain, food, weather, time, decorations, and resident species create habitat conditions that invite discoverable wild animals.
4. **Observe and fulfill:** Watch a visitor explore. Learn its needs from behavior and journal clues; provide food, habitat, company, and safe space to persuade it to stay.
5. **Care and develop:** Keep residents fed, comfortable, healthy, and unblocked. Different species may coexist, compete, play, forage, or need separation.
6. **Breed and discover:** Once two compatible residents are content and have a species habitat/home, initiate courtship. A short optional skill interaction leads to courtship, an egg/nest, a baby, and eventually a grown resident. Discover color variations and rare forms through playful experiments.
7. **Earn and reinvest:** Sell surplus harvest or craftable goods, earn farm/carnival reputation and experience, and unlock seeds, tools, decorations, homes, animal care options, and more garden space.
8. **Set a new personal goal:** Complete a journal clue, welcome a new animal, raise a family, decorate a themed nook, or optimize a small produce area—then let the garden surprise the player again.

This is an inspiration-derived loop, not a claim that every system or mechanic from Viva Piñata must be copied. The prototype should favor fewer clear interacting systems over a huge checklist.

## 5. Systems and mechanics

### 5.1 Garden and terrain

- One persistent, bounded starting plot with room to expand later.
- A legible top-down/isometric-leaning 3D camera: high enough to place accurately; low enough for expressive creature silhouettes and carnival dressing.
- Grid or soft-grid placement with visible previews, rotation, occupancy feedback, and undo/cancel affordance.
- Terrain types for MVP: ordinary soil, planted grass, shallow water/pond, and paths. Keep the simulation's canonical garden coordinate system independent from Three.js world units and screen projection.
- Clearing an obstacle is deliberate and yields a modest reward/material; removing decorations, plants, and homes should be reversible through a confirmation/undo where practical.
- Garden boundaries, building footprints, water, slopes, and plant spacing should be visible before commitment.

### 5.2 Plants

Plants are both garden-making tools and ecological content. For the MVP: starter grass/groundcover, one flower, one crop/fruit plant, and one decorative shrub/tree.

Each plant definition can describe:

- Valid substrate and footprint.
- Growth phases and approximate growth duration.
- Water/moisture need and healthy/stressed states.
- Optional fertilizer/soil response; avoid making precise watering a punishing maintenance requirement.
- Harvestable produce, value, and regrowth (if applicable).
- Attraction tags and food tags for animal requirements.
- Season/time-of-day appearance hooks, reserved for later.

Allow fertilization and water as satisfying, low-friction actions. Player-readable visual states (droop, blossoms, fruit, happy sparkle) should communicate needs; never rely only on tiny meters. Favor an adjustable/single-action watering interaction or gentle moisture range over pixel-perfect water balancing.

### 5.3 Animals

Use a small original starter roster, provisionally **3–4 species**; names and designs are undecided. Each species should be a unique, friendly balloon-craft/farm-animal hybrid, not a recognizable Viva Piñata analogue.

A species data definition should support:

- **Appears:** garden/habitat conditions that make a wild visitor eligible.
- **Visits:** a simple invitation/entry condition (e.g. a food sample, nearby plant, or safe area).
- **Resides:** a small set of observable requirements, such as a plant count, preferred food eaten, habitat area, home, or compatible companion.
- **Courtship:** pair eligibility, comfort/food/home needs, and offspring cooldown/capacity.
- Needs/behavior: hunger, rest, comfort, curiosity, health, preferred foods, simple daily routine.
- Compatibility/avoidance tags, without allowing unfair sudden losses.
- Variant experiments and cosmetic traits.
- Growth/offspring progression and a representative home/den.

For the first playable, encode explicit conditions as data and show them in a friendly journal. The player should be able to see: **Unknown clue → discovered clue → requirement met → action/result**. Never hide a mandatory condition behind unexplained randomness.

### 5.4 Animal AI and relationships

MVP behaviors: wander within reachable garden, seek food/rest, approach points of interest, react to nearby player actions, and perform one or two charming species interactions. Use lightweight steering/state machines rather than a general-purpose AI framework.

Possible relationship verbs: sniff, follow, nap together, play, share food, court, avoid. Population and pathing limits should be explicit. If the garden is crowded or animals get stuck, warn the player and offer an easy fix; don't silently punish them.

### 5.5 Courtship, eggs, and young

- The player initiates courtship once a pair's conditions are met; animals do not silently breed beyond intended population limits.
- A short, skippable rhythm/path/gesture interaction may improve a celebration/reward, but it must not block accessibility or make breeding tedious.
- Courtship success produces a visual celebration and nest/egg; hatching and growing up happen on a readable short timeline.
- Ensure the offspring inherits identity and optional cosmetic traits without requiring genealogy UI for MVP.
- No reproduction requiring precise QTEs. Provide an assist/skip option and preserve the outcome.

### 5.6 Economy and progression

- Sell spare produce and crafted goods at a carnival farm stand; use earnings for seeds, decor, homes, and tool upgrades.
- Experience/reputation comes from first-time discoveries: new plant growth, first species visit/residency, first courtship/young, variants, and new garden features.
- Levels unlock a small number of useful options and eventually garden expansion. Do not overfill early play with currencies, shops, or unlock trees.
- A forgiving starter grant and early tutorial ensure players can always plant, water, and attract the first animal.

### 5.7 Carnival elements

Carnival is primarily a visual/worldbuilding layer in the first slice:

- Striped awnings, ticket bunting, pennants, lanterns, wooden stalls, painted planters, parade arches, carousel-horse silhouettes, prize ribbons, and decorative balloon bunches.
- In-world signboards/market stands can later serve as shops, journals, or event points, but all interaction UI remains in Three.js.
- Potential future seasonal events: harvest fair, lantern night, balloon parade, seed swap. Do not implement as MVP systems.

## 6. Menus, camera, and interaction

### Main menu

Exactly two main-menu options, per clarified direction:

1. **Continue** — load the most recent saved garden. If no save exists, offer a clear new-garden path rather than a broken/disabled experience.
2. **Options** — opens the options board.

### Options

- **Asset Viewer** — opens an in-game Three.js gallery for quickly inspecting models/materials/animations. Include asset-category filters, an orbit camera, grid/stage, reset-view, simple lighting presets, and asset name/metadata. This is a developer/content iteration utility, not a DOM page and not necessarily exposed in the shipped main menu.
- Basic audio, camera speed, input, and accessibility settings may be added later.

### Pause

Pause is a gameplay overlay/scene with **Resume**, **Save**, **Options**, and **Return to Main Menu**. Thus “Resume” belongs to the pause flow, not the two-button main menu. Save confirmation should be clear; returning to menu must not discard unsaved changes silently.

### Input direction

- Mouse-first: click/drag to navigate menus and place tools/items; hover/selection highlights targetable objects; right-click/Escape cancels or backs out.
- WASD/arrow keys pan the garden; wheel zooms; optional drag rotates/orbits within a safe range.
- Shortcuts for primary tools, with visible icon+label selection.
- Input must work on the canvas; don't rely on HTML buttons, CSS HUD, or DOM pointer layers for game interactions. Browser fullscreen/context-menu considerations belong in later polish.

## 7. Persistence

- Save a versioned garden document: terrain/plot layout, placed plants/props/homes, animal identities/positions/needs/ages, discovered journal entries, progression/economy, time, and player settings.
- Autosave at safe checkpoints and provide a visible save indicator. Use schema version + migration strategy from the start.
- Corrupt/unknown saves should fail safely with recovery/backup, not permanently overwrite the last valid save.
- Start with local browser persistence (IndexedDB preferred for larger saves; localStorage is acceptable for a tiny prototype). No account/server requirement.

## 8. Visual and audio direction

- **World:** miniature, tactile farm-garden built like a traveling carnival's storybook set; warm daylight, lush plant masses, painted wood, canvas, brass/gold accents, confetti colors used sparingly.
- **Animals:** readable silhouettes, soft handmade materials, expressive faces, delicate balloon/candy-like motifs. Distinct body shapes and movement styles; avoid generic spherical placeholders becoming the final identity.
- **Camera:** stable three-quarter/isometric garden view, orthographic or mild perspective to be evaluated during blockout. Keep placement projection stable and test screen↔garden conversion.
- **UI:** carved/painted 3D signboards, pinned journal cards, diegetic shop stall, tool tray integrated into the game composition. Avoid fake HTML UI; text may use Three.js canvas textures or geometry where legible.
- **Feedback:** soft bounces, tiny chimes, seedling pops, pinwheel/bunting motion, sparkles, animal calls, cozy layered ambience. All important feedback also needs a visual/text equivalent and volume controls.

## 9. Technical requirements and repo conventions

- Three.js with `WebGLRenderer` is the sole scene/game rendering path. Do not add Vite or a second rendering framework.
- Minimal static `index.html` is only the browser boot document. Menus, HUD, controls, tooltips, and asset gallery are game-rendered, not HTML overlays.
- Prefer plain TypeScript and the minimal no-Vite esbuild setup: `scripts/dev.mjs` watches/bundles and serves `dist/` locally; `scripts/build.mjs` creates production output. Serve through local HTTP because browser modules and asset fetches need an HTTP origin.
- Pin Three.js and its TypeScript types to compatible versions; official Three.js addons must match the core version. The scaffold pins Three.js 0.186.1, types 0.186.0, and esbuild 0.28.2. Reconfirm compatibility at install time; research snapshot (Sep 2026) found Three.js r186.
- Keep simulation deterministic and independent from rendering. Separate `game/`, `render/three/`, `input/`, `ui-3d/`, `assets/`, and `persistence/` responsibilities without premature subsystems.
- Store garden coordinates in canonical units; define explicit garden↔world↔screen transforms and unit-test forward/inverse placement.
- Data-drive species, plants, and unlock requirements; do not scatter species rules through render code.
- Model prototype assets can begin as procedural primitives, then be replaced incrementally by reviewed GLB files. Treat the Asset Viewer as the rapid review loop for meshes, scale, pivot, materials, and animation.
- Provide deterministic seeded test gardens/scenarios; preserve the player's real save while using those.

## 10. MVP vertical slice (first playable)

**Goal:** Prove the garden feels appealing, understandable, and alive—not implement the whole game.

1. Full-screen Three.js boot, loading, two-option menu, and Options → Asset Viewer route.
2. One bounded carnival-farm plot, simple stable camera/pan/zoom, selection raycasting, and canonical-coordinate placement.
3. Three tools/actions: plant, water, and harvest/clear.
4. Four plant types: grass/groundcover, flower, fruit/crop, and decorative bush/tree; visible growth states.
5. Three original animal species with appear/visit/resident rules driven by plant/habitat/food conditions.
6. Basic animal idle/wander/seek/eat/rest behavior and one delightful inter-species or play interaction.
7. Species homes; two residents can court, produce an egg, and hatch a young animal.
8. One carnival stand; sell produce and buy a limited set of seeds/decor.
9. Journal/goal board, one progression milestone, save/load, a deterministic test garden, and one accessible help/hint surface.

**Explicitly out of MVP:** dozens of species, online sharing, multiplayer, procedural infinite land, complex combat/predation, deep crafting, elaborate NPC helper schedules, seasonal event calendar, multiple gardens, extensive story chapters, mobile adaptation, monetization.

## 11. Risks and design guardrails

- **Opaque requirements:** expose discovered clues and offer gentle hints; log why a visitor did/did not qualify during development.
- **Overwhelming simulation:** cap simultaneous needs and entities in the first garden; stagger notifications and avoid alert spam.
- **Tedium from watering/maintenance:** make care legible and forgiving; allow upgrades/automation later.
- **Placement frustration:** test mapping round-trips and pointer picking early; give clear invalid-placement previews and undo.
- **3D asset iteration slows gameplay:** make the Asset Viewer and a tiny representative asset set early; model/art quality follows proven scale and camera.
- **Performance:** instancing for repeated plants/props, simple LOD/material budgets, capped shadows, and explicit disposal of Three.js GPU resources.
- **IP drift:** no Viva Piñata-branded materials or one-to-one creature/system names/art; develop original writing and designs.
- **Build-tool conflict:** user's direction is explicitly no Vite; do not restore the archived Vite app or assume no-build means no local HTTP server.

## 12. Research basis and sources

The source material below informed the *high-level loop and interaction vocabulary*. It does not prescribe verbatim implementation; Animal Balloon Farm should be a new original work.

- [IGN — Early Days](https://www.ign.com/wikis/viva-pinata/Early_Days): garden restoration, shovel/cursor interaction, clearing debris, preparing soil, and early player learning.
- [IGN — Romancing](https://www.ign.com/wikis/viva-pinata/Romancing): species-specific residence/courtship conditions, directed animal interactions, homes, courtship, offspring, and color variants.
- [IGN — Gardening and Experience](https://www.ign.com/wikis/viva-pinata/Gardening_and_Experience): seeds, plant care, fertilizer, plant awards, and player freedom after early onboarding.
- [IGN — Advanced Strategies](https://www.ign.com/wikis/viva-pinata/Advanced_Strategies): happiness, player-directed care, discovery awards, and collection/progression cadence.
- [IGN — Money and Sours](https://www.ign.com/wikis/viva-pinata/Money_and_Sours): economy, selling produce/animals, disruptive visitors, garden separation, and useful vs. decorative objects.
- [PinataIsland.info — Frequently Asked Questions](https://pinataisland.info/viva/Frequently_Asked_Questions): visitor → resident distinction, environmental requirements, variants vs. evolutions, sickness, compatibility, care, and day/night FAQ.
- [PinataIsland.info — Helpers](https://pinataisland.info/viva/Helper): optional task helpers as later automation inspiration.
- [Common Sense Media — Viva Piñata review](https://www.commonsensemedia.org/game-reviews/viva-pinata-xbox-360): accessible summary of the ecosystem-simulation sandbox, consequences, and open-ended exploration.
- [Three.js manual](https://threejs.org/manual/): official orientation for Three.js scenes, assets, and browser rendering.

Research snapshot: September 2026. Guides describe specific original-game details that can differ in *Trouble in Paradise* or other entries; the design above intentionally generalizes them.

## 13. First build milestone

Before implementing broad systems, agree on a one-page moodboard and one garden camera blockout, then deliver a **playable garden postcard**: boot → Continue/Options → orbit/pan garden → place a plant → watch it grow → a clearly motivated animal visits. The Asset Viewer should load the same asset data used by the garden so iteration does not become a parallel pipeline.
