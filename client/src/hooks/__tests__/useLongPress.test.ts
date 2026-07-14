import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useLongPress } from '../useLongPress'

describe('useLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return touch event handlers', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useLongPress(callback))

    expect(result.current).toHaveProperty('onTouchStart')
    expect(result.current).toHaveProperty('onTouchEnd')
    expect(result.current).toHaveProperty('onTouchCancel')
    expect(typeof result.current.onTouchStart).toBe('function')
    expect(typeof result.current.onTouchEnd).toBe('function')
    expect(typeof result.current.onTouchCancel).toBe('function')
  })

  it('should call callback after default 500ms duration', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useLongPress(callback))

    // Start touch
    act(() => {
      result.current.onTouchStart()
    })

    // Callback should not be called yet
    expect(callback).not.toHaveBeenCalled()

    // Advance time by 500ms
    act(() => {
      vi.advanceTimersByTime(500)
    })

    // Now callback should be called
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should call callback after custom duration', () => {
    const callback = vi.fn()
    const customDuration = 300
    const { result } = renderHook(() => useLongPress(callback, customDuration))

    // Start touch
    act(() => {
      result.current.onTouchStart()
    })

    // Advance time by custom duration
    act(() => {
      vi.advanceTimersByTime(customDuration)
    })

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should not call callback if touch ends before duration', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useLongPress(callback))

    // Start touch
    act(() => {
      result.current.onTouchStart()
    })

    // End touch after 200ms (less than 500ms)
    act(() => {
      vi.advanceTimersByTime(200)
      result.current.onTouchEnd()
    })

    // Advance past 500ms to verify callback wasn't called
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('should not call callback if touch is cancelled', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useLongPress(callback))

    // Start touch
    act(() => {
      result.current.onTouchStart()
    })

    // Cancel touch after 200ms
    act(() => {
      vi.advanceTimersByTime(200)
      result.current.onTouchCancel()
    })

    // Advance past 500ms to verify callback wasn't called
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(callback).not.toHaveBeenCalled()
  })

  it('should handle multiple touch start/end cycles', () => {
    const callback = vi.fn()
    const { result } = renderHook(() => useLongPress(callback))

    // First cycle - complete
    act(() => {
      result.current.onTouchStart()
      vi.advanceTimersByTime(500)
    })
    expect(callback).toHaveBeenCalledTimes(1)

    // Second cycle - cancelled
    act(() => {
      result.current.onTouchStart()
      vi.advanceTimersByTime(200)
      result.current.onTouchEnd()
    })
    expect(callback).toHaveBeenCalledTimes(1) // Still just 1

    // Third cycle - complete
    act(() => {
      result.current.onTouchStart()
      vi.advanceTimersByTime(500)
    })
    expect(callback).toHaveBeenCalledTimes(2)
  })
})
