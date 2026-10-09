import * as THREE from 'three'
import {
  createNotificationCenter,
  relativeTimeLabel,
  type LedgerEntry,
  type Notification,
  type NotificationCenter,
  type SpeciesMilestone,
} from '../game/notifications'
import { createUIViewport, rectContains, type DesignPoint, type DesignRect, type UIViewport } from './ui-viewport'
import type { UIPanel } from './ui-layer'
import type { UiCursorKind } from './ui-cursor'
import { createSurface, fillRoundRect, strokeRoundRect, UI_THEME, withShadow } from './ui-theme'

/**
 * The farm postbox and the center-ring marquee.
 *
 * Routine route news (a resident moves in, a baby is born, a plant finishes
 * growing) never pops up; it lands in the postbox, a mailbox tucked under the
 * progression card with a badge count and a red flag that stands whenever
 * unread mail is waiting. Clicking the mailbox opens the letters, which also
 * marks everything read and lowers the flag. Species firsts still get the
 * center-ring call: a striped-awning marquee across the top with a little
 * pop, filed in the postbox as well.
 *
 * Everything is drawn on canvas textures on planes in the one centralized UI
 * layer -- no DOM, no HTML overlays. The ledger, the stage queue and the
 * first-time memory live in the pure `src/game/notifications.ts` center;
 * this panel only draws whatever the center reports.
 */

export interface NotificationPanel extends UIPanel {
  notifyMilestone(milestone: SpeciesMilestone, subject: string): void
  notifyPlantGrown(subject: string): void
  notifyAccomplishment(title: string, detail: string): void
  setVisible(visible: boolean): void
  toggleInbox(): void
  readonly isInboxOpen: boolean
  setMailboxVisible(visible: boolean): void
  getUnreadCount(): number
  getLetters(): readonly LedgerEntry[]
  nowSeconds(): number
  markAllRead(): void
}

const MAILBOX_SIZE = 76
const MAILBOX_GAP = 16
const INBOX_WIDTH = 420
const INBOX_HEADER = 48
const INBOX_ROW = 58
const INBOX_FOOTER = 30
const INBOX_MAX_ROWS = 8
const INBOX_GAP = 8
const SPOTLIGHT_WIDTH = 680
const SPOTLIGHT_HEIGHT = 142
const SPOTLIGHT_TOP_MARGIN = 24
const FADE_OUT_SPOTLIGHT = 1.1

const DOT_COLORS: Readonly<Record<LedgerEntry['kind'], string>> = {
  resident: UI_THEME.barnRed,
  birth: '#c98f2e',
  plantGrown: UI_THEME.meadow,
  accomplishment: UI_THEME.gilt,
  firstCarnival: UI_THEME.leather,
  firstFarm: UI_THEME.leather,
  firstResident: UI_THEME.leather,
  firstBirth: UI_THEME.leather,
}

function ellipsize(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text
  let clipped = text
  while (clipped.length > 1 && context.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped}…`
}

function drawMailbox(hasMail: boolean, badge: string): HTMLCanvasElement {
  const surface = createSurface(MAILBOX_SIZE, MAILBOX_SIZE)
  const context = surface.context
  withShadow(context, 8, 3, () => {
    context.fillStyle = '#6b4a30'
    fillRoundRect(context, 34, 42, 8, 28, 3, '#6b4a30')
    fillRoundRect(context, 12, 20, 52, 30, 9, UI_THEME.leather)
  })
  strokeRoundRect(context, 13, 21, 50, 28, 8, UI_THEME.gilt, 2)
  context.strokeStyle = 'rgba(251, 240, 214, .55)'
  context.lineWidth = 1.6
  context.beginPath()
  context.moveTo(44, 23)
  context.lineTo(44, 47)
  context.stroke()
  context.strokeStyle = hasMail ? UI_THEME.barnRed : UI_THEME.inkSoft
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(60, 22)
  context.lineTo(60, 46)
  context.stroke()
  context.fillStyle = hasMail ? UI_THEME.barnRed : UI_THEME.inkSoft
  if (hasMail) {
    context.beginPath()
    context.moveTo(60, 22)
    context.lineTo(74, 27)
    context.lineTo(60, 32)
    context.closePath()
    context.fill()
  } else {
    context.beginPath()
    context.arc(60, 48, 3.4, 0, Math.PI * 2)
    context.fill()
  }
  if (badge) {
    context.font = 'bold 19px Georgia, "Times New Roman", serif'
    const textWidth = context.measureText(badge).width
    const radius = Math.max(13, textWidth / 2 + 7)
    withShadow(context, 6, 2, () => {
      context.fillStyle = UI_THEME.barnRed
      context.beginPath()
      context.arc(MAILBOX_SIZE - radius - 1, radius + 1, radius, 0, Math.PI * 2)
      context.fill()
    })
    context.fillStyle = UI_THEME.cream
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(badge, MAILBOX_SIZE - radius - 1, radius + 2.5)
  }
  return surface.canvas
}

function drawInbox(entries: readonly LedgerEntry[], hiddenCount: number, nowSeconds: number): HTMLCanvasElement {
  const rows = entries.slice(-INBOX_MAX_ROWS).reverse()
  const height = INBOX_HEADER + rows.length * INBOX_ROW + (hiddenCount > 0 ? INBOX_FOOTER : 12)
  const surface = createSurface(INBOX_WIDTH, height)
  const context = surface.context
  withShadow(context, 12, 4, () => {
    fillRoundRect(context, 2, 2, INBOX_WIDTH - 4, height - 4, 16, UI_THEME.paper)
  })
  strokeRoundRect(context, 3, 3, INBOX_WIDTH - 6, height - 6, 14, UI_THEME.gilt, 2)
  context.fillStyle = UI_THEME.ink
  context.font = 'bold 20px Georgia, "Times New Roman", serif'
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillText('Farm post', 20, 31)
  const unread = entries.filter((entry) => entry.state !== 'read').length
  context.fillStyle = UI_THEME.inkSoft
  context.font = 'italic 14px Georgia, "Times New Roman", serif'
  context.textAlign = 'right'
  context.fillText(entries.length === 0 ? 'nothing yet' : unread > 0 ? `${unread} new` : 'all caught up', INBOX_WIDTH - 20, 30)
  context.strokeStyle = 'rgba(138, 104, 74, .5)'
  context.lineWidth = 1.4
  context.beginPath()
  context.moveTo(16, INBOX_HEADER - 6)
  context.lineTo(INBOX_WIDTH - 16, INBOX_HEADER - 6)
  context.stroke()
  if (rows.length === 0) {
    context.fillStyle = UI_THEME.inkSoft
    context.font = 'italic 15px Georgia, "Times New Roman", serif'
    context.textAlign = 'center'
    context.fillText('No letters yet — the farm will write.', INBOX_WIDTH / 2, INBOX_HEADER + 30)
    return surface.canvas
  }
  rows.forEach((entry, index) => {
    const top = INBOX_HEADER + index * INBOX_ROW
    const read = entry.state === 'read'
    context.save()
    if (read) context.globalAlpha = 0.62
    if (entry.state === 'unseen') {
      context.fillStyle = UI_THEME.gilt
      context.fillRect(10, top + 8, 4, INBOX_ROW - 16)
    }
    context.fillStyle = DOT_COLORS[entry.kind]
    context.beginPath()
    context.arc(30, top + 22, 7, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = read ? UI_THEME.inkSoft : UI_THEME.ink
    context.font = entry.state === 'read'
      ? '16px Georgia, "Times New Roman", serif'
      : 'bold 16px Georgia, "Times New Roman", serif'
    context.textAlign = 'left'
    context.fillText(ellipsize(context, entry.title, INBOX_WIDTH - 170), 46, top + 28)
    context.fillStyle = UI_THEME.inkSoft
    context.font = 'italic 13px Georgia, "Times New Roman", serif'
    context.fillText(ellipsize(context, entry.detail, INBOX_WIDTH - 170), 46, top + 47)
    context.fillStyle = UI_THEME.inkSoft
    context.font = 'italic 12px Georgia, "Times New Roman", serif'
    context.textAlign = 'right'
    context.fillText(relativeTimeLabel(Math.max(0, nowSeconds - entry.filedAt)), INBOX_WIDTH - 16, top + 24)
    context.textAlign = 'left'
    context.restore()
  })
  if (hiddenCount > 0) {
    context.fillStyle = UI_THEME.inkSoft
    context.font = 'italic 13px Georgia, "Times New Roman", serif'
    context.textAlign = 'center'
    context.fillText(`+ ${hiddenCount} older ${hiddenCount === 1 ? 'letter' : 'letters'}`, INBOX_WIDTH / 2, height - 10)
  }
  return surface.canvas
}

function drawAwning(context: CanvasRenderingContext2D, width: number, stripeHeight: number): void {
  const stripes = 17
  const stripeWidth = width / stripes
  context.save()
  context.beginPath()
  context.rect(0, 0, width, stripeHeight)
  context.clip()
  for (let index = 0; index < stripes; index += 1) {
    context.fillStyle = index % 2 === 0 ? UI_THEME.barnRed : UI_THEME.cream
    context.fillRect(index * stripeWidth, 0, stripeWidth + 1, stripeHeight)
  }
  context.restore()
  context.fillStyle = UI_THEME.gilt
  context.fillRect(0, stripeHeight - 3, width, 3)
}

function drawSpotlightMarquee(notification: Notification): HTMLCanvasElement {
  const surface = createSurface(SPOTLIGHT_WIDTH, SPOTLIGHT_HEIGHT)
  const context = surface.context
  withShadow(context, 14, 4, () => {
    fillRoundRect(context, 2, 2, SPOTLIGHT_WIDTH - 4, SPOTLIGHT_HEIGHT - 4, 18, UI_THEME.paper)
  })
  context.save()
  context.beginPath()
  context.moveTo(2, 30)
  context.lineTo(2, 20)
  context.quadraticCurveTo(2, 2, 20, 2)
  context.lineTo(SPOTLIGHT_WIDTH - 20, 2)
  context.quadraticCurveTo(SPOTLIGHT_WIDTH - 2, 2, SPOTLIGHT_WIDTH - 2, 20)
  context.lineTo(SPOTLIGHT_WIDTH - 2, 30)
  context.closePath()
  context.clip()
  drawAwning(context, SPOTLIGHT_WIDTH, 30)
  context.restore()
  strokeRoundRect(context, 3, 3, SPOTLIGHT_WIDTH - 6, SPOTLIGHT_HEIGHT - 6, 16, UI_THEME.gilt, 2.5)
  context.fillStyle = UI_THEME.barnRed
  context.font = 'bold 13px Georgia, "Times New Roman", serif'
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  const tracking = context.letterSpacing
  context.letterSpacing = '4px'
  context.fillText('★ CENTER RING ★', SPOTLIGHT_WIDTH / 2, 56)
  context.letterSpacing = tracking
  context.fillStyle = UI_THEME.ink
  context.font = 'bold 31px Georgia, "Times New Roman", serif'
  context.fillText(ellipsize(context, notification.title, SPOTLIGHT_WIDTH - 80), SPOTLIGHT_WIDTH / 2, 90)
  context.fillStyle = UI_THEME.inkSoft
  context.font = 'italic 17px Georgia, "Times New Roman", serif'
  context.fillText(ellipsize(context, notification.detail, SPOTLIGHT_WIDTH - 80), SPOTLIGHT_WIDTH / 2, 117)
  return surface.canvas
}

function easeOutBack(time: number): number {
  const eased = time - 1
  return 1 + 2.2 * eased * eased * eased + 1.2 * eased * eased
}

/** The progression card this mailbox tucks underneath (see progression-hud). */
const PROGRESSION_CARD_HEIGHT = 124
const PROGRESSION_TOP_MARGIN = 22

interface CardEntry {
  readonly notification: Notification
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  readonly texture: THREE.CanvasTexture
  centerX: number
  centerY: number
}

function badgeFor(unread: number): string {
  if (unread <= 0) return ''
  return unread > 9 ? '9+' : String(unread)
}

export function createNotificationPanel(width: number, height: number): NotificationPanel {
  const viewport: UIViewport = createUIViewport()
  viewport.resize(width, height)
  const center: NotificationCenter = createNotificationCenter()
  const group = new THREE.Group()
  group.name = 'Farm postbox and center ring'
  let mailboxVisible = true
  const cards = new Map<number, CardEntry>()
  let shown = true
  let inboxOpen = false
  let lastUnread = 0
  let bounceAge = 99

  const mailboxTexture = new THREE.CanvasTexture(drawMailbox(false, ''))
  mailboxTexture.colorSpace = THREE.SRGBColorSpace
  mailboxTexture.anisotropy = 4
  const mailboxMaterial = new THREE.MeshBasicMaterial({ map: mailboxTexture, transparent: true, depthTest: false, depthWrite: false })
  const mailbox = new THREE.Mesh(new THREE.PlaneGeometry(MAILBOX_SIZE, MAILBOX_SIZE), mailboxMaterial)
  mailbox.name = 'Farm postbox'
  mailbox.renderOrder = 9
  group.add(mailbox)

  let inboxMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  let inboxTexture: THREE.CanvasTexture | null = null
  let inboxRect: DesignRect | null = null
  let mailboxSignature = ''
  let inboxSignature = ''

  function mailboxSlot(): { x: number; y: number } {
    return {
      x: viewport.left + 24 + MAILBOX_SIZE / 2,
      y: viewport.top - PROGRESSION_TOP_MARGIN - PROGRESSION_CARD_HEIGHT - MAILBOX_GAP - MAILBOX_SIZE / 2,
    }
  }

  function spotlightSlot(): { x: number; y: number } {
    return { x: 0, y: viewport.top - SPOTLIGHT_TOP_MARGIN - SPOTLIGHT_HEIGHT / 2 }
  }

  function spawn(entry: Notification): void {
    const canvas = drawSpotlightMarquee(entry)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SPOTLIGHT_WIDTH, SPOTLIGHT_HEIGHT), material)
    mesh.name = 'Center-ring spotlight'
    mesh.renderOrder = 9
    group.add(mesh)
    const slot = spotlightSlot()
    cards.set(entry.id, { notification: entry, mesh, texture, centerX: slot.x, centerY: slot.y })
  }

  function retire(id: number): void {
    const card = cards.get(id)
    if (!card) return
    cards.delete(id)
    group.remove(card.mesh)
    card.mesh.geometry.dispose()
    card.mesh.material.dispose()
    card.texture.dispose()
  }

  function sync(): void {
    const live = new Map(center.visible().map((entry) => [entry.id, entry] as const))
    for (const id of [...cards.keys()]) {
      if (!live.has(id)) retire(id)
    }
    for (const entry of live.values()) {
      if (!cards.has(entry.id)) spawn(entry)
    }
  }

  function opacityFor(entry: Notification): number {
    const fadeIn = Math.min(1, entry.age / 0.25)
    const remaining = entry.duration - entry.age
    return Math.min(fadeIn, THREE.MathUtils.clamp(remaining / FADE_OUT_SPOTLIGHT, 0, 1))
  }

  function refreshMailbox(unread: number): void {
    const signature = `${unread}`
    if (signature === mailboxSignature) return
    mailboxSignature = signature
    mailboxTexture.image = drawMailbox(unread > 0, badgeFor(unread))
    mailboxTexture.needsUpdate = true
  }

  function closeInbox(): void {
    if (inboxMesh) {
      group.remove(inboxMesh)
      inboxMesh.geometry.dispose()
      inboxMesh.material.dispose()
    }
    inboxTexture?.dispose()
    inboxMesh = null
    inboxTexture = null
    inboxRect = null
    inboxSignature = ''
  }

  function refreshInbox(): void {
    const history = center.history()
    const nowSeconds = center.now()
    const timeBucket = Math.floor(nowSeconds / 20)
    const signature = `${history.map((entry) => `${entry.id}:${entry.state}`).join(',')}|${timeBucket}`
    if (!inboxOpen) {
      if (inboxMesh) closeInbox()
      return
    }
    if (inboxMesh && signature === inboxSignature) return
    inboxSignature = signature
    closeInbox()
    inboxSignature = signature
    const shownEntries = history.slice(-INBOX_MAX_ROWS)
    const hiddenCount = Math.max(0, history.length - shownEntries.length)
    const height = INBOX_HEADER + shownEntries.length * INBOX_ROW + (hiddenCount > 0 ? INBOX_FOOTER : 12)
    const canvas = drawInbox(history, hiddenCount, nowSeconds)
    inboxTexture = new THREE.CanvasTexture(canvas)
    inboxTexture.colorSpace = THREE.SRGBColorSpace
    inboxTexture.anisotropy = 4
    const material = new THREE.MeshBasicMaterial({ map: inboxTexture, transparent: true, depthTest: false, depthWrite: false })
    inboxMesh = new THREE.Mesh(new THREE.PlaneGeometry(INBOX_WIDTH, height), material)
    inboxMesh.name = 'Farm post letters'
    inboxMesh.renderOrder = 9
    group.add(inboxMesh)
    inboxRect = {
      x: viewport.left + 24,
      y: mailboxSlot().y - MAILBOX_SIZE / 2 - INBOX_GAP - height,
      width: INBOX_WIDTH,
      height,
    }
    layoutInbox()
  }

  function layoutInbox(): void {
    if (!inboxMesh || !inboxRect) return
    inboxMesh.position.set(inboxRect.x + inboxRect.width / 2, inboxRect.y + inboxRect.height / 2, 4)
  }

  function layout(): void {
    const slot = mailboxSlot()
    const bounce = bounceAge < 0.5 ? 1 + 0.22 * Math.sin((bounceAge / 0.5) * Math.PI) : 1
    mailbox.position.set(slot.x, slot.y, 0)
    mailbox.scale.setScalar(bounce)
    mailbox.visible = mailboxVisible
    const live = center.visible()
    const spotlight = live.find((entry) => entry.spotlight)
    if (spotlight) {
      const card = cards.get(spotlight.id)
      if (card) {
        const anchor = spotlightSlot()
        const pop = spotlight.age < 0.45 ? easeOutBack(THREE.MathUtils.clamp(spotlight.age / 0.45, 0, 1)) : 1
        const bob = spotlight.age < 0.45 ? 0 : Math.sin(spotlight.age * 2.2) * 4
        card.centerX = anchor.x
        card.centerY = anchor.y + bob
        card.mesh.position.set(card.centerX, card.centerY, 8)
        card.mesh.scale.setScalar(Math.max(0.01, pop))
        card.mesh.material.opacity = opacityFor(spotlight)
      }
    }
    layoutInbox()
  }

  function mailboxRect(): DesignRect {
    const slot = mailboxSlot()
    return { x: slot.x - MAILBOX_SIZE / 2, y: slot.y - MAILBOX_SIZE / 2, width: MAILBOX_SIZE, height: MAILBOX_SIZE }
  }

  function spotlightCardAt(point: DesignPoint): CardEntry | undefined {
    const live = center.visible()
    const spotlight = live.find((entry) => entry.spotlight)
    if (!spotlight) return undefined
    const card = cards.get(spotlight.id)
    if (!card) return undefined
    const hit = rectContains({
      x: card.centerX - SPOTLIGHT_WIDTH / 2,
      y: card.centerY - SPOTLIGHT_HEIGHT / 2,
      width: SPOTLIGHT_WIDTH,
      height: SPOTLIGHT_HEIGHT,
    }, point)
    return hit ? card : undefined
  }

  return {
    name: 'notification-panel',
    object: group,
    order: 9,
    notifyMilestone(milestone: SpeciesMilestone, subject: string): void {
      center.pushMilestone(milestone, subject)
      sync()
      layout()
    },
    notifyPlantGrown(subject: string): void {
      center.pushPlantGrown(subject)
      sync()
      layout()
    },
    notifyAccomplishment(title: string, detail: string): void {
      center.pushAccomplishment(title, detail)
      sync()
      layout()
    },
    setVisible(visible: boolean): void {
      shown = visible
      group.visible = visible
      if (!visible) {
        inboxOpen = false
        refreshInbox()
      }
    },
    toggleInbox(): void {
      if (!shown) return
      inboxOpen = !inboxOpen
      if (inboxOpen) center.markAllRead()
      refreshInbox()
    },
    get isInboxOpen(): boolean {
      return inboxOpen
    },
    setMailboxVisible(next: boolean): void {
      mailboxVisible = next
      layout()
    },
    getUnreadCount(): number {
      return center.unreadCount()
    },
    getLetters(): readonly LedgerEntry[] {
      return center.history()
    },
    nowSeconds(): number {
      return center.now()
    },
    markAllRead(): void {
      center.markAllRead()
    },
    pointerDown(point: DesignPoint): boolean {
      if (!shown) return false
      if (inboxRect && rectContains(inboxRect, point)) return true
      if (mailboxVisible && rectContains(mailboxRect(), point)) {
        inboxOpen = !inboxOpen
        if (inboxOpen) center.markAllRead()
        refreshInbox()
        return true
      }
      const card = spotlightCardAt(point)
      if (!card) return false
      center.dismiss(card.notification.id)
      sync()
      layout()
      return true
    },
    pointerMove(): boolean {
      return false
    },
    pointerUp(): boolean {
      return false
    },
    cursor(point: DesignPoint): UiCursorKind | undefined {
      if (!shown) return undefined
      if (mailboxVisible && rectContains(mailboxRect(), point)) return 'point'
      if (inboxRect && rectContains(inboxRect, point)) return undefined
      return spotlightCardAt(point) ? 'point' : undefined
    },
    hitTest(point: DesignPoint): boolean {
      if (!shown) return false
      if (mailboxVisible && rectContains(mailboxRect(), point)) return true
      if (inboxRect && rectContains(inboxRect, point)) return true
      return spotlightCardAt(point) !== undefined
    },
    update(delta: number): void {
      center.tick(delta)
      if (!shown) { lastUnread = center.unreadCount(); return }
      bounceAge += delta
      const unread = center.unreadCount()
      if (unread > lastUnread) bounceAge = 0
      lastUnread = unread
      if (inboxOpen) center.markAllRead()
      sync()
      refreshMailbox(inboxOpen ? 0 : unread)
      refreshInbox()
      layout()
    },
    resize(cssWidth: number, cssHeight): void {
      viewport.resize(cssWidth, cssHeight)
      inboxSignature = ''
      refreshInbox()
      layout()
    },
    describe(): unknown {
      const live = center.visible()
      const history = center.history()
      return {
        visible: shown,
        unread: center.unreadCount(),
        inboxOpen,
        mailbox: (() => {
          const rect = mailboxRect()
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height }
        })(),
        inbox: inboxRect ? { ...inboxRect, letters: history.length } : null,
        queued: center.queuedCount(),
        spotlight: (() => {
          const entry = live.find((candidate) => candidate.spotlight)
          const card = entry ? cards.get(entry.id) : undefined
          return entry
            ? { title: entry.title, x: card?.centerX ?? null, y: card?.centerY ?? null, width: SPOTLIGHT_WIDTH, height: SPOTLIGHT_HEIGHT }
            : null
        })(),
      }
    },
    dispose(): void {
      for (const id of [...cards.keys()]) retire(id)
      closeInbox()
      mailboxTexture.dispose()
      mailboxMaterial.dispose()
      mailbox.geometry.dispose()
    },
  }
}
