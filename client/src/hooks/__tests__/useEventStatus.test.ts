import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useEventStatus } from '../useEventStatus'
import type { Slot } from '../../types/slot'

/**
 * Helper pour créer un créneau de test
 * @param overrides - Propriétés à surcharger
 * @returns Un Slot avec des valeurs par défaut
 */
function createMockSlot(overrides: Partial<Slot> = {}): Slot {
  const now = new Date()
  const startTime = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2h dans le futur
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000) // 1h de durée

  return {
    id: 'slot-1',
    eventId: 'event-1',
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    capacity: 10,
    currentBookings: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    cancelledAt: null,
    cancellationReason: null,
    ...overrides,
  }
}

describe('useEventStatus', () => {
  describe('ended state', () => {
    it('returns ended when all slots are in the past', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: new Date(yesterday.getTime() - 4 * 60 * 60 * 1000).toISOString(),
          endTime: new Date(yesterday.getTime() - 3 * 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.type).toBe('ended')
      
      expect(result.current.ariaRole).toBe('alert')
    })
  })

  describe('upcoming state', () => {
    it('returns upcoming when first slot is more than 24h away AND opensAt is defined', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, tomorrow.toISOString()))

      expect(result.current.type).toBe('upcoming')
      
      expect(result.current.ariaRole).toBe('status')
    })

    it('returns upcoming when opensAt is in the future (even if slots are in the past)', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, tomorrow.toISOString()))

      // opensAt in the future should show upcoming even though slots are in the past
      expect(result.current.type).toBe('upcoming')
      
      expect(result.current.ariaRole).toBe('status')
    })

    it('returns upcoming when first slot is less than 24h away AND opensAt is defined', () => {
      const now = new Date()
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoHoursFromNow.toISOString(),
          endTime: new Date(twoHoursFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, oneHourFromNow.toISOString()))

      // Upcoming shows when opensAt is defined and in the future
      expect(result.current.type).toBe('upcoming')
      
      expect(result.current.ariaRole).toBe('status')
    })

    it('returns upcoming when first slot is exactly 24h away AND opensAt is defined', () => {
      const now = new Date()
      const exactly24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: exactly24Hours.toISOString(),
          endTime: new Date(exactly24Hours.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, twelveHoursFromNow.toISOString()))

      // 24h exactement est dans le futur, donc upcoming
      expect(result.current.type).toBe('upcoming')
      
      expect(result.current.ariaRole).toBe('status')
    })

    it('should not return upcoming when opensAt is null and slots are in future', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, null))

      // When opensAt is null, event is immediately open (no banner)
      expect(result.current.type).not.toBe('upcoming')
      expect(result.current.type).toBeNull()
    })

    it('should not return upcoming when opensAt is undefined and slots are in future', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, undefined))

      // When opensAt is undefined, event is immediately open (no banner)
      expect(result.current.type).not.toBe('upcoming')
      expect(result.current.type).toBeNull()
    })

    it('should not return upcoming when opensAt is in the past', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, yesterday.toISOString()))

      // When opensAt is in the past, registration is already open
      expect(result.current.type).not.toBe('upcoming')
      expect(result.current.type).toBeNull()
    })
  })

  describe('full state', () => {
    it('returns full when all slots at capacity but in future and no opensAt', () => {
      const slots: Slot[] = [
        createMockSlot({ currentBookings: 10, capacity: 10 }),
        createMockSlot({ id: 'slot-2', currentBookings: 5, capacity: 5 }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // Without opensAt, upcoming doesn't apply, so full takes priority
      expect(result.current.type).toBe('full')
      
      expect(result.current.ariaRole).toBe('status')
    })

    it('returns null when some slots have capacity and no opensAt', () => {
      const slots: Slot[] = [
        createMockSlot({ currentBookings: 10, capacity: 10 }),
        createMockSlot({ id: 'slot-2', currentBookings: 2, capacity: 10 }), // 20% -> total 60%
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // Slots in future but no opensAt and not full -> null
      expect(result.current.type).toBeNull()
    })

    it('returns upcoming when all slots at capacity but opensAt is in future', () => {
      const now = new Date()
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({ currentBookings: 10, capacity: 10 }),
        createMockSlot({ id: 'slot-2', currentBookings: 5, capacity: 5 }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, tomorrow.toISOString()))

      // With opensAt in future, upcoming has priority over full
      expect(result.current.type).toBe('upcoming')
      
      expect(result.current.ariaRole).toBe('status')
    })
  })

  describe('urgency state', () => {
    it('returns urgency when 80% full and slots are ongoing (started but not ended)', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(), // Ends in 30min
          currentBookings: 8,
          capacity: 10,
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), // Ends in 1h
          currentBookings: 8,
          capacity: 10,
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.type).toBe('urgency')
      
      expect(result.current.ariaRole).toBe('status')
    })

    it('returns urgency when more than 80% full and slots are ongoing', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 9,
          capacity: 10,
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          currentBookings: 9,
          capacity: 10,
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.type).toBe('urgency')
    })

    it('returns null when below 80% threshold and slots are ongoing', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
          currentBookings: 7,
          capacity: 10,
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 120 * 60 * 1000).toISOString(),
          currentBookings: 7,
          capacity: 10,
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.type).toBeNull()
      
    })

    it('calculates fill percentage correctly across multiple ongoing slots', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10,
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 6,
          capacity: 10,
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // Total: 16/20 = 80% -> urgency
      expect(result.current.type).toBe('urgency')
    })
  })

  describe('priority hierarchy', () => {
    it('ended overrides upcoming when both true', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      // Créneaux dans le passé (ended)
      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // ended doit avoir la priorité
      expect(result.current.type).toBe('ended')
      
    })

    it('upcoming overrides full when both true (with opensAt)', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10, // Full
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, tomorrow.toISOString()))

      // With opensAt, upcoming doit avoir la priorité sur full
      expect(result.current.type).toBe('upcoming')
      
    })

    it('full has priority when slots are full and no opensAt', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10, // Full
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // Without opensAt, full applies (upcoming doesn't apply without opensAt)
      expect(result.current.type).toBe('full')
      
    })

    it('full overrides urgency when both true and slots are ongoing', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10, // Full et urgency (100%)
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // full doit avoir la priorité sur urgency
      expect(result.current.type).toBe('full')
      
    })
  })

  describe('edge cases', () => {
    it('returns null for empty slots array', () => {
      const { result } = renderHook(() => useEventStatus([]))

      expect(result.current.type).toBeNull()
      
      expect(result.current.ariaRole).toBe('status')
    })

    it('returns null when no states apply (slots ongoing but not full/urgent)', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
          currentBookings: 3, // 30% - pas urgency
          capacity: 10,
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.type).toBeNull()
    })

    it('handles single slot correctly', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.type).toBe('ended')
    })

    it('finds earliest start across multiple slots for upcoming check (with opensAt)', () => {
      const now = new Date()
      const thirtyHoursFromNow = new Date(now.getTime() + 30 * 60 * 60 * 1000)
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: thirtyHoursFromNow.toISOString(), // Plus tôt
          endTime: new Date(thirtyHoursFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots, tomorrow.toISOString()))

      // With opensAt in future, must use the earliest slot time
      expect(result.current.type).toBe('upcoming')
    })

    it('returns null when slots are in future but no opensAt', () => {
      const now = new Date()
      const thirtyHoursFromNow = new Date(now.getTime() + 30 * 60 * 60 * 1000)
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: thirtyHoursFromNow.toISOString(),
          endTime: new Date(thirtyHoursFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // Without opensAt, slots in future don't trigger upcoming
      expect(result.current.type).toBeNull()
    })

    it('finds latest end across multiple slots for ended check', () => {
      const now = new Date()
      const tenHoursAgo = new Date(now.getTime() - 10 * 60 * 60 * 1000)
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(tenHoursAgo.getTime() - 60 * 60 * 1000).toISOString(),
          endTime: tenHoursAgo.toISOString(),
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: new Date(fiveHoursAgo.getTime() - 60 * 60 * 1000).toISOString(),
          endTime: fiveHoursAgo.toISOString(), // Plus récent
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // Le créneau le plus récent est passé → ended
      expect(result.current.type).toBe('ended')
    })

    it('handles zero capacity slots safely', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 0,
          capacity: 0, // Capacité 0
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      // Ne doit pas crasher avec division par zéro
      expect(result.current.type).toBeNull()
    })
  })

  describe('ARIA role mapping', () => {
    it('uses alert role for ended state', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.ariaRole).toBe('alert')
    })

    it('uses status role for upcoming state', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.ariaRole).toBe('status')
    })

    it('uses status role for full state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10,
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.ariaRole).toBe('status')
    })

    it('uses status role for urgency state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 9,
          capacity: 10,
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.ariaRole).toBe('status')
    })

    it('uses status role for null state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
          currentBookings: 3,
          capacity: 10,
        }),
      ]

      const { result } = renderHook(() => useEventStatus(slots))

      expect(result.current.ariaRole).toBe('status')
    })
  })
})
