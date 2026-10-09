/**
 * Save slots: the envelope a farm is written in, and the store that keeps it.
 *
 * Pure -- no Three.js, no DOM -- so it is tested in `tests/save-game.test.mjs`
 * with an in-memory `Storage`. What goes *in* a save is gathered by `main.ts`
 * from each system's own `exportState()`; this file only knows how to wrap it,
 * check it, find it again, and say so honestly when it cannot.
 *
 * Loading and starting over both work by reloading the page. The farm is built
 * once, at start-up, out of dozens of modules; tearing all of it down live and
 * rebuilding it would be a second, untested code path for every one of them.
 * Instead a reload is queued (`queueBoot`) and the next start-up asks the store
 * what to do (`takeBoot`), so a load is exactly as trustworthy as a fresh start.
 */

import type { AnimalLifeState } from './animal-life'
import type { PlantSimulationState } from './plants'
import type { ProgressLedgerState } from './farm-progression'

export const SAVE_APP_ID = 'animal-balloon-farm'
/** Bumped when the shape of `SaveGameData` changes in a way old code cannot read. */
export const SAVE_VERSION = 1
export const SAVE_SLOT_COUNT = 3

/** A sparse numeric field (terrain, water) packed as little-endian Int16s. */
export interface PackedField {
  readonly cols: number
  readonly rows: number
  /** Base64 of `cols * rows` Int16 values; divide by `scale` to get metres. */
  readonly data: string
  readonly scale: number
}

export interface SavedAnimalPlace {
  readonly x: number
  readonly z: number
  readonly name: string
}

export interface SavedProp {
  readonly id: string
  readonly cellX: number
  readonly cellZ: number
  readonly rotation: number
}

export interface SavedFenceSegment {
  readonly x: number
  readonly z: number
  readonly axis: 'x' | 'z'
}

export interface SavedGrass {
  /** Base64 Int16 world x of each blade in centimetres. */
  readonly xs: string
  /** Base64 Int16 world z of each blade in centimetres. */
  readonly zs: string
  /** Base64 Uint8 blade height, in `GRASS_HEIGHT_STEPS` per metre. */
  readonly heights: string
  readonly count: number
  /** Base64 Int16 lawn-paint keys (x, z pairs) and Uint8 coverage in percent. */
  readonly paintKeys: string
  readonly paintCoverage: string
  readonly paintCount: number
}

export interface SaveGameData {
  readonly playSeconds: number
  readonly clock: { readonly timeOfDay: number; readonly elapsedDays: number }
  readonly coins: number
  readonly progression: ProgressLedgerState
  readonly upgrades: Readonly<Record<string, number>>
  readonly accomplishments: readonly string[]
  readonly expansionLevel: number
  readonly life: AnimalLifeState
  readonly animalPlaces: Readonly<Record<string, SavedAnimalPlace>>
  /** Prey eaten per species, which `preyEaten` conditions count. */
  readonly preyEaten: Readonly<Record<string, number>>
  readonly plants: PlantSimulationState
  readonly props: {
    readonly inventory: Readonly<Record<string, number>>
    readonly placed: readonly SavedProp[]
    /** One entry per placed run, so selling or storing a run still acts on the same pieces. */
    readonly fenceRuns: readonly (readonly SavedFenceSegment[])[]
  }
  readonly terrain: PackedField
  readonly water: PackedField
  readonly grass: SavedGrass
  readonly tools: {
    readonly grassPack: 'short' | 'tall'
  }
  readonly journalBestStage: Readonly<Record<string, number>>
}

/** What a slot card shows without having to decode the whole farm. */
export interface SaveSummary {
  readonly farmerLevel: number
  readonly coins: number
  /** Whole days since the farm began. */
  readonly day: number
  readonly residents: number
  readonly playSeconds: number
}

export interface SaveEnvelope {
  readonly app: typeof SAVE_APP_ID
  readonly version: number
  readonly savedAt: number
  readonly summary: SaveSummary
  readonly data: SaveGameData
}

// -------------------------------------------------------------------- codecs --

const CHUNK = 0x8000

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/** Pack numbers as little-endian Int16 after multiplying by `scale`; values clamp to the range. */
export function packInt16(values: ArrayLike<number>, scale: number): string {
  const bytes = new Uint8Array(values.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < values.length; index += 1) {
    const scaled = Math.round((Number.isFinite(values[index]) ? values[index] : 0) * scale)
    view.setInt16(index * 2, Math.max(-32768, Math.min(32767, scaled)), true)
  }
  return bytesToBase64(bytes)
}

/** Inverse of `packInt16`. Throws if the text is not base64 or the wrong length. */
export function unpackInt16(text: string, scale: number, expectedLength?: number): Float32Array {
  const bytes = base64ToBytes(text)
  if (bytes.length % 2 !== 0) throw new RangeError('Packed Int16 data has an odd byte count')
  const length = bytes.length / 2
  if (expectedLength !== undefined && length !== expectedLength) {
    throw new RangeError(`Packed data holds ${length} values, expected ${expectedLength}`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out = new Float32Array(length)
  for (let index = 0; index < length; index += 1) out[index] = view.getInt16(index * 2, true) / scale
  return out
}

export function packUint8(values: ArrayLike<number>, scale: number): string {
  const bytes = new Uint8Array(values.length)
  for (let index = 0; index < values.length; index += 1) {
    const scaled = Math.round((Number.isFinite(values[index]) ? values[index] : 0) * scale)
    bytes[index] = Math.max(0, Math.min(255, scaled))
  }
  return bytesToBase64(bytes)
}

export function unpackUint8(text: string, scale: number, expectedLength?: number): Float32Array {
  const bytes = base64ToBytes(text)
  if (expectedLength !== undefined && bytes.length !== expectedLength) {
    throw new RangeError(`Packed data holds ${bytes.length} values, expected ${expectedLength}`)
  }
  const out = new Float32Array(bytes.length)
  for (let index = 0; index < bytes.length; index += 1) out[index] = bytes[index] / scale
  return out
}

/** Blade heights are stored in 1/250 m steps, which tops out above the tallest pack. */
export const GRASS_HEIGHT_STEPS = 250
/** Blade positions are stored in centimetres. */
export const GRASS_POSITION_SCALE = 100

// ------------------------------------------------------------------ envelope --

export function makeEnvelope(data: SaveGameData, summary: SaveSummary, savedAt: number): SaveEnvelope {
  return { app: SAVE_APP_ID, version: SAVE_VERSION, savedAt, summary, data }
}

export type ParseFailure = 'unreadable' | 'wrong-app' | 'too-new' | 'malformed'

export type ParseResult =
  | { readonly ok: true; readonly envelope: SaveEnvelope }
  | { readonly ok: false; readonly failure: ParseFailure }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * Read a stored string back into an envelope. This checks the *shape* of every
 * section the loader indexes into; each system's own `importState` then
 * sanitises its own numbers. Older versions would be migrated here.
 */
export function parseEnvelope(text: string | null): ParseResult {
  if (text === null) return { ok: false, failure: 'unreadable' }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, failure: 'unreadable' }
  }
  if (!isRecord(raw) || raw.app !== SAVE_APP_ID) return { ok: false, failure: 'wrong-app' }
  if (!isNumber(raw.version) || raw.version < 1) return { ok: false, failure: 'malformed' }
  if (raw.version > SAVE_VERSION) return { ok: false, failure: 'too-new' }
  const { summary, data } = raw
  if (!isNumber(raw.savedAt) || !isRecord(summary) || !isRecord(data)) return { ok: false, failure: 'malformed' }
  const summaryOk = ['farmerLevel', 'coins', 'day', 'residents', 'playSeconds'].every((key) => isNumber(summary[key]))
  const field = (value: unknown): boolean => isRecord(value) && isNumber(value.cols) && isNumber(value.rows)
    && typeof value.data === 'string' && isNumber(value.scale)
  const life = data.life
  const dataOk = isNumber(data.playSeconds) && isNumber(data.coins) && isNumber(data.expansionLevel)
    && isRecord(data.clock) && isNumber(data.clock.timeOfDay) && isNumber(data.clock.elapsedDays)
    && isRecord(data.progression) && Array.isArray(data.progression.awarded)
    && isRecord(data.upgrades) && Array.isArray(data.accomplishments)
    && isRecord(life) && Array.isArray(life.animals)
    && Array.isArray(life.discovered) && Array.isArray(life.pendingVisitors)
    && isRecord(data.animalPlaces) && isRecord(data.preyEaten)
    && isRecord(data.plants) && Array.isArray(data.plants.plants) && isRecord(data.plants.seeds)
    && isRecord(data.props) && Array.isArray(data.props.placed) && Array.isArray(data.props.fenceRuns) && isRecord(data.props.inventory)
    && field(data.terrain) && field(data.water)
    && isRecord(data.grass) && typeof data.grass.xs === 'string' && typeof data.grass.zs === 'string'
    && typeof data.grass.heights === 'string' && isNumber(data.grass.count)
    && typeof data.grass.paintKeys === 'string' && typeof data.grass.paintCoverage === 'string' && isNumber(data.grass.paintCount)
    && isRecord(data.tools) && isRecord(data.journalBestStage)
  if (!summaryOk || !dataOk) return { ok: false, failure: 'malformed' }
  return { ok: true, envelope: raw as unknown as SaveEnvelope }
}

// --------------------------------------------------------------------- store --

/** The slice of `Storage` the store needs, so tests can pass a plain object. */
export interface SaveStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type SlotInfo =
  | { readonly slot: number; readonly status: 'empty' }
  | { readonly slot: number; readonly status: 'damaged'; readonly failure: ParseFailure }
  | { readonly slot: number; readonly status: 'ok'; readonly savedAt: number; readonly summary: SaveSummary }

export type WriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unavailable' | 'full' | 'invalid-slot' }

/** What the next start-up should do, set just before the page reloads. */
export type BootRequest =
  | { readonly kind: 'load'; readonly slot: number }
  | { readonly kind: 'new'; readonly slot: number }

const KEY_PREFIX = `${SAVE_APP_ID}.save.`
const slotKey = (slot: number): string => `${KEY_PREFIX}slot${slot}`
const BOOT_KEY = `${KEY_PREFIX}boot`
const ACTIVE_KEY = `${KEY_PREFIX}active`

export interface SaveStore {
  /** False when the browser refused storage altogether (private mode, blocked cookies). */
  readonly available: boolean
  slots(): readonly SlotInfo[]
  read(slot: number): ParseResult
  write(slot: number, envelope: SaveEnvelope): WriteResult
  erase(slot: number): void
  /** The slot the running farm saves into, or null before it has been given one. */
  activeSlot(): number | null
  setActiveSlot(slot: number | null): void
  /** The slot that last saved, for a Continue button. */
  newestSlot(): number | null
  queueBoot(request: BootRequest): boolean
  /** Read and clear the queued request; it applies to one start-up only. */
  takeBoot(): BootRequest | null
}

export const isValidSlot = (slot: unknown): slot is number =>
  typeof slot === 'number' && Number.isInteger(slot) && slot >= 1 && slot <= SAVE_SLOT_COUNT

function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, code } = error as { name?: unknown; code?: unknown }
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014
}

export function createSaveStore(storage: SaveStorage | null): SaveStore {
  const safeGet = (key: string): string | null => {
    if (!storage) return null
    try { return storage.getItem(key) } catch { return null }
  }

  function read(slot: number): ParseResult {
    if (!isValidSlot(slot)) return { ok: false, failure: 'unreadable' }
    return parseEnvelope(safeGet(slotKey(slot)))
  }

  function info(slot: number): SlotInfo {
    const text = safeGet(slotKey(slot))
    if (text === null) return { slot, status: 'empty' }
    const parsed = parseEnvelope(text)
    if (!parsed.ok) return { slot, status: 'damaged', failure: parsed.failure }
    return { slot, status: 'ok', savedAt: parsed.envelope.savedAt, summary: parsed.envelope.summary }
  }

  const slotNumbers = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => index + 1)

  return {
    available: storage !== null,
    slots: () => slotNumbers.map(info),
    read,
    write(slot, envelope) {
      if (!isValidSlot(slot)) return { ok: false, reason: 'invalid-slot' }
      if (!storage) return { ok: false, reason: 'unavailable' }
      try {
        storage.setItem(slotKey(slot), JSON.stringify(envelope))
        return { ok: true }
      } catch (error) {
        return { ok: false, reason: isQuotaError(error) ? 'full' : 'unavailable' }
      }
    },
    erase(slot) {
      if (!storage || !isValidSlot(slot)) return
      try { storage.removeItem(slotKey(slot)) } catch { /* nothing to erase */ }
    },
    activeSlot() {
      const value = Number(safeGet(ACTIVE_KEY))
      return isValidSlot(value) ? value : null
    },
    setActiveSlot(slot) {
      if (!storage) return
      try {
        if (slot === null) storage.removeItem(ACTIVE_KEY)
        else if (isValidSlot(slot)) storage.setItem(ACTIVE_KEY, String(slot))
      } catch { /* the active slot is a convenience */ }
    },
    newestSlot() {
      let newest: number | null = null
      let newestAt = -Infinity
      for (const entry of slotNumbers.map(info)) {
        if (entry.status === 'ok' && entry.savedAt > newestAt) {
          newest = entry.slot
          newestAt = entry.savedAt
        }
      }
      return newest
    },
    queueBoot(request) {
      if (!storage || !isValidSlot(request.slot)) return false
      try {
        storage.setItem(BOOT_KEY, JSON.stringify(request))
        return true
      } catch {
        return false
      }
    },
    takeBoot() {
      const text = safeGet(BOOT_KEY)
      if (text === null) return null
      try { storage?.removeItem(BOOT_KEY) } catch { /* a stale request is harmless to re-read once */ }
      try {
        const raw: unknown = JSON.parse(text)
        if (!isRecord(raw) || (raw.kind !== 'load' && raw.kind !== 'new') || !isValidSlot(raw.slot)) return null
        return { kind: raw.kind, slot: raw.slot }
      } catch {
        return null
      }
    },
  }
}

/** The browser's `localStorage`, or null when it is blocked or missing. */
export function browserSaveStorage(): SaveStorage | null {
  try {
    const storage = window.localStorage
    const probe = `${KEY_PREFIX}probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

// ------------------------------------------------------------------- startup --

/** What this start-up should do about saves, decided before the world is built. */
export interface Startup {
  /**
   * The slot the running farm saves into. Null means "nowhere yet": every slot
   * is taken by farms this session must not overwrite, so autosave waits for
   * the player to pick a slot.
   */
  readonly slot: number | null
  /** The farm to load, or null for a fresh one. */
  readonly envelope: SaveEnvelope | null
  /** Something the player should be told, such as a save that could not be read. */
  readonly notice: string | null
}

const FAILURE_TEXT: Record<ParseFailure, string> = {
  unreadable: 'is unreadable',
  'wrong-app': 'is not a farm save',
  'too-new': 'was saved by a newer version of the game',
  malformed: 'is damaged',
}

function firstEmptySlot(store: SaveStore): number | null {
  return store.slots().find((entry) => entry.status === 'empty')?.slot ?? null
}

/**
 * Decide what to load. A queued request wins (Load and New Game set one before
 * reloading); with none, the farm last played is picked back up, so closing the
 * tab and returning is a continue, not a loss.
 *
 * A save that cannot be read is never overwritten by accident: the game starts
 * fresh in an empty slot instead, or with no slot at all if none is free.
 */
export function resolveStartup(store: SaveStore, request: BootRequest | null): Startup {
  if (request?.kind === 'new') return { slot: request.slot, envelope: null, notice: null }
  const wanted = request?.kind === 'load' ? request.slot : (store.activeSlot() ?? store.newestSlot())
  if (wanted === null) return { slot: firstEmptySlot(store), envelope: null, notice: null }
  const result = store.read(wanted)
  if (result.ok) return { slot: wanted, envelope: result.envelope, notice: null }
  const empty = store.slots().find((entry) => entry.slot === wanted)?.status === 'empty'
  if (empty) {
    // The last-played slot was erased. Fall back to the newest farm, if any.
    const newest = request ? null : store.newestSlot()
    if (newest !== null) {
      const fallback = store.read(newest)
      if (fallback.ok) return { slot: newest, envelope: fallback.envelope, notice: null }
    }
    return { slot: firstEmptySlot(store), envelope: null, notice: null }
  }
  return {
    slot: firstEmptySlot(store),
    envelope: null,
    notice: `Farm ${wanted} ${FAILURE_TEXT[result.failure]}, so a new farm was started.`,
  }
}

// -------------------------------------------------------------------- labels --

/** "3 min", "1 h 05 min": how long a farm has been played, for the slot card. */
export function formatPlayTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  return `${minutes} min`
}

/** "just now", "5 min ago", "3 h ago", "2 days ago": when a farm was last saved. */
export function formatSavedAgo(savedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - savedAt) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
