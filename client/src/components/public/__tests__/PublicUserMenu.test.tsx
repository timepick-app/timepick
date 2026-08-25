import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PublicUserMenu } from '../PublicUserMenu'
import { clearSessionData } from '@/hooks/useSessionTimeout'

// Stub global de fetch — F-085 utilise `fetch(..., { keepalive: true })` (et non
// `api.post`) pour survivre à la navigation qui suit immédiatement le clic sur
// Déconnexion. Hissé au niveau fichier (voir beforeEach racine) : plusieurs tests
// posent un utilisateur en localStorage, ce qui fournit aussi un jeton `auth_token`
// truthy — un clic sur Déconnexion doit toujours taper ce stub, jamais le réseau réel.
const fetchMock = vi.fn()

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
})

// Mock clearSessionData
vi.mock('@/hooks/useSessionTimeout', () => ({
  clearSessionData: vi.fn(),
}))

// Mock window.location
const mockLocation = { href: '' }
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
})

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, 'aria-label': ariaLabel, ...props }: { children: React.ReactNode; 'aria-label'?: string }) => (
    <button aria-label={ariaLabel} {...props}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children, align }: { children: React.ReactNode; align?: string }) => (
    <div data-testid="dropdown-content" data-align={align}>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('PublicUserMenu', () => {
  beforeEach(() => {
    // Clear mocks before each test
    vi.clearAllMocks()
    mockLocation.href = ''
    // Stub fetch au niveau fichier : aucun test ne doit jamais atteindre le réseau réel.
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    // Par défaut, pas d'utilisateur mais un jeton `auth_token` présent (implémentation
    // par clé, pour ne pas casser les tests qui écrasent getItem globalement).
    localStorageMock.getItem.mockImplementation((key: string) =>
      key === 'auth_token' ? 'fake-jwt-token' : null,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('AC3: Avatar with user initials displayed', () => {
    it('renders avatar button with aria-label', () => {
      render(<PublicUserMenu />)

      const button = screen.getByLabelText(/menu utilisateur/i)
      expect(button).toBeInTheDocument()
    })

    it('displays default "U" for Utilisateur when no user in localStorage', () => {
      render(<PublicUserMenu />)

      expect(screen.getByText('U')).toBeInTheDocument()
    })

    it('displays user initials from localStorage', () => {
      const mockUser = JSON.stringify({ firstName: 'Jean', lastName: 'Dupont', email: 'jean@example.com' })
      localStorageMock.getItem.mockReturnValue(mockUser)

      render(<PublicUserMenu />)

      expect(screen.getByText('JD')).toBeInTheDocument()
    })

    it('generates initials from single name', () => {
      const mockUser = JSON.stringify({ firstName: 'Marie', lastName: null, email: 'marie@example.com' })
      localStorageMock.getItem.mockReturnValue(mockUser)

      render(<PublicUserMenu />)

      expect(screen.getByText('M')).toBeInTheDocument()
    })

    it('limits initials to 2 characters', () => {
      const mockUser = JSON.stringify({ firstName: 'Jean', lastName: 'Pierre Marie Dupont', email: 'jp@example.com' })
      localStorageMock.getItem.mockReturnValue(mockUser)

      render(<PublicUserMenu />)

      expect(screen.getByText('JP')).toBeInTheDocument()
    })

    it('falls back to email username if no name', () => {
      const mockUser = JSON.stringify({ email: 'testuser@example.com' })
      localStorageMock.getItem.mockReturnValue(mockUser)

      render(<PublicUserMenu />)

      // "testuser" -> "T"
      expect(screen.getByText('T')).toBeInTheDocument()
    })
  })

  describe('AC4: Dropdown displays full name and email', () => {
    it('displays user name in dropdown', () => {
      const mockUser = JSON.stringify({ firstName: 'Jean', lastName: 'Dupont', email: 'jean.dupont@example.com' })
      localStorageMock.getItem.mockReturnValue(mockUser)

      render(<PublicUserMenu />)

      expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
    })

    it('displays user email in dropdown', () => {
      const mockUser = JSON.stringify({ firstName: 'Jean', lastName: 'Dupont', email: 'jean.dupont@example.com' })
      localStorageMock.getItem.mockReturnValue(mockUser)

      render(<PublicUserMenu />)

      expect(screen.getByText('jean.dupont@example.com')).toBeInTheDocument()
    })

    it('does not display email when not available', () => {
      const mockUser = JSON.stringify({ firstName: 'Jean', lastName: 'Dupont' })
      localStorageMock.getItem.mockReturnValue(mockUser)

      render(<PublicUserMenu />)

      expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
      // No email should be displayed
      expect(screen.queryByText(/@/)).not.toBeInTheDocument()
    })
  })

  describe('AC5: Logout redirects to /login', () => {
    it('displays logout option in dropdown', () => {
      render(<PublicUserMenu />)

      expect(screen.getByText(/déconnexion/i)).toBeInTheDocument()
    })

    it('clears auth_token and auth_user on logout', () => {
      render(<PublicUserMenu />)

      const logoutButton = screen.getByText(/déconnexion/i)
      logoutButton.click()

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user')
    })

    it('calls clearSessionData on logout', () => {
      render(<PublicUserMenu />)

      const logoutButton = screen.getByText(/déconnexion/i)
      logoutButton.click()

      expect(clearSessionData).toHaveBeenCalledTimes(1)
    })

    it('redirects to /login on logout', () => {
      render(<PublicUserMenu />)

      const logoutButton = screen.getByText(/déconnexion/i)
      logoutButton.click()

      expect(mockLocation.href).toBe('/login')
    })
  })

  describe('AC5 / F-085 : révocation serveur au logout', () => {
    it('appelle fetch exactement une fois vers /auth/logout avec les bons paramètres', () => {
      render(<PublicUserMenu />)

      const logoutButton = screen.getByText(/déconnexion/i)
      logoutButton.click()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        keepalive: true,
        headers: { Authorization: 'Bearer fake-jwt-token' },
      })
    })

    it('révoque la session serveur avant de purger le token local (ordre)', () => {
      render(<PublicUserMenu />)

      const logoutButton = screen.getByText(/déconnexion/i)
      logoutButton.click()

      const fetchOrder = fetchMock.mock.invocationCallOrder[0]
      const removeOrder = localStorageMock.removeItem.mock.invocationCallOrder[0]
      expect(fetchOrder).toBeLessThan(removeOrder)
    })

    it('poursuit le nettoyage local et la redirection sans attendre la révocation serveur (best-effort)', () => {
      // Promesse jamais réglée : simule une révocation serveur qui ne répond jamais
      // (réseau lent ou mort). Si l'implémentation attendait cette promesse avant de
      // purger/rediriger, les assertions ci-dessous échoueraient — elles défendent
      // l'invariant « le logout local ne bloque jamais sur le réseau ».
      const { promise: neverSettles } = Promise.withResolvers<Response>()
      fetchMock.mockReturnValueOnce(neverSettles)

      render(<PublicUserMenu />)

      const logoutButton = screen.getByText(/déconnexion/i)
      logoutButton.click()

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user')
      expect(clearSessionData).toHaveBeenCalledTimes(1)
      expect(mockLocation.href).toBe('/login')
    })

    it("n'appelle pas fetch si aucun jeton n'est présent en localStorage", () => {
      localStorageMock.getItem.mockImplementation(() => null)

      render(<PublicUserMenu />)

      const logoutButton = screen.getByText(/déconnexion/i)
      logoutButton.click()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token')
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user')
      expect(clearSessionData).toHaveBeenCalledTimes(1)
      expect(mockLocation.href).toBe('/login')
    })
  })

  describe('Dropdown alignment', () => {
    it('dropdown content is aligned to end (right side)', () => {
      render(<PublicUserMenu />)

      const dropdownContent = screen.getByTestId('dropdown-content')
      expect(dropdownContent).toHaveAttribute('data-align', 'end')
    })
  })
})
