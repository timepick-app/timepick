import { describe, it, expect, beforeEach } from 'vitest'
import { vi } from 'vitest'

// Le setup global (src/test/setup.ts) mocke '../services/api' pour tous les tests.
// On désactive ce mock pour pouvoir tester le VRAI intercepteur d'axios (qui s'est
// enregistré au moment de l'import du module). vi.unmock est hoisté avant les imports.
vi.unmock('../api')

import api from '../api'

// Axios stocke les handlers enregistrés dans `interceptors.<type>.handlers`.
// On caste pour récupérer le handler `rejected` du premier (et unique) intercepteur
// de réponse, puis on l'invoque directement — sans réseau réel.
type RejectedHandler = (error: unknown) => Promise<unknown>
type ResponseInterceptors = { handlers: { rejected: RejectedHandler }[] }

function getRejectedHandler(): RejectedHandler {
  const interceptors = api.interceptors.response as unknown as ResponseInterceptors
  return interceptors.handlers[0].rejected
}

describe('api — intercepteur de réponse 401', () => {
  beforeEach(() => {
    localStorage.clear()
    // window.location réifié : on doit pouvoir POSER pathname (ex. '/login') et
    // LIRE href après assignation. Même pattern que SessionExpiredModal.test.tsx,
    // enrichi de `pathname`.
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { href: '', pathname: '/admin/events/x/edit' },
    })
  })

  it('401 avec token présent + url non-/auth → teardown localStorage + redirection', async () => {
    localStorage.setItem('auth_token', 'tok')
    localStorage.setItem('auth_user', JSON.stringify({ id: '1' }))
    localStorage.setItem('loginTime', '123')
    localStorage.setItem('sessionTTL', '1800')

    const rejected = getRejectedHandler()
    const error = { response: { status: 401 }, config: { url: '/admin/events/x/slots' } }

    await expect(rejected(error)).rejects.toEqual(error)

    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(localStorage.getItem('auth_user')).toBeNull()
    expect(localStorage.getItem('loginTime')).toBeNull()
    expect(localStorage.getItem('sessionTTL')).toBeNull()
    expect(window.location.href).toBe('/login?reason=session_expired')
  })

  it('401 sur une url /auth/refresh (token présent) → PAS de redirect, token conservé', async () => {
    localStorage.setItem('auth_token', 'tok')

    const rejected = getRejectedHandler()
    const error = { response: { status: 401 }, config: { url: '/auth/refresh' } }

    await expect(rejected(error)).rejects.toEqual(error)
    expect(localStorage.getItem('auth_token')).toBe('tok')
    expect(window.location.href).toBe('')
  })

  it('401 sans token en localStorage → PAS de redirect, href inchangé', async () => {
    const rejected = getRejectedHandler()
    const error = { response: { status: 401 }, config: { url: '/admin/x' } }

    await expect(rejected(error)).rejects.toEqual(error)
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(window.location.href).toBe('')
  })

  it('401 alors que pathname === /login (token présent) → PAS de redirect', async () => {
    localStorage.setItem('auth_token', 'tok')
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: { href: '', pathname: '/login' },
    })

    const rejected = getRejectedHandler()
    const error = { response: { status: 401 }, config: { url: '/admin/x' } }

    await expect(rejected(error)).rejects.toEqual(error)
    expect(localStorage.getItem('auth_token')).toBe('tok')
    expect(window.location.href).toBe('')
  })

  it('erreur non-401 (500) → PAS de redirect, promesse rejetée', async () => {
    const rejected = getRejectedHandler()
    const error = { response: { status: 500 }, config: { url: '/admin/x' } }

    await expect(rejected(error)).rejects.toEqual(error)
    expect(window.location.href).toBe('')
  })
})
