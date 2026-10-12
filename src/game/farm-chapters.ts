/**
 * Chapters: the order the game's systems are introduced in (GAME_VISION.md).
 *
 * Pure, like the rest of `src/game/`. The farm is measured into a handful of
 * `ChapterSignals`; each chapter ends when its signal says the player has got
 * the hang of it (or by a calendar day, so nobody is stuck), and the next one
 * opens. Systems never ask "which chapter is it?": they ask `flags()`, so a
 * chapter can be reordered or split without touching them.
 */

export type ChapterId = 'garden' | 'land' | 'care' | 'husbandry' | 'harmony' | 'mythical'

export const CHAPTER_ORDER: readonly ChapterId[] = ['garden', 'land', 'care', 'husbandry', 'harmony', 'mythical']

/** What the farm reports for chapter triggers. All of it is already measured somewhere. */
export interface ChapterSignals {
  /** Grown plants in the garden, all species. */
  readonly grownPlants: number
  /** Square meters of grown lawn. */
  readonly lawnArea: number
  /** Resident species (stage 3+, adults). */
  readonly residentSpecies: ReadonlySet<string>
  /** Coins earned from collected goods, ever. */
  readonly goodsCoins: number
  readonly harmony: number
  /** Predator and prey pairs living on the farm. */
  readonly predatorLinks: number
  /** Whole days since the farm began. */
  readonly day: number
}

/** Switches a system reads. Off means the system is quiet or gentle, not absent. */
export interface ChapterFlags {
  /** The grass seeder (and with it, lawn) is in the farmer's hands. */
  readonly grassSeeder: boolean
  /** Hunger meter, bubbles and the journal's diet pages are shown. */
  readonly hungerShown: boolean
  /** Residents make goods into their houses; Collect and badges are shown. */
  readonly goods: boolean
  /** Pip sells feed sacks. */
  readonly feedShop: boolean
  /** A long-hungry balloon loses helium. Before this, hunger only stops breeding. */
  readonly starvation: boolean
  /** Owls, snakes and other hunters may be discovered. */
  readonly predators: boolean
  /** The Harmony chip, Larder and Food web chapter are shown. */
  readonly harmonyShown: boolean
  /** Mythic creatures (the starhorn), star gems and treasures. */
  readonly mythic: boolean
}

export interface ChapterDef {
  readonly id: ChapterId
  readonly number: number
  readonly title: string
  /** One line under the title card. */
  readonly tagline: string
  /** Pip's letter when the chapter opens. */
  readonly letter: string
  /** The goal shown while this chapter is the current one. */
  readonly goal: string
  /** True once the player has done what this chapter asks; the next one opens. */
  readonly endsWhen: (signals: ChapterSignals) => boolean
  /** Progress toward `endsWhen`, 0..1, for the HUD and journal. */
  readonly progress: (signals: ChapterSignals) => number
  /** The next chapter opens by this day regardless, so nobody is stuck. Absent: never by time. */
  readonly fallbackDay?: number
}

const GRAZERS = ['cow', 'sheep']
const PREDATORS = ['owl', 'snake']
const share = (value: number, target: number): number => Math.max(0, Math.min(1, value / target))

/** Chapter 1 ends at this many grown plants. */
export const GARDEN_PLANTS_GOAL = 10
/** Chapter 2 ends with this much lawn and a grazer living on it. */
export const LAND_LAWN_GOAL = 15
/** Chapter 3 ends once goods have earned this many coins. */
export const CARE_COINS_GOAL = 100
/** Chapter 5 ends at this Harmony with this many predator and prey links. */
export const HARMONY_GOAL = 70
export const HARMONY_LINKS_GOAL = 2

export const CHAPTERS: Readonly<Record<ChapterId, ChapterDef>> = {
  garden: {
    id: 'garden', number: 1, title: 'The Garden', tagline: 'Every farm starts with a seed.',
    letter: 'Welcome to your plot! Plant a few seeds from the shed and keep them watered. Something always comes to see a garden grow.',
    goal: `Grow ${GARDEN_PLANTS_GOAL} plants`,
    endsWhen: (s) => s.grownPlants >= GARDEN_PLANTS_GOAL,
    progress: (s) => share(s.grownPlants, GARDEN_PLANTS_GOAL),
    fallbackDay: 4,
  },
  land: {
    id: 'land', number: 2, title: 'The Lay of the Land', tagline: 'Grass, ponds and hills, by your hand.',
    letter: 'Your garden is the talk of the carnival! Here is a grass seeder: sow a lawn and the grazers will follow. Dig, raise and flood the ground to suit whoever you want to meet.',
    goal: `Sow ${LAND_LAWN_GOAL} m² of lawn and welcome a grazer`,
    endsWhen: (s) => s.lawnArea >= LAND_LAWN_GOAL && GRAZERS.some((species) => s.residentSpecies.has(species)),
    progress: (s) => (share(s.lawnArea, LAND_LAWN_GOAL) + (GRAZERS.some((species) => s.residentSpecies.has(species)) ? 1 : 0)) / 2,
    fallbackDay: 9,
  },
  care: {
    id: 'care', number: 3, title: 'Animal Care', tagline: 'Full bellies, full barns.',
    letter: 'Your residents are hungry, and well-fed ones give back: milk, eggs, wool. Collect them from their houses. If the grass runs short, I sell feed sacks.',
    goal: `Earn ${CARE_COINS_GOAL} coins from goods`,
    endsWhen: (s) => s.goodsCoins >= CARE_COINS_GOAL,
    progress: (s) => share(s.goodsCoins, CARE_COINS_GOAL),
    fallbackDay: 15,
  },
  husbandry: {
    id: 'husbandry', number: 4, title: 'Husbandry', tagline: 'Families grow, and something is watching.',
    letter: 'Your herds are growing! Keep them fed: a balloon left hungry too long loses its helium. And a busy farm draws hunters. An owl or a snake keeps a flock in check.',
    goal: 'Make a predator a resident',
    endsWhen: (s) => PREDATORS.some((species) => s.residentSpecies.has(species)),
    progress: (s) => (PREDATORS.some((species) => s.residentSpecies.has(species)) ? 1 : 0),
    fallbackDay: 24,
  },
  harmony: {
    id: 'harmony', number: 5, title: 'Ecological Harmony', tagline: 'Everyone in their place.',
    letter: 'Hunters and hunted, grazers and gardens: your farm is becoming a little world. Keep it varied, balanced and fed, and watch your Harmony grow.',
    goal: `Reach Harmony ${HARMONY_GOAL} with ${HARMONY_LINKS_GOAL} predator and prey pairs`,
    endsWhen: (s) => s.harmony >= HARMONY_GOAL && s.predatorLinks >= HARMONY_LINKS_GOAL,
    progress: (s) => (share(s.harmony, HARMONY_GOAL) + share(s.predatorLinks, HARMONY_LINKS_GOAL)) / 2,
  },
  mythical: {
    id: 'mythical', number: 6, title: 'Mythical', tagline: 'Some guests only come to a farm in tune.',
    letter: 'Something starry has been seen at the carnival, and it only visits a farm in perfect harmony. Rare creatures, rare gifts. Good luck!',
    goal: 'Befriend a mythical creature',
    endsWhen: () => false,
    progress: (s) => (s.residentSpecies.has('starhorn') ? 1 : 0),
  },
}

/** The flags a set of open chapters turns on. */
export function flagsFor(open: ReadonlySet<ChapterId>): ChapterFlags {
  return {
    grassSeeder: open.has('land'),
    hungerShown: open.has('care'),
    goods: open.has('care'),
    feedShop: open.has('care'),
    starvation: open.has('husbandry'),
    predators: open.has('husbandry'),
    harmonyShown: open.has('harmony'),
    mythic: open.has('mythical'),
  }
}

export interface ChapterState {
  readonly open: readonly ChapterId[]
}

export interface FarmChapters {
  isOpen(id: ChapterId): boolean
  /** The newest open chapter: the one whose goal the player is working on. */
  current(): ChapterDef
  flags(): ChapterFlags
  /** Open the next chapters whose predecessor has ended. Returns the ones opened, in order. */
  tick(signals: ChapterSignals): readonly ChapterDef[]
  /** Open a chapter (and every one before it) outright. Debug and migration. */
  openThrough(id: ChapterId): readonly ChapterDef[]
  exportState(): ChapterState
  /** Load a save. A save from before chapters is caught up from its signals (see `catchUp`). */
  importState(state: ChapterState | null | undefined, legacySignals?: ChapterSignals): void
  reset(): void
}

export function createFarmChapters(): FarmChapters {
  const open = new Set<ChapterId>(['garden'])

  const currentId = (): ChapterId => [...CHAPTER_ORDER].reverse().find((id) => open.has(id)) ?? 'garden'

  function openThrough(id: ChapterId): readonly ChapterDef[] {
    const opened: ChapterDef[] = []
    for (const chapter of CHAPTER_ORDER.slice(0, CHAPTER_ORDER.indexOf(id) + 1)) {
      if (open.has(chapter)) continue
      open.add(chapter)
      opened.push(CHAPTERS[chapter])
    }
    return opened
  }

  /**
   * Open every chapter whose goal the farm has already met. An old save with
   * cows, an owl and a full barn should not lose its barn's goods to a chapter
   * gate, so it is walked forward as far as its own farm justifies.
   */
  function catchUp(signals: ChapterSignals): void {
    for (const id of CHAPTER_ORDER) {
      const next = CHAPTER_ORDER[CHAPTER_ORDER.indexOf(id) + 1]
      if (!next || !open.has(id)) break
      if (CHAPTERS[id].endsWhen(signals)) open.add(next)
    }
  }

  return {
    isOpen: (id) => open.has(id),
    current: () => CHAPTERS[currentId()],
    flags: () => flagsFor(open),
    tick(signals) {
      const id = currentId()
      const next = CHAPTER_ORDER[CHAPTER_ORDER.indexOf(id) + 1]
      if (!next) return []
      const chapter = CHAPTERS[id]
      const late = chapter.fallbackDay !== undefined && signals.day >= chapter.fallbackDay
      if (!chapter.endsWhen(signals) && !late) return []
      return openThrough(next)
    },
    openThrough,
    exportState: () => ({ open: CHAPTER_ORDER.filter((id) => open.has(id)) }),
    importState(state, legacySignals) {
      open.clear()
      open.add('garden')
      if (state && Array.isArray(state.open)) {
        // Chapters only open in order: a hand-edited save cannot skip one.
        for (const id of CHAPTER_ORDER) {
          if (!state.open.includes(id)) break
          open.add(id)
        }
        return
      }
      if (legacySignals) catchUp(legacySignals)
    },
    reset() {
      open.clear()
      open.add('garden')
    },
  }
}
