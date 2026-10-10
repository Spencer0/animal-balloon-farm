import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import type { createAnimalLife } from '../game/animal-life'
import { conditionMetricLabel, conditionMetricUnit, getSpeciesConditions, isCountKind } from '../game/animal-conditions'
import { farmMetric, type FarmState } from '../game/farm-state'
import type { JournalConditionSource } from './journal-panel'

export interface JournalConditionsDeps {
  readonly progress: ReturnType<typeof createAnimalLife>
  readonly measureFarm: () => FarmState
  readonly noteJournalStages: () => void
  readonly journalBestStage: Map<string, number>
}

export function createJournalConditions(deps: JournalConditionsDeps) {
  const { progress, measureFarm, noteJournalStages, journalBestStage } = deps
  /**
   * Hand the journal a live view of the condition ladder.
   *
   * The translation lives here rather than in the journal so the UI keeps no
   * knowledge of the progression model -- it draws rows, and the model decides
   * what a row says and whether it is sealed yet.
   */
  const journalConditionsSource: JournalConditionSource = {
    get: (species) => {
      noteJournalStages()
      const stage = journalBestStage.get(species) ?? 0
      if (stage < 1) return null
      const farm = measureFarm()
      const definitions = getSpeciesConditions(species)
      if (!definitions.length) return null
      return {
        stage,
        rows: definitions.map((definition) => {
          const requirement = definition.requirement
          const isNumeric = requirement !== null && requirement.kind !== 'residentSpecies'
          // A social condition has no area to meter, so name the friend instead.
          const wantsSpecies = requirement?.kind === 'residentSpecies' ? requirement.species : undefined
          const revealed = definition.stage <= stage + 1
          const labelled = isCountKind(requirement?.kind)
          return {
            stage: definition.stage,
            title: definition.title,
            revealed,
            current: isNumeric ? farmMetric(farm, requirement.kind, requirement.species) : null,
            target: requirement?.amount ?? null,
            met: definition.stage <= stage,
            result: definition.result,
            hint: definition.hint,
            ...(requirement ? { requirementKind: requirement.kind, ...(requirement.species ? { requirementSpecies: requirement.species } : {}) } : {}),
            // Area rows keep their old unlabeled look; plant and predator rows name what they count.
            ...(isNumeric && labelled ? { metricLabel: conditionMetricLabel(requirement) ?? undefined } : {}),
            ...(isNumeric && labelled ? { metricUnit: conditionMetricUnit(requirement) } : {}),
            ...(revealed && requirement?.and?.length ? {
              alsoNeeds: requirement.and.map((also) => ({
                label: conditionMetricLabel(also) ?? 'Also needed',
                current: farmMetric(farm, also.kind, also.species),
                target: also.amount ?? 1,
                kind: also.kind,
                ...(also.species ? { species: also.species } : {}),
              })),
            } : {}),
            ...(wantsSpecies ? {
              waitingOn: {
                species: wantsSpecies,
                name: ANIMAL_CATALOG.find((animal) => animal.id === wantsSpecies)?.name ?? wantsSpecies,
                resident: progress.all().some((entry) => entry.species === wantsSpecies && entry.stage >= 3),
              },
            } : {}),
          }
        }),
      }
    },
  }

  return {
    journalConditionsSource,
  }
}
