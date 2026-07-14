import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SlotDetailDialog } from '../SlotDetailDialog'
import type { Slot } from '../../../types/slot'

// Mock de date-fns : `format` (libellés de date localisés) → 'formatted_date',
// pour neutraliser la locale. Les libellés calculés SANS `format`
// (formatSlotDuration → « N jours », places disponibles) restent fiables.
vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns')
  return {
    ...actual,
    format: vi.fn(() => 'formatted_date'),
  }
})

const mockSlot: Slot = {
  id: 'slot-1',
  eventId: 'event-1',
  startTime: '2099-02-15T14:00:00Z',
  endTime: '2099-02-15T16:00:00Z',
  capacity: 3,
  currentBookings: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  cancelledAt: null,
  cancellationReason: null,
}

const mockSlotFull: Slot = {
  ...mockSlot,
  id: 'slot-2',
  currentBookings: 3,
}

describe('SlotDetailDialog', () => {
  it('ne s\'affiche pas quand open=false', () => {
    render(
      <SlotDetailDialog
        slot={mockSlot}
        open={false}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.queryByTestId('slot-detail-dialog')).not.toBeInTheDocument()
  })

  it('s\'affiche quand open=true', () => {
    render(
      <SlotDetailDialog
        slot={mockSlot}
        open={true}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.getByTestId('slot-detail-dialog')).toBeInTheDocument()
  })

  it('affiche les places disponibles en une phrase unique', () => {
    render(
      <SlotDetailDialog
        slot={mockSlot}
        open={true}
        onOpenChange={vi.fn()}
      />
    )

    // 1/3 réservé → 2 places restantes. Phrase unique (plus de jauge ni d'encart « 9 »).
    expect(screen.getByText(/2 places disponibles sur 3/)).toBeInTheDocument()
  })

  it('affiche le bouton Réserver quand disponible', () => {
    render(
      <SlotDetailDialog
        slot={mockSlot}
        open={true}
        onOpenChange={vi.fn()}
        onBook={vi.fn()}
      />
    )

    expect(screen.getByText('Réserver ce créneau')).toBeInTheDocument()
  })

  it('n\'affiche pas le bouton Réserver quand complet', () => {
    render(
      <SlotDetailDialog
        slot={mockSlotFull}
        open={true}
        onOpenChange={vi.fn()}
        onBook={vi.fn()}
      />
    )

    expect(screen.queryByText('Réserver ce créneau')).not.toBeInTheDocument()
    expect(screen.getByTestId('slot-full-message')).toBeInTheDocument()
  })

  it('affiche le message mode consultatif', () => {
    render(
      <SlotDetailDialog
        slot={mockSlot}
        open={true}
        onOpenChange={vi.fn()}
        isConsultative={true}
      />
    )

    expect(screen.getByText(/Inscriptions non ouvertes/)).toBeInTheDocument()
  })

  it('appelle onOpenChange(false) lors du clic sur Fermer', () => {
    const onOpenChange = vi.fn()
    render(
      <SlotDetailDialog
        slot={mockSlot}
        open={true}
        onOpenChange={onOpenChange}
      />
    )

    fireEvent.click(screen.getByText('Fermer'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  describe('Créneaux multi-jours (Story 1.4)', () => {
    // 3 jours calendaires inclusifs (15→17), heures en milieu de journée →
    // differenceInCalendarDays robuste quelle que soit la TZ. `date-fns.format`
    // est mocké : on teste les libellés calculés SANS `format` (badge/bouton via
    // formatSlotDuration) et la STRUCTURE de l'en-tête (sous-titre horaires).
    const multiDaySlot: Slot = {
      ...mockSlot,
      id: 'slot-md',
      startTime: '2099-02-15T09:00:00Z',
      endTime: '2099-02-17T17:00:00Z',
    }

    it('affiche un badge « N jours »', () => {
      render(
        <SlotDetailDialog slot={multiDaySlot} open={true} onOpenChange={vi.fn()} />
      )
      // formatSlotDuration n'utilise pas `format` (mocké) → valeur exacte fiable.
      expect(screen.getByText('3 jours')).toBeInTheDocument()
    })

    it('libellé bouton dynamique « Réserver les N jours » (AC2)', () => {
      render(
        <SlotDetailDialog slot={multiDaySlot} open={true} onOpenChange={vi.fn()} onBook={vi.fn()} />
      )
      expect(screen.getByText('Réserver les 3 jours')).toBeInTheDocument()
      expect(screen.queryByText('Réserver ce créneau')).not.toBeInTheDocument()
    })

    it('mono-jour : aucun badge « jours », bouton « Réserver ce créneau » (FR12)', () => {
      render(
        <SlotDetailDialog slot={mockSlot} open={true} onOpenChange={vi.fn()} onBook={vi.fn()} />
      )
      expect(screen.getByText('Réserver ce créneau')).toBeInTheDocument()
      expect(screen.queryByText(/jours/)).not.toBeInTheDocument()
    })

    it('multi-jours COMPLET : badge « N jours » présent, bouton Réserver absent + message « complet » (AC5, L-4)', () => {
      // Lacune revue 1.4 (L-4) : multi-jours × état complet. Le badge multi-jours
      // (en-tête) doit coexister avec l'état complet (zone d'état unique).
      const multiDayFull: Slot = { ...multiDaySlot, capacity: 3, currentBookings: 3 }
      render(
        <SlotDetailDialog slot={multiDayFull} open={true} onOpenChange={vi.fn()} onBook={vi.fn()} />
      )
      expect(screen.getByText('3 jours')).toBeInTheDocument()
      expect(screen.queryByTestId('reserve-slot-button')).not.toBeInTheDocument()
      expect(screen.getByTestId('slot-full-message')).toBeInTheDocument()
    })

    it('multi-jours ANNULÉ : badge « N jours » coexiste avec l\'encart d\'annulation, aucune action (AC5, L-6)', () => {
      // L-6 (comportement assumé) : le badge « N jours » (en-tête) reste affiché
      // malgré l'annulation. Aucune action de réservation/annulation.
      const multiDayCancelled: Slot = {
        ...multiDaySlot,
        cancelledAt: '2026-01-10T12:00:00Z',
        cancellationReason: 'Salle indisponible',
      }
      render(
        <SlotDetailDialog
          slot={multiDayCancelled}
          open={true}
          onOpenChange={vi.fn()}
          onBook={vi.fn()}
          hasBooked={true}
          onCancel={vi.fn()}
        />
      )
      expect(screen.getByText('3 jours')).toBeInTheDocument()
      expect(screen.getByText(/L'organisateur a annulé ce créneau/)).toBeInTheDocument()
      // Seul « Fermer » subsiste : ni Réserver ni Annuler ma réservation.
      expect(screen.queryByTestId('reserve-slot-button')).not.toBeInTheDocument()
      expect(screen.queryByTestId('cancel-reservation-button')).not.toBeInTheDocument()
    })
  })

  describe('Story 6.6 - Annulation de réservation', () => {
    it('affiche le bouton Annuler quand hasBooked=true', () => {
      render(
        <SlotDetailDialog
          slot={mockSlot}
          open={true}
          onOpenChange={vi.fn()}
          hasBooked={true}
          onCancel={vi.fn()}
        />
      )

      const cancelButton = screen.getByTestId('cancel-reservation-button')
      expect(cancelButton).toBeInTheDocument()
      expect(cancelButton).toHaveTextContent('Annuler')
    })

    it("n'affiche pas le bouton Annuler quand hasBooked=false", () => {
      render(
        <SlotDetailDialog
          slot={mockSlot}
          open={true}
          onOpenChange={vi.fn()}
          hasBooked={false}
          onCancel={vi.fn()}
        />
      )

      expect(screen.queryByTestId('cancel-reservation-button')).not.toBeInTheDocument()
    })

    it("n'affiche pas le bouton Réserver quand hasBooked=true", () => {
      render(
        <SlotDetailDialog
          slot={mockSlot}
          open={true}
          onOpenChange={vi.fn()}
          hasBooked={true}
          onBook={vi.fn()}
        />
      )

      expect(screen.queryByText('Réserver ce créneau')).not.toBeInTheDocument()
    })

    it('appelle onCancel lors du clic sur le bouton Annuler', () => {
      const onCancel = vi.fn()
      render(
        <SlotDetailDialog
          slot={mockSlot}
          open={true}
          onOpenChange={vi.fn()}
          hasBooked={true}
          onCancel={onCancel}
        />
      )

      fireEvent.click(screen.getByTestId('cancel-reservation-button'))
      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('affiche "Annulation..." quand isCancelling=true', () => {
      render(
        <SlotDetailDialog
          slot={mockSlot}
          open={true}
          onOpenChange={vi.fn()}
          hasBooked={true}
          onCancel={vi.fn()}
          isCancelling={true}
        />
      )

      const cancelButton = screen.getByTestId('cancel-reservation-button')
      expect(cancelButton).toHaveTextContent('Annulation...')
      expect(cancelButton).toBeDisabled()
    })
  })

  describe('Créneau annulé (soft-delete)', () => {
    const cancelledSlot: Slot = {
      ...mockSlot,
      cancelledAt: '2026-01-10T12:00:00Z',
      cancellationReason: 'Salle indisponible',
    }

    it('affiche l\'encart d\'annulation avec le motif', () => {
      render(
        <SlotDetailDialog
          slot={cancelledSlot}
          open={true}
          onOpenChange={vi.fn()}
          hasBooked={true}
          onCancel={vi.fn()}
        />
      )

      expect(screen.getByText('Créneau annulé')).toBeInTheDocument()
      expect(
        screen.getByText(/L'organisateur a annulé ce créneau\. Vous n'avez plus rien à faire\./)
      ).toBeInTheDocument()
      expect(screen.getByText(/Salle indisponible/)).toBeInTheDocument()
    })

    it('masque le bouton Réserver et le bouton Annuler ma réservation', () => {
      render(
        <SlotDetailDialog
          slot={cancelledSlot}
          open={true}
          onOpenChange={vi.fn()}
          onBook={vi.fn()}
          hasBooked={true}
          onCancel={vi.fn()}
        />
      )

      expect(screen.queryByText('Réserver ce créneau')).not.toBeInTheDocument()
      expect(screen.queryByTestId('cancel-reservation-button')).not.toBeInTheDocument()
      // Seul « Fermer » reste actionnable
      expect(screen.getByText('Fermer')).toBeInTheDocument()
    })
  })
})
