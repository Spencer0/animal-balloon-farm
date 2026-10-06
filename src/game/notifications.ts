/**
 * Farm notifications: the midway ticket-ticker and the farm postbox.
 *
 * Two flavours, matching the two ways the farm talks to the player:
 *
 *   routine    everyday route news (a resident moves in, an egg is laid, a
 *              plant finishes growing). It never pops up; it lands in the
 *              postbox behind a badge count, for the player to read at
 *              leisure.
 *   spotlight  the center-ring call for accomplishments and species firsts
 *              (first appear, visit, resident, breed, first plant grown). Bigger,
 *              gold, and only ever once each. It plays on
 *              stage and is also filed in the postbox.
 *
 * Every ticket is filed in a ledger with one of three states:
 *
 *   unseen   filed but never played on stage (routine mail, or a spotlight
 *            still waiting in the wings).
 *   unread   played on stage but the postbox has not been opened since.
 *   read     the postbox was opened, or the ticket itself was clicked away.
 *
 * This module is deliberately pure: no Three.js, no DOM, no timers. It owns
 * the ledger, the stage queue, the lifetimes, the dedupe, and the "first
 * time ever" memory. The scene in `src/ui/notification-panel.ts` reads it
 * and draws the marquee, the mailbox and the letters. That split is what
 * lets the whole mechanic be verified from a node test.
 */

export type SpeciesMilestone = 'carnival' | 'farm' | 'resident' | 'egg'

export type NotificationKind =
  | 'resident'
  | 'egg'
  | 'plantGrown'
  | 'accomplishment'
  | 'firstCarnival'
  | 'firstFarm'
  | 'firstResident'
  | 'firstEgg'

export interface NotificationCopy {
  readonly title: string
  readonly detail: string
}

/**
 * The words on the ticket. `subject` is the display name the caller looked
 * up (animal or plant), so this module never has to know the catalogs.
 */
export function notificationCopy(kind: NotificationKind, subject: string): NotificationCopy {
  switch (kind) {
    case 'resident':
      return { title: `${subject} moved in!`, detail: 'A new resident joins the farm.' }
    case 'egg':
      return { title: `${subject} laid an egg!`, detail: 'Something is incubating.' }
    case 'plantGrown':
      return { title: `${subject} is fully grown!`, detail: 'Fresh from the soil.' }
    case 'accomplishment':
      return { title: subject, detail: 'An accomplishment was earned.' }
    case 'firstCarnival':
      return { title: 'New arrival at the circus!', detail: `${subject} showed up at the tents for the very first time.` }
    case 'firstFarm':
      return { title: 'A first visit to the farm!', detail: `${subject} wandered in for the very first time.` }
    case 'firstResident':
      return { title: 'A first resident!', detail: `The first ${subject} called the farm home.` }
    case 'firstEgg':
      return { title: 'A first egg!', detail: `The first ${subject} egg was laid.` }
  }
}

/** A ticket currently playing on stage (spotlights only). */
export interface Notification {
  readonly id: number
  readonly kind: NotificationKind
  readonly title: string
  readonly detail: string
  readonly spotlight: boolean
  readonly duration: number
  age: number
}

export type LedgerState = 'unseen' | 'unread' | 'read'

/** Farm-post time, e.g. `1 min ago`. `ageSeconds` counts from filing. */
export function relativeTimeLabel(ageSeconds: number): string {
  const age = Number.isFinite(ageSeconds) ? Math.max(0, ageSeconds) : 0
  if (age < 45) return 'just now'
  if (age < 90) return '1 min ago'
  if (age < 3600) return `${Math.floor(age / 60)} mins ago`
  if (age < 7200) return '1 hr ago'
  return `${Math.floor(age / 3600)} hrs ago`
}

/** Every ticket ever filed, newest last. */
export interface LedgerEntry {
  readonly id: number
  readonly kind: NotificationKind
  readonly title: string
  readonly detail: string
  readonly spotlight: boolean
  state: LedgerState
  /** Center-clock seconds when the ticket was filed. */
  readonly filedAt: number
}

export interface NotificationCenterOptions {
  readonly spotlightLifetime?: number
  readonly maxQueued?: number
  readonly maxLedger?: number
}

export const SPOTLIGHT_LIFETIME = 6.5
const MAX_QUEUED = 8
const MAX_LEDGER = 40

const MILESTONE_FIRST_KIND: Readonly<Record<SpeciesMilestone, NotificationKind>> = {
  carnival: 'firstCarnival',
  farm: 'firstFarm',
  resident: 'firstResident',
  egg: 'firstEgg',
}

const MILESTONE_ROUTINE_KIND: Readonly<Record<SpeciesMilestone, NotificationKind | null>> = {
  carnival: null,
  farm: null,
  resident: 'resident',
  egg: 'egg',
}

function isSpotlightKind(kind: NotificationKind): boolean {
  return kind === 'accomplishment' || kind === 'firstCarnival' || kind === 'firstFarm' || kind === 'firstResident' || kind === 'firstEgg'
}

export interface NotificationCenter {
  pushMilestone(milestone: SpeciesMilestone, subject: string): LedgerEntry | null
  pushPlantGrown(subject: string): LedgerEntry | null
  pushAccomplishment(title: string, detail: string): LedgerEntry
  tick(deltaSeconds: number): void
  visible(): readonly Notification[]
  queuedCount(): number
  history(): readonly LedgerEntry[]
  entryState(id: number): LedgerState | null
  unreadCount(): number
  markAllRead(): void
  dismiss(id: number): boolean
  reset(): void
  /** Seconds since the center was created, advanced by `tick`. */
  now(): number
}

export function createNotificationCenter(options: NotificationCenterOptions = {}): NotificationCenter {
  const spotlightLifetime = options.spotlightLifetime ?? SPOTLIGHT_LIFETIME
  const maxQueued = options.maxQueued ?? MAX_QUEUED
  const maxLedger = options.maxLedger ?? MAX_LEDGER
  let nextId = 1
  let nowSeconds = 0
  let live: Notification[] = []
  let queue: Notification[] = []
  let ledger: LedgerEntry[] = []
  const seenFirsts = new Set<string>()

  function ledgerById(id: number): LedgerEntry | undefined {
    return ledger.find((entry) => entry.id === id)
  }

  function trimLedger(): void {
    while (ledger.length > maxLedger) {
      const liveIds = new Set([...live, ...queue].map((entry) => entry.id))
      const dropIndex = ledger.findIndex((entry) => entry.state === 'read' && !liveIds.has(entry.id))
      if (dropIndex < 0) return
      ledger.splice(dropIndex, 1)
    }
  }

  /**
   * File a ticket. A repeat of something already sitting in the postbox
   * unread updates nothing -- five eggs in a minute is one letter, not five.
   */
  function file(kind: NotificationKind, subject: string, detail?: string): LedgerEntry {
    const copy = notificationCopy(kind, subject)
    const title = detail === undefined ? copy.title : subject
    const body = detail ?? copy.detail
    const duplicate = ledger.find((entry) => entry.kind === kind && entry.title === title && entry.state !== 'read')
    if (duplicate) return duplicate
    const entry: LedgerEntry = {
      filedAt: nowSeconds,
      id: nextId++,
      kind,
      title,
      detail: body,
      spotlight: isSpotlightKind(kind),
      state: 'unseen',
    }
    ledger.push(entry)
    trimLedger()
    if (entry.spotlight) {
      const ticket: Notification = {
        id: entry.id,
        kind,
        title: entry.title,
        detail: entry.detail,
        spotlight: true,
        duration: spotlightLifetime,
        age: 0,
      }
      queue.push(ticket)
      while (queue.length > maxQueued) queue.shift()
      promote()
    }
    return entry
  }

  function promote(): void {
    if (live.some((entry) => entry.spotlight)) return
    const next = queue.shift()
    if (!next) return
    live.push(next)
    const filed = ledgerById(next.id)
    if (filed && filed.state === 'unseen') filed.state = 'unread'
  }

  return {
    pushMilestone(milestone: SpeciesMilestone, subject: string): LedgerEntry | null {
      const name = subject.trim() || 'A mysterious friend'
      const memoryKey = `${milestone}:${name}`
      if (!seenFirsts.has(memoryKey)) {
        seenFirsts.add(memoryKey)
        return file(MILESTONE_FIRST_KIND[milestone], name)
      }
      const repeat = MILESTONE_ROUTINE_KIND[milestone]
      if (!repeat) return null
      return file(repeat, name)
    },
    pushPlantGrown(subject: string): LedgerEntry | null {
      const name = subject.trim() || 'A plant'
      return file('plantGrown', name)
    },
    pushAccomplishment(title: string, detail: string): LedgerEntry {
      return file('accomplishment', title.trim() || 'Accomplishment earned!', detail.trim() || 'An accomplishment was earned.')
    },
    tick(deltaSeconds: number): void {
      const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
      if (delta === 0) return
      nowSeconds += delta
      for (const entry of live) entry.age += delta
      live = live.filter((entry) => entry.age < entry.duration)
      promote()
    },
    visible(): readonly Notification[] {
      return live
    },
    queuedCount(): number {
      return queue.length
    },
    history(): readonly LedgerEntry[] {
      return ledger
    },
    entryState(id: number): LedgerState | null {
      return ledgerById(id)?.state ?? null
    },
    unreadCount(): number {
      return ledger.filter((entry) => entry.state !== 'read').length
    },
    markAllRead(): void {
      for (const entry of ledger) entry.state = 'read'
    },
    now(): number {
      return nowSeconds
    },
    dismiss(id: number): boolean {
      const filed = ledgerById(id)
      if (filed) filed.state = 'read'
      const before = live.length
      live = live.filter((entry) => entry.id !== id)
      if (live.length !== before) {
        promote()
        return true
      }
      const queuedBefore = queue.length
      queue = queue.filter((entry) => entry.id !== id)
      return filed !== undefined || queue.length !== queuedBefore
    },
    reset(): void {
      nowSeconds = 0
      live = []
      queue = []
      ledger = []
      seenFirsts.clear()
    },
  }
}
