/**
 * Animal progression: the state machine that walks a species up the four
 * conditions and decides what the journal is allowed to reveal.
 *
 * Pure, like the rest of `src/game/`. It is driven by `tick(farm, dt)` and
 * returns *events* for the scene to act on (walk in, play the transition, go
 * to hearts), so nothing in here knows what a Three.js object is. That split
 * is what makes the whole mechanic verifiable from a node test.
 *
 * Timing is deliberate. Turning up at the carnival is immediate, but a visit
 * takes a beat so the two conditions feel distinct, and a settle plays out as
 * an event rather than snapping, because the transition is the reward.
 */

import {
  CARNIVAL_STARTERS,
  DISCOVERY,
  getSpeciesConditions,
  stageAppearance,
  stageHasHeartEyes,
  type AnimalStage,
  type ConditionRequirement,
  type StageDefinition,
} from './animal-conditions'
import { farmMetric, type FarmState } from './farm-state'

/** Seconds an animal lingers at the carnival before wandering into the farm. */
export const VISIT_DELAY_SECONDS = 4

/** Seconds an animal hesitates at the farm edge before stepping inside. */
export const ENTER_FARM_SECONDS = 2.2

export type ProgressEventKind = 'arriveCarnival' | 'enterFarm' | 'settle' | 'fallInLove'

export interface ProgressEvent {
  readonly kind: ProgressEventKind
  readonly species: string
  readonly stage: AnimalStage
  /** True when this arrival was earned rather than present at the start. */
  readonly discovered?: boolean
}

export interface RequirementStatus {
  readonly stage: AnimalStage
  readonly title: string
  /** False until the previous stage is reached — the disclosure rule. */
  readonly revealed: boolean
  readonly requirement: ConditionRequirement | null
  /** Current value of the metric, or null when not applicable. */
  readonly current: number | null
  /** Required value, or null when not applicable. */
  readonly target: number | null
  /** True when revealed and the requirement is satisfied. */
  readonly met: boolean
  readonly result: string
}

export interface SpeciesProgress {
  readonly species: string
  readonly stage: AnimalStage
  /** Seconds spent in the current stage, used for the delays above. */
  readonly elapsed: number
  readonly appearance: 'wild' | 'standard'
  readonly heartEyes: boolean
  /** True once the animal has begun walking in from the carnival. */
  readonly invited: boolean
}

export interface FarmSnapshot {
  readonly state: FarmState
  /** Species ids currently at stage >= 3. */
  readonly residentSpecies: ReadonlySet<string>
}

export interface AnimalProgressOptions {
  readonly visitDelaySeconds?: number
  readonly enterFarmSeconds?: number
}

export interface AnimalProgress {
  progressOf(species: string): SpeciesProgress
  all(): readonly SpeciesProgress[]
  /** Requirement checklist for the journal, disclosure already applied. */
  statusOf(species: string): readonly RequirementStatus[]
  /** Advance the world by `deltaSeconds` and return what changed. */
  tick(farm: FarmSnapshot, deltaSeconds: number): readonly ProgressEvent[]
  /** Force a species to a stage — the debug harness and the tests use this. */
  setStage(species: string, stage: AnimalStage): readonly ProgressEvent[]
  /** Return every species to undiscovered and forget the last farm snapshot. */
  reset(): void
  /** Grant the carnival stage, as happens for species that start the game there. */
  discover(species: string): readonly ProgressEvent[]
}

/**
 * Whether a requirement is satisfied by the current farm.
 *
 * A `residentSpecies` requirement is a social condition, not a land one, so
 * it reads the resident set rather than the area metrics.
 */
export function requirementMet(requirement: ConditionRequirement | null, farm: FarmSnapshot): boolean {
  if (!requirement) return true
  if (requirement.kind === 'residentSpecies') {
    return farm.residentSpecies.has(requirement.species ?? '')
  }
  const target = requirement.amount ?? 0
  return farmMetric(farm.state, requirement.kind) >= target
}

function statusFor(definition: StageDefinition, currentStage: AnimalStage, farm: FarmSnapshot | null): RequirementStatus {
  const reached = definition.stage <= currentStage
  // Disclosure: a stage's requirement stays hidden until the previous one is
  // done, so the player never sees what to build before it makes sense.
  const revealed = definition.stage <= currentStage + 1
  const requirement = definition.requirement
  let current: number | null = null
  let target: number | null = null
  // A hidden requirement must not leak its target — that is the whole point of
  // progressive disclosure. The journal draws "???" off a null target.
  if (revealed && requirement && requirement.kind !== 'residentSpecies') {
    target = requirement.amount ?? null
    current = farm ? farmMetric(farm.state, requirement.kind) : null
  }
  return {
    stage: definition.stage,
    title: definition.title,
    revealed,
    requirement,
    current,
    target,
    met: reached && (farm ? requirementMet(requirement, farm) : false),
    result: definition.result,
  }
}

export function createAnimalProgress(
  speciesIds: readonly string[],
  options: AnimalProgressOptions = {},
): AnimalProgress {
  const visitDelay = options.visitDelaySeconds ?? VISIT_DELAY_SECONDS
  const enterFarmSeconds = options.enterFarmSeconds ?? ENTER_FARM_SECONDS
  const progress = new Map<string, SpeciesProgress>()
  /** The most recent farm the scene ticked with; powers the journal's live bar. */
  let lastFarm: FarmSnapshot | null = null

  for (const species of speciesIds) {
    progress.set(species, {
      species,
      stage: 0,
      elapsed: 0,
      appearance: 'wild',
      heartEyes: false,
      invited: false,
    })
  }

  function sync(entry: SpeciesProgress): SpeciesProgress {
    const next: SpeciesProgress = {
      ...entry,
      appearance: stageAppearance(entry.stage),
      heartEyes: stageHasHeartEyes(entry.stage),
    }
    progress.set(entry.species, next)
    return next
  }

  function advance(species: string, to: AnimalStage, events: ProgressEvent[], discovered = false): void {
    const entry = progress.get(species)
    if (!entry || to <= entry.stage) return
    // Walking one rung at a time means every rung emits its own event, so a
    // debug jump from 0 to 4 still plays through the intervening beats.
    for (let stage = entry.stage + 1; stage <= to; stage += 1) {
      const eventKind: ProgressEventKind =
        stage === 1 ? 'arriveCarnival' : stage === 2 ? 'enterFarm' : stage === 3 ? 'settle' : 'fallInLove'
      const current = progress.get(species)!
      progress.set(species, { ...current, stage: stage as AnimalStage, elapsed: 0, invited: stage >= 2 || current.invited })
      events.push({ kind: eventKind, species, stage: stage as AnimalStage, ...(discovered ? { discovered } : {}) })
    }
    sync(progress.get(species)!)
  }

  function conditionsFor(species: string): readonly StageDefinition[] {
    return getSpeciesConditions(species)
  }

  const api: AnimalProgress = {
    progressOf(species) {
      return progress.get(species) ?? {
        species,
        stage: 0,
        elapsed: 0,
        appearance: 'wild',
        heartEyes: false,
        invited: false,
      }
    },
    all: () => Array.from(progress.values()),
    statusOf(species) {
      const entry = api.progressOf(species)
      return conditionsFor(species).map((definition) => statusFor(definition, entry.stage, lastFarm))
    },
    discover(species) {
      const events: ProgressEvent[] = []
      advance(species, 1, events, true)
      return events
    },
    setStage(species, stage) {
      const events: ProgressEvent[] = []
      const current = api.progressOf(species)
      if (stage > current.stage) advance(species, stage, events)
      else if (stage === current.stage) return events
      else {
        // Demotion is only used by the harness to re-run a reveal.
        const step: SpeciesProgress = {
          species,
          stage,
          elapsed: 0,
          appearance: stageAppearance(stage),
          heartEyes: stageHasHeartEyes(stage),
          invited: stage >= 2,
        }
        progress.set(species, step)
      }
      return events
    },
    reset() {
      for (const species of progress.keys()) {
        progress.set(species, { species, stage: 0, elapsed: 0, appearance: 'wild', heartEyes: false, invited: false })
      }
      lastFarm = null
    },
    tick(farm, deltaSeconds) {
      lastFarm = farm
      const events: ProgressEvent[] = []
      const delta = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? Math.min(deltaSeconds, 0.25) : 0
      for (const entry of Array.from(progress.values())) {
        const stages = conditionsFor(entry.species)
        if (entry.stage === 0) {
          // Not yet in the world. A species nobody has laid eyes on still has
          // to be findable, so DISCOVERY decides when it wanders up to the
          // tents. Without this, a condition could never be satisfied at all.
          const trigger = DISCOVERY[entry.species]
          if (trigger && requirementMet(trigger, farm)) advance(entry.species, 1, events, true)
          continue
        }
        const next = stages[entry.stage]
        if (!next) continue
        const withTime: SpeciesProgress = { ...entry, elapsed: entry.elapsed + delta }
        progress.set(entry.species, withTime)

        if (entry.stage === 1) {
          if (withTime.elapsed < visitDelay) continue
          advance(entry.species, 2, events)
          continue
        }
        if (entry.stage === 2) {
          // Even with the land ready, an animal takes a moment to make up its
          // mind before committing — this is the pause the "call it home"
          // animation plays inside.
          if (withTime.elapsed < enterFarmSeconds) continue
        }
        if (!requirementMet(next.requirement, farm)) continue
        advance(entry.species, (entry.stage + 1) as AnimalStage, events)
      }
      return events
    },
  }

  return api
}

/** Species that should be present at the carnival on the first frame. */
export function startingCarnivalSpecies(speciesIds: readonly string[]): readonly string[] {
  return speciesIds.filter((species) => CARNIVAL_STARTERS.includes(species))
}

export function makeFarmSnapshot(state: FarmState, progress: AnimalProgress): FarmSnapshot {
  return { state, residentSpecies: residentsOf(progress) }
}

function residentsOf(progress: AnimalProgress): ReadonlySet<string> {
  const set = new Set<string>()
  for (const entry of progress.all()) if (entry.stage >= 3) set.add(entry.species)
  return set
}
