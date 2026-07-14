import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PublicUserMenu } from '../PublicUserMenu'
import { clearSessionData } from '@/hooks/useSessionTimeout'

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
    // Par défaut, pas d'utilisateur dans localStorage
    localStorageMock.getItem.mockReturnValue(null)
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

  describe('Dropdown alignment', () => {
    it('dropdown content is aligned to end (right side)', () => {
      render(<PublicUserMenu />)

      const dropdownContent = screen.getByTestId('dropdown-content')
      expect(dropdownContent).toHaveAttribute('data-align', 'end')
    })
  })
})
