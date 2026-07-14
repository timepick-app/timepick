import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PublicNavHeader } from '../PublicNavHeader'

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

// Mock PublicUserMenu to simplify testing
vi.mock('../PublicUserMenu', () => ({
  PublicUserMenu: () => <div data-testid="user-menu">User Menu</div>,
}))

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, asChild, ...props }: { children: React.ReactNode; asChild?: boolean }) => (
    <button {...props}>{children}</button>
  ),
}))

/**
 * Helper to render component with router context
 */
function renderWithRouter(props?: { eventName?: string; periodFormatted?: string | null; loginHref?: string }) {
  return render(
    <MemoryRouter>
      <PublicNavHeader {...props} />
    </MemoryRouter>
  )
}

describe('PublicNavHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  describe('Default mode (no event context)', () => {
    it('renders a sticky header at top of page', async () => {
      renderWithRouter()

      await waitFor(() => {
        const header = screen.getByRole('banner')
        expect(header).toBeInTheDocument()
        expect(header).toHaveClass('sticky', 'top-0', 'z-50')
      })
    })

    it('renders "TimePick" as app name', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('TimePick')).toBeInTheDocument()
      })
    })

    it('app name links to home page', async () => {
      renderWithRouter()

      await waitFor(() => {
        const appName = screen.getByRole('link', { name: /timepick/i })
        expect(appName).toHaveAttribute('href', '/')
      })
    })
  })

  describe('Event context mode', () => {
    it('displays event name instead of app branding', async () => {
      renderWithRouter({ eventName: "Fête de l'école 2026" })

      await waitFor(() => {
        expect(screen.getByText("Fête de l'école 2026")).toBeInTheDocument()
        expect(screen.queryByText('TimePick')).not.toBeInTheDocument()
      })
    })

    it('renders event name as h1', async () => {
      renderWithRouter({ eventName: 'Test Event' })

      await waitFor(() => {
        const title = screen.getByRole('heading', { level: 1, name: /test event/i })
        expect(title).toBeInTheDocument()
      })
    })

    it('displays period formatted alongside event name', async () => {
      renderWithRouter({ eventName: 'Test Event', periodFormatted: '2 avril 2026' })

      await waitFor(() => {
        expect(screen.getByTestId('event-period')).toHaveTextContent('2 avril 2026')
      })
    })

    it('renders without period when periodFormatted is null', async () => {
      renderWithRouter({ eventName: 'Test Event', periodFormatted: null })

      await waitFor(() => {
        expect(screen.getByText('Test Event')).toBeInTheDocument()
        expect(screen.queryByTestId('event-period')).not.toBeInTheDocument()
      })
    })

    it('applies truncate on event name for long titles', async () => {
      renderWithRouter({ eventName: 'A Very Long Event Name That Should Be Truncated On Mobile' })

      await waitFor(() => {
        const title = screen.getByRole('heading', { level: 1 })
        expect(title).toHaveClass('truncate')
      })
    })

    it('uses compact padding (py-2) in event context mode', async () => {
      renderWithRouter({ eventName: 'Test Event' })

      await waitFor(() => {
        const header = screen.getByRole('banner')
        expect(header).toHaveClass('py-2')
      })
    })

    it('period has whitespace-nowrap to prevent wrapping', async () => {
      renderWithRouter({ eventName: 'Test Event', periodFormatted: '2 avril 2026' })

      await waitFor(() => {
        const period = screen.getByTestId('event-period')
        expect(period).toHaveClass('whitespace-nowrap')
      })
    })
  })

  describe('Authentication states', () => {
    it('shows "Se connecter" button when user is not authenticated', async () => {
      localStorageMock.getItem.mockReturnValue(null)
      renderWithRouter({ eventName: 'Test Event' })

      await waitFor(() => {
        expect(screen.getByText(/se connecter/i)).toBeInTheDocument()
      })
    })

    it('shows user menu when user is authenticated', async () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === 'auth_token') return 'test-token'
        if (key === 'auth_user') return JSON.stringify({ firstName: 'Test', lastName: 'User', email: 'test@example.com' })
        return null
      })

      renderWithRouter({ eventName: 'Test Event' })

      await waitFor(() => {
        expect(screen.getByTestId('user-menu')).toBeInTheDocument()
        expect(screen.queryByText(/se connecter/i)).not.toBeInTheDocument()
      })
    })

    it('redirige vers loginHref personnalisé quand non authentifié', async () => {
      localStorageMock.getItem.mockReturnValue(null)
      renderWithRouter({ eventName: 'Test Event', loginHref: '/login?next=/me/events/EVT' })

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /se connecter/i })
        expect(link).toHaveAttribute('href', '/login?next=/me/events/EVT')
      })
    })
  })

  describe('No notification bell', () => {
    it('does not render notification bell (unlike AdminLayout)', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.queryByLabelText(/notification/i)).not.toBeInTheDocument()
      })
    })
  })
})
