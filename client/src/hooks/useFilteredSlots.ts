import { useMemo } from 'react'
import type { Slot } from '../types/slot'

/**
 * Time of day periods for filtering
 * Story 19.7 AC2: Matin (6h-12h), Après-midi (12h-18h), Soir (18h-24h)
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening'

/**
 * Availability filter options
 * Story 19.7 AC3: Available only, Partial, All
 */
export type AvailabilityFilter = 'all' | 'available' | 'partial'

/**
 * Filter configuration for slot filtering
 * Story 19.7: Filtres Calendrier Public
 */
export interface SlotFilters {
  /** Filter by time of day periods */
  timeOfDay: TimeOfDay[]
  /** Filter by availability status */
  availability: AvailabilityFilter
  /** Minimum duration in minutes (optional) - AC4 */
  minDuration?: number
  /** Maximum duration in minutes (optional) - AC4 */
  maxDuration?: number
}

/**
 * Default filter configuration showing all slots
 */
export const DEFAULT_FILTERS: SlotFilters = {
  timeOfDay: [],
  availability: 'all',
  minDuration: undefined,
  maxDuration: undefined,
}

/**
 * Get the time of day for a given date
 */
function getTimeOfDay(date: Date): TimeOfDay | null {
  const hour = date.getHours()
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 24) return 'evening'
  return null // Hours 0-5 are not categorized
}

/**
 * Hook to filter slots based on filter criteria
 * Story 19.7: Filtres Calendrier Public
 *
 * @param slots - Array of slots to filter
 * @param filters - Filter configuration
 * @returns Filtered array of slots (memoized)
 *
 * @example
 * ```tsx
 * const filteredSlots = useFilteredSlots(slots, {
 *   timeOfDay: ['morning', 'afternoon'],
 *   availability: 'available',
 * })
 * ```
 */
export function useFilteredSlots(slots: Slot[], filters: SlotFilters): Slot[] {
  return useMemo(() => {
    return slots.filter((slot) => {
      // AC2: Time of day filter
      if (filters.timeOfDay.length > 0) {
        const startTime = new Date(slot.startTime)
        const slotTimeOfDay = getTimeOfDay(startTime)

        // Skip slot if its time of day is not in the selected filters
        if (!slotTimeOfDay || !filters.timeOfDay.includes(slotTimeOfDay)) {
          return false
        }
      }

      // AC3: Availability filter
      if (filters.availability === 'available') {
        // Show only slots with NO bookings (completely empty)
        if ((slot.currentBookings ?? 0) > 0) {
          return false
        }
      } else if (filters.availability === 'partial') {
        // Show only slots that have some bookings but are not full
        // i.e., 0 < currentBookings < capacity
        if ((slot.currentBookings ?? 0) === 0 || (slot.currentBookings ?? 0) >= slot.capacity) {
          return false
        }
      }

      // AC4: Duration filter
      const startTime = new Date(slot.startTime)
      const endTime = new Date(slot.endTime)
      const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000

      if (filters.minDuration !== undefined && durationMinutes < filters.minDuration) {
        return false
      }

      if (filters.maxDuration !== undefined && durationMinutes > filters.maxDuration) {
        return false
      }

      return true
    })
  }, [slots, filters])
}
