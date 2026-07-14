import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFilterParams, DEFAULT_FILTERS } from '../useFilterParams'

// Mock react-router-dom useSearchParams with reactive state
let currentSearchParams = new URLSearchParams()
let searchParamsListeners: Array<() => void> = []

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [
    currentSearchParams,
    (params: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) => {
      if (typeof params === 'function') {
        currentSearchParams = params(new URLSearchParams(currentSearchParams.toString()))
      } else {
        currentSearchParams = new URLSearchParams(params.toString())
      }
      // Notify all listeners (triggers re-renders)
      searchParamsListeners.forEach((listener) => listener())
    },
  ],
}))

/**
 * Re-render the hook to get updated values after setSearchParams
 */
function rerenderHook<T>(result: { current: T }, rerender: () => void) {
  rerender()
  return result.current
}

describe('useFilterParams', () => {
  beforeEach(() => {
    // Reset search params before each test
    currentSearchParams = new URLSearchParams()
    searchParamsListeners = []
  })

  describe('Default state', () => {
    it('should return default filters when URL has no params', () => {
      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters).toEqual(DEFAULT_FILTERS)
    })
  })

  describe('URL parsing (AC8 - Restore filters from URL)', () => {
    it('should parse timeOfDay from URL', () => {
      currentSearchParams.set('tod', 'morning,afternoon')

      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters.timeOfDay).toEqual(['morning', 'afternoon'])
    })

    it('should parse availability from URL', () => {
      currentSearchParams.set('avail', 'available')

      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters.availability).toBe('available')
    })

    it('should parse minDuration from URL', () => {
      currentSearchParams.set('minDur', '30')

      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters.minDuration).toBe(30)
    })

    it('should parse maxDuration from URL', () => {
      currentSearchParams.set('maxDur', '120')

      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters.maxDuration).toBe(120)
    })

    it('should parse all filters from URL simultaneously', () => {
      currentSearchParams.set('tod', 'morning')
      currentSearchParams.set('avail', 'partial')
      currentSearchParams.set('minDur', '30')
      currentSearchParams.set('maxDur', '90')

      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters).toEqual({
        timeOfDay: ['morning'],
        availability: 'partial',
        minDuration: 30,
        maxDuration: 90,
      })
    })

    it('should ignore invalid timeOfDay values', () => {
      currentSearchParams.set('tod', 'morning,invalid,evening')

      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters.timeOfDay).toEqual(['morning', 'evening'])
    })

    it('should default availability to "all" if invalid', () => {
      currentSearchParams.set('avail', 'invalid')

      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters.availability).toBe('all')
    })

    it('should ignore non-numeric duration values', () => {
      currentSearchParams.set('minDur', 'not-a-number')
      currentSearchParams.set('maxDur', 'also-invalid')

      const { result } = renderHook(() => useFilterParams())

      expect(result.current.filters.minDuration).toBeUndefined()
      expect(result.current.filters.maxDuration).toBeUndefined()
    })
  })

  describe('URL update (AC8 - Persist filters to URL)', () => {
    it('should update URL when filters change', () => {
      const { result } = renderHook(() => useFilterParams())

      act(() => {
        result.current.setFilters({
          ...DEFAULT_FILTERS,
          timeOfDay: ['morning'],
        })
      })

      expect(currentSearchParams.get('tod')).toBe('morning')
    })

    it('should not include params with default values in URL', () => {
      const { result } = renderHook(() => useFilterParams())

      act(() => {
        result.current.setFilters(DEFAULT_FILTERS)
      })

      expect(currentSearchParams.get('tod')).toBeNull()
      expect(currentSearchParams.get('avail')).toBeNull()
    })

    it('should clear timeOfDay param when empty array', () => {
      const { result } = renderHook(() => useFilterParams())

      act(() => {
        result.current.setFilters({
          ...DEFAULT_FILTERS,
          timeOfDay: [],
        })
      })

      expect(currentSearchParams.get('tod')).toBeNull()
    })

    it('should clear availability param when "all"', () => {
      const { result } = renderHook(() => useFilterParams())

      act(() => {
        result.current.setFilters({
          ...DEFAULT_FILTERS,
          availability: 'all',
        })
      })

      expect(currentSearchParams.get('avail')).toBeNull()
    })
  })

  describe('Reset filters (AC6)', () => {
    it('should have a resetFilters function that clears URL params', () => {
      // Start with some filters in URL
      currentSearchParams.set('tod', 'morning')
      currentSearchParams.set('avail', 'available')

      const { result, rerender } = renderHook(() => useFilterParams())

      // Initial state should reflect URL
      expect(result.current.filters.timeOfDay).toEqual(['morning'])
      expect(result.current.filters.availability).toBe('available')

      act(() => {
        result.current.resetFilters()
      })

      // Re-render to get updated values
      rerenderHook(result, rerender)

      // URL should be cleared
      expect(currentSearchParams.toString()).toBe('')
    })
  })

  describe('activeFilterCount', () => {
    it('should count 0 when no filters are active', () => {
      const { result } = renderHook(() => useFilterParams())

      expect(result.current.activeFilterCount).toBe(0)
    })

    it('should count 1 when one filter type is active', () => {
      const { result, rerender } = renderHook(() => useFilterParams())

      act(() => {
        result.current.setFilters({
          ...DEFAULT_FILTERS,
          availability: 'available',
        })
      })

      // Re-render to pick up the new searchParams
      rerenderHook(result, rerender)

      expect(result.current.activeFilterCount).toBe(1)
    })

    it('should count correctly with multiple active filters', () => {
      const { result, rerender } = renderHook(() => useFilterParams())

      act(() => {
        result.current.setFilters({
          timeOfDay: ['morning', 'afternoon'],
          availability: 'partial',
          minDuration: 30,
          maxDuration: 90,
        })
      })

      rerenderHook(result, rerender)

      // timeOfDay, availability, minDuration, maxDuration = 4 types
      expect(result.current.activeFilterCount).toBe(4)
    })

    it('should not count empty timeOfDay as active', () => {
      const { result, rerender } = renderHook(() => useFilterParams())

      act(() => {
        result.current.setFilters({
          ...DEFAULT_FILTERS,
          timeOfDay: [],
        })
      })

      rerenderHook(result, rerender)

      expect(result.current.activeFilterCount).toBe(0)
    })
  })

  describe('hasActiveFilters', () => {
    it('should be false when no filters are active', () => {
      const { result } = renderHook(() => useFilterParams())

      expect(result.current.hasActiveFilters).toBe(false)
    })

    it('should be true when at least one filter is active', () => {
      const { result, rerender } = renderHook(() => useFilterParams())

      act(() => {
        result.current.setFilters({
          ...DEFAULT_FILTERS,
          availability: 'available',
        })
      })

      rerenderHook(result, rerender)

      expect(result.current.hasActiveFilters).toBe(true)
    })
  })
})
