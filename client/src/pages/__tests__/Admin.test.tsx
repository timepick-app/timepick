import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import Admin from '../Admin'
import type { Event } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'
import type { EngagementStats } from '@/types/analytics'

// État mutable des hooks de données, piloté par chaque test (factories vi.mock hoistées).
const h = vi.hoisted(() => ({
  events: [] as unknown[],
  eventsLoading: false,
  stats: [] as unknown[],
  engagement: undefined as unknown,
  memberTotal: 0,
  membersError: null as string | null,
}))

vi.mock('@/hooks/useAdminAuth', () => ({ useAdminAuth: () => ({ isAuthChecked: true }) }))
vi.mock('@/hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }))
vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({ events: h.events, isLoading: h.eventsLoading }),
}))
vi.mock('@/hooks/useStats', () => ({
  useAllEventsStats: () => ({ data: h.stats, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/useDashboardAnalytics', () => ({
  useDashboardEngagement: () => ({ data: h.engagement, isLoading: false, isError: false }),
  useEventActivity: () => ({ data: [], isLoading: false, isError: false }),
  useBookingTimestamps: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/hooks/useUsers', () => ({
  useUsers: () => ({
    pagination: h.membersError ? null : { total: h.memberTotal, page: 1, limit: 1, totalPages: 1 },
    loading: false,
    error: h.membersError,
  }),
}))

// Stubs des composants enfants : on teste l'orchestration des phases, pas leur rendu interne.
vi.mock('@/components/layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/admin/dashboard/OnboardingGuide', () => ({
  OnboardingGuide: ({ density }: { density: string }) => (
    <div data-testid="onboarding-guide" data-density={density} />
  ),
}))
vi.mock('@/components/admin/dashboard/DashboardSummary', () => ({
  DashboardSummary: () => <div data-testid="dashboard-summary" />,
}))
vi.mock('@/components/admin/dashboard/AttentionZone', () => ({
  AttentionZone: () => <div data-testid="attention-zone" />,
}))
vi.mock('@/components/admin/dashboard/InvitationFunnel', () => ({
  InvitationFunnel: () => <div data-testid="invitation-funnel" />,
}))
vi.mock('@/components/admin/dashboard/FillDonut', () => ({
  FillDonut: () => <div data-testid="fill-donut" />,
}))
vi.mock('@/components/admin/dashboard/BookingsPeaksChart', () => ({
  BookingsPeaksChart: () => <div data-testid="bookings-chart" />,
}))
vi.mock('@/components/admin/dashboard/BookingsEventSelect', () => ({
  BookingsEventSelect: () => <div data-testid="bookings-select" />,
}))
vi.mock('@/components/admin/dashboard/EventList', () => ({
  EventList: ({ events }: { events: unknown[] }) => (
    <div data-testid="event-list" data-count={events.length} />
  ),
}))

const ev = (o: Partial<Event> = {}): Event => ({
  id: 'e1', name: 'Test', description: null, isPublished: true, opensAt: null,
  hasCustomInvitation: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  periodStart: null, periodEnd: null, ...o,
})
const st = (o: Partial<EventStats> = {}): EventStats => ({
  eventId: 'e1', totalSlots: 0, filledSlots: 0, vacantSlots: 0, fillRate: 0,
  totalCapacity: 0, totalBookings: 0, ...o,
})
const eng = (o: Partial<EngagementStats> = {}): EngagementStats => ({
  invited: 0, sent: 0, clicked: 0, booked: 0, unansweredOver3Days: 0, ...o,
})

describe('Admin — orchestration des phases d\'onboarding', () => {
  beforeEach(() => {
    h.events = []
    h.eventsLoading = false
    h.stats = []
    h.engagement = undefined
    h.memberTotal = 0
    h.membersError = null
  })

  it('Phase 0 (0 événement) : guide complet, aucune zone analytique, À traiter sous le guide', () => {
    render(<Admin />)

    const guide = screen.getByTestId('onboarding-guide')
    expect(guide).toHaveAttribute('data-density', 'full')
    // Aucun widget analytique monté.
    expect(screen.queryByTestId('dashboard-summary')).toBeNull()
    expect(screen.queryByText('Aperçu')).toBeNull()
    expect(screen.queryByText('Analyse')).toBeNull()
    // À traiter présent, mais APRÈS le guide dans le DOM.
    const attention = screen.getByTestId('attention-zone')
    expect(guide.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Liste des événements vide.
    expect(screen.getByTestId('event-list')).toHaveAttribute('data-count', '0')
  })

  it('Phase 1 (≥1 événement, sent=0) : bande compacte + Aperçu (tuiles selon seuils), pas d\'Entonnoir ni Analyse', () => {
    h.events = [ev()]
    h.stats = [st({ totalSlots: 5, totalCapacity: 10, totalBookings: 0 })]
    h.engagement = eng({ sent: 0 })
    h.memberTotal = 5

    render(<Admin />)

    expect(screen.getByTestId('onboarding-guide')).toHaveAttribute('data-density', 'compact')
    expect(screen.getByTestId('dashboard-summary')).toBeInTheDocument()
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
    // Donut visible (Σ totalSlots ≥ 1) mais Entonnoir masqué (sent = 0).
    expect(screen.getByTestId('fill-donut')).toBeInTheDocument()
    expect(screen.queryByTestId('invitation-funnel')).toBeNull()
    // Analyse masquée (aucune réservation).
    expect(screen.queryByText('Analyse')).toBeNull()
    expect(screen.getByTestId('event-list')).toHaveAttribute('data-count', '1')
  })

  it('Phase 2 (pipeline complet) : plus de guide, dashboard analytique complet', () => {
    h.events = [ev()]
    h.stats = [st({ totalSlots: 5, totalCapacity: 10, totalBookings: 8 })]
    h.engagement = eng({ invited: 10, sent: 8, clicked: 4, booked: 6 })
    h.memberTotal = 5

    render(<Admin />)

    expect(screen.queryByTestId('onboarding-guide')).toBeNull()
    expect(screen.getByTestId('dashboard-summary')).toBeInTheDocument()
    expect(screen.getByText('Aperçu')).toBeInTheDocument()
    expect(screen.getByTestId('invitation-funnel')).toBeInTheDocument()
    expect(screen.getByText('Analyse')).toBeInTheDocument()
    expect(screen.getByTestId('bookings-chart')).toBeInTheDocument()
  })

  it('Anti-flash : pendant le chargement des événements, aucune phase n\'est rendue (skeleton)', () => {
    h.eventsLoading = true

    render(<Admin />)

    expect(screen.getByTestId('admin-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-guide')).toBeNull()
    expect(screen.queryByTestId('attention-zone')).toBeNull()
    expect(screen.queryByTestId('dashboard-summary')).toBeNull()
  })

  it("erreur de comptage membres → bannière d'erreur, sans silence ni masquage du guide", () => {
    h.events = [ev()]
    h.engagement = eng({ sent: 0 })
    h.membersError = 'Erreur réseau'

    render(<Admin />)

    expect(screen.getByText(/Impossible de vérifier vos membres/)).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-guide')).toBeInTheDocument()
  })
})
