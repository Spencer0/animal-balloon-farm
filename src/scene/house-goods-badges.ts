import * as THREE from 'three'
import { GOODS, type GoodId } from '../game/animal-diet'
import { badgeCountLabel, goodsBadge, goodsBadgeKey, type GoodsBadge } from '../game/food-cues'
import { propDefinition, type PropId } from '../game/farm-props'
import { drawGoodFallback, FOOD_ART_COLORS, loadIconImage, makeCanvas } from './food-icon-art'

/** The slice of a house spot the badges need. */
export interface BadgeHouse {
  readonly id: string
  readonly prop: string
  readonly x: number
  readonly z: number
}

export interface HouseGoodsBadgesDeps {
  readonly scene: THREE.Object3D
  readonly houses: () => readonly BadgeHouse[]
  readonly goodsIn: (houseId: string) => Readonly<Partial<Record<GoodId, number>>>
}

export interface HouseGoodsBadges {
  /** Per frame: bobs and pulses what is showing; re-reads the houses at a low rate. */
  update(deltaSeconds: number, nowSeconds: number): void
  /** A resident made a good into a house: a tiny "+1" rises from its badge. */
  notifyProduce(houseId: string | undefined): void
  setEnabled(enabled: boolean): void
  /** Badges currently alive, for the debug report. */
  readonly badgeCount: number
  dispose(): void
}

const CANVAS_W = 192
const CANVAS_H = 96
/** World size of a badge: wide, so the icon and the count both read at the farm's zoom. */
const BADGE_WIDTH = 2.0
const BADGE_HEIGHT = BADGE_WIDTH * CANVAS_H / CANVAS_W
const REFRESH_SECONDS = 0.5
const MAX_POPS = 6
const POP_SECONDS = 1.1

interface Badge {
  readonly houseId: string
  readonly sprite: THREE.Sprite
  readonly glow: THREE.Sprite
  readonly material: THREE.SpriteMaterial
  readonly texture: THREE.CanvasTexture
  readonly canvas: HTMLCanvasElement
  key: string
  badge: GoodsBadge | null
  baseX: number
  baseY: number
  baseZ: number
  wanted: boolean
  grow: number
  readonly phase: number
}

interface Pop {
  readonly sprite: THREE.Sprite
  readonly material: THREE.SpriteMaterial
  age: number
  x: number
  y: number
  z: number
}

function phaseOf(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 17 + id.charCodeAt(index)) | 0
  return (Math.abs(hash) % 628) / 100
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function createHouseGoodsBadges(deps: HouseGoodsBadgesDeps): HouseGoodsBadges {
  const group = new THREE.Group()
  group.name = 'House goods badges'
  deps.scene.add(group)

  // Good icons: one image per good, shared by every badge. A badge redraws once its icon arrives.
  const icons = new Map<GoodId, HTMLImageElement>()
  let iconRevision = 0
  for (const spec of Object.values(GOODS)) {
    loadIconImage(spec.icon, (image) => {
      icons.set(spec.id, image)
      iconRevision += 1
    })
  }

  // One soft warm glow texture and material, shared; every full house shows it.
  const glowCanvas = makeCanvas(128, 128)
  const glowCtx = glowCanvas.getContext('2d')
  if (glowCtx) {
    const gradient = glowCtx.createRadialGradient(64, 64, 4, 64, 64, 62)
    gradient.addColorStop(0, 'rgba(255, 196, 96, 0.95)')
    gradient.addColorStop(0.5, 'rgba(255, 170, 80, 0.4)')
    gradient.addColorStop(1, 'rgba(255, 170, 80, 0)')
    glowCtx.fillStyle = gradient
    glowCtx.fillRect(0, 0, 128, 128)
  }
  const glowTexture = new THREE.CanvasTexture(glowCanvas)
  glowTexture.name = 'Goods badge glow'
  glowTexture.colorSpace = THREE.SRGBColorSpace
  const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, opacity: 0.6 })
  glowMaterial.name = 'Goods badge glow'

  // "+1": one texture, a few sprites each with its own material so they fade apart.
  const popCanvas = makeCanvas(96, 64)
  const popCtx = popCanvas.getContext('2d')
  if (popCtx) {
    popCtx.font = 'bold 46px "Trebuchet MS", sans-serif'
    popCtx.textAlign = 'center'
    popCtx.textBaseline = 'middle'
    popCtx.lineWidth = 7
    popCtx.strokeStyle = FOOD_ART_COLORS.paper
    popCtx.strokeText('+1', 48, 34)
    popCtx.fillStyle = FOOD_ART_COLORS.terracotta
    popCtx.fillText('+1', 48, 34)
  }
  const popTexture = new THREE.CanvasTexture(popCanvas)
  popTexture.name = 'Goods +1'
  popTexture.colorSpace = THREE.SRGBColorSpace
  const pops: Pop[] = []
  const freePops: Pop[] = []
  for (let index = 0; index < MAX_POPS; index += 1) {
    const material = new THREE.SpriteMaterial({ map: popTexture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
    material.name = `Goods +1 · ${index}`
    const sprite = new THREE.Sprite(material)
    sprite.name = `Goods +1 ${index}`
    sprite.renderOrder = 931
    sprite.visible = false
    group.add(sprite)
    freePops.push({ sprite, material, age: 0, x: 0, y: 0, z: 0 })
  }

  const badges = new Map<string, Badge>()
  let enabled = true
  let sinceRefresh = REFRESH_SECONDS
  let lastIconRevision = 0

  function draw(entry: Badge): void {
    const ctx = entry.canvas.getContext('2d')
    const badge = entry.badge
    if (!ctx || !badge) return
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    roundedRect(ctx, 5, 5, CANVAS_W - 10, CANVAS_H - 10, 40)
    ctx.fillStyle = FOOD_ART_COLORS.paper
    ctx.fill()
    ctx.lineWidth = badge.full ? 7 : 5
    ctx.strokeStyle = badge.full ? FOOD_ART_COLORS.terracotta : FOOD_ART_COLORS.border
    ctx.stroke()
    const iconSize = 66
    const iconX = 17
    const iconY = (CANVAS_H - iconSize) / 2
    const image = icons.get(badge.good)
    if (image) ctx.drawImage(image, iconX, iconY, iconSize, iconSize)
    else drawGoodFallback(ctx, iconX, iconY, iconSize, badge.good)
    ctx.fillStyle = badge.full ? FOOD_ART_COLORS.terracotta : FOOD_ART_COLORS.border
    ctx.font = 'bold 50px "Trebuchet MS", Verdana, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(badgeCountLabel(badge.count), 134, CANVAS_H / 2 + 3)
    entry.texture.needsUpdate = true
  }

  function createBadge(house: BadgeHouse): Badge {
    const canvas = makeCanvas(CANVAS_W, CANVAS_H)
    const texture = new THREE.CanvasTexture(canvas)
    texture.name = `Goods badge · ${house.id}`
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false })
    material.name = `Goods badge · ${house.id}`
    const sprite = new THREE.Sprite(material)
    sprite.name = `Goods badge · ${house.id}`
    sprite.renderOrder = 930
    sprite.visible = false
    const glow = new THREE.Sprite(glowMaterial)
    glow.name = `Goods badge glow · ${house.id}`
    glow.renderOrder = 929
    glow.visible = false
    group.add(glow, sprite)
    return { houseId: house.id, sprite, glow, material, texture, canvas, key: '', badge: null, baseX: 0, baseY: 0, baseZ: 0, wanted: true, grow: 0, phase: phaseOf(house.id) }
  }

  function destroy(entry: Badge): void {
    group.remove(entry.sprite, entry.glow)
    entry.texture.dispose()
    entry.material.dispose()
  }

  function refresh(): void {
    const iconsChanged = iconRevision !== lastIconRevision
    lastIconRevision = iconRevision
    for (const entry of badges.values()) entry.wanted = false
    for (const house of deps.houses()) {
      const next = goodsBadge(deps.goodsIn(house.id))
      let entry = badges.get(house.id)
      if (!next) {
        if (entry) entry.wanted = false
        continue
      }
      if (!entry) {
        entry = createBadge(house)
        badges.set(house.id, entry)
      }
      entry.wanted = true
      const roof = propDefinition(house.prop as PropId).size
      entry.baseX = house.x
      entry.baseY = roof * 0.95 + 0.7
      entry.baseZ = house.z
      const key = goodsBadgeKey(next)
      entry.badge = next
      if (key !== entry.key || iconsChanged) {
        entry.key = key
        draw(entry)
      }
      entry.sprite.visible = true
    }
    // A house that was sold or emptied lets its badge shrink away, then frees it.
    for (const [id, entry] of badges) {
      if (!entry.wanted && entry.grow < 0.02) {
        destroy(entry)
        badges.delete(id)
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
      const ease = Math.min(1, deltaSeconds * 8)
      let anyFull = false
      for (const entry of badges.values()) {
        entry.grow += ((entry.wanted ? 1 : 0) - entry.grow) * ease
        const full = entry.wanted && entry.badge?.full === true
        if (full) anyFull = true
        const bob = Math.sin(nowSeconds * 1.7 + entry.phase) * 0.09
        const y = entry.baseY + bob
        entry.sprite.position.set(entry.baseX, y, entry.baseZ)
        entry.sprite.scale.set(BADGE_WIDTH * entry.grow, BADGE_HEIGHT * entry.grow, 1)
        entry.glow.visible = full
        if (full) {
          entry.glow.position.set(entry.baseX, y, entry.baseZ)
          entry.glow.scale.setScalar(BADGE_WIDTH * 1.75 * entry.grow)
        }
      }
      // The glow material is shared, so one pulse serves every full house.
      if (anyFull) glowMaterial.opacity = 0.5 + Math.sin(nowSeconds * 3.2) * 0.25
      for (let index = pops.length - 1; index >= 0; index -= 1) {
        const pop = pops[index]
        pop.age += deltaSeconds
        const t = pop.age / POP_SECONDS
        if (t >= 1) {
          pop.sprite.visible = false
          pops.splice(index, 1)
          freePops.push(pop)
          continue
        }
        const rise = 1 - (1 - t) * (1 - t)
        pop.sprite.position.set(pop.x, pop.y + rise * 1.1, pop.z)
        const size = 1.05 * (t < 0.15 ? t / 0.15 : 1)
        pop.sprite.scale.set(size, size * 0.667, 1)
        pop.material.opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
      }
    },
    notifyProduce(houseId) {
      if (!enabled || !houseId) return
      const entry = badges.get(houseId)
      const pop = freePops.pop()
      if (!pop) return
      // A badge that does not exist yet appears on the next refresh; the "+1" waits on the house itself.
      const house = entry ?? undefined
      const source = house ? { x: house.baseX, y: house.baseY, z: house.baseZ } : (() => {
        const spot = deps.houses().find((candidate) => candidate.id === houseId)
        return spot ? { x: spot.x, y: propDefinition(spot.prop as PropId).size * 0.95 + 0.7, z: spot.z } : null
      })()
      if (!source) {
        freePops.push(pop)
        return
      }
      pop.age = 0
      pop.x = source.x + 0.9
      pop.y = source.y + 0.5
      pop.z = source.z
      pop.material.opacity = 1
      pop.sprite.visible = true
      pop.sprite.position.set(pop.x, pop.y, pop.z)
      pop.sprite.scale.setScalar(0.001)
      pops.push(pop)
      // The count on the badge is the truth; read it now so the new good shows with the "+1".
      sinceRefresh = REFRESH_SECONDS
    },
    setEnabled(next) {
      if (next === enabled) return
      enabled = next
      group.visible = next
      if (next) sinceRefresh = REFRESH_SECONDS
    },
    get badgeCount() { return badges.size },
    dispose() {
      deps.scene.remove(group)
      for (const entry of badges.values()) destroy(entry)
      badges.clear()
      for (const pop of [...pops, ...freePops]) pop.material.dispose()
      popTexture.dispose()
      glowTexture.dispose()
      glowMaterial.dispose()
    },
  }
}
