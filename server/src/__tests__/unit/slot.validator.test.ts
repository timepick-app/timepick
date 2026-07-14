import { describe, it, expect } from '@jest/globals'
import { createSlotSchema } from '../../validators/slot.validator'

/**
 * Story 1.1 (créneaux multi-jours) : le validateur de création n'impose AUCUNE
 * contrainte « même jour » — seulement `endTime > startTime` (+ début dans le
 * futur). Ces tests confirment qu'un créneau multi-jours est accepté tel quel,
 * sans modification serveur. Test unitaire pur (zod), sans DB.
 */
const VALID_EVENT_ID = '550e8400-e29b-41d4-a716-446655440000'

/** ISO d'un instant à `days` jours dans le futur (toujours > now → passe le refine). */
function futureISO(days: number, hour = 9): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hour, 0, 0, 0)
  return d.toISOString()
}

describe('createSlotSchema — créneaux multi-jours', () => {
  const base = { eventId: VALID_EVENT_ID, capacity: 5 }

  it('accepte un créneau s\'étendant sur plusieurs jours (endTime un jour ultérieur)', () => {
    const result = createSlotSchema.safeParse({
      ...base,
      startTime: futureISO(30, 22),
      endTime: futureISO(32, 1),
    })
    expect(result.success).toBe(true)
  })

  it('accepte un créneau mono-jour (non-régression)', () => {
    const result = createSlotSchema.safeParse({
      ...base,
      startTime: futureISO(30, 9),
      endTime: futureISO(30, 11),
    })
    expect(result.success).toBe(true)
  })

  it('rejette endTime <= startTime, y compris à cheval sur plusieurs jours', () => {
    const result = createSlotSchema.safeParse({
      ...base,
      startTime: futureISO(32, 9),
      endTime: futureISO(30, 9),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('endTime'))).toBe(true)
    }
  })
})
