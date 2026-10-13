import "./chapter-card-dom.css";

/**
 * The title card and subtitles for a chapter's opening film.
 *
 * A DOM overlay in the Farm Journal look: a cream ribbon with a "Chapter N"
 * kicker, the chapter's title and tagline, and Pip's line below it, framed by
 * letterbox bars. `chapter-film-player.ts` drives it with a state every frame.
 */

export interface ChapterCardTitle {
  readonly label: string
  readonly title: string
  readonly tagline: string
}

export interface ChapterCardState {
  /** The title card, or null when none is showing. */
  readonly title: ChapterCardTitle | null
  readonly titleOpacity: number
  /** Pip's line, or null. */
  readonly line: string | null
  readonly lineOpacity: number
  /** Bar height as a fraction of the screen height. */
  readonly letterbox: number
}

export interface ChapterCard {
  setState(state: ChapterCardState): void
  /** Show the "press again to skip" hint for a moment. */
  flashSkipHint(): void
  /** Count the hint down; call once per frame. */
  update(delta: number): void
  dispose(): void
}

const HINT_SECONDS = 2.6

export function createChapterCard(parent: HTMLElement = document.body): ChapterCard {
  const root = document.createElement('div')
  root.id = 'chapter-card'
  root.className = 'chapter-card-root'
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = `
    <div class="cc-bar cc-bar-top"></div>
    <div class="cc-bar cc-bar-bottom"></div>
    <div class="cc-title">
      <p class="cc-kicker"></p>
      <h2 class="cc-name"></h2>
      <p class="cc-tagline"></p>
    </div>
    <p class="cc-line"></p>
    <p class="cc-hint">Press again to skip</p>
  `
  parent.appendChild(root)

  const topBar = root.querySelector<HTMLElement>('.cc-bar-top')!
  const bottomBar = root.querySelector<HTMLElement>('.cc-bar-bottom')!
  const title = root.querySelector<HTMLElement>('.cc-title')!
  const kicker = root.querySelector<HTMLElement>('.cc-kicker')!
  const name = root.querySelector<HTMLElement>('.cc-name')!
  const tagline = root.querySelector<HTMLElement>('.cc-tagline')!
  const line = root.querySelector<HTMLElement>('.cc-line')!
  const hint = root.querySelector<HTMLElement>('.cc-hint')!

  let shownTitle: ChapterCardTitle | null = null
  let shownLine: string | null = null
  let letterboxShown = -1
  let hintSeconds = 0
  let disposed = false

  return {
    setState(state) {
      if (disposed) return
      if (state.title !== shownTitle) {
        shownTitle = state.title
        kicker.textContent = state.title?.label ?? ''
        name.textContent = state.title?.title ?? ''
        tagline.textContent = state.title?.tagline ?? ''
      }
      if (state.line !== shownLine) {
        shownLine = state.line
        line.textContent = state.line ?? ''
      }
      title.style.opacity = String(state.title ? state.titleOpacity : 0)
      line.style.opacity = String(state.line ? state.lineOpacity : 0)
      if (state.letterbox !== letterboxShown) {
        letterboxShown = state.letterbox
        const bar = `${(state.letterbox * 100).toFixed(2)}vh`
        topBar.style.height = bar
        bottomBar.style.height = bar
      }
    },
    flashSkipHint() {
      hintSeconds = HINT_SECONDS
    },
    update(delta) {
      hintSeconds = Math.max(0, hintSeconds - delta)
      hint.classList.toggle('is-shown', hintSeconds > 0)
    },
    dispose() {
      disposed = true
      root.remove()
    },
  }
}
