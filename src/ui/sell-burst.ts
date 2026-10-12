import * as THREE from 'three';
import { SELL_BURST_DURATION, sellBurstFrame } from '../game/sell-animation';

export interface SellBurst {
  readonly root: THREE.Object3D;
  /** Advance the placeholder; returns false once it has finished. */
  update(deltaSeconds: number): boolean;
  dispose(): void;
}

const SPARK_COUNT = 12;

/**
 * Placeholder farewell: a gold ring that expands and fades on the ground, a
 * "+N coins" tag that rises, and a fizz of sparks. World-space (added to the
 * farm scene, not the UI layer) so it pops exactly where the animal stood.
 */
/** Finished bursts parked for the next sale; their materials stay alive so the programs stay compiled. */
const POOL_LIMIT = 4
const pool: PooledBurst[] = []

interface PooledBurst extends SellBurst {
  /** Re-arm for a new sale at `position`. */
  reset(position: THREE.Vector3, price: number, unit?: string): void
  destroy(): void
}

function buildBurst(): PooledBurst {
  const root = new THREE.Group()
  root.name = 'Sell farewell burst'

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#e8b64c'),
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMaterial)
  ring.name = 'Sell burst ring'
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.2
  // Never culled: the load-time warm draw parks the burst out of view, and it still has to be drawn once.
  ring.frustumCulled = false
  root.add(ring)

  const label = document.createElement('canvas')
  label.width = 280
  label.height = 96
  const labelContext = label.getContext('2d')
  if (!labelContext) throw new Error('2D canvas context unavailable for the sell burst')
  const labelTexture = new THREE.CanvasTexture(label)
  labelTexture.colorSpace = THREE.SRGBColorSpace
  const tagMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false })
  const tag = new THREE.Sprite(tagMaterial)
  tag.name = 'Sell burst tag'
  tag.scale.set(5, 1.7, 1)
  tag.position.y = 2.4
  tag.frustumCulled = false
  root.add(tag)

  const sparkDirections: THREE.Vector3[] = []
  for (let index = 0; index < SPARK_COUNT; index += 1) sparkDirections.push(new THREE.Vector3())
  const sparkGeometry = new THREE.BufferGeometry()
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3))
  const sparkMaterial = new THREE.PointsMaterial({
    color: new THREE.Color('#f6d47c'),
    size: 0.4,
    transparent: true,
    depthWrite: false,
  })
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial)
  sparks.name = 'Sell burst sparks'
  sparks.position.y = 1
  sparks.frustumCulled = false
  root.add(sparks)

  let elapsed = 0
  const burst: PooledBurst = {
    root,
    reset(position: THREE.Vector3, price: number, unit = 'coins'): void {
      elapsed = 0
      root.position.copy(position)
      root.visible = true
      labelContext.clearRect(0, 0, label.width, label.height)
      labelContext.font = 'bold 44px Georgia, "Times New Roman", serif'
      labelContext.textAlign = 'center'
      labelContext.textBaseline = 'middle'
      labelContext.lineWidth = 7
      labelContext.strokeStyle = '#fff4d5'
      labelContext.strokeText(`+${price}`, 140, 38)
      labelContext.fillStyle = '#7c4a1e'
      labelContext.fillText(`+${price}`, 140, 38)
      labelContext.font = 'italic 24px Georgia, serif'
      labelContext.fillText(unit, 140, 74)
      labelTexture.needsUpdate = true
      for (let index = 0; index < SPARK_COUNT; index += 1) {
        const angle = (index / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.5
        sparkDirections[index].set(Math.cos(angle), 0.55 + Math.random() * 0.5, Math.sin(angle)).normalize()
      }
      burst.update(0)
    },
    update(deltaSeconds: number): boolean {
      elapsed += Math.max(0, deltaSeconds)
      const frame = sellBurstFrame(elapsed)
      ring.scale.setScalar(Math.max(0.001, frame.ringScale))
      ringMaterial.opacity = frame.ringAlpha
      tag.position.y = 2.4 + frame.textRise
      tagMaterial.opacity = frame.textAlpha
      const positions = sparkGeometry.getAttribute('position') as THREE.BufferAttribute
      for (let index = 0; index < SPARK_COUNT; index += 1) {
        const direction = sparkDirections[index]
        positions.setXYZ(
          index,
          direction.x * frame.sparkSpread,
          direction.y * frame.sparkSpread,
          direction.z * frame.sparkSpread,
        )
      }
      positions.needsUpdate = true
      sparkMaterial.opacity = frame.sparkAlpha
      return elapsed < SELL_BURST_DURATION
    },
    /** Park the burst for reuse (or free it when the pool is full). */
    dispose(): void {
      root.visible = false
      root.removeFromParent()
      if (pool.length < POOL_LIMIT && !pool.includes(burst)) pool.push(burst)
      else burst.destroy()
    },
    destroy(): void {
      ring.geometry.dispose()
      ringMaterial.dispose()
      labelTexture.dispose()
      tagMaterial.dispose()
      sparkGeometry.dispose()
      sparkMaterial.dispose()
    },
  }
  return burst
}

/**
 * Take a burst from the pool (or build one) and arm it at `position`. Every
 * sale used to build and free three materials, a texture and two geometries, so
 * the programs they share were dropped and recompiled on the next sale; pooled
 * bursts keep them alive.
 */
export function createSellBurst(position: THREE.Vector3, price: number, unit = 'coins'): SellBurst {
  const burst = pool.pop() ?? buildBurst()
  burst.reset(position, price, unit)
  return burst
}

/**
 * Run one burst, parked far below the farm, through `warm` at load. Compiling
 * is not enough: GL drivers finish linking a program on its first draw, which
 * stalled the first sale's frame for as long as the compile itself, so `warm`
 * should draw the scene once (or build the pipelines on WebGPU).
 */
export async function warmSellBursts(scene: THREE.Object3D, warm: () => void | Promise<void>): Promise<void> {
  const burst = createSellBurst(new THREE.Vector3(0, -1000, 0), 0)
  scene.add(burst.root)
  try {
    await warm()
  } finally {
    burst.dispose()
  }
}
