import * as THREE from 'three'
import type { BalloonAnimal } from '../animals/balloon-animal'
import { ANIMAL_CATALOG } from '../animals/animal-catalog'
import type { HungerLevel } from '../game/animal-diet'
import { hungerBubbleKind, type HungerBubbleKind } from '../game/food-cues'
import { drawBubbleFallback, loadIconImage, makeCanvas } from './food-icon-art'

/** What the bubbles need to know about a resident (a slice of AnimalRecord). */
export interface HungerBubbleRecord {
  readonly hunger: HungerLevel
  readonly stage: number
  readonly insideId: string | null
}

export interface HungerBubblesDeps {
  readonly scene: THREE.Object3D
  readonly animals: readonly BalloonAnimal[]
  readonly recordOf: (animalId: string) => HungerBubbleRecord | undefined
}

export interface HungerBubbles {
  /** Per frame, after the animals have moved: follows each wearer and bobs the bubble. */
  update(deltaSeconds: number, nowSeconds: number): void
  /** Hide every bubble (a film or a full-screen panel is up) without losing the pool. */
  setEnabled(enabled: boolean): void
  /** Bubbles currently shown or fading, for the debug report. */
  readonly activeCount: number
  dispose(): void
}

const TEXTURE_SIZE = 128
/** At most this many bubbles are ever alive, so the pool is the budget. */
const MAX_BUBBLES = 24
/** Who is hungry is re-read at this rate; the bobbing itself runs every frame. */
const REFRESH_SECONDS = 0.25
/** World size of a bubble on the farm. */
const BUBBLE_SIZE = 1.15
const ICON_URLS: Readonly<Record<HungerBubbleKind, string>> = {
  hunger: 'assets/goods/hunger-bubble.png',
  starving: 'assets/goods/starving-bubble.png',
}

interface Slot {
  readonly animal: BalloonAnimal
  readonly sprite: THREE.Sprite
  kind: HungerBubbleKind
  wanted: boolean
  /** 0 hidden .. 1 shown, eased so a bubble pops in and out instead of flicking. */
  grow: number
  readonly phase: number
}

/** The size class of a species, used to float the bubble above its back. */
function sizeOf(animal: BalloonAnimal): number {
  return ANIMAL_CATALOG.find((entry) => entry.id === animal.id)?.size ?? 2
}

function phaseOf(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0
  return (Math.abs(hash) % 628) / 100
}

export function createHungerBubbles(deps: HungerBubblesDeps): HungerBubbles {
  const group = new THREE.Group()
  group.name = 'Hunger bubbles'
  deps.scene.add(group)

  // One canvas texture and one material per kind, shared by every sprite.
  const textures = {} as Record<HungerBubbleKind, THREE.CanvasTexture>
  const materials = {} as Record<HungerBubbleKind, THREE.SpriteMaterial>
  for (const kind of ['hunger', 'starving'] as const) {
    const canvas = makeCanvas(TEXTURE_SIZE, TEXTURE_SIZE)
    const ctx = canvas.getContext('2d')
    if (ctx) drawBubbleFallback(ctx, TEXTURE_SIZE, kind)
    const texture = new THREE.CanvasTexture(canvas)
    texture.name = `Hunger bubble · ${kind}`
    texture.colorSpace = THREE.SRGBColorSpace
    textures[kind] = texture
    materials[kind] = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false })
    materials[kind].name = `Hunger bubble · ${kind}`
    // The rendered PNG, when it exists, replaces the hand-drawn fallback in place.
    loadIconImage(ICON_URLS[kind], (image) => {
      if (!ctx) return
      ctx.clearRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
      ctx.drawImage(image, 0, 0, TEXTURE_SIZE, TEXTURE_SIZE)
      texture.needsUpdate = true
    })
  }

  const free: THREE.Sprite[] = []
  const slots = new Map<string, Slot>()
  let created = 0
  let enabled = true
  let sinceRefresh = REFRESH_SECONDS

  function takeSprite(): THREE.Sprite | null {
    const reused = free.pop()
    if (reused) return reused
    if (created >= MAX_BUBBLES) return null
    created += 1
    const sprite = new THREE.Sprite(materials.hunger)
    sprite.name = `Hunger bubble ${created}`
    sprite.renderOrder = 900
    sprite.visible = false
    group.add(sprite)
    return sprite
  }

  function refresh(): void {
    for (const slot of slots.values()) slot.wanted = false
    // Starving first, so a crowded pool spends itself on the animals in trouble.
    for (const pass of ['starving', 'hunger'] as const) {
      for (const animal of deps.animals) {
        if (animal.isSold || !animal.root.visible) continue
        const record = deps.recordOf(animal.instanceId)
        if (!record || record.stage < 3 || record.insideId !== null) continue
        const kind = hungerBubbleKind(record.hunger)
        if (kind !== pass) continue
        const held = slots.get(animal.instanceId)
        if (held) {
          held.wanted = true
          if (held.kind !== kind) {
            held.kind = kind
            held.sprite.material = materials[kind]
          }
          continue
        }
        const sprite = takeSprite()
        if (!sprite) continue
        sprite.material = materials[kind]
        sprite.scale.setScalar(0.001)
        sprite.visible = true
        slots.set(animal.instanceId, { animal, sprite, kind, wanted: true, grow: 0, phase: phaseOf(animal.instanceId) })
      }
    }
  }

  return {
    update(deltaSeconds, nowSeconds) {
      if (!enabled) return
      sinceRefresh += deltaSeconds
      if (sinceRefresh >= REFRESH_SECONDS) {
        sinceRefresh = 0
        refresh()
      }
      if (slots.size === 0) return
      const ease = Math.min(1, deltaSeconds * 9)
      for (const [id, slot] of slots) {
        const target = slot.wanted && !slot.animal.isSold && slot.animal.root.visible ? 1 : 0
        slot.grow += (target - slot.grow) * ease
        if (target === 0 && slot.grow < 0.02) {
          slot.sprite.visible = false
          free.push(slot.sprite)
          slots.delete(id)
          continue
        }
        const urgent = slot.kind === 'starving'
        const bob = Math.sin(nowSeconds * (urgent ? 4.2 : 2.4) + slot.phase) * (urgent ? 0.1 : 0.07)
        const pulse = urgent ? 1 + Math.sin(nowSeconds * 6 + slot.phase) * 0.05 : 1
        const lift = sizeOf(slot.animal) * slot.animal.currentScale
        const position = slot.animal.currentPosition
        slot.sprite.position.set(position.x, position.y + lift * 0.95 + 0.55 + bob, position.z)
        slot.sprite.scale.setScalar(BUBBLE_SIZE * slot.grow * pulse)
      }
    },
    setEnabled(next) {
      if (next === enabled) return
      enabled = next
      group.visible = next
      if (next) sinceRefresh = REFRESH_SECONDS
    },
    get activeCount() { return slots.size },
    dispose() {
      deps.scene.remove(group)
      for (const kind of ['hunger', 'starving'] as const) {
        textures[kind].dispose()
        materials[kind].dispose()
      }
      slots.clear()
      free.length = 0
    },
  }
}
