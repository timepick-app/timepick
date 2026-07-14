import { describe, it, expect } from 'vitest'
import { getAvailabilityStatus, getAvailablePlaces } from '../slot'
import type { Slot } from '../slot'

describe('Slot Helpers', () => {
  const baseSlot: Slot = {
    id: 'slot-1',
    eventId: 'event-1',
    startTime: '2026-02-15T14:00:00Z',
    endTime: '2026-02-15T16:00:00Z',
    capacity: 3,
    currentBookings: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    cancelledAt: null,
    cancellationReason: null,
  }

  describe('getAvailabilityStatus', () => {
    it('retourne "available" quand aucune réservation', () => {
      expect(getAvailabilityStatus(baseSlot)).toBe('available')
    })

    it('retourne "partial" quand il y a des réservations mais pas complet', () => {
      const slot: Slot = { ...baseSlot, currentBookings: 1 }
      expect(getAvailabilityStatus(slot)).toBe('partial')
    })

    it('retourne "full" quand le créneau est complet', () => {
      const slot: Slot = { ...baseSlot, currentBookings: 3 }
      expect(getAvailabilityStatus(slot)).toBe('full')
    })

    it('retourne "full" quand currentBookings dépasse capacity', () => {
      const slot: Slot = { ...baseSlot, currentBookings: 5 }
      expect(getAvailabilityStatus(slot)).toBe('full')
    })
  })

  describe('getAvailablePlaces', () => {
    it('calcule les places disponibles quand availablePlaces n\'est pas fourni', () => {
      expect(getAvailablePlaces(baseSlot)).toBe(3)

      const slotPartial: Slot = { ...baseSlot, currentBookings: 1 }
      expect(getAvailablePlaces(slotPartial)).toBe(2)

      const slotFull: Slot = { ...baseSlot, currentBookings: 3 }
      expect(getAvailablePlaces(slotFull)).toBe(0)
    })

    it('utilise availablePlaces quand fourni', () => {
      const slot: Slot = { ...baseSlot, availablePlaces: 5 }
      expect(getAvailablePlaces(slot)).toBe(5)
    })

    it('retourne 0 quand le calcul est négatif (sécurité)', () => {
      const slot: Slot = { ...baseSlot, currentBookings: 10 }
      expect(getAvailablePlaces(slot)).toBe(0)
    })
  })
})
