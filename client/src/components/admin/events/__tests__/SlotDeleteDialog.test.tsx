import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlotDeleteDialog } from '../SlotDeleteDialog'
import type { Slot } from '@/types/slot'

// Mock des primitives AlertDialog (Radix) : on rend les enfants quand `open`,
// les boutons en <button> natifs. La logique conditionnelle de wording du
// composant (titre/corps/bouton/motif) s'exécute telle quelle.
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    <div data-testid="alert-dialog-root">{open ? children : null}</div>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 className={className}>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogAction: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}>{children}</button>
  ),
  AlertDialogCancel: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <button disabled={disabled}>{children}</button>
  ),
}))

vi.mock('lucide-react', () => ({
  AlertTriangle: ({ className }: { className?: string }) => <span data-testid="alert-triangle" className={className} />,
}))

const makeSlot = (currentBookings: number): Slot => ({
  id: 'slot-1',
  eventId: 'event-1',
  startTime: '2026-06-15T09:00:00.000Z',
  endTime: '2026-06-15T11:00:00.000Z',
  capacity: 5,
  currentBookings,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
})

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onConfirm: vi.fn(),
}

describe('SlotDeleteDialog — wording conditionnel au nombre d\'inscrits', () => {
  describe('0 inscrit → suppression définitive', () => {
    it('affiche le titre « Supprimer définitivement », « irréversible », sans champ motif', () => {
      render(<SlotDeleteDialog {...baseProps} slot={makeSlot(0)} />)

      expect(screen.getByText(/Supprimer définitivement ce créneau/)).toBeInTheDocument()
      expect(screen.getByText(/Cette action est irréversible/)).toBeInTheDocument()
      // Pas de wording d'annulation, pas de champ motif.
      expect(screen.queryByText(/Annuler ce créneau/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Motif d.?annulation/i)).not.toBeInTheDocument()
      // Bouton d'action « Supprimer ».
      expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument()
    })
  })

  describe('≥1 inscrit → annulation (soft-delete)', () => {
    it('au singulier (1 inscrit) : titre « Annuler ce créneau ? », réservation conservée, champ motif', () => {
      render(<SlotDeleteDialog {...baseProps} slot={makeSlot(1)} />)

      expect(screen.getByText(/Annuler ce créneau/)).toBeInTheDocument()
      expect(screen.getByText(/sa réservation est conservée/)).toBeInTheDocument()
      expect(screen.getByText(/Motif d.?annulation/i)).toBeInTheDocument()
      // Pas de wording de suppression définitive.
      expect(screen.queryByText(/Supprimer définitivement/)).not.toBeInTheDocument()
      // Bouton d'action « Annuler le créneau ».
      expect(screen.getByRole('button', { name: 'Annuler le créneau' })).toBeInTheDocument()
    })

    it('au pluriel (2 inscrits) : décompte + réservations conservées + champ motif', () => {
      render(<SlotDeleteDialog {...baseProps} slot={makeSlot(2)} />)

      expect(screen.getByText(/Annuler ce créneau/)).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText(/leurs réservations sont conservées/)).toBeInTheDocument()
      expect(screen.getByText(/Motif d.?annulation/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Annuler le créneau' })).toBeInTheDocument()
    })
  })

  it('reflète l\'état de chargement (isDeleting) selon le cas', () => {
    const { rerender } = render(<SlotDeleteDialog {...baseProps} slot={makeSlot(0)} isDeleting />)
    expect(screen.getByRole('button', { name: 'Suppression...' })).toBeInTheDocument()

    rerender(<SlotDeleteDialog {...baseProps} slot={makeSlot(2)} isDeleting />)
    expect(screen.getByRole('button', { name: 'Annulation...' })).toBeInTheDocument()
  })
})

describe('SlotDeleteDialog — reset du motif à la fermeture', () => {
  it('vide le motif quand la dialog se ferme, évitant la fuite entre créneaux', () => {
    const { rerender } = render(<SlotDeleteDialog {...baseProps} open slot={makeSlot(1)} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Salle indisponible' } })
    expect(textarea).toHaveValue('Salle indisponible')

    // Fermeture pilotée par le parent (open=false), puis réouverture pour un autre
    // créneau : le champ doit repartir vide.
    rerender(<SlotDeleteDialog {...baseProps} open={false} slot={makeSlot(1)} />)
    rerender(<SlotDeleteDialog {...baseProps} open slot={makeSlot(2)} />)

    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
