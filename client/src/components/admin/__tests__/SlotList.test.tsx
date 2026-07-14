import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SlotList } from '../SlotList'
import type { Slot } from '@/types/slot'

// Mock du SlotEditDialog
vi.mock('../SlotEditDialog', () => ({
  SlotEditDialog: ({ slot, onOpenChange }: { slot: Slot; onOpenChange: (open: boolean) => void }) => (
    <div data-testid="slot-edit-dialog" data-slot-id={slot.id}>
      <button onClick={() => onOpenChange(false)}>Close</button>
    </div>
  ),
}))

// Mock du SlotDeleteDialog (dans le sous-dossier events/)
vi.mock('../events/SlotDeleteDialog', () => ({
  SlotDeleteDialog: ({ slot, onOpenChange }: { slot: Slot | null; onOpenChange: (open: boolean) => void }) => (
    <div data-testid="slot-delete-dialog" data-slot-id={slot?.id || 'none'}>
      <button onClick={() => onOpenChange(false)}>Close</button>
    </div>
  ),
}))

// Mock par défaut des slots — dates FUTURES (2099) pour que le badge E2
// « N places » s'affiche (statut Disponible/Partiel, non « Passé »).
const defaultMockSlots: Slot[] = [
  {
    id: 'slot-1',
    eventId: 'event-1',
    startTime: new Date('2099-03-15T09:00:00Z').toISOString(),
    endTime: new Date('2099-03-15T11:00:00Z').toISOString(),
    capacity: 5,
    currentBookings: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cancelledAt: null,
    cancellationReason: null,
  },
  {
    id: 'slot-2',
    eventId: 'event-1',
    startTime: new Date('2099-03-15T14:00:00Z').toISOString(),
    endTime: new Date('2099-03-15T16:00:00Z').toISOString(),
    capacity: 3,
    currentBookings: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cancelledAt: null,
    cancellationReason: null,
  }
]

// Mock du hook useAdminSlots - variable mutable pour les tests
let mockSlots = defaultMockSlots
const mockDeleteSlotAsync = vi.fn()

vi.mock('../../../hooks/useAdminSlots', () => ({
  useAdminSlots: () => ({
    slots: mockSlots,
    isLoading: false,
    error: null,
    deleteSlotAsync: mockDeleteSlotAsync,
    isDeleting: false
  })
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('SlotList', () => {
  const mockEventId = 'test-event-id'

  beforeEach(() => {
    vi.clearAllMocks()
    mockSlots = defaultMockSlots
  })

  it('affiche la liste des créneaux', () => {
    render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

    // Vérifier que les plages horaires sont affichées (format compact « HHhmm → HHhmm »)
    expect(screen.getAllByText(/→/).length).toBeGreaterThan(0)
  })

  it('affiche le badge de places disponibles (fusion statut↔places E2)', () => {
    render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

    // Le badge E2 « N places » remplace l'ancien « Places disponibles: X ».
    // slot-1 (3 places, partiel) + slot-2 (3 places, dispo) ; badge rendu pour les
    // deux layouts (CSS-toggle) → au moins 2 occurrences.
    expect(screen.getAllByText(/3 places/i).length).toBeGreaterThanOrEqual(2)
  })

  it('affiche les boutons Modifier et Supprimer (icône) pour chaque créneau', () => {
    render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

    const editButtons = screen.getAllByLabelText('Modifier le créneau')
    const deleteButtons = screen.getAllByLabelText('Supprimer le créneau')

    expect(editButtons).toHaveLength(2)
    expect(deleteButtons).toHaveLength(2)
  })

  it('ouvre le dialog de suppression quand on clique sur l\'icône supprimer', async () => {
    const user = userEvent.setup()

    render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

    const deleteButtons = screen.getAllByLabelText('Supprimer le créneau')
    await user.click(deleteButtons[0])

    // Le SlotDeleteDialog mocké devrait être affiché
    expect(screen.getByTestId('slot-delete-dialog')).toBeInTheDocument()
  })

  it('ouvre le dialog d\'édition quand on clique sur Modifier', async () => {
    const user = userEvent.setup()

    render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

    const editButtons = screen.getAllByLabelText('Modifier le créneau')
    await user.click(editButtons[0])

    // Le SlotEditDialog mocké devrait être affiché
    expect(screen.getByTestId('slot-edit-dialog')).toBeInTheDocument()
  })

  it('affiche l\'état vide quand aucun créneau n\'existe', () => {
    // Override du mock pour retourner une liste vide
    mockSlots = []

    render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

    expect(screen.getByText('Aucun créneau créé')).toBeInTheDocument()
    expect(screen.getByText(/Commencez par créer/)).toBeInTheDocument()
  })

  it('affiche le badge « Complet » pour un créneau saturé', () => {
    const fullSlot: Slot = {
      id: 'full-slot',
      eventId: 'event-1',
      // Date dans le futur pour que le statut 'past' ne masque pas 'full'
      // (getSlotStatus retourne 'past' avant de vérifier la capacité)
      startTime: new Date('2099-03-15T09:00:00Z').toISOString(),
      endTime: new Date('2099-03-15T11:00:00Z').toISOString(),
      capacity: 3,
      currentBookings: 3, // Complet
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cancelledAt: null,
      cancellationReason: null,
    }

    // Override du mock pour inclure un créneau complet
    mockSlots = [fullSlot]

    render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

    expect(screen.getAllByText('Complet').length).toBeGreaterThan(0)
  })

  describe('Créneau annulé (soft-delete)', () => {
    const cancelledSlot: Slot = {
      id: 'slot-cancelled',
      eventId: 'event-1',
      startTime: new Date('2099-03-15T09:00:00Z').toISOString(),
      endTime: new Date('2099-03-15T11:00:00Z').toISOString(),
      capacity: 5,
      currentBookings: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cancelledAt: '2026-03-10T12:00:00Z',
      cancellationReason: 'Salle indisponible',
    }

    it('affiche le badge « Annulé », le motif et remplace le bouton supprimer par la date', () => {
      mockSlots = [cancelledSlot]
      render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

      expect(screen.getAllByText('Annulé').length).toBeGreaterThan(0)
      expect(screen.getByText(/Salle indisponible/)).toBeInTheDocument()
      expect(screen.getByText(/Annulé le/)).toBeInTheDocument()
      // Le bouton supprimer (icône) n'est plus rendu pour un créneau annulé
      expect(screen.queryByLabelText('Supprimer le créneau')).not.toBeInTheDocument()
    })

    it('F9 : le bouton supprimer reste actif pour un créneau réservé non annulé', () => {
      // slot-1 du mock par défaut a currentBookings: 2
      render(<SlotList eventId={mockEventId} />, { wrapper: createWrapper() })

      const deleteButtons = screen.getAllByLabelText('Supprimer le créneau')
      expect(deleteButtons[0]).not.toBeDisabled()
    })
  })
})
