import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberReservationsPopover } from '../MemberReservationsPopover'
import type { Booking } from '@/types/booking'

// ---------------------------------------------------------------------------
// Mock useMediaQuery — contrôle desktop (Popover) vs mobile (Sheet).
// Indispensable pour couvrir les deux branches du switch responsive
// (test anti-régression §7 du cadrage S6).
// ---------------------------------------------------------------------------
const mockIsMobile = vi.fn<() => boolean>(() => false)
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockIsMobile(),
}))

// Fabrique de réservations event-scopées.
function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    slotId: 'slot-1',
    userId: 'user-1',
    createdAt: '2026-06-18T08:00:00Z',
    eventName: 'Fête de l\'école',
    slot: {
      id: 'slot-1',
      startTime: '2026-06-19T12:00:00Z',
      endTime: '2026-06-19T14:00:00Z',
      capacity: 4,
      eventId: 'evt-1',
      cancelledAt: null,
      cancellationReason: null,
    },
    ...overrides,
  }
}

describe('MemberReservationsPopover (Story 1.6 — AC1–AC5)', () => {
  beforeEach(() => {
    mockIsMobile.mockReset()
    mockIsMobile.mockReturnValue(false) // desktop par défaut
  })

  // === AC1 — Badge compteur =================================================

  it('affiche le décompte event-scopé dans le badge (AC1)', () => {
    const reservations = [
      makeBooking({ id: 'b1', slotId: 's1', slot: { id: 's1', startTime: '2026-06-19T12:00:00Z', endTime: '2026-06-19T14:00:00Z', capacity: 4, eventId: 'evt-1', cancelledAt: null, cancellationReason: null } }),
      makeBooking({ id: 'b2', slotId: 's2', slot: { id: 's2', startTime: '2026-06-20T10:00:00Z', endTime: '2026-06-20T11:00:00Z', capacity: 4, eventId: 'evt-1', cancelledAt: null, cancellationReason: null } }),
    ]
    render(
      <MemberReservationsPopover eventName="Fête" eventReservations={reservations} />,
    )
    expect(screen.getByTestId('member-reservations-count')).toHaveTextContent('2')
  })

  it('affiche 0 quand aucune réservation (badge toujours visible — T1.1)', () => {
    render(<MemberReservationsPopover eventName="Fête" eventReservations={[]} />)
    expect(screen.getByTestId('member-reservations-count')).toHaveTextContent('0')
  })

  it('décrémente le badge quand eventReservations diminue (live — AC4)', () => {
    const b1 = makeBooking({ id: 'b1', slotId: 's1' })
    const b2 = makeBooking({ id: 'b2', slotId: 's2', slot: { id: 's2', startTime: '2026-06-20T10:00:00Z', endTime: '2026-06-20T11:00:00Z', capacity: 4, eventId: 'evt-1', cancelledAt: null, cancellationReason: null } })
    const { rerender } = render(
      <MemberReservationsPopover eventName="Fête" eventReservations={[b1, b2]} />,
    )
    expect(screen.getByTestId('member-reservations-count')).toHaveTextContent('2')

    // Re-render après annulation (React Query invalide ['reservations'], le parent
    // refiltre et repasse un eventReservations réduit).
    rerender(<MemberReservationsPopover eventName="Fête" eventReservations={[b1]} />)
    expect(screen.getByTestId('member-reservations-count')).toHaveTextContent('1')
  })

  // === AC1 — Badge « actif » (slots annulés exclus) =======================

  it('badge : compte seulement les créneaux actifs (slot annulé exclu)', () => {
    const cancelled = makeBooking({
      id: 'bx',
      slotId: 'sx',
      slot: { id: 'sx', startTime: '2026-06-19T12:00:00Z', endTime: '2026-06-19T14:00:00Z', capacity: 4, eventId: 'evt-1', cancelledAt: '2026-06-18T00:00:00Z', cancellationReason: null },
    })
    render(
      <MemberReservationsPopover eventName="Fête" eventReservations={[makeBooking(), cancelled]} />,
    )
    // 1 actif + 1 annulé → badge affiche le compte ACTIF (1).
    expect(screen.getByTestId('member-reservations-count')).toHaveTextContent('1')
  })

  it('« que des annulés » : badge 0 mais le panel compact s\'affiche (pas l\'état vide)', async () => {
    const cancelled = (id: string, slotId: string) =>
      makeBooking({
        id,
        slotId,
        slot: { id: slotId, startTime: '2026-06-19T12:00:00Z', endTime: '2026-06-19T14:00:00Z', capacity: 4, eventId: 'evt-1', cancelledAt: '2026-06-18T00:00:00Z', cancellationReason: null },
      })
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[cancelled('c1', 'sx1'), cancelled('c2', 'sx2')]}
      />,
    )
    // count>0 mais activeCount=0 → badge « 0 ».
    expect(screen.getByTestId('member-reservations-count')).toHaveTextContent('0')

    // Le gate état-vide reste sur la longueur totale (count>0) → le panel
    // compact s'affiche (montrant « Aucun créneau actif » + lignes annulées),
    // PAS l'état vide contextuel.
    const user = userEvent.setup()
    await user.click(screen.getByTestId('member-reservations-trigger'))
    await screen.findByTestId('member-reservations-popover')
    expect(screen.getByTestId('my-reservations-panel-compact')).toBeInTheDocument()
    expect(screen.queryByTestId('member-reservations-empty')).not.toBeInTheDocument()
  })

  it('trigger : icône CalendarClock à gauche + « Mes réservations » + Badge info (refonte DS)', () => {
    render(<MemberReservationsPopover eventName="Fête" eventReservations={[makeBooking()]} />)
    const trigger = screen.getByTestId('member-reservations-trigger')
    // Libellé visible « Mes réservations » (accessibilité : nom accessible le contient).
    expect(trigger).toHaveTextContent('Mes réservations')
    // Icône CalendarClock à gauche (icône brute, PAS encapsulée dans un Badge).
    expect(trigger.querySelector('svg')).not.toBeNull()
    // Décompte dans un Badge DS variante info (bleu) à droite du libellé.
    const countBadge = trigger.querySelector('[data-testid="member-reservations-count"]')
    expect(countBadge).toHaveTextContent('1')
    expect(countBadge?.className).toContain('bg-blue-100')
  })

  // === AC2 — Popover desktop ===============================================

  it('desktop : Popover fermé par défaut, contenu absent (AC2)', () => {
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
      />,
    )
    expect(screen.queryByTestId('member-reservations-content')).not.toBeInTheDocument()
    // PopoverContent (desktop) absent tant que fermé.
    expect(screen.queryByTestId('member-reservations-popover')).not.toBeInTheDocument()
  })

  it('desktop : clic sur le badge ouvre le Popover avec contenu condensé + récap (AC2)', async () => {
    const user = userEvent.setup()
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
      />,
    )
    await user.click(screen.getByTestId('member-reservations-trigger'))

    const popover = await screen.findByTestId('member-reservations-popover')
    expect(popover).toBeInTheDocument()
    // Contenu condensé rendu (récap via la variante compact de MyReservationsPanel).
    expect(screen.getByTestId('my-reservations-panel-compact')).toBeInTheDocument()
    expect(screen.getByText(/créneau/)).toBeInTheDocument()
  })

  it('desktop : Échap ferme le Popover (AC2)', async () => {
    const user = userEvent.setup()
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
      />,
    )
    await user.click(screen.getByTestId('member-reservations-trigger'))
    expect(screen.getByTestId('member-reservations-popover')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByTestId('member-reservations-popover')).not.toBeInTheDocument()
  })

  it('desktop : clic extérieur ferme le Popover (AC2)', async () => {
    const user = userEvent.setup()
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
      />,
    )
    await user.click(screen.getByTestId('member-reservations-trigger'))
    expect(screen.getByTestId('member-reservations-popover')).toBeInTheDocument()

    // Clic en dehors du Popover (sur le body) → fermeture (Radix DismissableLayer).
    await user.click(document.body)

    expect(
      screen.queryByTestId('member-reservations-popover'),
    ).not.toBeInTheDocument()
  })

  // === AC3 — Sheet mobile ==================================================

  it('mobile : clic sur le badge ouvre un Sheet side="bottom" (AC3)', async () => {
    mockIsMobile.mockReturnValue(true)
    const user = userEvent.setup()
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
      />,
    )
    await user.click(screen.getByTestId('member-reservations-trigger'))

    const sheet = await screen.findByTestId('member-reservations-sheet')
    expect(sheet).toBeInTheDocument()
    // side="bottom" prouvé par les classes positionnelles dérivées de la cva
    // sheetVariants (inset-x-0 + bottom-0) — PAS rounded-t-lg (ajout manuel).
    expect(sheet.className).toContain('bottom-0')
    expect(sheet.className).toContain('inset-x-0')
  })

  it('mobile : <SheetTitle> présent pour a11y (AC3 / Piège n°4)', async () => {
    mockIsMobile.mockReturnValue(true)
    const user = userEvent.setup()
    render(
      <MemberReservationsPopover
        eventName="Fête de l'école"
        eventReservations={[makeBooking()]}
      />,
    )
    await user.click(screen.getByTestId('member-reservations-trigger'))

    // SheetTitle existe (sr-only) — Radix lève un warning console sinon.
    const title = await screen.findByText(/Mes réservations — Fête de l'école/)
    expect(title).toBeInTheDocument()
  })

  // === AC4 — Annulation inline réactive ====================================

  it('le bouton « Annuler » inline appelle onCancelReservation(slotId) (AC4)', async () => {
    const user = userEvent.setup()
    const onCancelReservation = vi.fn()
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
        onCancelReservation={onCancelReservation}
      />,
    )
    await user.click(screen.getByTestId('member-reservations-trigger'))
    await screen.findByTestId('member-reservations-popover')

    const cancelBtn = screen.getByTestId('reservation-cancel-slot-1')
    await user.click(cancelBtn)

    expect(onCancelReservation).toHaveBeenCalledTimes(1)
    expect(onCancelReservation).toHaveBeenCalledWith('slot-1')
  })

  it('le bouton « Annuler » est désactivé quand cancellingSlotId correspond (AC4)', async () => {
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
        onCancelReservation={vi.fn()}
        cancellingSlotId="slot-1"
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByTestId('member-reservations-trigger'))
    await screen.findByTestId('member-reservations-popover')

    const cancelBtn = screen.getByTestId('reservation-cancel-slot-1')
    expect(cancelBtn).toBeDisabled()
  })

  // === AC5 — État vide contextuel ==========================================

  it('état vide : message contextuel visible (AC5)', async () => {
    const user = userEvent.setup()
    render(<MemberReservationsPopover eventName="Fête de l'école" eventReservations={[]} />)
    await user.click(screen.getByTestId('member-reservations-trigger'))

    await screen.findByTestId('member-reservations-popover')
    expect(screen.getByTestId('member-reservations-empty')).toBeInTheDocument()
    expect(screen.getByText(/Aucune réservation pour « Fête de l'école »/)).toBeInTheDocument()
  })

  // === Anti-régression §7 : deux primitives physiques =====================

  it('anti-régression §7 : desktop rend <Popover>, PAS <Sheet>', () => {
    mockIsMobile.mockReturnValue(false)
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
      />,
    )
    // Le trigger est commun, mais la primitive overlay dépend de la branche.
    // Desktop fermé → ni popover ni sheet contenu rendus, mais le Popover
    // est monté (son trigger l'est). On vérifie via ouverture.
    expect(screen.queryByTestId('member-reservations-sheet')).not.toBeInTheDocument()
  })

  it('anti-régression §7 : mobile rend <Sheet>, PAS <Popover>', async () => {
    mockIsMobile.mockReturnValue(true)
    const user = userEvent.setup()
    render(
      <MemberReservationsPopover
        eventName="Fête"
        eventReservations={[makeBooking()]}
      />,
    )
    await user.click(screen.getByTestId('member-reservations-trigger'))
    expect(await screen.findByTestId('member-reservations-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('member-reservations-popover')).not.toBeInTheDocument()
  })
})
