import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAdminAuth } from '../useAdminAuth'
import { AuthProvider } from '../useAuth'

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

describe('useAdminAuth Hook', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    // Clear localStorage before each test
    localStorage.clear()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  it('redirige vers /login si non authentifié', async () => {
    const { result } = renderHook(() => useAdminAuth(), { wrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    })

    expect(result.current.isAuthChecked).toBe(false)
  })

  it('redirige vers /me si authentifié mais rôle != admin', async () => {
    const mockUser = {
      id: '123',
      email: 'user@example.com',
      firstName: 'Regular',
      lastName: 'User',
      phone: '1234567890',
      role: 'user' as const,
      hasMemberAccess: true,
    }

    localStorage.setItem('auth_token', 'aaa.bbb.ccc')
    localStorage.setItem('auth_user', JSON.stringify(mockUser))

    const { result } = renderHook(() => useAdminAuth(), { wrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/me', { replace: true })
    })

    expect(result.current.isAuthChecked).toBe(false)
  })

  it('isAuthChecked = true si rôle = admin', async () => {
    const mockAdmin = {
      id: '456',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      phone: '0987654321',
      role: 'admin' as const,
      hasMemberAccess: false,
    }

    localStorage.setItem('auth_token', 'aaa.bbb.ccc')
    localStorage.setItem('auth_user', JSON.stringify(mockAdmin))

    const { result } = renderHook(() => useAdminAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.isAuthChecked).toBe(true)
    })

    // Pas de redirection pour un admin
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('pas de navigation multiple (hasNavigatedRef)', async () => {
    // Sans authentification - doit naviguer une seule fois
    const { result } = renderHook(() => useAdminAuth(), { wrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledTimes(1)
    })

    // Même après plusieurs render, pas de navigation supplémentaire
    void result.current
    void result.current

    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it('attend le chargement du AuthProvider (isLoading)', async () => {
    const mockAdmin = {
      id: '456',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      phone: '0987654321',
      role: 'admin' as const,
      hasMemberAccess: false,
    }

    localStorage.setItem('auth_token', 'aaa.bbb.ccc')
    localStorage.setItem('auth_user', JSON.stringify(mockAdmin))

    const { result } = renderHook(() => useAdminAuth(), { wrapper })

    // Pendant le chargement, pas de navigation
    expect(mockNavigate).not.toHaveBeenCalled()

    // Après le chargement, isAuthChecked devrait être true
    await waitFor(() => {
      expect(result.current.isAuthChecked).toBe(true)
    })
  })

  it('purge un user au rôle invalide (résidu obsolète) → /login', async () => {
    const mockVolunteer = {
      id: '789',
      email: 'volunteer@example.com',
      firstName: 'Volunteer',
      lastName: 'User',
      phone: '5555555555',
      role: 'volunteer' as const,
      hasMemberAccess: false,
    }

    localStorage.setItem('auth_token', 'aaa.bbb.ccc')
    localStorage.setItem('auth_user', JSON.stringify(mockVolunteer))

    const { result } = renderHook(() => useAdminAuth(), { wrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
    })

    expect(result.current.isAuthChecked).toBe(false)
  })
})
