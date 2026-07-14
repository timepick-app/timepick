import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import type { MemberEvent } from '@/types/member'
import { MemberLayout } from '../MemberLayout'

// --- Mocks contrôlables (hoisted pour préserver l'ordre de vi.mock) -----------

const { mockAuth, mockEvents, mockLocation, captured } = vi.hoisted(() => ({
  mockAuth: {
    isAuthenticated: true,
    isLoading: false,
  },
  mockEvents: { data: undefined as MemberEvent[] | undefined },
  mockLocation: { pathname: '/me' },
  captured: { props: null as Record<string, unknown> | null },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockAuth,
}))

vi.mock('@/hooks/useMyEvents', () => ({
  useMyEvents: () => mockEvents,
}))

vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="outlet" />,
  useLocation: () => mockLocation,
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="navigate" data-to={to} />
  ),
}))

// AppShell capturé : on rend header + contentTop + children pour pouvoir
// inspected les props ET le contenu (header « Espace membre », banner session).
vi.mock('../AppShell', () => ({
  AppShell: (props: Record<string, unknown> & { children?: ReactNode }) => {
    captured.props = props
    return (
      <div data-testid="appshell">
        {props.header as ReactNode}
        {props.contentTop as ReactNode}
        {props.children as ReactNode}
      </div>
    )
  },
}))

// pageTitle.ts est pur (aucun import React) — on laisse le vrai module tourner.

const futureEvent: MemberEvent = {
  uuid: 'u1',
  name: 'Futur',
  startDate: '2026-12-01T10:00:00Z',
  endDate: '2026-12-01T12:00:00Z',
  myBookingCount: 1,
  isUpcoming: true,
}
const pastEvent: MemberEvent = {
  uuid: 'p1',
  name: 'Passé',
  startDate: '2026-01-01T10:00:00Z',
  endDate: '2026-01-01T12:00:00Z',
  myBookingCount: 0,
  isUpcoming: false,
}

describe('MemberLayout', () => {
  beforeEach(() => {
    captured.props = null
    mockAuth.isAuthenticated = true
    mockAuth.isLoading = false
    mockEvents.data = undefined
    mockLocation.pathname = '/me'
  })

  it('AC4 : 0 événement → sidebar « Mon agenda » seule, aucun en-tête de section', () => {
    mockEvents.data = []
    render(<MemberLayout />)

    const items = captured.props?.items as Array<{ id: string; label?: string; collapsible?: boolean }>
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('Mon agenda')
    expect(items[0]).not.toHaveProperty('collapsible')
  })

  it('AC4 : cache en cours (data undefined) → sidebar « Mon agenda » seule sans crasher', () => {
    mockEvents.data = undefined
    render(<MemberLayout />)

    const items = captured.props?.items as Array<{ label?: string }>
    expect(items).toHaveLength(1)
    expect(items[0].label).toBe('Mon agenda')
  })

  it('AC2 : événements présents → Mon agenda + section « À venir » + section « Passés »', () => {
    mockEvents.data = [futureEvent, pastEvent]
    render(<MemberLayout />)

    const items = captured.props?.items as Array<{ id: string; label: string; collapsible?: boolean; links?: unknown[] }>
    expect(items).toHaveLength(3)
    expect(items[0].label).toBe('Mon agenda')
    const upcoming = items.find((i) => i.id === 'me-upcoming')
    const past = items.find((i) => i.id === 'me-past')
    expect(upcoming?.label).toBe('À venir')
    expect(upcoming?.collapsible).toBe(false)
    expect(past?.label).toBe('Passés')
    expect(past?.collapsible).toBe(true)
  })

  it('D7 : tri null-safe — « À venir » startDate ASC nulls last, « Passés » startDate DESC nulls last', () => {
    mockEvents.data = [
      // À venir, fournis dans le désordre + un sans créneau actif (startDate null).
      { uuid: 'up-late', name: 'Up tardif', startDate: '2026-12-20T10:00:00Z', endDate: null, myBookingCount: 0, isUpcoming: true },
      { uuid: 'up-null', name: 'Up sans créneau', startDate: null, endDate: null, myBookingCount: 0, isUpcoming: true },
      { uuid: 'up-early', name: 'Up tôt', startDate: '2026-12-01T10:00:00Z', endDate: null, myBookingCount: 0, isUpcoming: true },
      // Passés dans le désordre + un sans créneau actif.
      { uuid: 'past-old', name: 'Passé ancien', startDate: '2026-01-01T10:00:00Z', endDate: null, myBookingCount: 0, isUpcoming: false },
      { uuid: 'past-null', name: 'Passé sans créneau', startDate: null, endDate: null, myBookingCount: 0, isUpcoming: false },
      { uuid: 'past-recent', name: 'Passé récent', startDate: '2026-06-01T10:00:00Z', endDate: null, myBookingCount: 0, isUpcoming: false },
    ]
    render(<MemberLayout />)

    const items = captured.props?.items as Array<{ id: string; links?: Array<{ href: string }> }>
    const upcoming = items.find((i) => i.id === 'me-upcoming')
    const past = items.find((i) => i.id === 'me-past')
    // ASC, nulls last : tôt → tardif → null.
    expect(upcoming?.links?.map((l) => l.href)).toEqual([
      '/me/events/up-early',
      '/me/events/up-late',
      '/me/events/up-null',
    ])
    // DESC, nulls last : récent → ancien → null.
    expect(past?.links?.map((l) => l.href)).toEqual([
      '/me/events/past-recent',
      '/me/events/past-old',
      '/me/events/past-null',
    ])
  })

  it('AC1 : passe profilePath="/me/profile" et le header « Espace membre » à AppShell', () => {
    render(<MemberLayout />)

    expect(captured.props?.profilePath).toBe('/me/profile')
    expect(screen.getByText('Espace membre')).toBeInTheDocument()
    // L'Outlet (contenu de page) est bien rendu dans le shell.
    expect(screen.getByTestId('outlet')).toBeInTheDocument()
  })

  it('D9 : pageTitle résolu depuis getStaticTitle (pathname /me → « Mon agenda »)', () => {
    mockLocation.pathname = '/me'
    render(<MemberLayout />)
    expect(captured.props?.pageTitle).toBe('Mon agenda')
  })

  it('D9 : fallback « Mon espace » quand getStaticTitle ne match pas', () => {
    mockLocation.pathname = '/me/ailleurs'
    render(<MemberLayout />)
    expect(captured.props?.pageTitle).toBe('Mon espace')
  })

  it('route événement : pageTitle=null (le nom événement est le <h1> du sticky header)', () => {
    mockLocation.pathname = '/me/events/evt-1'
    render(<MemberLayout />)
    expect(captured.props?.pageTitle).toBeNull()
  })

  it('D11 guard : !isAuthenticated → Navigate vers /login?next=<encoded pathname> (shell non rendu)', () => {
    mockAuth.isAuthenticated = false
    mockAuth.isLoading = false
    // Lien profond membre : la destination doit être préservée dans `next`.
    mockLocation.pathname = '/me/events/u1'
    render(<MemberLayout />)

    const nav = screen.getByTestId('navigate')
    expect(nav).toHaveAttribute('data-to', '/login?next=%2Fme%2Fevents%2Fu1')
    expect(screen.queryByTestId('appshell')).toBeNull()
    expect(captured.props).toBeNull()
  })

  it('D11 guard : isLoading → shell + skeleton (pas d\'écran blanc, pas de redirect au boot)', () => {
    mockAuth.isAuthenticated = false
    mockAuth.isLoading = true
    render(<MemberLayout />)

    // Chrome du shell rendu (pas d'écran blanc) pendant la réhydratation auth ...
    expect(screen.getByTestId('appshell')).toBeInTheDocument()
    expect(screen.getByText('Espace membre')).toBeInTheDocument()
    // ... contenu en skeleton, donc PAS l'Outlet de page ...
    expect(screen.queryByTestId('outlet')).toBeNull()
    // ... et SANS redirection prématurée vers /login tant que l'auth charge.
    expect(screen.queryByTestId('navigate')).toBeNull()
  })
})
