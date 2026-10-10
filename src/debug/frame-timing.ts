import * as THREE from 'three'

// Debug-only frame timing and the on-screen performance HUD. Nothing here runs
// unless main.ts creates it behind a literal `__GARDEN_DEBUG__` gate, so a
// production build drops the whole module.

export interface GardenFrameTiming {
  readonly frameNumber: number
  readonly intervalMs: number
  readonly workMs: number
  readonly fairgroundMs: number
  readonly expansionBoundsMs: number
  readonly animalsMs: number
  readonly toolsMs: number
  readonly otherUpdateMs: number
  readonly sceneRenderMs: number
  readonly overlayRenderMs: number
}

export interface GardenPerformanceSummary {
  readonly samples: number
  readonly fps: number
  readonly cadenceMs: number
  readonly droppedFrames: number
  readonly zoom: number
  readonly bufferWidth: number
  readonly bufferHeight: number
  readonly renderCalls: number
  readonly triangles: number
  readonly intervalMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly workMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly updateMs: { readonly p50: number; readonly p95: number; readonly max: number }
  readonly fairgroundMs: { readonly p95: number; readonly max: number }
  readonly expansionBoundsMs: { readonly p95: number; readonly max: number }
  readonly animalsMs: { readonly p95: number; readonly max: number }
  readonly toolsMs: { readonly p95: number; readonly max: number }
  readonly otherUpdateMs: { readonly p95: number; readonly max: number }
  readonly sceneRenderMs: { readonly p95: number; readonly max: number }
  readonly overlayRenderMs: { readonly p95: number; readonly max: number }
}

export interface PerformanceOverlay {
  readonly scene: THREE.Scene
  readonly camera: THREE.OrthographicCamera
  update(now: number, summarize: () => GardenPerformanceSummary | null): void
  resize(width: number, height: number): void
  dispose(): void
}

/** The rolling window of frame samples, and the summary every perf scenario reads. */
export interface FrameTimer {
  readonly samples: readonly GardenFrameTiming[]
  /** Store one frame's splits, and log a summary every couple of seconds. */
  record(now: number, timing: Omit<GardenFrameTiming, 'frameNumber'>): void
  summarize(): GardenPerformanceSummary | null
}

const FRAME_TIMING_SAMPLE_LIMIT = 180
const PERF_OVERLAY_REFRESH_MS = 400
const PERF_LOG_INTERVAL_MS = 2000

export function createPerformanceOverlay(): PerformanceOverlay {
  const scene = new THREE.Scene()
  scene.name = 'Debug performance HUD'
  const camera = new THREE.OrthographicCamera(-640, 640, 360, -360, 0.1, 100)
  camera.position.set(0, 0, 50)
  camera.lookAt(0, 0, 0)

  const canvas = document.createElement('canvas')
  canvas.width = 760
  canvas.height = 240
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas context unavailable for performance HUD')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(380, 120), material)
  panel.position.z = 2
  scene.add(panel)
  let viewportWidth = 1280
  let viewportHeight = 720
  let lastDrawAt = -PERF_OVERLAY_REFRESH_MS

  function resize(width: number, height: number): void {
    viewportWidth = width
    viewportHeight = height
    camera.left = -width / 2
    camera.right = width / 2
    camera.top = height / 2
    camera.bottom = -height / 2
    camera.updateProjectionMatrix()
    panel.position.set(-width / 2 + 205, height / 2 - 80, 2)
  }

  resize(viewportWidth, viewportHeight)
  return {
    scene,
    camera,
    resize,
    update(now, summarize): void {
      if (now - lastDrawAt < PERF_OVERLAY_REFRESH_MS) return
      lastDrawAt = now
      const summary = summarize()
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = 'rgba(18, 35, 33, 0.88)'
      context.strokeStyle = 'rgba(248, 225, 174, 0.78)'
      context.lineWidth = 3
      context.beginPath()
      context.roundRect(3, 3, canvas.width - 6, canvas.height - 6, 24)
      context.fill()
      context.stroke()
      context.textBaseline = 'middle'
      context.textAlign = 'left'
      context.font = 'bold 48px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillStyle = !summary || summary.fps >= 50 ? '#c9f29b' : summary.fps >= 30 ? '#ffd27a' : '#ff9988'
      context.fillText(`${summary?.fps.toFixed(0) ?? '--'} FPS`, 26, 48)
      context.font = '26px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillStyle = '#fff3d7'
      context.fillText(
        `frame p95 ${summary?.intervalMs.p95.toFixed(1) ?? '--'}ms · drops ${summary?.droppedFrames ?? '--'} @ ${summary?.cadenceMs.toFixed(1) ?? '--'}ms`,
        26,
        104,
      )
      context.fillText(
        `CPU p95 ${summary?.workMs.p95.toFixed(1) ?? '--'}ms · render ${summary?.sceneRenderMs.p95.toFixed(1) ?? '--'}ms`,
        26,
        154,
      )
      context.font = '23px ui-monospace, SFMono-Regular, Menlo, monospace'
      context.fillText(
        `zoom ${summary?.zoom.toFixed(1) ?? '--'}x · buffer ${summary?.bufferWidth ?? '--'}×${summary?.bufferHeight ?? '--'} · ${summary?.renderCalls ?? '--'} calls`,
        26,
        207,
      )
      texture.needsUpdate = true
    },
    dispose(): void {
      panel.geometry.dispose()
      texture.dispose()
      material.dispose()
      scene.clear()
    },
  }
}

/**
 * Frame samples for scripted stress tests. `zoom` reads the farm camera's
 * current zoom, which every summary reports beside the timings.
 */
export function createFrameTimer(renderer: THREE.WebGLRenderer, zoom: () => number): FrameTimer {
  const samples: GardenFrameTiming[] = []
  let frameNumber = 0
  let lastLogAt = performance.now()

  function summarize(): GardenPerformanceSummary | null {
    if (!samples.length) return null
    const percentile = (values: readonly number[], fraction: number): number => {
      const sorted = [...values].sort((a, b) => a - b)
      return +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(2)
    }
    const max = (values: readonly number[]): number => +Math.max(...values).toFixed(2)
    const get = (key: keyof GardenFrameTiming): number[] => samples.map((sample) => sample[key])
    const update = samples.map((sample) => sample.fairgroundMs + sample.animalsMs + sample.toolsMs + sample.otherUpdateMs)
    const intervals = get('intervalMs').filter((value) => value > 0)
    if (intervals.length === 0) return null
    const averageInterval = intervals.reduce((total, value) => total + value, 0) / intervals.length
    // Adapt to the browser/display's actual rAF cadence (e.g. 30 Hz remote browser
    // previews) so ordinary 33 ms frames are not mislabeled as missed 60 Hz frames.
    const cadenceMs = percentile(intervals, 0.1)
    const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2())
    const summarizeAll = (values: readonly number[]) => ({ p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: max(values) })
    const summarizeTail = (values: readonly number[]) => ({ p95: percentile(values, 0.95), max: max(values) })
    return {
      samples: intervals.length,
      fps: +(1000 / averageInterval).toFixed(1),
      cadenceMs,
      droppedFrames: intervals.filter((value) => value > cadenceMs * 1.5).length,
      zoom: +zoom().toFixed(2),
      bufferWidth: drawingBuffer.x,
      bufferHeight: drawingBuffer.y,
      renderCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      intervalMs: summarizeAll(intervals),
      workMs: summarizeAll(get('workMs')),
      updateMs: summarizeAll(update),
      fairgroundMs: summarizeTail(get('fairgroundMs')),
      expansionBoundsMs: summarizeTail(get('expansionBoundsMs')),
      animalsMs: summarizeTail(get('animalsMs')),
      toolsMs: summarizeTail(get('toolsMs')),
      otherUpdateMs: summarizeTail(get('otherUpdateMs')),
      sceneRenderMs: summarizeTail(get('sceneRenderMs')),
      overlayRenderMs: summarizeTail(get('overlayRenderMs')),
    }
  }

  return {
    samples,
    summarize,
    record(now, timing): void {
      samples.push({ frameNumber: ++frameNumber, ...timing })
      if (samples.length > FRAME_TIMING_SAMPLE_LIMIT) samples.shift()
      if (now - lastLogAt >= PERF_LOG_INTERVAL_MS) {
        lastLogAt = now
        const summary = summarize()
        if (summary) {
          console.info(`[Frame Performance] ${JSON.stringify(summary)}`)
        }
      }
    },
  }
}
