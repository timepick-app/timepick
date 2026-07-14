import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AdminGuard } from '../AdminGuard'

// useAuth est la seule dépendance du garde — on la mocke pour piloter l'état
// d'authentification. Navigate/Outlet viennent du vrai react-router-dom (jsdom).
const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: true,
  user: null as { role: 'admin' | 'user'; hasMemberAccess: boolean } | null,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    user: authState.user,
  }),
}))

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route element={<AdminGuard />}>
          <Route path="/admin" element={<div data-testid="admin-page">Admin Page</div>} />
        </Route>
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route path="/me" element={<div data-testid="me-page">Member Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminGuard (D9 story 1.4)', () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.isLoading = true
    authState.user = null
  })

  it('isLoading → null (pas de flash, aucune page enfant rendue)', () => {
    authState.isLoading = true
    renderGuard()
    expect(screen.queryByTestId('admin-page')).toBeNull()
    expect(screen.queryByTestId('login-page')).toBeNull()
    expect(screen.queryByTestId('me-page')).toBeNull()
  })

  it('visiteur non authentifié → redirect /login', () => {
    authState.isLoading = false
    authState.isAuthenticated = false
    renderGuard()
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-page')).toBeNull()
  })

  it('membre authentifié (role=user) → redirect /me (AC4)', () => {
    authState.isLoading = false
    authState.isAuthenticated = true
    authState.user = { role: 'user', hasMemberAccess: true }
    renderGuard()
    expect(screen.getByTestId('me-page')).toBeInTheDocument()
    expect(screen.queryByTestId('admin-page')).toBeNull()
  })

  it('admin authentifié → Outlet rendu (page admin enfant)', () => {
    authState.isLoading = false
    authState.isAuthenticated = true
    authState.user = { role: 'admin', hasMemberAccess: false }
    renderGuard()
    expect(screen.getByTestId('admin-page')).toBeInTheDocument()
  })
})
