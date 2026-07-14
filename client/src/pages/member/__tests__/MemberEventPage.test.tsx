import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { MemberEvent } from '@/types/member'
import { MemberEventPage } from '../MemberEventPage'

// useMyEvents piloté par état mutable (data + isLoading) afin de couvrir les
// trois branches de la garde de rattachement (chargement / neutre / rattaché).
const myEventsState = vi.hoisted(() => ({
  data: undefined as MemberEvent[] | undefined,
  isLoading: false,
}))

vi.mock('@/hooks/useMyEvents', () => ({
  useMyEvents: () => ({
    data: myEventsState.data,
    isLoading: myEventsState.isLoading,
  }),
}))

// EventCalendarContent stubbé : rend un marker + invoque `renderHeader` (pour
// vérifier le câblage du header membre). Isole la garde de rattachement
// (logique sous test) — les internes du calendrier sont couvertes par leurs
// propres tests (PublicCalendar.* + EventCalendarContent.*).
// Story 1.6 : le stub passe `eventReservations: []` au renderHeader (le header
// membre en a désormais besoin — il monte le popover).
vi.mock('@/components/public', () => ({
  EventCalendarContent: ({
    uuid,
    renderHeader,
  }: {
    uuid: string
    renderHeader?: (ctx: {
      eventName: string
      periodFormatted: string | null
      eventReservations: never[]
    }) => ReactNode
  }) => (
    <div data-testid="event-calendar-content" data-uuid={uuid}>
      {renderHeader
        ? renderHeader({
            eventName: 'Membre Événement',
            periodFormatted: '1–3 mai 2026',
            eventReservations: [],
          })
        : <div data-testid="default-header" />}
    </div>
  ),
}))

// Story 1.6 — le header membre rend MemberReservationsPopover (useMediaQuery).
// jsdom ne fournit pas window.matchMedia → mock obligatoire (défaut desktop).
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
}))

function renderPage(uuid = 'evt-1') {
  return render(
    <MemoryRouter initialEntries={[`/me/events/${uuid}`]}>
      <Routes>
        <Route path="/me/events/:uuid" element={<MemberEventPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const ATTACHED: MemberEvent = {
  uuid: 'evt-1',
  name: 'Salon membre',
  startDate: null,
  endDate: null,
  myBookingCount: 0,
  isUpcoming: true,
}

describe('MemberEventPage (AC1 / AC3 — garde de rattachement)', () => {
  beforeEach(() => {
    myEventsState.data = undefined
    myEventsState.isLoading = false
  })

  it('membre rattaché → calendrier affiché + header membre câblé (AC1)', () => {
    myEventsState.data = [ATTACHED]
    renderPage('evt-1')
    const calendar = screen.getByTestId('event-calendar-content')
    expect(calendar).toHaveAttribute('data-uuid', 'evt-1')
    // renderHeader invoqué → MemberEventStickyHeader réel rend le nom reçu via ctx.
    expect(screen.getByText('Membre Événement')).toBeInTheDocument()
  })

  it('membre NON rattaché (uuid différent) → EventNotFound neutre (AC3)', () => {
    myEventsState.data = [{ ...ATTACHED, uuid: 'autre-uuid' }]
    renderPage('evt-1')
    expect(screen.getByText('Événement non trouvé')).toBeInTheDocument()
    expect(screen.queryByTestId('event-calendar-content')).toBeNull()
  })

  it('uuid inexistant (liste vide) → EventNotFound neutre — pas de fuite (AC3)', () => {
    myEventsState.data = []
    renderPage('evt-1')
    expect(screen.getByText('Événement non trouvé')).toBeInTheDocument()
    expect(screen.queryByTestId('event-calendar-content')).toBeNull()
  })

  it('chargement (isLoading) → EventSkeleton', () => {
    myEventsState.data = undefined
    myEventsState.isLoading = true
    renderPage('evt-1')
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
    expect(screen.queryByTestId('event-calendar-content')).toBeNull()
    expect(screen.queryByText('Événement non trouvé')).toBeNull()
  })

  it('cache non résolu (data undefined, isLoading false) → EventSkeleton', () => {
    myEventsState.data = undefined
    myEventsState.isLoading = false
    renderPage('evt-1')
    expect(document.querySelector('.animate-pulse')).not.toBeNull()
  })
})
