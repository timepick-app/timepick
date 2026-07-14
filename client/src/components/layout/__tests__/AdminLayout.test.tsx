import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminLayout } from '../AdminLayout'

// Mock localStorage
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

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/admin' }),
}))

// État de session mutable partagé avec le mock useSessionTimeout (réinitialisé
// dans beforeEach) pour piloter l'affichage du toast d'avertissement par test.
const sessionState = vi.hoisted(() => ({
  timeRemaining: 3600,
  isExpiringSoon: false,
  isCritical: false,
  isExpired: false,
}))

beforeEach(() => {
  localStorage.clear()
  // Set a default sessionTTL for tests
  localStorage.setItem('sessionTTL', '7200')
  sessionState.timeRemaining = 3600
  sessionState.isExpiringSoon = false
  sessionState.isCritical = false
  sessionState.isExpired = false
})

// Mock des hooks d'authentification
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    refreshSession: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/hooks/useSessionTimeout', () => ({
  useSessionTimeout: () => ({
    ...sessionState,
    refreshSession: vi.fn().mockResolvedValue(undefined),
  }),
}))

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children?: ReactNode }) => <div data-testid="sheet-content">{children}</div>,
  SheetTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/progress', () => ({
  Progress: ({ value }: { value?: number }) => <div data-testid="progress" data-value={value} />,
}))

vi.mock('../SidebarContent', () => ({
  SidebarContent: () => <div data-testid="sidebar">Sidebar</div>,
}))

vi.mock('../SessionWarningToast', () => ({
  SessionWarningToast: ({ onDismiss, critical }: { onDismiss: () => void; critical?: boolean }) => (
    <div data-testid="warning-toast" data-critical={critical ? 'true' : 'false'}>
      <button data-testid="dismiss-toast" onClick={onDismiss}>Ignorer</button>
    </div>
  ),
}))

vi.mock('../SessionExpiredModal', () => ({
  SessionExpiredModal: () => null,
}))

describe('AdminLayout', () => {
  it('should render children content', () => {
    render(
      <AdminLayout>
        <div data-testid="test-content">Test Content</div>
      </AdminLayout>
    )

    expect(screen.getByTestId('test-content')).toBeInTheDocument()
  })

  it('should render mobile header on small screens', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )

    // Check that the mobile menu button is rendered (part of mobile header)
    const menuButton = screen.getByLabelText('Ouvrir le menu')
    expect(menuButton).toBeInTheDocument()
  })

  it('should render sidebar on desktop', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )

    // Sidebar is rendered twice (mobile sheet + desktop), so use getAllByTestId
    const sidebars = screen.getAllByTestId('sidebar')
    expect(sidebars.length).toBeGreaterThan(0)
  })

  it('should display correct page title for admin route', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )

    // Title appears twice (desktop + mobile), so use getAllByText
    const titles = screen.getAllByText('Tableau de bord')
    expect(titles.length).toBeGreaterThan(0)
  })

  it('should have mobile menu button with aria-label', () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )

    const menuButton = screen.getByLabelText('Ouvrir le menu')
    expect(menuButton).toBeInTheDocument()
  })

  it("affiche le toast d'avertissement pendant la fenêtre T-5min", () => {
    sessionState.isExpiringSoon = true
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    expect(screen.getByTestId('warning-toast')).toBeInTheDocument()
  })

  it("n'affiche pas le toast hors de la fenêtre d'avertissement", () => {
    render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    expect(screen.queryByTestId('warning-toast')).not.toBeInTheDocument()
  })

  it('garde le toast visible quand la phase critique commence', () => {
    sessionState.isExpiringSoon = true
    const { rerender } = render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    expect(screen.getByTestId('warning-toast')).toBeInTheDocument()

    // Entrée en phase critique (toujours expiringSoon) → le toast persiste.
    sessionState.isCritical = true
    rerender(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    expect(screen.getByTestId('warning-toast')).toBeInTheDocument()
  })

  it('masque le toast après rejet puis le réarme à la fenêtre suivante', () => {
    sessionState.isExpiringSoon = true
    const { rerender } = render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    expect(screen.getByTestId('warning-toast')).toBeInTheDocument()

    // Rejet utilisateur → toast masqué, et il le reste dans la même fenêtre.
    fireEvent.click(screen.getByTestId('dismiss-toast'))
    expect(screen.queryByTestId('warning-toast')).not.toBeInTheDocument()
    rerender(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    expect(screen.queryByTestId('warning-toast')).not.toBeInTheDocument()

    // Sortie de la fenêtre (session prolongée) puis nouvelle approche → réarmé.
    sessionState.isExpiringSoon = false
    rerender(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    sessionState.isExpiringSoon = true
    rerender(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    expect(screen.getByTestId('warning-toast')).toBeInTheDocument()
  })

  it('réarme le toast en phase critique même après rejet', () => {
    sessionState.isExpiringSoon = true
    const { rerender } = render(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    fireEvent.click(screen.getByTestId('dismiss-toast'))
    expect(screen.queryByTestId('warning-toast')).not.toBeInTheDocument()

    // Entrée en phase critique → le toast réapparaît malgré le rejet.
    sessionState.isCritical = true
    rerender(
      <AdminLayout>
        <div>Content</div>
      </AdminLayout>
    )
    const toast = screen.getByTestId('warning-toast')
    expect(toast).toBeInTheDocument()
    expect(toast).toHaveAttribute('data-critical', 'true')
  })
})
