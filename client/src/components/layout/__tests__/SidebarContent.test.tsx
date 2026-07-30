import type { AnchorHTMLAttributes } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SidebarContent } from '../SidebarContent'

// Mock react-router-dom
const mockLocation = { pathname: '/admin' }
const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
  NavLink: ({ to, children, className, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} className={className} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}))

// Mock NavigationBlockerContext
vi.mock('@/contexts/NavigationBlockerContext', () => ({
  useNavigationBlocker: () => ({
    isBlocked: false,
    showConfirmDialog: false,
    pendingPath: null,
    confirmAndLeave: vi.fn(),
    cancelAndStay: vi.fn(),
    requestNavigation: vi.fn(() => true),
  }),
}))

// Mock NavUser (carte profil) — testée séparément, évite de câbler AuthProvider ici
vi.mock('../NavUser', () => ({
  NavUser: () => <div data-testid="nav-user" />,
}))

describe('SidebarContent', () => {
  it('should render navigation items', () => {
    render(<SidebarContent />)

    expect(screen.getByText('Tableau de bord')).toBeInTheDocument()
    expect(screen.getByText('Événements')).toBeInTheDocument()
    expect(screen.getByText('Membres')).toBeInTheDocument()
    expect(screen.getByText('Paramètres')).toBeInTheDocument()
  })

  it('should render logo and subtitle', () => {
    render(<SidebarContent />)

    expect(screen.getByText('TimePick')).toBeInTheDocument()
    expect(screen.getByText('Administration')).toBeInTheDocument()
  })

  it('should render version footer', () => {
    render(<SidebarContent />)

    // __APP_VERSION__ is defined as '0.6.0' in src/test/setup.ts
    expect(screen.getByText('Version 0.6.0')).toBeInTheDocument()
  })

  it('should call onNavigate callback when nav item is clicked', () => {
    const onNavigate = vi.fn()

    render(<SidebarContent onNavigate={onNavigate} />)

    const dashboardLink = screen.getByText('Tableau de bord').closest('a')
    dashboardLink?.click()

    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('should not error when onNavigate is undefined', () => {
    expect(() => render(<SidebarContent onNavigate={undefined} />)).not.toThrow()
  })

  it('should render navigation with aria-label', () => {
    render(<SidebarContent />)

    const nav = screen.getByRole('navigation', { hidden: true })
    expect(nav).toHaveAttribute('aria-label', 'Navigation principale')
  })

  it('collapses the Paramètres section by default and reveals sub-items on click', () => {
    render(<SidebarContent />)

    // Not on a settings route → section collapsed, sub-items absent.
    expect(screen.queryByText("Serveur d'email")).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Paramètres').closest('button')!)

    expect(screen.getByText("Serveur d'email")).toBeInTheDocument()
    expect(screen.getByText("Modèle d'email")).toBeInTheDocument()
  })

  it('wires each settings sub-item to its ?tab= deep-link', () => {
    render(<SidebarContent />)
    fireEvent.click(screen.getByText('Paramètres').closest('button')!)

    expect(screen.getByText('Organisation').closest('a')).toHaveAttribute(
      'href',
      '/admin/settings?tab=organization',
    )
    expect(screen.getByText("Serveur d'email").closest('a')).toHaveAttribute(
      'href',
      '/admin/settings?tab=email',
    )
    expect(screen.getByText("Modèle d'email").closest('a')).toHaveAttribute(
      'href',
      '/admin/settings?tab=email-template',
    )
    expect(screen.getByText('Authentification').closest('a')).toHaveAttribute(
      'href',
      '/admin/settings?tab=auth',
    )
  })

  it('auto-expands the Paramètres section when already on a settings route', () => {
    mockLocation.pathname = '/admin/settings'
    try {
      render(<SidebarContent />)
      expect(screen.getByText("Serveur d'email")).toBeInTheDocument()
    } finally {
      mockLocation.pathname = '/admin'
    }
  })

  it('auto-expands the Paramètres section when navigating into settings after mount', () => {
    const { rerender } = render(<SidebarContent />)
    // Départ hors settings → section repliée.
    expect(screen.queryByText("Serveur d'email")).not.toBeInTheDocument()

    // Navigation vers une route settings → ouverture posée du premier coup.
    mockLocation.pathname = '/admin/settings'
    try {
      rerender(<SidebarContent />)
      expect(screen.getByText("Serveur d'email")).toBeInTheDocument()
    } finally {
      mockLocation.pathname = '/admin'
    }
  })

  it('lets the user collapse Paramètres even while on a settings route', () => {
    mockLocation.pathname = '/admin/settings'
    try {
      render(<SidebarContent />)
      // Auto-ouvert au montage sur une route settings.
      expect(screen.getByText("Serveur d'email")).toBeInTheDocument()

      // Repli manuel → reste replié (aucune re-synchro forcée tant qu'on ne
      // ré-entre pas dans la section).
      fireEvent.click(screen.getByText('Paramètres').closest('button')!)
      expect(screen.queryByText("Serveur d'email")).not.toBeInTheDocument()
    } finally {
      mockLocation.pathname = '/admin'
    }
  })
})
