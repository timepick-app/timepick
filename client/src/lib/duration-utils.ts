/**
 * Unités de temps pour les sélecteurs
 */
export type TimeUnit = 'minutes' | 'hours' | 'days'

/**
 * Convertit des secondes en valeur avec unité appropriée
 */
const convertFromSeconds = (seconds: number, targetUnit: TimeUnit): number => {
  switch (targetUnit) {
    case 'minutes':
      return Math.round(seconds / 60)
    case 'hours':
      return Math.round(seconds / 3600)
    case 'days':
      return Math.round(seconds / 86400)
  }
}

/**
 * Convertit une valeur avec unité en secondes
 */
export const convertToSeconds = (value: number, unit: TimeUnit): number => {
  switch (unit) {
    case 'minutes':
      return value * 60
    case 'hours':
      return value * 3600
    case 'days':
      return value * 86400
  }
}

export interface DurationConfig {
  defaultValue: number
  defaultUnit: TimeUnit
  minSeconds: number
  maxSeconds: number
}

export function getBestUnit(seconds: number): TimeUnit {
  if (seconds >= 86400) return 'days'
  if (seconds >= 3600) return 'hours'
  return 'minutes'
}

const UNIT_ORDER: TimeUnit[] = ['minutes', 'hours', 'days']

export function secondsToDisplay(
  seconds: number,
  config: DurationConfig,
  allowedUnits?: TimeUnit[],
): { value: number; unit: TimeUnit } {
  const clamped = Math.max(config.minSeconds, Math.min(config.maxSeconds, seconds))
  let unit = getBestUnit(clamped)
  if (allowedUnits && !allowedUnits.includes(unit)) {
    const idx = UNIT_ORDER.indexOf(unit)
    for (let i = idx - 1; i >= 0; i--) {
      if (allowedUnits.includes(UNIT_ORDER[i])) { unit = UNIT_ORDER[i]; break }
    }
  }
  const value = convertFromSeconds(clamped, unit)
  return { value, unit }
}
