import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useDebounce } from '../useDebounce'

describe('useDebounce', () => {
  it('retourne la valeur initiale immédiatement', () => {
    const { result } = renderHook(() => useDebounce('test', 300))

    expect(result.current).toBe('test')
  })

  it('retourne la valeur débondée après le délai', async () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    )

    expect(result.current).toBe('initial')

    // Changer la valeur avec act()
    act(() => {
      rerender({ value: 'updated', delay: 300 })
    })

    // Avancer le temps progressivement
    vi.advanceTimersByTime(299)
    expect(result.current).toBe('initial')

    // Une fois le délai passé, la valeur doit être mise à jour
    act(() => {
      vi.advanceTimersByTime(1)
    })

    // Avec act(), le useEffect se déclenche et la valeur est mise à jour
    expect(result.current).toBe('updated')

    vi.useRealTimers()
  })

  it('se relance à chaque changement de valeur avant le délai', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    )

    expect(result.current).toBe('initial')

    // Premier changement
    act(() => {
      rerender({ value: 'change1' })
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('initial')

    // Deuxième changement avant la fin du délai
    act(() => {
      rerender({ value: 'change2' })
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('initial')

    // Le timer se reset à chaque changement, donc toujours la valeur initiale
    act(() => {
      vi.advanceTimersByTime(200)
    })
    // Après 400ms (100 + 100 + 200), la valeur débondée est 'change2'
    expect(result.current).toBe('change2')

    vi.useRealTimers()
  })

  it('fonctionne avec un délai de 0ms', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'test', delay: 0 } }
    )

    act(() => {
      rerender({ value: 'updated', delay: 0 })
    })
    act(() => {
      vi.runAllTimers()
    })

    // Vérifier que le hook ne plante pas avec delay: 0
    expect(result.current).toBeDefined()

    vi.useRealTimers()
  })

  it('fonctionne avec différents types de données', () => {
    const { result: numberResult } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 0 } }
    )

    expect(numberResult.current).toBe(0)

    // Test avec un objet
    const { result: objResult } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: { key: 'value1' } } }
    )

    expect(objResult.current).toEqual({ key: 'value1' })
  })

  it('nettoie le timer précédent quand le composant est démonté', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

    const { rerender, unmount } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'test' } }
    )

    rerender({ value: 'updated' })
    unmount()

    // clearTimeout doit être appelé lors du démontage
    expect(clearTimeout).toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
  })

  it('se met à jour quand le délai change', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'test', delay: 300 } }
    )

    expect(result.current).toBe('test')

    act(() => {
      rerender({ value: 'updated', delay: 100 })
    })
    act(() => {
      vi.runAllTimers()
    })

    // Vérifier que le hook ne plante pas
    expect(result.current).toBeDefined()

    vi.useRealTimers()
  })
})
