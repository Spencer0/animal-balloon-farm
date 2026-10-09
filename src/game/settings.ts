/**
 * Player settings: plain data plus a tiny store. No Three.js and no DOM, so the
 * defaults, parsing and persistence stay testable in node. Storage is injected
 * (the browser passes `localStorage`) and every access is guarded, because
 * private windows and blocked site data make it throw.
 */

export interface GameSettings {
  /** Show the frame-rate counter in the corner of the screen. */
  readonly showFps: boolean
}

export const DEFAULT_SETTINGS: GameSettings = { showFps: false }

export const SETTINGS_KEY = 'animal-balloon-farm-settings-v1'

/** Anything unreadable, missing or of the wrong type falls back to the default for that key. */
export function parseSettings(raw: string | null | undefined): GameSettings {
  if (!raw) return DEFAULT_SETTINGS
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return DEFAULT_SETTINGS
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_SETTINGS
  const record = value as Record<string, unknown>
  return {
    showFps: typeof record['showFps'] === 'boolean' ? record['showFps'] : DEFAULT_SETTINGS.showFps,
  }
}

export interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface SettingsStore {
  readonly settings: GameSettings
  set<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void
  /** Called with the new settings after every change. Returns an unsubscribe. */
  subscribe(listener: (settings: GameSettings) => void): () => void
}

export function createSettingsStore(storage: SettingsStorage | null): SettingsStore {
  let settings = DEFAULT_SETTINGS
  try {
    settings = parseSettings(storage?.getItem(SETTINGS_KEY))
  } catch {
    /* storage blocked: run on defaults */
  }
  const listeners = new Set<(settings: GameSettings) => void>()
  return {
    get settings() {
      return settings
    },
    set(key, value): void {
      if (settings[key] === value) return
      settings = { ...settings, [key]: value }
      try {
        storage?.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch {
        /* private mode: the choice lasts this session only */
      }
      for (const listener of listeners) listener(settings)
    },
    subscribe(listener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
