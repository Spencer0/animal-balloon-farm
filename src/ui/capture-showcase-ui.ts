import type { BalloonAnimal, BalloonAnimalId } from '../animals/balloon-animal'
import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import { CAPTURE_DURATION_SECONDS } from '../animals/balloon-capture'

const ANIMALS = ANIMAL_CATALOG

export interface CaptureShowcaseUI {
  update(animals: readonly BalloonAnimal[]): void
  dispose(): void
}

export function createCaptureShowcaseUI(actions: {
  readonly onPlayAll: () => void
  readonly onResetAll: () => void
  readonly onExit: () => void
  readonly onReplay: (animalId: BalloonAnimalId) => void
}): CaptureShowcaseUI {
  const root = document.createElement('section')
  root.className = 'showcase-ui'
  root.setAttribute('aria-label', 'Capture animation showcase')

  const header = document.createElement('header')
  header.className = 'showcase-header'
  const heading = document.createElement('div')
  heading.className = 'showcase-heading'
  const eyebrow = document.createElement('span')
  eyebrow.className = 'showcase-eyebrow'
  eyebrow.textContent = 'BALLOON ANIMAL STUDIO'
  const title = document.createElement('h1')
  title.textContent = 'The color reveal'
  const description = document.createElement('p')
  description.textContent = `${ANIMAL_CATALOG.length} personalities. One little paint-bucket miracle. · ${CAPTURE_DURATION_SECONDS.toFixed(1)} sec each`
  heading.append(eyebrow, title, description)

  const toolbar = document.createElement('div')
  toolbar.className = 'showcase-toolbar'
  const playAll = document.createElement('button')
  playAll.className = 'showcase-button showcase-button--primary'
  playAll.dataset.role = 'play-all'
  playAll.type = 'button'
  playAll.textContent = `▶  Play all ${ANIMAL_CATALOG.length}`
  playAll.addEventListener('click', actions.onPlayAll)
  const resetAll = document.createElement('button')
  resetAll.className = 'showcase-button showcase-button--quiet'
  resetAll.type = 'button'
  resetAll.textContent = '↺  Reset'
  resetAll.addEventListener('click', actions.onResetAll)
  const exit = document.createElement('button')
  exit.className = 'showcase-button showcase-button--farm'
  exit.type = 'button'
  exit.textContent = 'Back to farm'
  exit.addEventListener('click', actions.onExit)
  toolbar.append(playAll, resetAll, exit)
  header.append(heading, toolbar)

  const cards = document.createElement('nav')
  cards.className = 'showcase-animal-list'
  cards.setAttribute('aria-label', 'Replay an animal capture animation')
  const cardById = new Map<BalloonAnimalId, HTMLButtonElement>()
  const fillById = new Map<BalloonAnimalId, HTMLSpanElement>()
  for (const item of ANIMALS) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'showcase-animal-card'
    card.dataset.animal = item.id
    card.style.setProperty('--animal-color', item.color)
    card.setAttribute('aria-label', `Replay ${item.label}: ${item.gesture}`)
    card.addEventListener('click', () => actions.onReplay(item.id))

    const colorMark = document.createElement('span')
    colorMark.className = 'showcase-animal-color'
    colorMark.setAttribute('aria-hidden', 'true')
    const text = document.createElement('span')
    text.className = 'showcase-animal-copy'
    const name = document.createElement('strong')
    name.textContent = item.label
    const gesture = document.createElement('small')
    gesture.textContent = item.gesture
    text.append(name, gesture)
    const playIcon = document.createElement('span')
    playIcon.className = 'showcase-animal-play'
    playIcon.textContent = '↻'
    playIcon.setAttribute('aria-hidden', 'true')
    const progress = document.createElement('span')
    progress.className = 'showcase-animal-progress'
    const progressFill = document.createElement('span')
    progressFill.className = 'showcase-animal-progress-fill'
    progress.append(progressFill)
    fillById.set(item.id, progressFill)
    card.append(colorMark, text, playIcon, progress)
    cards.append(card)
    cardById.set(item.id, card)
  }

  const hint = document.createElement('p')
  hint.className = 'showcase-hint'
  hint.textContent = 'Pick a card to replay · click an animal to replay · drag to orbit · scroll to zoom'
  root.append(header, cards, hint)
  document.body.append(root)

  return {
    update(animals): void {
      for (const animal of animals) {
        const card = cardById.get(animal.id)
        const progressFill = fillById.get(animal.id)
        if (!card || !progressFill) continue
        card.dataset.state = animal.isCapturing ? 'pouring' : animal.isCaptured ? 'restored' : 'wild'
        card.setAttribute('aria-pressed', String(animal.isCapturing))
        progressFill.style.transform = `scaleX(${Math.max(0, Math.min(1, animal.captureProgress))})`
      }
      const anyPlaying = animals.some((animal) => animal.isCapturing)
      const everyAnimalIsRunning = animals.length > 0 && animals.every((animal) => animal.isCapturing)
      playAll.disabled = everyAnimalIsRunning
      playAll.textContent = everyAnimalIsRunning ? `✦  All ${ANIMAL_CATALOG.length} are painting…` : anyPlaying ? `↻  Replay all ${ANIMAL_CATALOG.length}` : `▶  Play all ${ANIMAL_CATALOG.length}`
    },
    dispose(): void {
      root.remove()
    },
  }
}

export function createShowcaseLaunchButton(onOpen: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'showcase-launch-button'
  button.textContent = '✦  Capture viewer'
  button.setAttribute('aria-label', 'Open the animal capture animation showcase')
  button.addEventListener('click', onOpen)
  document.body.append(button)
  return button
}
