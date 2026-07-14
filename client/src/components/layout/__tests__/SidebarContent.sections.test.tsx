import type { AnchorHTMLAttributes } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CalendarClock } from 'lucide-react'
import { SidebarContent } from '../SidebarContent'
import type { NavEntry } from '../SidebarContent'

// Mock react-router-dom — mockLocation est mutable par test (active state).
const mockLocation = { pathname: '/me' }
vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => vi.fn(),
  NavLink: ({
    to,
    children,
    className,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} className={className} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}))

// Mock NavigationBlockerContext — nav non bloquée.
vi.mock('@/contexts/NavigationBlockerContext', () => ({
  useNavigationBlocker: () => ({
    isBlocked: false,
    showConfirmDialog: false,
    pendingPath: null,
    confirmAndLeave: vi.fn(),
    cancelAndStay: vi.fn(),
    requestNavigation: vi.fn(),
  }),
}))

// Mock NavUser (testée séparément).
vi.mock('../NavUser', () => ({
  NavUser: () => <div data-testid="nav-user" />,
}))

// Items membre représentatifs : Mon agenda + section « À venir » non-repliable
// (2 liens, ordre = tri ASC attendu) + section « Passés » repliable (1 lien).
const memberItems: NavEntry[] = [
  { id: 'me-agenda', label: 'Mon agenda', href: '/me', icon: CalendarClock, exact: true },
  {
    id: 'me-upcoming',
    label: 'À venir',
    collapsible: false,
    links: [
      { id: 'me-evt-u1', label: 'Futur A', href: '/me/events/u1' },
      { id: 'me-evt-u2', label: 'Futur B', href: '/me/events/u2' },
    ],
  },
  {
    id: 'me-past',
    label: 'Passés',
    collapsible: true,
    defaultOpen: false,
    links: [{ id: 'me-evt-p1', label: 'Passé A', href: '/me/events/p1' }],
  },
]

describe('SidebarContent — branche NavSection (sections membre, D2)', () => {
  beforeEach(() => {
    mockLocation.pathname = '/me'
  })

  it('rend « Mon agenda », la section « À venir » et ses liens événements', () => {
    render(<SidebarContent items={memberItems} />)

    expect(screen.getByText('Mon agenda')).toBeInTheDocument()
    expect(screen.getByText('À venir')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Futur A' })).toHaveAttribute('href', '/me/events/u1')
    expect(screen.getByRole('link', { name: 'Futur B' })).toHaveAttribute('href', '/me/events/u2')
  })

  it('l\'en-tête « À venir » est non-cliquable (ni <button> ni <a>, UX-DR1)', () => {
    render(<SidebarContent items={memberItems} />)

    // L'en-tête est un simple <p>, pas un contrôle.
    expect(screen.getByText('À venir').tagName).toBe('P')
    expect(screen.queryByRole('button', { name: 'À venir' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'À venir' })).toBeNull()
  })

  it('la section « Passés » est repliée par défaut (liens masqués, defaultOpen=false)', () => {
    render(<SidebarContent items={memberItems} />)

    expect(screen.queryByText('Passé A')).toBeNull()
    expect(screen.getByRole('button', { name: 'Passés' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('déplie « Passés » au clic sur son en-tête-bouton (liens visibles, aria-expanded bascule)', () => {
    render(<SidebarContent items={memberItems} />)

    const toggle = screen.getByRole('button', { name: 'Passés' })
    fireEvent.click(toggle)

    expect(screen.getByText('Passé A')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // Re-pli au second clic.
    fireEvent.click(toggle)
    expect(screen.queryByText('Passé A')).toBeNull()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('marque l\'événement actif via aria-current (match exact pathname, D8)', () => {
    mockLocation.pathname = '/me/events/u1'
    render(<SidebarContent items={memberItems} />)

    const active = screen.getByRole('link', { name: 'Futur A' })
    expect(active).toHaveAttribute('aria-current', 'page')
    // L'autre lien à venir n'est pas actif.
    expect(screen.getByRole('link', { name: 'Futur B' })).not.toHaveAttribute('aria-current')
  })

  it('marque « Mon agenda » actif en match exact — actif sur /me, PAS sur /me/events/:uuid (D6/D8)', () => {
    // Actif sur /me (exact).
    mockLocation.pathname = '/me'
    const { unmount } = render(<SidebarContent items={memberItems} />)
    expect(screen.getByRole('link', { name: 'Mon agenda' })).toHaveAttribute('aria-current', 'page')
    unmount()

    // Non-actif sur /me/events/u1 (exact → pas de startsWith).
    mockLocation.pathname = '/me/events/u1'
    render(<SidebarContent items={memberItems} />)
    expect(screen.getByRole('link', { name: 'Mon agenda' })).not.toHaveAttribute('aria-current')
  })

  it('rend les liens de section dans l\'ordre du tableau fourni (SidebarContent ne trie pas ; le tri D7 est couvert par MemberLayout.test)', () => {
    render(<SidebarContent items={memberItems} />)

    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    const upcomingIdx = hrefs.indexOf('/me/events/u1')
    const upcoming2Idx = hrefs.indexOf('/me/events/u2')
    expect(upcomingIdx).toBeGreaterThanOrEqual(0)
    expect(upcoming2Idx).toBeGreaterThan(upcomingIdx)
  })

  it('omettent les sections vides — 0 event → « Mon agenda » seul, pas d\'en-têtes orphelins (AC4)', () => {
    render(<SidebarContent items={[{ id: 'me-agenda', label: 'Mon agenda', href: '/me', icon: CalendarClock, exact: true }]} />)

    expect(screen.getByText('Mon agenda')).toBeInTheDocument()
    expect(screen.queryByText('À venir')).toBeNull()
    expect(screen.queryByText('Passés')).toBeNull()
  })
})
