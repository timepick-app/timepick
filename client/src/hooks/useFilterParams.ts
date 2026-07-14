import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DEFAULT_FILTERS } from './useFilteredSlots'
import type { SlotFilters, TimeOfDay, AvailabilityFilter } from './useFilteredSlots'

/**
 * Re-export types and constants for convenience
 */
export type { SlotFilters, TimeOfDay, AvailabilityFilter }
export { DEFAULT_FILTERS }

/**
 * Valid time of day values for URL validation
 */
const VALID_TIME_OF_DAY: TimeOfDay[] = ['morning', 'afternoon', 'evening']

/**
 * Valid availability values for URL validation
 */
const VALID_AVAILABILITY: AvailabilityFilter[] = ['all', 'available', 'partial']

/**
 * Parse time of day from URL param
 */
function parseTimeOfDay(value: string | null): TimeOfDay[] {
  if (!value) return []

  return value
    .split(',')
    .filter((v): v is TimeOfDay => VALID_TIME_OF_DAY.includes(v as TimeOfDay))
}

/**
 * Parse availability from URL param
 */
function parseAvailability(value: string | null): AvailabilityFilter {
  if (!value) return 'all'

  return VALID_AVAILABILITY.includes(value as AvailabilityFilter)
    ? (value as AvailabilityFilter)
    : 'all'
}

/**
 * Parse duration from URL param
 */
function parseDuration(value: string | null): number | undefined {
  if (!value) return undefined

  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? undefined : parsed
}

/**
 * Hook to manage filter state with URL persistence
 * Story 19.7 AC8: Filters persisted in URL (shareable)
 *
 * @returns Object with filters, setFilters, resetFilters, and utility properties
 *
 * @example
 * ```tsx
 * const { filters, setFilters, resetFilters, activeFilterCount, hasActiveFilters } = useFilterParams()
 *
 * // Update filters (also updates URL)
 * setFilters({ ...filters, availability: 'available' })
 *
 * // Reset to defaults
 * resetFilters()
 * ```
 */
export function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Parse filters from URL
  const filters: SlotFilters = useMemo(() => {
    return {
      timeOfDay: parseTimeOfDay(searchParams.get('tod')),
      availability: parseAvailability(searchParams.get('avail')),
      minDuration: parseDuration(searchParams.get('minDur')),
      maxDuration: parseDuration(searchParams.get('maxDur')),
    }
  }, [searchParams])

  // Count active filter types (not individual values)
  const activeFilterCount = useMemo(() => {
    let count = 0

    // Time of day filter
    if (filters.timeOfDay.length > 0) count++

    // Availability filter (only count if not 'all')
    if (filters.availability !== 'all') count++

    // Duration filters
    if (filters.minDuration !== undefined) count++
    if (filters.maxDuration !== undefined) count++

    return count
  }, [filters])

  const hasActiveFilters = activeFilterCount > 0

  // Update filters and persist to URL
  const setFilters = useCallback(
    (newFilters: SlotFilters) => {
      const params = new URLSearchParams()

      // Only add non-default values to URL
      if (newFilters.timeOfDay.length > 0) {
        params.set('tod', newFilters.timeOfDay.join(','))
      }

      if (newFilters.availability !== 'all') {
        params.set('avail', newFilters.availability)
      }

      if (newFilters.minDuration !== undefined) {
        params.set('minDur', String(newFilters.minDuration))
      }

      if (newFilters.maxDuration !== undefined) {
        params.set('maxDur', String(newFilters.maxDuration))
      }

      setSearchParams(params, { replace: true })
    },
    [setSearchParams]
  )

  // Reset filters to defaults
  const resetFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  return {
    filters,
    setFilters,
    resetFilters,
    activeFilterCount,
    hasActiveFilters,
  }
}
