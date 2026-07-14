import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MyReservationsPanel } from '../MyReservationsPanel'
import type { Booking } from '../../../types/booking'

const activeBooking: Booking = {
  id: 'booking-active',
  slotId: 'slot-active',
  userId: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
  eventName: 'Fête du village',
  slot: {
    id: 'slot-active',
    startTime: '2099-06-19T12:00:00Z',
    endTime: '2099-06-19T14:00:00Z',
    capacity: 4,
    eventId: 'event-1',
    cancelledAt: null,
    cancellationReason: null,
  },
}

const cancelledBooking: Booking = {
  id: 'booking-cancelled',
  slotId: 'slot-cancelled',
  userId: 'user-1',
  createdAt: '2026-01-01T00:00:00Z',
  eventName: 'Fête du village',
  slot: {
    id: 'slot-cancelled',
    startTime: '2099-06-19T14:00:00Z',
    endTime: '2099-06-19T16:00:00Z',
    capacity: 4,
    eventId: 'event-1',
    cancelledAt: '2026-01-10T12:00:00Z',
    cancellationReason: 'Salle indisponible',
  },
}

// Scope les requêtes au panneau desktop (le contenu est rendu en double :
// accordéon mobile + panneau desktop).
const panel = () => within(screen.getByTestId('my-reservations-panel'))

describe('MyReservationsPanel — soft-delete', () => {
  it('affiche « Réservé » et le bouton Annuler pour une réservation active', () => {
    render(<MyReservationsPanel reservations={[activeBooking]} onCancel={vi.fn()} />)

    expect(panel().getByText('Réservé')).toBeInTheDocument()
    expect(panel().getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
  })

  it('affiche « Annulé » + le motif pour un créneau annulé', () => {
    render(<MyReservationsPanel reservations={[cancelledBooking]} onCancel={vi.fn()} />)

    expect(panel().getByText('Annulé')).toBeInTheDocument()
    expect(panel().getByText(/Salle indisponible/)).toBeInTheDocument()
  })

  it('masque le bouton Annuler pour un créneau annulé', () => {
    render(<MyReservationsPanel reservations={[cancelledBooking]} onCancel={vi.fn()} />)

    expect(panel().queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
    expect(panel().queryByText('Réservé')).not.toBeInTheDocument()
  })

  it('conserve le bouton « Voir les détails » pour un créneau annulé', () => {
    render(
      <MyReservationsPanel
        reservations={[cancelledBooking]}
        onCancel={vi.fn()}
        onViewSlot={vi.fn()}
      />
    )

    expect(panel().getByRole('button', { name: 'Voir les détails' })).toBeInTheDocument()
  })
})

describe('MyReservationsPanel — variante compact (Story 1.6 / C1)', () => {
  it('rend une ligne condensée + bouton « Annuler » inline par réservation', () => {
    const onCancel = vi.fn()
    render(
      <MyReservationsPanel
        variant="compact"
        reservations={[activeBooking]}
        onCancel={onCancel}
      />,
    )

    const compact = screen.getByTestId('my-reservations-panel-compact')
    expect(compact).toBeInTheDocument()
    // 1 ligne/réservation
    expect(screen.getByTestId('reservation-compact-slot-active')).toBeInTheDocument()
    // Bouton « Annuler » inline
    const cancelBtn = screen.getByTestId('reservation-cancel-slot-active')
    expect(cancelBtn).toBeInTheDocument()
  })

  it('affiche le récap « N créneau(x) · Xh »', () => {
    // activeBooking = 12:00→14:00 = 120 min = 2h00
    render(
      <MyReservationsPanel
        variant="compact"
        reservations={[activeBooking]}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/1 créneau · 2h00/)).toBeInTheDocument()
  })

  it('le bouton « Annuler » appelle onCancel(slotId)', async () => {
    const userEvent = (await import('@testing-library/user-event')).default
    const onCancel = vi.fn()
    render(
      <MyReservationsPanel
        variant="compact"
        reservations={[activeBooking]}
        onCancel={onCancel}
      />,
    )

    await userEvent.click(screen.getByTestId('reservation-cancel-slot-active'))
    expect(onCancel).toHaveBeenCalledWith('slot-active')
  })

  it('le récap exclut les annulés (compte + durée) et affiche « N annulé(s) »', () => {
    // activeBooking (12:00→14:00 = 2h00) + cancelledBooking (annulé → exclu des totaux)
    render(
      <MyReservationsPanel
        variant="compact"
        reservations={[activeBooking, cancelledBooking]}
        onCancel={vi.fn()}
      />,
    )
    // Récap gauche : 1 créneau actif · 2h00 (l'annulé n'est PAS compté)
    expect(screen.getByText(/1 créneau · 2h00/)).toBeInTheDocument()
    // Récap droite : 1 annulé
    expect(screen.getByText(/1 annulé/)).toBeInTheDocument()
  })

  it("la ligne annulée montre « Annulé » et masque le bouton", () => {
    render(
      <MyReservationsPanel
        variant="compact"
        reservations={[activeBooking, cancelledBooking]}
        onCancel={vi.fn()}
      />,
    )
    const cancelledLine = screen.getByTestId('reservation-compact-slot-cancelled')
    // Pastille « Annulé »
    expect(within(cancelledLine).getByText('Annulé')).toBeInTheDocument()
    // Aucun bouton Annuler sur la ligne annulée
    expect(
      within(cancelledLine).queryByRole('button', { name: /Annuler/ }),
    ).not.toBeInTheDocument()
  })

  it('la ligne active expose un bouton « Annuler » accessible', () => {
    render(
      <MyReservationsPanel
        variant="compact"
        reservations={[activeBooking, cancelledBooking]}
        onCancel={vi.fn()}
      />,
    )
    const activeLine = screen.getByTestId('reservation-compact-slot-active')
    expect(
      within(activeLine).getByRole('button', { name: /Annuler/ }),
    ).toBeInTheDocument()
  })

  it('la variante full (défaut) rend le panneau desktop (pas la branche compact)', () => {
    // Anti-régression : le défaut reste le panneau desktop. (Les chips et le
    // bouton Annuler full ont été alignés sur les actifs / hover destructif,
    // mais la structure desktop + l'accordéon mobile demeurent.)
    render(<MyReservationsPanel reservations={[activeBooking]} onCancel={vi.fn()} />)
    expect(screen.getByTestId('my-reservations-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('my-reservations-panel-compact')).not.toBeInTheDocument()
  })
})
