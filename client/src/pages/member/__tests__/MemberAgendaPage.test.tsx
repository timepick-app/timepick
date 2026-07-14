import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { MySlotsResponse, MyAvailableSlot } from '@/types/member'
import { MemberAgendaPage } from '../MemberAgendaPage'

// sonner est mocké globalement (src/test/setup.ts) — NE PAS ré-mocker ici.

// États pilotés par vi.hoisted (mutables entre tests) — même technique que
// MemberProfilePage.test.tsx.
const slotsState = vi.hoisted(() => ({
  data: undefined as MySlotsResponse | undefined,
  isLoading: false,
  isError: false,
}))

const availState = vi.hoisted(() => ({
  data: undefined as MyAvailableSlot[] | undefined,
  isLoading: false,
  isError: false,
}))

vi.mock('@/hooks/useMySlots', () => ({
  useMySlots: () => ({
    data: slotsState.data,
    isLoading: slotsState.isLoading,
    isError: slotsState.isError,
  }),
}))

vi.mock('@/hooks/useMyAvailableSlots', () => ({
  useMyAvailableSlots: () => ({
    data: availState.data,
    isLoading: availState.isLoading,
    isError: availState.isError,
  }),
}))

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BOOKING_ACTIVE = {
  slotUuid: 'slot-1',
  eventUuid: 'evt-1',
  eventName: 'Atelier photo',
  startTime: '2026-07-10T09:00:00.000Z',
  endTime: '2026-07-10T11:00:00.000Z',
  status: 'active' as const,
}

const BOOKING_CANCELLED = {
  slotUuid: 'slot-2',
  eventUuid: 'evt-1',
  eventName: 'Atelier photo',
  startTime: '2026-07-15T14:00:00.000Z',
  endTime: '2026-07-15T16:00:00.000Z',
  status: 'cancelled' as const,
}

const BOOKING_3 = {
  slotUuid: 'slot-3',
  eventUuid: 'evt-2',
  eventName: 'Stage vidéo',
  startTime: '2026-08-01T10:00:00.000Z',
  endTime: '2026-08-01T12:00:00.000Z',
  status: 'active' as const,
}

const AVAILABLE_SLOT: MyAvailableSlot = {
  slotUuid: 'avail-1',
  eventUuid: 'evt-3',
  eventName: 'Conférence IA',
  startTime: '2026-07-20T09:00:00.000Z',
  endTime: '2026-07-20T10:00:00.000Z',
  availableSpots: 3,
}

const SLOTS_FULL: MySlotsResponse = {
  upcoming: [BOOKING_ACTIVE, BOOKING_CANCELLED, BOOKING_3],
  past: [],
  nextCursor: null,
  totalRealizedHours: 2.5,
}

const SLOTS_EMPTY: MySlotsResponse = {
  upcoming: [],
  past: [],
  nextCursor: null,
  totalRealizedHours: 0,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter>
      <MemberAgendaPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  slotsState.data = { ...SLOTS_FULL }
  slotsState.isLoading = false
  slotsState.isError = false
  availState.data = [{ ...AVAILABLE_SLOT }]
  availState.isLoading = false
  availState.isError = false
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MemberAgendaPage', () => {
  it('affiche les 3 Cards avec bons titres', () => {
    renderPage()
    expect(screen.getByText('Mes prochains créneaux')).toBeInTheDocument()
    expect(screen.getByText('Heures réalisées')).toBeInTheDocument()
    expect(screen.getByText('Prochainement sans réservation')).toBeInTheDocument()
  })

  it('affiche le total au format X h', () => {
    renderPage()
    // 2.5 → locale fr-FR → « 2,5 h »
    expect(screen.getByText(/2,5 h/)).toBeInTheDocument()
  })

  it('affiche les prochains créneaux', () => {
    renderPage()
    // 3 bookings → 3 eventNames visibles dans la card 1
    const eventNames = screen.getAllByText('Atelier photo')
    expect(eventNames.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Stage vidéo')).toBeInTheDocument()
  })

  it('card Heures réalisées — sous-texte futur non compté', () => {
    renderPage()
    expect(
      screen.getByText(/Un créneau futur réservé n'est pas compté/)
    ).toBeInTheDocument()
  })

  it('créneau annulé badge Annulé', () => {
    renderPage()
    expect(screen.getByText('Annulé')).toBeInTheDocument()
  })

  it('états vides', () => {
    slotsState.data = { ...SLOTS_EMPTY }
    availState.data = []
    renderPage()

    expect(screen.getByText('Aucun créneau à venir.')).toBeInTheDocument()
    expect(screen.getByText('Aucun créneau disponible pour le moment.')).toBeInTheDocument()
    expect(screen.getByText('Aucune heure réalisée.')).toBeInTheDocument()
  })

  it('états loading → Skeleton', () => {
    slotsState.isLoading = true
    availState.isLoading = true
    const { container } = renderPage()

    // Skeleton renders divs with class animate-pulse
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it("affiche un message d'erreur quand useMySlots/useMyAvailableSlots échouent", () => {
    slotsState.isError = true
    slotsState.data = undefined
    availState.isError = true
    availState.data = undefined
    renderPage()

    // Messages d'erreur affichés
    expect(
      screen.getByText('Impossible de charger vos créneaux. Réessayez plus tard.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Impossible de charger vos créneaux disponibles. Réessayez plus tard.')
    ).toBeInTheDocument()

    // Empty-states NON affichés (erreur ≠ vide)
    expect(screen.queryByText('Aucun créneau à venir.')).not.toBeInTheDocument()
    expect(screen.queryByText('Aucun créneau disponible pour le moment.')).not.toBeInTheDocument()
  })
})
