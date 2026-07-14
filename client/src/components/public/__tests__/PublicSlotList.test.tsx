import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PublicSlotList } from '../PublicSlotList'
import type { Slot } from '../../../types/slot'

/**
 * Fabrique un créneau. Les dates sont volontairement en mars 2026 ; l'horloge
 * est gelée au 2026-03-01 (beforeEach) pour qu'aucun créneau ne soit « passé ».
 */
function makeSlot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: 'slot-1',
    eventId: 'event-1',
    startTime: '2026-03-15T10:00:00Z',
    endTime: '2026-03-15T12:00:00Z',
    capacity: 3,
    currentBookings: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    cancelledAt: null,
    cancellationReason: null,
    ...overrides,
  }
}

describe('PublicSlotList', () => {
  // Freeze system time so the hardcoded 2026-03 mock slots remain in the
  // future relative to "now". The real "today" (2026-06-20) would otherwise
  // marquer tous les créneaux comme « Terminé » et casser les assertions sur
  // les boutons Réserver/Voir.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Grouped agenda', () => {
    it('regroupe et affiche les créneaux de jours distincts', () => {
      const slots = [
        makeSlot({ id: 'slot-15a', startTime: '2026-03-15T10:00:00Z', endTime: '2026-03-15T12:00:00Z' }),
        makeSlot({ id: 'slot-16', startTime: '2026-03-16T14:00:00Z', endTime: '2026-03-16T16:00:00Z' }),
      ]

      render(<PublicSlotList slots={slots} />)

      const root = screen.getByTestId('public-slot-list')
      const text = root.textContent ?? ''

      // Chaque jour occupé porte un marqueur de date (« d MMM »).
      expect(text).toContain('15 mars')
      expect(text).toContain('16 mars')
    })

    it('porte le data-testid racine', () => {
      render(<PublicSlotList slots={[makeSlot()]} />)
      expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
    })
  })

  describe('Description complète (jamais tronquée)', () => {
    it('affiche la description entière même au-delà de 50 caractères', () => {
      // L'ancien SlotCard tronquait à 50 caractères ; le composant partagé
      // SlotAgendaList rend la description complète (break-words).
      const longDescription =
        'Atelier de poterie céramique pour débutants et initiés, tout le matériel est fourni sur place.'
      expect(longDescription.length).toBeGreaterThan(50)

      render(<PublicSlotList slots={[makeSlot({ description: longDescription })]} />)

      // Texte intégral présent — pas d'ellipsis « ... ».
      expect(screen.getByText(longDescription)).toBeInTheDocument()
      expect(screen.queryByText(/Atelier de poterie céramique pour débutants et init\.\.\./)).not.toBeInTheDocument()
    })
  })

  describe('Bouton d action membre', () => {
    it('affiche « Réserver » pour un créneau disponible et déclenche onReserveSlot (réservation directe)', () => {
      const onReserveSlot = vi.fn()
      render(
        <PublicSlotList
          slots={[makeSlot({ id: 'slot-open', currentBookings: 0, capacity: 3 })]}
          onReserveSlot={onReserveSlot}
        />,
      )

      const button = screen.getByRole('button', { name: 'Réserver' })
      expect(button).not.toBeDisabled()
      button.click()

      expect(onReserveSlot).toHaveBeenCalledTimes(1)
      expect(onReserveSlot).toHaveBeenCalledWith('slot-open')
    })

    it('affiche « Annuler » (outline-destructive) pour un créneau réservé et déclenche onCancelSlot', () => {
      const onCancelSlot = vi.fn()
      render(
        <PublicSlotList
          slots={[makeSlot({ id: 'slot-mine', currentBookings: 1, capacity: 3 })]}
          bookedSlotIds={new Set(['slot-mine'])}
          onCancelSlot={onCancelSlot}
        />,
      )

      const button = screen.getByRole('button', { name: 'Annuler' })
      expect(button).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Voir' })).not.toBeInTheDocument()
      button.click()
      expect(onCancelSlot).toHaveBeenCalledWith('slot-mine')
    })

    it('affiche « Complet » (désactivé) pour un créneau complet', () => {
      render(<PublicSlotList slots={[makeSlot({ currentBookings: 3, capacity: 3 })]} />)

      const button = screen.getByRole('button', { name: 'Complet' })
      expect(button).toBeDisabled()
    })

    it('affiche « Terminé » (désactivé) pour un créneau passé', () => {
      render(<PublicSlotList slots={[makeSlot({ endTime: '2026-02-15T12:00:00Z' })]} />)

      const button = screen.getByRole('button', { name: 'Terminé' })
      expect(button).toBeDisabled()
    })

    it('rend le bouton disponible désactivé en mode consultatif (disabled)', () => {
      render(
        <PublicSlotList
          slots={[makeSlot({ currentBookings: 0, capacity: 3 })]}
          disabled
        />,
      )

      // Le libellé reste « Réserver » mais le bouton est désactivé.
      expect(screen.getByRole('button', { name: 'Réserver' })).toBeDisabled()
    })

    it('affiche le motif inline et aucun CTA pour un créneau annulé (remarque #27)', () => {
      render(
        <PublicSlotList
          slots={[makeSlot({ id: 'slot-cancel', cancelledAt: '2026-02-20T12:00:00Z', cancellationReason: 'Salle indisponible' })]}
        />,
      )

      // Le motif est rendu directement dans la rangée…
      expect(screen.getByText(/Salle indisponible/)).toBeInTheDocument()
      // …et il n'y a plus de CTA « Voir » (ni aucun autre bouton d'action).
      expect(screen.queryByRole('button', { name: 'Voir' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('État vide', () => {
    it("affiche le titre et le texte d'aide quand aucun créneau", () => {
      render(<PublicSlotList slots={[]} />)

      expect(screen.getByText('Aucun créneau disponible')).toBeInTheDocument()
      expect(screen.getByText(/Les créneaux de participation seront affichés ici/)).toBeInTheDocument()
    })

    it("affiche l'icône CalendarX (DS) en ton muted", () => {
      const { container } = render(<PublicSlotList slots={[]} />)

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveClass('h-12', 'w-12', 'text-muted-foreground')
    })
  })

  describe('Indicateur de filtrage', () => {
    it("s'affiche quand isFiltered=true et allSlotsCount fourni", () => {
      render(<PublicSlotList slots={[makeSlot()]} allSlotsCount={10} isFiltered />)

      expect(screen.getByText(/1 \/ 10 créneaux/)).toBeInTheDocument()
    })

    it("ne s'affiche pas quand isFiltered=false", () => {
      render(<PublicSlotList slots={[makeSlot()]} allSlotsCount={10} isFiltered={false} />)

      expect(screen.queryByText(/créneaux/)).not.toBeInTheDocument()
    })

    it("ne s'affiche pas quand allSlotsCount est absent", () => {
      render(<PublicSlotList slots={[makeSlot()]} isFiltered />)

      expect(screen.queryByText(/créneaux/)).not.toBeInTheDocument()
    })
  })
})
