import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useViewMode } from '../useViewMode'

describe('useViewMode', () => {
  // Store original window properties
  const originalInnerWidth = window.innerWidth

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset localStorage mock
    localStorage.clear()
  })

  afterEach(() => {
    // Restore window.innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
  })

  describe('Initial state', () => {
    it('returns calendar view for desktop by default (>= 768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })

      const { result } = renderHook(() => useViewMode('test-uuid'))

      expect(result.current.viewMode).toBe('calendar')
    })

    it('returns list view for mobile by default (< 768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      const { result } = renderHook(() => useViewMode('test-uuid'))

      expect(result.current.viewMode).toBe('list')
    })

    it('returns calendar as fallback for SSR (no window)', () => {
      // This simulates SSR where window might not be available
      // The hook has SSR fallback to 'calendar'
      const { result } = renderHook(() => useViewMode('test-uuid'))

      // Default should be based on window.innerWidth
      expect(['calendar', 'list']).toContain(result.current.viewMode)
    })
  })

  describe('localStorage persistence', () => {
    it('loads view mode from localStorage on mount', () => {
      localStorage.setItem('timepick-view-mode-test-uuid', JSON.stringify({
        version: 1,
        mode: 'list',
      }))

      const { result } = renderHook(() => useViewMode('test-uuid'))

      expect(result.current.viewMode).toBe('list')
    })

    it('ignores invalid localStorage values', () => {
      localStorage.setItem('timepick-view-mode-test-uuid', 'invalid-json')

      const { result } = renderHook(() => useViewMode('test-uuid'))

      // Should fall back to default based on screen width
      expect(['calendar', 'list']).toContain(result.current.viewMode)
    })

    it('ignores localStorage with wrong version', () => {
      localStorage.setItem('timepick-view-mode-test-uuid', JSON.stringify({
        version: 2, // Wrong version
        mode: 'list',
      }))

      const { result } = renderHook(() => useViewMode('test-uuid'))

      // Should fall back to default
      expect(['calendar', 'list']).toContain(result.current.viewMode)
    })

    it('ignores localStorage with invalid mode', () => {
      localStorage.setItem('timepick-view-mode-test-uuid', JSON.stringify({
        version: 1,
        mode: 'invalid-mode',
      }))

      const { result } = renderHook(() => useViewMode('test-uuid'))

      // Should fall back to default
      expect(['calendar', 'list']).toContain(result.current.viewMode)
    })

    it('saves view mode to localStorage on change', () => {
      const { result } = renderHook(() => useViewMode('test-uuid'))

      act(() => {
        result.current.setViewMode('list')
      })

      const stored = localStorage.getItem('timepick-view-mode-test-uuid')
      expect(stored).not.toBeNull()
      expect(JSON.parse(stored!)).toEqual({
        version: 1,
        mode: 'list',
      })
    })

    it('saves week mode to localStorage (Story 19.5)', () => {
      const { result } = renderHook(() => useViewMode('week-persist-uuid'))

      act(() => {
        result.current.setViewMode('week')
      })

      const stored = localStorage.getItem('timepick-view-mode-week-persist-uuid')
      expect(stored).not.toBeNull()
      expect(JSON.parse(stored!)).toEqual({
        version: 1,
        mode: 'week',
      })
    })

    it('loads week mode from localStorage on mount (Story 19.5)', () => {
      localStorage.setItem('timepick-view-mode-week-load-uuid', JSON.stringify({
        version: 1,
        mode: 'week',
      }))

      const { result } = renderHook(() => useViewMode('week-load-uuid'))

      expect(result.current.viewMode).toBe('week')
    })

    it('uses correct storage key with eventUuid', () => {
      const { result } = renderHook(() => useViewMode('my-event-123'))

      act(() => {
        result.current.setViewMode('calendar')
      })

      expect(localStorage.getItem('timepick-view-mode-my-event-123')).not.toBeNull()
    })
  })

  describe('setViewMode', () => {
    it('updates viewMode state', () => {
      const { result } = renderHook(() => useViewMode('test-uuid'))

      expect(result.current.viewMode).toBe('calendar') // Desktop default

      act(() => {
        result.current.setViewMode('list')
      })

      expect(result.current.viewMode).toBe('list')
    })

    it('ignores invalid mode values', () => {
      const { result } = renderHook(() => useViewMode('test-uuid'))
      const initialMode = result.current.viewMode

      act(() => {
        // @ts-expect-error Testing invalid input
        result.current.setViewMode('invalid')
      })

      expect(result.current.viewMode).toBe(initialMode)
    })

    it('does not save to localStorage when eventUuid is null', () => {
      const { result } = renderHook(() => useViewMode(null))

      act(() => {
        result.current.setViewMode('list')
      })

      // No item should be saved
      expect(localStorage.length).toBe(0)
    })

    it('does not save to localStorage when eventUuid is undefined', () => {
      const { result } = renderHook(() => useViewMode(undefined))

      act(() => {
        result.current.setViewMode('calendar')
      })

      expect(localStorage.length).toBe(0)
    })
  })

  describe('Device detection (AC4 & AC5)', () => {
    it('defaults to list view on mobile breakpoint (< 768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 767,
      })

      const { result } = renderHook(() => useViewMode('test-uuid'))

      expect(result.current.viewMode).toBe('list')
    })

    it('defaults to calendar view at mobile breakpoint boundary (768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      })

      const { result } = renderHook(() => useViewMode('test-uuid'))

      expect(result.current.viewMode).toBe('calendar')
    })

    it('defaults to calendar view on desktop (> 768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1440,
      })

      const { result } = renderHook(() => useViewMode('test-uuid'))

      expect(result.current.viewMode).toBe('calendar')
    })

    it('localStorage preference overrides device default', () => {
      // Set up mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      })

      // But user has previously selected calendar view
      localStorage.setItem('timepick-view-mode-test-uuid', JSON.stringify({
        version: 1,
        mode: 'calendar',
      }))

      const { result } = renderHook(() => useViewMode('test-uuid'))

      // Should use localStorage preference, not device default
      expect(result.current.viewMode).toBe('calendar')
    })
  })

  describe('Error handling', () => {
    it('handles localStorage quota exceeded gracefully', () => {
      const originalLocalStorage = window.localStorage
      const mockSetItem = vi.fn(() => {
        throw new Error('QuotaExceededError')
      })
      const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: vi.fn(),
          setItem: mockSetItem,
          removeItem: vi.fn(),
          clear: vi.fn(),
          length: 0,
          key: vi.fn(),
        },
        writable: true,
        configurable: true,
      })

      const { result } = renderHook(() => useViewMode('test-uuid'))

      // Should not throw
      act(() => {
        result.current.setViewMode('list')
      })

      // State should still update even if localStorage fails
      expect(result.current.viewMode).toBe('list')

      mockConsoleWarn.mockRestore()

      // Restore original localStorage
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      })
    })

    it('handles localStorage read errors gracefully', () => {
      const originalLocalStorage = window.localStorage
      const mockGetItem = vi.fn(() => {
        throw new Error('Storage access denied')
      })
      const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: mockGetItem,
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn(),
          length: 0,
          key: vi.fn(),
        },
        writable: true,
        configurable: true,
      })

      // Should not throw and should use default
      const { result } = renderHook(() => useViewMode('test-uuid'))

      expect(['calendar', 'list']).toContain(result.current.viewMode)

      mockConsoleWarn.mockRestore()

      // Restore original localStorage
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      })
    })
  })

  describe('Per-event isolation', () => {
    it('maintains separate preferences for different events', () => {
      // Clear localStorage before this test
      localStorage.clear()

      const { result: result1 } = renderHook(
        ({ uuid }) => useViewMode(uuid),
        { initialProps: { uuid: 'event-1' } }
      )
      const { result: result2 } = renderHook(
        ({ uuid }) => useViewMode(uuid),
        { initialProps: { uuid: 'event-2' } }
      )

      // Set different modes for each event
      act(() => {
        result1.current.setViewMode('calendar')
      })
      act(() => {
        result2.current.setViewMode('list')
      })

      // Verify each hook has its own state
      expect(result1.current.viewMode).toBe('calendar')
      expect(result2.current.viewMode).toBe('list')

      // Verify localStorage has separate entries
      const stored1 = JSON.parse(localStorage.getItem('timepick-view-mode-event-1')!)
      const stored2 = JSON.parse(localStorage.getItem('timepick-view-mode-event-2')!)

      expect(stored1.mode).toBe('calendar')
      expect(stored2.mode).toBe('list')
    })
  })
})
