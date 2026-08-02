import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { DEFAULT_TEST_SCREEN, setTestScreen } from './screenSize'

// Runners CI / charge locale : le défaut de 1 s de waitFor/findBy est trop juste
// pour les tests d'intégration wizard (rendu React + user-event + requêtes
// mockées enchaînés), d'où des faux échecs intermittents. 3 s supprime le flake
// sans masquer de vraie régression — un composant réellement cassé ne met pas
// 3 s à ne pas s'afficher, il ne s'affiche jamais.
configure({ asyncUtilTimeout: 3000 })

// Mock Vite global constants for tests
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      __APP_VERSION__: string
    }
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__APP_VERSION__ = '0.6.0'

// Mock localStorage fonctionnel (stocke vraiment les données)
// NOTE: This mock preserves localStorage interface properties like 'length'
// LIMITATIONS:
// - Does not simulate quota errors (localStorage can throw QuotaExceededError)
// - Does not persist across test files (cleared in beforeEach)
// - In-memory only - not suitable for testing persistence scenarios
const localStorageMock = (function () {
  let store: Record<string, string> = {}

  return {
    get length(): number {
      return Object.keys(store).length
    },
    key: (index: number): string | null => {
      const keys = Object.keys(store)
      return keys[index] ?? null
    },
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      // NOTE: Real localStorage can throw QuotaExceededError, but this mock doesn't
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

// Mock URL.createObjectURL et revokeObjectURL pour les tests d'export
// NOTE: monkey-patch only — replacing global.URL entirely breaks axios's
// isURLSameOrigin helper which calls `new URL(url)`.
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

// Mock hasPointerCapture et setPointerCapture pour Radix UI (non implémenté dans jsdom)
Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
  value: vi.fn(function () { return false }),
  configurable: true,
})

Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
  value: vi.fn(function () {}),
  configurable: true,
})

// Mock scrollIntoView pour Radix UI (non implémenté dans jsdom)
Element.prototype.scrollIntoView = vi.fn(function () {})

// Mock scrollTo
window.scrollTo = vi.fn(function () {})

// Mock ResizeObserver for useCompactMode hook (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// jsdom rapporte un écran de 0 × 0 (screen.width / screen.height), une valeur
// qu'aucun appareil réel ne produit. Tout code qui décide d'après la capacité
// de l'écran classerait donc l'environnement de test en « appareil incapable »
// et en ferait tomber les tests, sans que rien ne soit cassé côté application.
// On pose un écran de bureau par défaut, une fois pour toutes ici plutôt que
// fichier par fichier — même convention que le défaut « bureau » retenu pour
// useMediaQuery.
setTestScreen(DEFAULT_TEST_SCREEN.width, DEFAULT_TEST_SCREEN.height)

// Nettoyer localStorage avant chaque test
beforeEach(() => {
  localStorage.clear()
  // Nettoyer le corps du document
  document.body.innerHTML = ''
  // Rétablir l'écran par défaut : un test qui vise un appareil incapable
  // appelle setTestScreen sans avoir à nettoyer derrière lui.
  setTestScreen(DEFAULT_TEST_SCREEN.width, DEFAULT_TEST_SCREEN.height)
})

// Mock Sonner toast library
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
  Toaster: () => null,
}))

// Mock du service API
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))
