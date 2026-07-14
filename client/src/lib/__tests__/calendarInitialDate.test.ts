import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getInitialCalendarDate } from '../calendarInitialDate'
import type { Slot } from '@/types/slot'

// « Maintenant » figé au 15/06/2026 12:00 UTC pour rendre « passé/futur »
// déterministe (isSlotPast compare startTime à new Date()).
const NOW = '2026-06-15T12:00:00.000Z'

/**
 * Fabrique un créneau minimal. Par défaut futur, non annulé, à moitié rempli.
 * `start` est l'ISO de l'heure de début (seul champ pertinent pour le helper).
 */
function makeSlot(overrides: Partial<Slot> & { start: string }): Slot {
  const { start, ...rest } = overrides
  const startDate = new Date(start)
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000) // +1h
  return {
    id: `slot-${start}`,
    eventId: 'event-1',
    startTime: start,
    endTime: endDate.toISOString(),
    capacity: 5,
    currentBookings: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    cancelledAt: null,
    cancellationReason: null,
    ...rest,
  }
}

describe('getInitialCalendarDate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renvoie le plus ancien créneau futur non annulé', () => {
    const slots = [
      makeSlot({ start: '2026-08-10T09:00:00.000Z' }),
      makeSlot({ start: '2026-07-05T09:00:00.000Z' }),
      makeSlot({ start: '2026-09-01T09:00:00.000Z' }),
    ]
    expect(getInitialCalendarDate(slots)?.toISOString()).toBe('2026-07-05T09:00:00.000Z')
  })

  it('prend le minimum par startTime, pas slots[0] (créneaux dans le désordre)', () => {
    const slots = [
      makeSlot({ start: '2026-12-01T09:00:00.000Z' }), // le plus tardif en tête
      makeSlot({ start: '2026-07-20T09:00:00.000Z' }), // le plus tôt en queue
      makeSlot({ start: '2026-10-15T09:00:00.000Z' }),
    ]
    expect(getInitialCalendarDate(slots)?.toISOString()).toBe('2026-07-20T09:00:00.000Z')
  })

  it('inclut un créneau futur complet (currentBookings = capacity) comme candidat', () => {
    const slots = [
      makeSlot({ start: '2026-07-01T09:00:00.000Z', capacity: 3, currentBookings: 3 }),
    ]
    expect(getInitialCalendarDate(slots)?.toISOString()).toBe('2026-07-01T09:00:00.000Z')
  })

  it('ignore les créneaux passés et renvoie le 1er futur (mix passé + futur)', () => {
    const slots = [
      makeSlot({ start: '2026-05-01T09:00:00.000Z' }), // passé
      makeSlot({ start: '2026-06-01T09:00:00.000Z' }), // passé
      makeSlot({ start: '2026-07-20T09:00:00.000Z' }), // futur
    ]
    expect(getInitialCalendarDate(slots)?.toISOString()).toBe('2026-07-20T09:00:00.000Z')
  })

  it('exclut un créneau futur annulé même s’il est le plus ancien', () => {
    const slots = [
      makeSlot({ start: '2026-07-01T09:00:00.000Z', cancelledAt: '2026-06-10T00:00:00.000Z' }), // futur mais annulé
      makeSlot({ start: '2026-08-15T09:00:00.000Z' }), // futur non annulé
    ]
    expect(getInitialCalendarDate(slots)?.toISOString()).toBe('2026-08-15T09:00:00.000Z')
  })

  it('renvoie undefined si tous les créneaux sont passés', () => {
    const slots = [
      makeSlot({ start: '2026-05-01T09:00:00.000Z' }),
      makeSlot({ start: '2026-06-01T09:00:00.000Z' }),
    ]
    expect(getInitialCalendarDate(slots)).toBeUndefined()
  })

  it('renvoie undefined si tous les créneaux futurs sont annulés', () => {
    const slots = [
      makeSlot({ start: '2026-07-01T09:00:00.000Z', cancelledAt: '2026-06-10T00:00:00.000Z' }),
      makeSlot({ start: '2026-08-01T09:00:00.000Z', cancelledAt: '2026-06-11T00:00:00.000Z' }),
    ]
    expect(getInitialCalendarDate(slots)).toBeUndefined()
  })

  it('renvoie undefined pour une liste vide', () => {
    expect(getInitialCalendarDate([])).toBeUndefined()
  })
})
