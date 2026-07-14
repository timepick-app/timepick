import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { EventEditPage } from '../EventEditPage'
import {
  useEvents,
  usePublishEvent,
  useUnpublishEvent,
  useUpdateOpeningDate,
  useSetEventUsers,
  useEventDetails,
  useEventUsers,
  useUpdateEvent,
  useDeleteEvent
} from '@/hooks/useEvents'
import type { Event } from '@/hooks/useEvents'
import type { User } from '@/types/user'
import { AuthProvider } from '@/hooks/useAuth'
import { useBookingTimestamps, useDashboardEngagement } from '@/hooks/useDashboardAnalytics'
import { useAllEventsStats } from '@/hooks/useStats'
import { SAMPLE_BOOKINGS } from '@/components/admin/dashboard/__tests__/sampleBookings'

// Mock react-i18next pour les traductions françaises
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'tabs.details': 'Détails',
        'tabs.slots': 'Créneaux',
        'tabs.users': 'Invités',
        'tabs.template': 'Template',
        'tabs.stats': 'Statistiques',
        'eventPublishBanner.draft': 'Brouillon',
        'eventPublishBanner.draftHelp': "L'événement sera en brouillon, invisible publiquement",
        'eventPublishBanner.published': 'Publié',
        'eventPublishBanner.publishedHelp': "L'événement est visible publiquement",
        'eventPublishBanner.publish': 'Publier',
        'eventPublishBanner.unpublish': 'Dépublier',
        'eventPublishBanner.cancel': 'Annuler',
        'eventPublishBanner.save': 'Enregistrer',
        'eventPublishBanner.saving': 'Enregistrement...',
        'eventPublishBanner.resetChanges': 'Annuler les modifications',
        'eventPublishBanner.draftAriaLabel': 'Publier l\'événement',
        'eventPublishBanner.publishedAriaLabel': 'Dépublier l\'événement',
      }
      return translations[key] || key
    }
  })
}))

// Mock hooks — importOriginal préserve toutes les exportations
vi.mock('@/hooks/useEvents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useEvents')>()
  return {
    ...actual,
    useEvents: vi.fn(),
    usePublishEvent: vi.fn(),
    useUnpublishEvent: vi.fn(),
    useUpdateOpeningDate: vi.fn(),
    useSetEventUsers: vi.fn(),
    useEventDetails: vi.fn(),
    useEventUsers: vi.fn(),
    useUpdateEvent: vi.fn(),
    useDeleteEvent: vi.fn()
  }
})

vi.mock('@/hooks/useDashboardAnalytics', () => ({
  useBookingTimestamps: vi.fn(() => ({ data: undefined, isLoading: false })),
  useDashboardEngagement: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
}))

vi.mock('@/hooks/useStats', () => ({
  useAllEventsStats: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
}))

// Mock useAdminAuth
vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: vi.fn(() => ({ isAuthChecked: true }))
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
    triggerBlocker: vi.fn(),
    blockNavigation: vi.fn(),
    unblockNavigation: vi.fn(),
  }),
}))

// Mock useAuth pour AdminLayout
vi.mock('@/hooks/useAuth', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAuth')>('@/hooks/useAuth')
  return {
    ...actual,
    useAuth: () => ({
      user: { id: '1', email: 'admin@test.com', firstName: 'Admin', lastName: null },
      logout: vi.fn(),
      refreshSession: vi.fn()
    })
  }
})

// Mock useSessionTimeout
vi.mock('@/hooks/useSessionTimeout', () => ({
  useSessionTimeout: () => ({
    timeRemaining: 3600,
    isExpiringSoon: false,
    isCritical: false,
    isExpired: false
  }),
  WARNING_THRESHOLD: 300,
  CRITICAL_THRESHOLD: 60
}))

// Stub SlotCalendar — FullCalendar requiert des API de layout absentes de jsdom
vi.mock('@/components/admin/events/SlotCalendar', () => ({
  SlotCalendar: () => <div data-testid="slot-calendar-stub" />
}))

const mockPublishEvent = vi.fn()
const mockUnpublishEvent = vi.fn()
const mockUpdateOpeningDate = vi.fn()
const mockSetEventUsers = vi.fn()
const mockDeleteEvent = vi.fn()
const mockNavigate = vi.fn()

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual as object,
    useNavigate: () => mockNavigate
  }
})

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { mutations: { retry: false } }
  })
}

function setupEditModeMocks(event: Record<string, unknown> | null = null) {
  vi.mocked(useEvents).mockReturnValue({
    events: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })
  vi.mocked(usePublishEvent).mockReturnValue({
    publishEvent: mockPublishEvent,
    isPublishing: false
  })
  vi.mocked(useUnpublishEvent).mockReturnValue({
    unpublishEvent: mockUnpublishEvent,
    isUnpublishing: false
  })
  vi.mocked(useUpdateOpeningDate).mockReturnValue({
    updateOpeningDate: mockUpdateOpeningDate,
    isUpdating: false
  })
  vi.mocked(useSetEventUsers).mockReturnValue({
    setEventUsers: mockSetEventUsers,
    isSetting: false
  })
  vi.mocked(useEventDetails).mockReturnValue({
    data: event as unknown as Event,
    isLoading: false,
    error: null
  } as unknown as UseQueryResult<Event>)
  vi.mocked(useEventUsers).mockReturnValue({
    data: [],
    refetch: vi.fn()
  } as unknown as UseQueryResult<User[]>)
  vi.mocked(useUpdateEvent).mockReturnValue({
    updateEvent: vi.fn(),
    isUpdating: false
  })
  vi.mocked(useDeleteEvent).mockReturnValue({
    deleteEvent: mockDeleteEvent,
    isDeleting: false
  })
}

describe('EventEditPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createQueryClient()
    mockPublishEvent.mockReset()
    mockUnpublishEvent.mockReset()
    mockUpdateOpeningDate.mockReset()
    mockSetEventUsers.mockReset()
    mockDeleteEvent.mockReset()
    mockNavigate.mockReset()
  })

  // ==========================================
  // EDIT MODE TESTS
  // ==========================================
  describe('Edit Mode', () => {
    const mockEvent = {
      id: 'event-456',
      name: 'Test Event',
      description: 'Test description',
      isPublished: false,
      opensAt: null,
      uuid: 'test-uuid-456',
      updatedAt: '2026-02-15T12:00:00Z'
    }

    beforeEach(() => {
      setupEditModeMocks(mockEvent)
    })

    function renderPage() {
      return render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/events/event-456/edit']}>
            <AuthProvider>
              <Routes>
                <Route path="/admin/events/:id/edit" element={<EventEditPage />} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      )
    }

    it('affiche le nom de l\'événement dans le bandeau de modification', () => {
      renderPage()

      expect(screen.getByText('Test Event')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Retour/i }).length).toBeGreaterThan(0)
    })

    it('affiche le graphe des pics d\'inscription dans l\'onglet Statistiques', async () => {
      const user = userEvent.setup()
      vi.mocked(useBookingTimestamps).mockReturnValue({
        data: SAMPLE_BOOKINGS,
        isLoading: false,
        isError: false,
      } as unknown as UseQueryResult<typeof SAMPLE_BOOKINGS>)

      renderPage()

      await user.click(screen.getByRole('radio', { name: /Statistiques/i }))

      expect(await screen.findByText(SAMPLE_BOOKINGS.name)).toBeInTheDocument()
    })

    it('affiche les cards entonnoir et répartition par événement dans l\'onglet Statistiques', async () => {
      const user = userEvent.setup()
      vi.mocked(useDashboardEngagement).mockReturnValue({
        data: { invited: 10, sent: 8, clicked: 5, booked: 3, unansweredOver3Days: 0 },
        isLoading: false,
        isError: false,
      } as unknown as UseQueryResult<{ invited: number; sent: number; clicked: number; booked: number; unansweredOver3Days: number }>)
      vi.mocked(useAllEventsStats).mockReturnValue({
        data: [{ eventId: 'event-456', totalSlots: 10, filledSlots: 6, vacantSlots: 4, fillRate: 60, totalCapacity: 20, totalBookings: 12 }],
        isLoading: false,
        isError: false,
      } as unknown as UseQueryResult<{ eventId: string; totalSlots: number; filledSlots: number; vacantSlots: number; fillRate: number; totalCapacity: number; totalBookings: number }[]>)

      renderPage()

      await user.click(screen.getByRole('radio', { name: /Statistiques/i }))

      expect(await screen.findByText('Entonnoir des invitations')).toBeInTheDocument()
      expect(screen.getByText('Répartition des créneaux')).toBeInTheDocument()
      expect(screen.getByText(/Remplis/)).toBeInTheDocument()
    })

    it('affiche une erreur de chargement (pas l\'état vide) si la récupération échoue', async () => {
      const user = userEvent.setup()
      vi.mocked(useBookingTimestamps).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as unknown as UseQueryResult<typeof SAMPLE_BOOKINGS>)

      renderPage()

      await user.click(screen.getByRole('radio', { name: /Statistiques/i }))

      expect(await screen.findByText('Impossible de charger les inscriptions.')).toBeInTheDocument()
      // L'état vide du graphe ne doit PAS masquer l'erreur
      expect(screen.queryByText('Aucune inscription pour cet événement')).not.toBeInTheDocument()
    })

    it('affiche les 5 onglets dont Statistiques', () => {
      renderPage()

      expect(screen.getByRole('radio', { name: /Détails/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /Créneaux/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /Invités/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /Template/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /Statistiques/i })).toBeInTheDocument()
    })

    it('tous les onglets sont actifs dès le chargement', () => {
      renderPage()

      expect(screen.getByRole('radio', { name: /Créneaux/i })).not.toBeDisabled()
      expect(screen.getByRole('radio', { name: /Invités/i })).not.toBeDisabled()
      expect(screen.getByRole('radio', { name: /Template/i })).not.toBeDisabled()
      expect(screen.getByRole('radio', { name: /Statistiques/i })).not.toBeDisabled()
    })

    it('navigue vers la liste des événements au clic sur Retour', async () => {
      const user = userEvent.setup()

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/events/event-456/edit']}>
            <AuthProvider>
              <Routes>
                <Route path="/admin/events/:id/edit" element={<EventEditPage />} />
                <Route path="/admin/events" element={<div>Events List</div>} />
              </Routes>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>
      )

      const backButtons = screen.getAllByRole('button', { name: /Retour/i })
      await user.click(backButtons[0])

      expect(mockNavigate).toHaveBeenCalledWith('/admin/events')
    })

    it('n\'affiche pas le bouton Créer (il est dans la Sheet, pas ici)', () => {
      renderPage()

      expect(screen.queryByRole('button', { name: /créer l'événement/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /publier/i })).toBeInTheDocument()
    })

    it('ne confine pas le formulaire (#name) dans le wrapper overflow-hidden de mesure des onglets', () => {
      const { container } = renderPage()

      // L'overflow-hidden sert uniquement à clipper la TabsList mesurée par
      // useCompactMode. Les TabsContent (et donc les champs pleine largeur)
      // doivent rester en dehors, sinon leur anneau de focus est rogné sur
      // les bords gauche/droite (régression tâche 44).
      const measuredTabsList = container.querySelector('[data-measure]')
      const clipWrapper = measuredTabsList?.closest('.overflow-hidden')
      const nameInput = container.querySelector('#name')

      expect(measuredTabsList).toBeTruthy()
      expect(clipWrapper).toBeTruthy()
      expect(nameInput).toBeTruthy()
      expect(clipWrapper!.contains(nameInput!)).toBe(false)
    })

    it('le wrapper sticky entoure l\'en-tête et n\'a pas data-condensed au repos', () => {
      const { container } = renderPage()

      // Le wrapper sticky doit exister et contenir la TabsList
      const stickyWrapper = container.querySelector('.group\\/sticky')
      expect(stickyWrapper).toBeTruthy()

      // Au repos (IntersectionObserver absent en jsdom → condensed=false),
      // data-condensed ne doit pas être présent
      expect(stickyWrapper).not.toHaveAttribute('data-condensed')

      // La TabsList mesurée est à l'intérieur du wrapper sticky
      const tabsList = container.querySelector('[data-measure]')
      expect(stickyWrapper!.contains(tabsList!)).toBe(true)

      // Les TabsContent sont à l'extérieur du wrapper sticky (défilent normalement)
      const detailsPanel = container.querySelector('[data-state][role="tabpanel"]')
      expect(detailsPanel).toBeTruthy()
      expect(stickyWrapper!.contains(detailsPanel!)).toBe(false)
    })
  })
})
