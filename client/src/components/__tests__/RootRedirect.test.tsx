import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RootRedirect } from '../RootRedirect'
import type { OrganizationSettings } from '@/services/organization.service'

// `useAuth` pilote le régime (connecté / anonyme) ; le service public est mocké
// pour exercer le VRAI hook `usePublicOrganization` (clé de cache, `enabled`,
// absence de retry). Navigate/Routes viennent du vrai react-router-dom.
const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  user: null as { role: 'admin' | 'user' } | null,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    user: authState.user,
  }),
}))

const mockGetPublicOrganization = vi.hoisted(() => vi.fn())
vi.mock('@/services/organization.service', () => ({
  getPublicOrganization: () => mockGetPublicOrganization(),
}))

const CONFIGURED_FACADE: OrganizationSettings = {
  name: 'Chorale du Marais',
  logo: '',
  description: 'Répétitions hebdomadaires, ouvertes à tous',
  homepageFacade: true,
}

function renderRoot() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/admin" element={<div data-testid="admin-page">Admin</div>} />
          <Route path="/me" element={<div data-testid="me-page">Mon agenda</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RootRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.isAuthenticated = false
    authState.isLoading = false
    authState.user = null
    mockGetPublicOrganization.mockResolvedValue(CONFIGURED_FACADE)
  })

  describe('visiteur connecté — aiguilleur inchangé', () => {
    it('isLoading → null (pas de flash pendant la réhydratation du token)', () => {
      authState.isLoading = true
      renderRoot()

      expect(screen.queryByTestId('login-page')).toBeNull()
      expect(screen.queryByTestId('admin-page')).toBeNull()
      expect(screen.queryByTestId('me-page')).toBeNull()
      expect(screen.queryByRole('heading')).toBeNull()
    })

    it('admin → /admin', () => {
      authState.isAuthenticated = true
      authState.user = { role: 'admin' }
      renderRoot()

      expect(screen.getByTestId('admin-page')).toBeInTheDocument()
    })

    it('membre → /me', () => {
      authState.isAuthenticated = true
      authState.user = { role: 'user' }
      renderRoot()

      expect(screen.getByTestId('me-page')).toBeInTheDocument()
    })

    it("n'interroge jamais l'endpoint public pour un visiteur connecté", () => {
      authState.isAuthenticated = true
      authState.user = { role: 'admin' }
      renderRoot()

      expect(mockGetPublicOrganization).not.toHaveBeenCalled()
    })

    it("n'interroge pas l'endpoint public tant que l'auth n'est pas résolue", () => {
      authState.isLoading = true
      renderRoot()

      expect(mockGetPublicOrganization).not.toHaveBeenCalled()
    })
  })

  describe('visiteur anonyme — façade A1', () => {
    it('identité configurée + façade activée → rend OrganizationHome', async () => {
      renderRoot()

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Chorale du Marais' }),
      ).toBeInTheDocument()
      expect(screen.getByText('Répétitions hebdomadaires, ouvertes à tous')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login')
      expect(screen.queryByTestId('login-page')).toBeNull()
    })

    it('nom vide (identité non configurée) → repli /login', async () => {
      mockGetPublicOrganization.mockResolvedValue({ ...CONFIGURED_FACADE, name: '' })
      renderRoot()

      expect(await screen.findByTestId('login-page')).toBeInTheDocument()
    })

    it('nom réduit à des blancs → repli /login', async () => {
      mockGetPublicOrganization.mockResolvedValue({ ...CONFIGURED_FACADE, name: '   ' })
      renderRoot()

      expect(await screen.findByTestId('login-page')).toBeInTheDocument()
    })

    it('façade désactivée (homepageFacade=false) → repli /login', async () => {
      mockGetPublicOrganization.mockResolvedValue({ ...CONFIGURED_FACADE, homepageFacade: false })
      renderRoot()

      expect(await screen.findByTestId('login-page')).toBeInTheDocument()
    })

    it('erreur API → repli /login', async () => {
      mockGetPublicOrganization.mockRejectedValue(new Error('boom'))
      renderRoot()

      expect(await screen.findByTestId('login-page')).toBeInTheDocument()
    })

    it('pendant le fetch → null, sans flash de /login', () => {
      mockGetPublicOrganization.mockReturnValue(Promise.withResolvers<OrganizationSettings>().promise)
      renderRoot()

      expect(mockGetPublicOrganization).toHaveBeenCalled()
      expect(screen.queryByTestId('login-page')).toBeNull()
      expect(screen.queryByRole('heading')).toBeNull()
    })
  })
})
