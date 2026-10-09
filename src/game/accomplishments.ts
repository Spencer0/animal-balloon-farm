export type AccomplishmentStage = 'appear' | 'visit' | 'live' | 'breed';

export interface AccomplishmentDef {
  readonly id: string;
  readonly kind: 'animal' | 'plant';
  readonly species: string;
  readonly stage: AccomplishmentStage | null;
  readonly title: string;
  readonly detail: string;
  readonly hint: string;
  readonly points: number;
}

export const ACCOMPLISHMENT_POINTS = {
  appear: 10,
  visit: 15,
  live: 25,
  breed: 40,
  plantGrown: 10,
} as const;

const ANIMAL_STAGES: readonly AccomplishmentStage[] = ['appear', 'visit', 'live', 'breed'];

const STAGE_LABELS: Readonly<Record<AccomplishmentStage, string>> = {
  appear: 'Appear',
  visit: 'Visit',
  live: 'Live',
  breed: 'Breed',
};

const STAGE_DETAILS: Readonly<Record<AccomplishmentStage, string>> = {
  appear: 'spotted for the first time at the carnival tents',
  visit: 'welcomed onto the farm for the first time',
  live: 'settled as a farm resident for the first time',
  breed: 'raised to breeding for the first time',
};

const STAGE_HINTS: Readonly<Record<AccomplishmentStage, string>> = {
  appear: 'Keep an eye on the carnival tents.',
  visit: 'Make the farm inviting and wait for a visit.',
  live: 'Give this species what it needs to settle.',
  breed: 'Help two settled residents fall in love.',
};

export interface CatalogSpecies {
  readonly id: string;
  readonly name: string;
}

function pointsFor(stage: AccomplishmentStage | null): number {
  return stage === null ? ACCOMPLISHMENT_POINTS.plantGrown : ACCOMPLISHMENT_POINTS[stage];
}

export function buildAccomplishmentCatalog(
  animals: readonly CatalogSpecies[],
  plants: readonly CatalogSpecies[],
): readonly AccomplishmentDef[] {
  const defs: AccomplishmentDef[] = [];
  const seen = new Set<string>();
  function add(def: AccomplishmentDef): void {
    if (!def.id || seen.has(def.id)) throw new RangeError(`Duplicate accomplishment id: ${def.id}`);
    if (!Number.isFinite(def.points) || def.points < 0) throw new RangeError(`Bad points for ${def.id}`);
    seen.add(def.id);
    defs.push(def);
  }
  for (const animal of animals) {
    for (const stage of ANIMAL_STAGES) {
      add({
        id: `animal.${animal.id}.${stage}`,
        kind: 'animal',
        species: animal.id,
        stage,
        title: `${animal.name} · ${STAGE_LABELS[stage]}`,
        detail: `First ${animal.name} ${STAGE_DETAILS[stage]}.`,
        hint: STAGE_HINTS[stage],
        points: pointsFor(stage),
      });
    }
  }
  for (const plant of plants) {
    add({
      id: `plant.${plant.id}.grown`,
      kind: 'plant',
      species: plant.id,
      stage: null,
      title: `Grow ${plant.name}`,
      detail: `First ${plant.name} grown to full maturity.`,
      hint: `Grow a ${plant.name} to full maturity.`,
      points: pointsFor(null),
    });
  }
  return defs;
}

export type AccomplishmentState = 'accomplished' | 'unaccomplished' | 'hidden';

export interface AccomplishmentRow {
  readonly def: AccomplishmentDef;
  readonly state: AccomplishmentState;
  readonly completedAt: number | null;
}

export type AccomplishmentFilter = 'all' | 'accomplished' | 'unaccomplished';
export type AccomplishmentSort = 'recent' | 'points' | 'name';

export interface AccomplishmentTracker {
  readonly defs: readonly AccomplishmentDef[];
  discoverAnimalStage(species: string, stage: AccomplishmentStage): AccomplishmentDef | null;
  discoverPlantGrown(species: string): AccomplishmentDef | null;
  isAccomplished(id: string): boolean;
  accomplishedIds(): readonly string[];
  appearedSpecies(): ReadonlySet<string>;
  list(seedsOwned: ReadonlySet<string>): AccomplishmentRow[];
  recent(limit?: number): readonly AccomplishmentDef[];
  reset(): void;
  /** Accomplished ids in the order they were earned, for saving. */
  exportState(): readonly string[];
  /** Replace progress with saved ids; ids no longer in the catalog are dropped. */
  importState(ids: readonly string[]): void;
}

export function createAccomplishmentTracker(defs: readonly AccomplishmentDef[] = []): AccomplishmentTracker {
  const byId = new Map<string, AccomplishmentDef>();
  for (const def of defs) {
    if (!def.id || byId.has(def.id)) throw new RangeError(`Duplicate accomplishment id: ${def.id}`);
    byId.set(def.id, def);
  }
  const done = new Set<string>();
  const order: string[] = [];

  function discover(id: string): AccomplishmentDef | null {
    const def = byId.get(id) ?? null;
    if (!def || done.has(id)) return null;
    done.add(id);
    order.push(id);
    return def;
  }

  function stateOf(def: AccomplishmentDef, seedsOwned: ReadonlySet<string>): AccomplishmentState {
    if (done.has(def.id)) return 'accomplished';
    if (def.kind === 'plant') return seedsOwned.has(def.species) ? 'unaccomplished' : 'hidden';
    if (def.stage === 'appear' || done.has(`animal.${def.species}.appear`)) return 'unaccomplished';
    return 'hidden';
  }

  return {
    defs,
    discoverAnimalStage(species: string, stage: AccomplishmentStage): AccomplishmentDef | null {
      if ((ANIMAL_STAGES as readonly string[]).includes(stage)) return discover(`animal.${species}.${stage}`);
      return null;
    },
    discoverPlantGrown(species: string): AccomplishmentDef | null {
      return discover(`plant.${species}.grown`);
    },
    isAccomplished(id: string): boolean {
      return done.has(id);
    },
    accomplishedIds(): readonly string[] {
      return [...order];
    },
    appearedSpecies(): ReadonlySet<string> {
      const species = new Set<string>();
      for (const id of done) {
        const def = byId.get(id);
        if (def?.kind === 'animal' && def.stage === 'appear') species.add(def.species);
      }
      return species;
    },
    list(seedsOwned: ReadonlySet<string>): AccomplishmentRow[] {
      return defs.map((def) => ({
        def,
        state: stateOf(def, seedsOwned),
        completedAt: done.has(def.id) ? order.indexOf(def.id) : null,
      }));
    },
    recent(limit = 5): readonly AccomplishmentDef[] {
      const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
      return order.slice(-count).reverse().map((id) => byId.get(id)).filter((def): def is AccomplishmentDef => def !== undefined);
    },
    reset(): void {
      done.clear();
      order.length = 0;
    },
    exportState(): readonly string[] {
      return [...order];
    },
    importState(ids: readonly string[]): void {
      done.clear();
      order.length = 0;
      for (const id of ids) {
        if (typeof id === 'string' && byId.has(id) && !done.has(id)) {
          done.add(id);
          order.push(id);
        }
      }
    },
  };
}

export function filterAccomplishmentRows(rows: readonly AccomplishmentRow[], filter: AccomplishmentFilter): readonly AccomplishmentRow[] {
  if (filter === 'all') return rows;
  return rows.filter((row) => row.state === filter);
}

export function sortAccomplishmentRows(rows: readonly AccomplishmentRow[], sort: AccomplishmentSort): AccomplishmentRow[] {
  const copy = [...rows];
  if (sort === 'points') copy.sort((a, b) => b.def.points - a.def.points || a.def.title.localeCompare(b.def.title));
  else if (sort === 'name') copy.sort((a, b) => a.def.title.localeCompare(b.def.title));
  else copy.sort((a, b) => (b.completedAt ?? -1) - (a.completedAt ?? -1));
  return copy;
}
