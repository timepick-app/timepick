import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { NavUser } from '../NavUser'

// Stub global de fetch — F-085 utilise `fetch(..., { keepalive: true })` (et
// non `api.post`) pour survivre à la navigation qui suit immédiatement le
// clic sur Déconnexion (cf. auth.service.ts).
const mockFetch = vi.fn()

const { mockNavigate, blocker, mockClearSessionData, authUser } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  blocker: { isBlocked: false, requestNavigation: vi.fn() },
  mockClearSessionData: vi.fn(),
  // Utilisateur authentifié mutable — les tests de bascule (D7) font varier
  // role/hasMemberAccess. hasMemberAccess: false par défaut (préserve les tests
  // existants : shell admin par défaut + pas d'item de bascule).
  authUser: {
    id: 'u1',
    email: 'jane@timepick.fr',
    firstName: 'Jane',
    lastName: 'Admin',
    role: 'admin' as 'admin' | 'user',
    hasMemberAccess: false,
  },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authUser,
  }),
}))

vi.mock('@/contexts/NavigationBlockerContext', () => ({
  useNavigationBlocker: () => blocker,
}))

vi.mock('@/hooks/useSessionTimeout', () => ({
  clearSessionData: mockClearSessionData,
}))

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

// Rendu eager du menu pour pouvoir interroger les items sans simuler l'ouverture Radix
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock })

const mockLocation = { href: '' }
Object.defineProperty(window, 'location', { value: mockLocation, writable: true })

describe('NavUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    // Jeton par défaut : la plupart des tests déclenchent la révocation
    // serveur (F-085). Le test « sans jeton » l'écrase avec `null`.
    localStorageMock.getItem.mockImplementation((key: string) =>
      key === 'auth_token' ? 'jeton-test' : null,
    )
    blocker.isBlocked = false
    mockLocation.href = ''
    // Réinitialiser l'utilisateur entre les tests (bascule D7 story 1.4).
    authUser.role = 'admin'
    authUser.hasMemberAccess = false
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('affiche nom, email et initiales depuis useAuth', () => {
    render(<NavUser />)
    expect(screen.getAllByText('Jane Admin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('jane@timepick.fr').length).toBeGreaterThan(0)
    expect(screen.getByText('JA')).toBeInTheDocument()
  })

  it('navigue vers /admin/profile via l\'item Profil et ferme le tiroir', () => {
    const onNavigate = vi.fn()
    render(<NavUser onNavigate={onNavigate} />)
    screen.getByText('Profil').click()
    expect(mockNavigate).toHaveBeenCalledWith('/admin/profile')
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('ouvre la documentation dans un nouvel onglet via l\'item Documentation', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const onNavigate = vi.fn()
    render(<NavUser onNavigate={onNavigate} />)
    screen.getByText('Documentation').click()
    expect(openSpy).toHaveBeenCalledWith(
      'https://docs.timepick.app/',
      '_blank',
      'noopener,noreferrer',
    )
    expect(onNavigate).toHaveBeenCalledTimes(1)
    openSpy.mockRestore()
  })

  it('respecte le NavigationBlocker quand des modifications sont en attente', () => {
    blocker.isBlocked = true
    render(<NavUser />)
    screen.getByText('Profil').click()
    expect(blocker.requestNavigation).toHaveBeenCalledWith('/admin/profile')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('déconnecte : purge le stockage, vide la session et redirige', () => {
    render(<NavUser />)
    screen.getByText('Déconnexion').click()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user')
    expect(mockClearSessionData).toHaveBeenCalledTimes(1)
    expect(mockLocation.href).toBe('/login')
  })

  describe('AC5 / F-085 : révocation serveur au logout', () => {
    it('appelle fetch exactement une fois avec URL, méthode, keepalive et Authorization corrects', () => {
      render(<NavUser />)
      screen.getByText('Déconnexion').click()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/logout',
        {
          method: 'POST',
          keepalive: true,
          headers: { Authorization: 'Bearer jeton-test' },
        },
      )
    })

    it('révoque la session serveur avant de purger le token local (ordre)', () => {
      render(<NavUser />)
      screen.getByText('Déconnexion').click()

      const fetchOrder = mockFetch.mock.invocationCallOrder[0]
      const removeOrder = localStorageMock.removeItem.mock.invocationCallOrder[0]
      expect(fetchOrder).toBeLessThan(removeOrder)
    })

    it('ne bloque jamais la déconnexion locale sur la requête serveur', () => {
      const enVol = new Promise<Response>(() => {})
      mockFetch.mockReturnValueOnce(enVol)

      render(<NavUser />)
      screen.getByText('Déconnexion').click()

      // aucune attente : purge et redirection sont déjà faites
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user')
      expect(mockClearSessionData).toHaveBeenCalledTimes(1)
      expect(mockLocation.href).toBe('/login')
    })

    it("n'appelle pas fetch si aucun jeton n'est présent en localStorage (nettoyage et redirection quand même)", () => {
      localStorageMock.getItem.mockImplementation(() => null)

      render(<NavUser />)
      screen.getByText('Déconnexion').click()

      expect(mockFetch).not.toHaveBeenCalled()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user')
      expect(mockClearSessionData).toHaveBeenCalledTimes(1)
      expect(mockLocation.href).toBe('/login')
    })
  })

  describe('bascule admin↔membre (D7 story 1.4)', () => {
    it('shell admin + hasMemberAccess → item « Espace membre » présent (AC5)', () => {
      authUser.hasMemberAccess = true
      render(<NavUser shell="admin" />)
      expect(screen.getByText('Espace membre')).toBeInTheDocument()
    })

    it('shell admin + hasMemberAccess=false → item « Espace membre » absent (AC6)', () => {
      authUser.hasMemberAccess = false
      render(<NavUser shell="admin" />)
      expect(screen.queryByText('Espace membre')).toBeNull()
    })

    it('shell member + role admin → item « Console admin » présent (AC5)', () => {
      authUser.role = 'admin'
      render(<NavUser shell="member" />)
      expect(screen.getByText('Console admin')).toBeInTheDocument()
    })

    it('shell member + role user → item « Console admin » absent', () => {
      authUser.role = 'user'
      render(<NavUser shell="member" />)
      expect(screen.queryByText('Console admin')).toBeNull()
    })

    it('item « Espace membre » navigue vers /me', () => {
      authUser.hasMemberAccess = true
      render(<NavUser shell="admin" />)
      screen.getByText('Espace membre').click()
      expect(mockNavigate).toHaveBeenCalledWith('/me')
    })

    it('item « Console admin » navigue vers /admin', () => {
      authUser.role = 'admin'
      render(<NavUser shell="member" />)
      screen.getByText('Console admin').click()
      expect(mockNavigate).toHaveBeenCalledWith('/admin')
    })
  })
})
