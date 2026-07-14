import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useEventMode } from '../useEventMode'

describe('useEventMode', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('retourne isConsultative: true quand opens_at est dans le futur', () => {
    // Date dans le futur: 7 jours à partir d'aujourd'hui
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 7)

    const { result } = renderHook(() =>
      useEventMode(futureDate.toISOString())
    )

    expect(result.current.isConsultative).toBe(true)
    expect(result.current.opensAt).toBeDefined()
  })

  it('retourne isConsultative: false quand opens_at est dans le passé', () => {
    // Date dans le passé: 7 jours avant aujourd'hui
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 7)

    const { result } = renderHook(() =>
      useEventMode(pastDate.toISOString())
    )

    expect(result.current.isConsultative).toBe(false)
  })

  it('retourne isConsultative: false quand opens_at est null', () => {
    const { result } = renderHook(() =>
      useEventMode(null)
    )

    expect(result.current.isConsultative).toBe(false)
    expect(result.current.opensAt).toBeNull()
    expect(result.current.opensAtDate).toBeNull()
  })

  it('retourne isConsultative: false quand opens_at est maintenant (ou passé)', () => {
    // Date actuelle moins 1 seconde pour être sûr que c'est passé
    const now = new Date()
    now.setSeconds(now.getSeconds() - 1)

    const { result } = renderHook(() =>
      useEventMode(now.toISOString())
    )

    expect(result.current.isConsultative).toBe(false)
  })

  it('formate la date en français avec "1er" pour le premier du mois', () => {
    const date = new Date('2026-02-01T00:00:00Z')

    const { result } = renderHook(() =>
      useEventMode(date.toISOString())
    )

    expect(result.current.opensAtDate).toBe('1er février 2026')
  })

  it('formate la date sans "er" pour les autres jours du mois', () => {
    const date = new Date('2026-02-15T00:00:00Z')

    const { result } = renderHook(() =>
      useEventMode(date.toISOString())
    )

    expect(result.current.opensAtDate).toBe('15 février 2026')
  })

  it('formate correctement les mois en français', () => {
    const dates = [
      { input: '2026-01-15T00:00:00Z', expected: '15 janvier 2026' },
      { input: '2026-02-01T00:00:00Z', expected: '1er février 2026' },
      { input: '2026-03-15T00:00:00Z', expected: '15 mars 2026' },
      { input: '2026-04-15T00:00:00Z', expected: '15 avril 2026' },
      { input: '2026-05-15T00:00:00Z', expected: '15 mai 2026' },
      { input: '2026-06-15T00:00:00Z', expected: '15 juin 2026' },
      { input: '2026-07-15T00:00:00Z', expected: '15 juillet 2026' },
      { input: '2026-08-15T00:00:00Z', expected: '15 août 2026' },
      { input: '2026-09-15T00:00:00Z', expected: '15 septembre 2026' },
      { input: '2026-10-15T00:00:00Z', expected: '15 octobre 2026' },
      { input: '2026-11-15T00:00:00Z', expected: '15 novembre 2026' },
      { input: '2026-12-15T00:00:00Z', expected: '15 décembre 2026' },
    ]

    dates.forEach(({ input, expected }) => {
      const { result } = renderHook(() =>
        useEventMode(input)
      )
      expect(result.current.opensAtDate).toBe(expected)
    })
  })

  it('formate l\'heure quand elle est présente', () => {
    const date = new Date('2026-02-01T09:30:00+01:00')

    const { result } = renderHook(() =>
      useEventMode(date.toISOString())
    )

    expect(result.current.opensAtDate).toBe('1er février 2026')
    expect(result.current.opensAtTime).toBe('09:30')
  })

  it('retourne opensAtTime null quand la date est à minuit heure locale', () => {
    // Créer une date à minuit heure locale France
    const date = new Date('2026-02-01T00:00:00+01:00')

    const { result } = renderHook(() =>
      useEventMode(date.toISOString())
    )

    expect(result.current.opensAtTime).toBeNull()
  })
})
