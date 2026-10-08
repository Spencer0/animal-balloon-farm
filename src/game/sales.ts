import type { BalloonAnimalId } from '../animals/animal-catalog'
import type { PlantId } from './plants'

export const PLANT_SALE_PRICES: Readonly<Record<PlantId, number>> = {
  clover: 5,
  dandelion: 5,
  poppy: 7,
  'water-lily': 9,
}

export const ANIMAL_SALE_PRICES: Readonly<Record<BalloonAnimalId, number>> = {
  goose: 18,
  cow: 24,
  sheep: 20,
  duck: 14,
  chicken: 12,
  pig: 16,
  frog: 15,
  owl: 30,
}

export interface AnimalSaleStatus {
  readonly sold: boolean
  readonly captured: boolean
  readonly capturing: boolean
  readonly stage: number
  readonly appearance: 'wild' | 'standard'
}

/** Only settled, captured farm residents can be sold. */
export function canSellAnimal(status: AnimalSaleStatus): boolean {
  return !status.sold && status.captured && !status.capturing && status.stage >= 3 && status.appearance === 'standard'
}

/** Seedlings start at half their species value; maturity earns a 50% bonus. */
export function plantSaleValue(species: PlantId, growth: number): number {
  const normalizedGrowth = Number.isFinite(growth) ? Math.min(1, Math.max(0, growth)) : 0
  return Math.max(1, Math.round(PLANT_SALE_PRICES[species] * (0.5 + normalizedGrowth)))
}

/** Animal progression adds 25% of base value per earned stage, up to double. */
export function animalSaleValue(species: BalloonAnimalId, stage: number): number {
  const normalizedStage = Number.isFinite(stage) ? Math.min(4, Math.max(0, Math.floor(stage))) : 0
  return Math.round(ANIMAL_SALE_PRICES[species] * (1 + normalizedStage * 0.25))
}

export interface Wallet {
  readonly balance: number
  credit(amount: number): number
  /**
   * Spend coins. Returns the new balance, or `null` when the wallet cannot
   * cover the cost so the caller can refuse the purchase without an exception.
   */
  debit(amount: number): number | null
  canAfford(amount: number): boolean
}

export function createWallet(initialBalance = 0): Wallet {
  let balance = Number.isFinite(initialBalance) ? Math.max(0, Math.floor(initialBalance)) : 0
  return {
    get balance(): number { return balance },
    credit(amount): number {
      if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Wallet credits must be a non-negative finite amount')
      balance += Math.floor(amount)
      return balance
    },
    debit(amount): number | null {
      if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Wallet debits must be a non-negative finite amount')
      const cost = Math.floor(amount)
      if (cost > balance) return null
      balance -= cost
      return balance
    },
    canAfford(amount): boolean {
      if (!Number.isFinite(amount) || amount < 0) return false
      return Math.floor(amount) <= balance
    },
  }
}

const ANIMAL_NAMES = [
  'Pip', 'Mabel', 'Bramble', 'Poppy', 'Waffles', 'Clover', 'Biscuit', 'Juniper',
  'Mochi', 'Daisy', 'Pickles', 'Maple', 'Noodle', 'Olive', 'Pebble', 'Toffee',
  'Button', 'Honey', 'Sprout', 'Pudding', 'Bubbles', 'Tansy', 'Muffin', 'Fern',
  'Acorn', 'Doodle', 'Bumble', 'Marigold', 'Peaches', 'Socks', 'Truffle', 'Bean',
] as const

/** Make a fresh, unique set of friendly names for this game session. */
export function generateAnimalNames(count: number, random: () => number = Math.random): readonly string[] {
  if (!Number.isFinite(count) || count < 0) throw new RangeError('Animal name count must be a non-negative finite number')
  const nameCount = Math.floor(count)
  const names = [...ANIMAL_NAMES]
  for (let index = names.length - 1; index > 0; index -= 1) {
    const value = random()
    const other = Math.min(index, Math.max(0, Math.floor((Number.isFinite(value) ? value : 0) * (index + 1))))
    ;[names[index], names[other]] = [names[other], names[index]]
  }
  const result: string[] = []
  while (result.length < nameCount) {
    const name = names[result.length % names.length]
    const cycle = Math.floor(result.length / names.length)
    result.push(cycle === 0 ? name : `${name} ${cycle + 1}`)
  }
  return result
}
