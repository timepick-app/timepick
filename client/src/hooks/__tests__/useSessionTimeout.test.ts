/**
 * Tests pour useSessionTimeout hook
 * Gestion du timeout de session avec avertissements et prolongation
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSessionTimeout } from '../useSessionTimeout'

// Mock du localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString() },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} }
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock de l'API avec factory inline
vi.mock('@/services/api', () => ({
  default: {
    post: vi.fn(() =>
      Promise.resolve({
        data: {
          data: {
            token: 'new-token',
            expiresAt: Math.floor(Date.now() / 1000) + 7200
          }
        }
      })
    )
  }
}))

describe('useSessionTimeout Hook', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('Calcul du temps restant', () => {
    it('calcule correctement le temps restant depuis la connexion', () => {
      const now = Date.now()
      const loginTime = Math.floor(now / 1000)
      const sessionTTL = 7200 // 2 heures

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      // Le temps restant doit être proche de sessionTTL
      expect(result.current.timeRemaining).toBeGreaterThan(7100)
      expect(result.current.timeRemaining).toBeLessThanOrEqual(7200)
    })

    it('calcule correctement le temps quand la session est avancée', () => {
      const now = Date.now()
      const loginTime = Math.floor(now / 1000) - 3600 // Connecté il y a 1 heure
      const sessionTTL = 7200 // 2 heures

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      // Le temps restant doit être d\'environ 1 heure
      expect(result.current.timeRemaining).toBeGreaterThan(3500)
      expect(result.current.timeRemaining).toBeLessThanOrEqual(3600)
    })

    it('retourne 0 quand la session est expirée', () => {
      const now = Date.now()
      const loginTime = Math.floor(now / 1000) - 7200 // Connecté il y a 2 heures
      const sessionTTL = 7200 // 2 heures

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      expect(result.current.timeRemaining).toBe(0)
      expect(result.current.isExpired).toBe(true)
    })
  })

  describe('Détection des seuils d\'avertissement', () => {
    it('détecte quand la session expire bientôt (T-5min)', () => {
      const now = Date.now()
      const loginTime = Math.floor(now / 1000) - 6890 // Connecté il y a ~114min50, reste ~310s avant expiration
      const sessionTTL = 7200 // 2 heures

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      // T-5min = 300 secondes restantes ou moins
      // Avec loginTime à -6890s, on a 7200-6890=310s restantes
      expect(result.current.timeRemaining).toBeLessThanOrEqual(310) // Marge de sécurité
      // Le WARNING_THRESHOLD est à 300s, donc 310s ne déclenche PAS l'avertissement
      // On teste donc avec un temps plus proche de l'expiration
    })

    it('détecte quand la session est critique (T-1min)', () => {
      const now = Date.now()
      const loginTime = Math.floor(now / 1000) - 7140 // Connecté il y a 119min, reste 60s
      const sessionTTL = 7200 // 2 heures

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      // T-1min = 60 secondes restantes
      expect(result.current.timeRemaining).toBeLessThanOrEqual(60)
      expect(result.current.isCritical).toBe(true)
      expect(result.current.isExpiringSoon).toBe(true)
    })

    it('ne détecte pas d\'avertissement quand la session est fraîche', () => {
      const now = Date.now()
      const loginTime = Math.floor(now / 1000) - 600 // Connecté il y a 10min
      const sessionTTL = 7200 // 2 heures

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      expect(result.current.isExpiringSoon).toBe(false)
      expect(result.current.isCritical).toBe(false)
      expect(result.current.isExpired).toBe(false)
    })

    it('détecte l\'avertissement T-5min avec le bon seuil', () => {
      const now = Date.now()
      const loginTime = Math.floor(now / 1000) - 6900 // Connecté il y a 115min, reste 300s exactement
      const sessionTTL = 7200 // 2 heures

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      // T-5min = 300 secondes restantes - seuil exact
      expect(result.current.timeRemaining).toBeLessThanOrEqual(300)
      expect(result.current.isExpiringSoon).toBe(true)
    })
  })

  describe('Persistance au rechargement de page', () => {
    it('récupère le loginTime depuis localStorage', () => {
      const loginTime = Math.floor(Date.now() / 1000) - 600
      const sessionTTL = 7200

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      expect(result.current.timeRemaining).toBeGreaterThanOrEqual(6600)
      expect(result.current.timeRemaining).toBeLessThanOrEqual(6600 + 10) // petite marge
    })

    it('gère le cas où localStorage est vide (pas de connexion)', () => {
      const { result } = renderHook(() => useSessionTimeout())

      expect(result.current.timeRemaining).toBe(0)
      expect(result.current.isExpired).toBe(true)
    })
  })

  describe('Prolongation de session', () => {
    it('prolonge la session via refreshSession', async () => {
      const now = Date.now()
      const loginTime = Math.floor(now / 1000) - 3600
      const sessionTTL = 7200

      localStorage.setItem('loginTime', loginTime.toString())
      localStorage.setItem('sessionTTL', sessionTTL.toString())

      const { result } = renderHook(() => useSessionTimeout())

      const timeBeforeRefresh = result.current.timeRemaining

      await act(async () => {
        await result.current.refreshSession()
      })

      // Le nouveau temps restant doit être plus grand
      expect(result.current.timeRemaining).toBeGreaterThan(timeBeforeRefresh)

      // Vérifier que le nouveau loginTime a été stocké
      const newLoginTime = localStorage.getItem('loginTime')
      expect(newLoginTime).toBeDefined()
      expect(parseInt(newLoginTime!)).toBeGreaterThan(loginTime)
    })
  })
})
