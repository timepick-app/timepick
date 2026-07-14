import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EventCalendarContent } from '../EventCalendarContent'
import type { EventCalendarHeaderContext } from '../EventCalendarContent'
import { MemberEventStickyHeader } from '@/components/member/MemberEventStickyHeader'

// ---------------------------------------------------------------------------
// Mocks — on stubbe les enfants lourds (FullCalendar etc.) et les hooks de
// données afin d'isoler le contrat d'extraction : le header injectable.
// `PublicNavHeader` reste RÉEL : c'est la cible de l'assertion anti-régression
// (absence d'avatar / « Se connecter » en contexte membre).
// ---------------------------------------------------------------------------

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '@/services/api'

type UsePublicSlotsReturn = {
  data: unknown[]
  isLoading: boolean
  isRefetching: boolean
  error: Error | null
  failureCount: number
  dataUpdatedAt: number
}

const mockUsePublicSlots = vi.fn<(...args: unknown[]) => UsePublicSlotsReturn>(() => ({
  data: [],
  isLoading: false,
  isRefetching: false,
  error: null,
  failureCount: 0,
  dataUpdatedAt: 0,
}))
vi.mock('@/hooks/usePublicSlots', () => ({
  usePublicSlots: (...args: unknown[]) => mockUsePublicSlots(...args),
}))
vi.mock('@/hooks/usePollingConfig', () => ({
  usePollingConfig: () => ({ data: { interval: 30000 } }),
}))

// Story 1.6 — le header membre rend MemberReservationsPopover (useMediaQuery).
// jsdom ne fournit pas window.matchMedia → mock obligatoire (défaut desktop).
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}))

const mockUseMyReservations = vi.hoisted(() => vi.fn(() => ({ data: [], isLoading: false })))
vi.mock('@/hooks/useReservations', () => ({
  useCreateReservation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCancelReservationBySlot: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useMyReservations: mockUseMyReservations,
}))
const authState = vi.hoisted(() => ({ isAuthenticated: true as boolean }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: authState.isAuthenticated }),
}))

// Enfants lourds stubbés (rendu léger + déterministe).
vi.mock('@/components/public/CalendarView', () => ({
  CalendarView: () => <div data-testid="calendar-view">Calendar</div>,
}))
vi.mock('@/components/public/PublicSlotList', () => ({
  PublicSlotList: () => <div data-testid="public-slot-list">Slots</div>,
}))
vi.mock('@/components/public/ViewToggle', () => ({
  ViewToggle: () => <div data-testid="view-toggle">Toggle</div>,
}))
vi.mock('@/components/public/MyReservationsPanel', () => ({
  MyReservationsPanel: () => <div data-testid="my-reservations-panel">Reservations</div>,
}))
vi.mock('@/components/public/StatusBanner', () => ({
  StatusBanner: () => <div data-testid="status-banner">Status</div>,
}))
vi.mock('@/components/public/PollingIndicator', () => ({
  PollingIndicator: () => <div data-testid="polling-indicator">Polling</div>,
}))
vi.mock('@/components/public/ConnectionStatusIndicator', () => ({
  ConnectionStatusIndicator: () => <div data-testid="connection-status">Connected</div>,
}))
vi.mock('@/components/public/SlotDetailDialog', () => ({
  SlotDetailDialog: () => null,
}))
vi.mock('@/components/public/ConfirmCancelDialog', () => ({
  ConfirmCancelDialog: () => null,
}))
vi.mock('@/components/public/PublicEventHeader', () => ({
  PublicEventHeader: ({ eventDescription }: { eventDescription?: string }) => (
    <div data-testid="public-event-header">{eventDescription ?? null}</div>
  ),
}))
vi.mock('@/components/public/SlotFiltersPanel', () => ({
  SlotFiltersPanel: () => <div data-testid="slot-filters-panel">Filters</div>,
}))

const mockApiGet = vi.mocked(api.get)

const mockEventEnvelope = {
  data: {
    data: {
      id: 'evt-1',
      uuid: 'evt-1',
      name: 'Événement Membre 1',
      description: 'Description de test',
      isPublished: true,
      opensAt: null,
      slots: [],
      canReserve: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  },
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

function renderContent(props: {
  uuid?: string
  renderHeader?: (ctx: EventCalendarHeaderContext) => ReactNode
}) {
  return render(
    <EventCalendarContent
      uuid={props.uuid ?? 'evt-1'}
      renderHeader={props.renderHeader ?? undefined}
    />,
    { wrapper: createWrapper() },
  )
}

describe('EventCalendarContent — header injectable (anti-régression S5 / AC2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApiGet.mockResolvedValue(mockEventEnvelope)
    mockUsePublicSlots.mockReturnValue({
      data: [],
      isLoading: false,
      isRefetching: false,
      error: null,
      failureCount: 0,
      dataUpdatedAt: 0,
    })
  })

  it('renderHeader membre → header membre rendu, PublicNavHeader/avatar ABSENT (AC2)', async () => {
    renderContent({
      renderHeader: (ctx) => <MemberEventStickyHeader {...ctx} />,
    })
    // Le calendrier (succès) s'affiche.
    await waitFor(() => {
      expect(screen.getByText('Événement Membre 1')).toBeInTheDocument()
    })

    // Aucun avatar / menu utilisateur / lien « Se connecter » (PublicNavHeader
    // totalement écarté en contexte membre — cœur de l'AC2 / Décision clé).
    expect(screen.queryByText('Se connecter')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('renderHeader omis (défaut) → PublicNavHeader rendu (comportement public inchangé)', async () => {
    renderContent({})

    // PublicNavHeader réel : visiteur non authentifié (localStorage vide) →
    // bouton « Se connecter ». Prouve la branche défaut (route publique).
    await waitFor(() => {
      expect(screen.getByText('Se connecter')).toBeInTheDocument()
    })
  })

  it('chargement initial (usePublicEvent ou usePublicSlots) → EventSkeleton', () => {
    // La garde `if (isLoading || isLoadingSlots)` rend le skeleton tant que
    // l'UNE OU l'AUTRE source charge. On force `usePublicSlots.isLoading` ;
    // au premier rendu `usePublicEvent` (réel, via api.get async) charge aussi
    // — les deux convergent sur le même early-return de chargement.
    mockUsePublicSlots.mockReturnValue({
      data: [],
      isLoading: true,
      isRefetching: false,
      error: null,
      failureCount: 0,
      dataUpdatedAt: 0,
    })
    renderContent({})
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
  })

  it("erreur 404 → EventNotFound (défense en profondeur conservée)", async () => {
    const error = new Error('Not found') as Error & { response?: { status: number } }
    error.response = { status: 404 }
    mockApiGet.mockRejectedValue(error)
    renderContent({})
    await waitFor(() => {
      expect(screen.getByText('Événement non trouvé')).toBeInTheDocument()
    })
  })
})

describe('EventCalendarContent — panneau « Mes réservations » de pied (tâche #20)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.isAuthenticated = true
    localStorage.clear()
    mockApiGet.mockResolvedValue(mockEventEnvelope)
    mockUsePublicSlots.mockReturnValue({
      data: [],
      isLoading: false,
      isRefetching: false,
      error: null,
      failureCount: 0,
      dataUpdatedAt: 0,
    })
  })

  it('route publique (défaut) → panneau de pied ABSENT', async () => {
    renderContent({})
    await waitFor(() => {
      expect(screen.getByText('Événement Membre 1')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('my-reservations-panel')).toBeNull()
  })

  it('renderHeader fourni (contexte membre) → panneau de pied ABSENT', async () => {
    renderContent({
      renderHeader: (ctx) => <MemberEventStickyHeader {...ctx} />,
    })
    await waitFor(() => {
      expect(screen.getByText('Événement Membre 1')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('my-reservations-panel')).toBeNull()
  })

  it('anonyme (isAuthenticated:false) → useMyReservations appelé avec false (gating anti-401)', () => {
    authState.isAuthenticated = false
    renderContent({})
    expect(mockUseMyReservations).toHaveBeenCalledWith(false)
  })
})

describe('EventCalendarContent — accès réservé non-connecté (cas B, masquage minimal)', () => {
  // Événement privé vu déconnecté : canReserve=false sans mode consultatif
  // (opensAt=null → isConsultative=false). C'est le seul cas verrouillé de la
  // route publique non-connectée.
  const lockedEnvelope = {
    data: {
      data: { ...mockEventEnvelope.data.data, canReserve: false, opensAt: null },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockUsePublicSlots.mockReturnValue({
      data: [],
      isLoading: false,
      isRefetching: false,
      error: null,
      failureCount: 0,
      dataUpdatedAt: 0,
    })
  })

  it('masque le descriptif et affiche la copie « Accès réservé » honnête', async () => {
    mockApiGet.mockResolvedValue(lockedEnvelope)
    renderContent({})
    await waitFor(() => {
      expect(screen.getByText('Accès réservé')).toBeInTheDocument()
    })
    // Descriptif masqué (le mock PublicEventHeader rend la prop eventDescription).
    expect(screen.queryByText('Description de test')).toBeNull()
    // Copie honnête : pas de fausse promesse de réservation.
    expect(screen.queryByText(/Connectez-vous pour voir les créneaux/)).toBeNull()
    expect(
      screen.getByText(/n'est pas ouvert à la consultation publique/),
    ).toBeInTheDocument()
    // Polling du calendrier désactivé en état verrouillé (rien à rafraîchir).
    expect(mockUsePublicSlots).toHaveBeenLastCalledWith('evt-1', true, 0)
  })

  it('événement réservable → descriptif visible (anti-régression)', async () => {
    mockApiGet.mockResolvedValue(mockEventEnvelope)
    renderContent({})
    await waitFor(() => {
      expect(screen.getByText('Événement Membre 1')).toBeInTheDocument()
    })
    expect(screen.getByText('Description de test')).toBeInTheDocument()
    expect(screen.queryByText('Accès réservé')).toBeNull()
    // Calendrier visible → polling actif (intervalle de config).
    expect(mockUsePublicSlots).toHaveBeenLastCalledWith('evt-1', true, 30000)
  })
})
