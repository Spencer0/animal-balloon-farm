import './loading-dom.css'

/**
 * Loading screen. index.html carries the static markup (`#boot-loading`) so it
 * is on screen before the bundle is parsed; this adopts it, shows what is being
 * loaded, and fades it out once the first frame has really been drawn.
 *
 * Ready signal for scripts: `document.documentElement.dataset.ready === 'true'`
 * and `window.__farmReady` (a promise) once the first frame is on screen.
 */

export type LoadingStage = 'renderer' | 'models' | 'shaders'

const STAGE_TEXT: Readonly<Record<LoadingStage, string>> = {
  renderer: 'Loading renderer',
  models: 'Loading models',
  shaders: 'Warming up shaders',
}

export interface LoadingScreen {
  /** Resolves after the text has been painted, so a long synchronous step after it does not hide it. */
  setStage(stage: LoadingStage): Promise<void>
  /** Call after the first frame has been drawn. Safe to call more than once. */
  done(): void
}

declare global {
  interface Window {
    __farmReady?: Promise<void>
  }
}

export function createLoadingScreen(): LoadingScreen {
  let overlay = document.getElementById('boot-loading')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'boot-loading'
    overlay.className = 'ld-overlay'
    overlay.setAttribute('role', 'status')
    overlay.innerHTML =
      '<div class="ld-card"><h1 class="ld-title">Animal Balloon Farm</h1><hr class="ld-divider">' +
      '<p class="ld-stage" data-ld-stage></p><div class="ld-bar"></div></div>'
    document.body.appendChild(overlay)
  }
  const root = overlay
  const stageText = root.querySelector<HTMLElement>('[data-ld-stage]')
  let finished = false
  let resolveReady: () => void = () => {}
  window.__farmReady = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  return {
    setStage(stage) {
      if (finished || !stageText) return Promise.resolve()
      stageText.textContent = STAGE_TEXT[stage]
      return new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 100) // hidden tab: rAF never fires
        requestAnimationFrame(() => window.setTimeout(() => (window.clearTimeout(timer), resolve()), 0))
      })
    },
    done() {
      if (finished) return
      finished = true
      root.dataset.state = 'done'
      document.documentElement.dataset.ready = 'true'
      resolveReady()
      const remove = (): void => root.remove()
      root.addEventListener('transitionend', remove, { once: true })
      window.setTimeout(remove, 800) // reduced-motion / hidden tab: no transition fires
    },
  }
}
