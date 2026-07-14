import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFilteredSlots, type SlotFilters, DEFAULT_FILTERS } from '../useFilteredSlots'
import type { Slot } from '../../types/slot'

// Fixtures pour les tests
const createMockSlot = (
  id: string,
  startHour: number,
  capacity: number,
  currentBookings: number,
  durationMinutes: number = 60
): Slot => {
  const baseDate = new Date('2026-02-23T00:00:00Z')
  const startTime = new Date(baseDate)
  startTime.setHours(startHour, 0, 0, 0)
  const endTime = new Date(startTime)
  endTime.setMinutes(endTime.getMinutes() + durationMinutes)

  return {
    id,
    eventId: 'event-1',
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    capacity,
    currentBookings,
    createdAt: '2026-02-20T00:00:00Z',
    updatedAt: '2026-02-20T00:00:00Z',
    cancelledAt: null,
    cancellationReason: null,
  }
}

describe('useFilteredSlots', () => {
  // Créneaux de test: matin (9h), après-midi (14h), soir (19h)
  const slots: Slot[] = [
    createMockSlot('slot-morning-avail', 9, 10, 0),      // Matin, disponible
    createMockSlot('slot-morning-partial', 10, 10, 5),   // Matin, partiel
    createMockSlot('slot-afternoon-avail', 14, 10, 0),   // Après-midi, disponible
    createMockSlot('slot-afternoon-full', 15, 10, 10),   // Après-midi, complet
    createMockSlot('slot-evening-avail', 19, 10, 0),     // Soir, disponible
    createMockSlot('slot-evening-partial', 20, 10, 3),   // Soir, partiel
  ]

  describe('DEFAULT_FILTERS', () => {
    it('should have default values that show all slots', () => {
      expect(DEFAULT_FILTERS.timeOfDay).toEqual([])
      expect(DEFAULT_FILTERS.availability).toBe('all')
      expect(DEFAULT_FILTERS.minDuration).toBeUndefined()
      expect(DEFAULT_FILTERS.maxDuration).toBeUndefined()
    })
  })

  describe('No filters (default)', () => {
    it('should return all slots when no filters are applied', () => {
      const { result } = renderHook(() => useFilteredSlots(slots, DEFAULT_FILTERS))

      expect(result.current).toHaveLength(6)
      expect(result.current.map(s => s.id)).toEqual(slots.map(s => s.id))
    })
  })

  describe('Time of day filter (AC2)', () => {
    it('should filter slots to morning only (6h-12h)', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        timeOfDay: ['morning'],
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      expect(result.current).toHaveLength(2)
      expect(result.current.map(s => s.id)).toEqual(['slot-morning-avail', 'slot-morning-partial'])
    })

    it('should filter slots to afternoon only (12h-18h)', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        timeOfDay: ['afternoon'],
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      expect(result.current).toHaveLength(2)
      expect(result.current.map(s => s.id)).toEqual(['slot-afternoon-avail', 'slot-afternoon-full'])
    })

    it('should filter slots to evening only (18h-24h)', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        timeOfDay: ['evening'],
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      expect(result.current).toHaveLength(2)
      expect(result.current.map(s => s.id)).toEqual(['slot-evening-avail', 'slot-evening-partial'])
    })

    it('should allow multiple time periods (morning + afternoon)', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        timeOfDay: ['morning', 'afternoon'],
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      expect(result.current).toHaveLength(4)
      expect(result.current.map(s => s.id)).toEqual([
        'slot-morning-avail',
        'slot-morning-partial',
        'slot-afternoon-avail',
        'slot-afternoon-full',
      ])
    })

    it('should handle edge case: slot starting exactly at boundary (12h)', () => {
      const edgeSlots: Slot[] = [
        createMockSlot('slot-11h59', 11, 10, 0), // 11h = morning
        createMockSlot('slot-12h', 12, 10, 0),   // 12h = afternoon
        createMockSlot('slot-17h59', 17, 10, 0), // 17h = afternoon
        createMockSlot('slot-18h', 18, 10, 0),   // 18h = evening
      ]

      const morningFilters: SlotFilters = { ...DEFAULT_FILTERS, timeOfDay: ['morning'] }
      const afternoonFilters: SlotFilters = { ...DEFAULT_FILTERS, timeOfDay: ['afternoon'] }
      const eveningFilters: SlotFilters = { ...DEFAULT_FILTERS, timeOfDay: ['evening'] }

      const { result: morning } = renderHook(() => useFilteredSlots(edgeSlots, morningFilters))
      const { result: afternoon } = renderHook(() => useFilteredSlots(edgeSlots, afternoonFilters))
      const { result: evening } = renderHook(() => useFilteredSlots(edgeSlots, eveningFilters))

      expect(morning.current).toHaveLength(1)
      expect(morning.current[0].id).toBe('slot-11h59')

      expect(afternoon.current).toHaveLength(2)
      expect(afternoon.current.map(s => s.id)).toEqual(['slot-12h', 'slot-17h59'])

      expect(evening.current).toHaveLength(1)
      expect(evening.current[0].id).toBe('slot-18h')
    })
  })

  describe('Availability filter (AC3)', () => {
    it('should filter to available slots only', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        availability: 'available',
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      expect(result.current).toHaveLength(3)
      expect(result.current.map(s => s.id)).toEqual([
        'slot-morning-avail',
        'slot-afternoon-avail',
        'slot-evening-avail',
      ])
    })

    it('should filter to partial slots (not fully booked, not empty)', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        availability: 'partial',
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      expect(result.current).toHaveLength(2)
      expect(result.current.map(s => s.id)).toEqual([
        'slot-morning-partial',
        'slot-evening-partial',
      ])
    })

    it('should show all slots when availability is "all"', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        availability: 'all',
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      expect(result.current).toHaveLength(6)
    })
  })

  describe('Duration filter (AC4)', () => {
    const variableDurationSlots: Slot[] = [
      createMockSlot('slot-30min', 9, 10, 0, 30),
      createMockSlot('slot-60min', 10, 10, 0, 60),
      createMockSlot('slot-90min', 14, 10, 0, 90),
      createMockSlot('slot-120min', 16, 10, 0, 120),
    ]

    it('should filter by minimum duration', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        minDuration: 60,
      }

      const { result } = renderHook(() => useFilteredSlots(variableDurationSlots, filters))

      expect(result.current).toHaveLength(3)
      expect(result.current.map(s => s.id)).toEqual(['slot-60min', 'slot-90min', 'slot-120min'])
    })

    it('should filter by maximum duration', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        maxDuration: 90,
      }

      const { result } = renderHook(() => useFilteredSlots(variableDurationSlots, filters))

      expect(result.current).toHaveLength(3)
      expect(result.current.map(s => s.id)).toEqual(['slot-30min', 'slot-60min', 'slot-90min'])
    })

    it('should filter by both min and max duration', () => {
      const filters: SlotFilters = {
        ...DEFAULT_FILTERS,
        minDuration: 45,
        maxDuration: 100,
      }

      const { result } = renderHook(() => useFilteredSlots(variableDurationSlots, filters))

      expect(result.current).toHaveLength(2)
      expect(result.current.map(s => s.id)).toEqual(['slot-60min', 'slot-90min'])
    })
  })

  describe('Combined filters (AC5 - real-time)', () => {
    it('should apply multiple filters simultaneously', () => {
      const filters: SlotFilters = {
        timeOfDay: ['morning', 'afternoon'],
        availability: 'available',
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      // Morning avail + afternoon avail = 2 slots
      expect(result.current).toHaveLength(2)
      expect(result.current.map(s => s.id)).toEqual(['slot-morning-avail', 'slot-afternoon-avail'])
    })

    it('should return empty array when no slots match all filters', () => {
      const filters: SlotFilters = {
        timeOfDay: ['evening'],
        availability: 'available',
        minDuration: 120, // Evening slots are 60 min
      }

      const { result } = renderHook(() => useFilteredSlots(slots, filters))

      expect(result.current).toHaveLength(0)
    })
  })

  describe('Memoization', () => {
    it('should return the same reference when slots and filters have not changed', () => {
      const filters: SlotFilters = DEFAULT_FILTERS

      const { result, rerender } = renderHook(() => useFilteredSlots(slots, filters))

      const firstResult = result.current
      rerender()
      const secondResult = result.current

      expect(firstResult).toBe(secondResult)
    })

    it('should return a new array when slots change', () => {
      const filters: SlotFilters = DEFAULT_FILTERS

      const { result, rerender } = renderHook(
        ({ slots }) => useFilteredSlots(slots, filters),
        { initialProps: { slots } }
      )

      const firstResult = result.current

      const newSlots = [...slots, createMockSlot('slot-new', 22, 10, 0)]
      rerender({ slots: newSlots })

      const secondResult = result.current

      expect(firstResult).not.toBe(secondResult)
      expect(secondResult).toHaveLength(7)
    })
  })

  describe('Empty slots', () => {
    it('should return empty array when slots is empty', () => {
      const { result } = renderHook(() => useFilteredSlots([], DEFAULT_FILTERS))

      expect(result.current).toHaveLength(0)
    })
  })
})
