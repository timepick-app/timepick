import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventDeleteDialog } from '../EventDeleteDialog'
import type { Event } from '@/hooks/useEvents'

// Mock des composants shadcn/ui
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) => (
    <div data-open={open} data-testid="dialog-root">
      {open && children}
    </div>
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h2 data-testid="dialog-title" className={className}>{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-testid="dialog-description">{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
}))

// Mock du composant Button
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}))

// Mock de lucide-react
vi.mock('lucide-react', () => ({
  AlertTriangle: ({ className }: { className?: string }) => <span data-testid="alert-triangle" className={className} />,
}))

describe('EventDeleteDialog', () => {
  const mockEvent: Event = {
    id: 'event-123',
    name: 'Événement Test',
    description: 'Description test',
    isPublished: true,
    opensAt: '2026-01-25T10:00:00Z',
    hasCustomInvitation: false,
    periodStart: null,
    periodEnd: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }

  const mockOnOpenChange = vi.fn()
  const mockOnConfirm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * AC2: Test de l'affichage de la dialog avec le nom de l'événement
   */
  it('should render dialog with event name and warning message', () => {
    render(
      <EventDeleteDialog
        event={mockEvent}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={false}
      />
    )

    // Vérifier que le titre est affiché
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Supprimer l\'événement')

    // Vérifier que le nom de l'événement est affiché
    expect(screen.getByTestId('dialog-description')).toHaveTextContent(/Événement Test/)

    // Vérifier l'icône d'avertissement
    expect(screen.getAllByTestId('alert-triangle')).toHaveLength(2) // Une dans le titre, une dans le warning

    // Vérifier le message d'irréversibilité
    expect(screen.getByText(/irréversible/i)).toBeInTheDocument()

    // Vérifier la liste des conséquences
    expect(screen.getByText(/créneaux horaires associés/i)).toBeInTheDocument()
    expect(screen.getByText(/réservations confirmées/i)).toBeInTheDocument()
  })

  /**
   * AC4: Test du bouton « Fermer » ferme la dialog sans supprimer
   */
  it('should close dialog when Fermer button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <EventDeleteDialog
        event={mockEvent}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={false}
      />
    )

    const cancelButton = screen.getByRole('button', { name: 'Fermer' })
    await user.click(cancelButton)

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })

  /**
   * AC3: Test du bouton Supprimer appelle onConfirm
   */
  it('should call onConfirm when Supprimer button is clicked', async () => {
    const user = userEvent.setup()
    mockOnConfirm.mockResolvedValue(undefined)

    render(
      <EventDeleteDialog
        event={mockEvent}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={false}
      />
    )

    const deleteButton = screen.getByRole('button', { name: 'Supprimer' })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith('event-123')
    })
  })

  /**
   * Test: Boutons disabled pendant la suppression
   */
  it('should disable buttons during deletion', () => {
    render(
      <EventDeleteDialog
        event={mockEvent}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={true}
      />
    )

    const buttons = screen.getAllByRole('button')
    const cancelButton = buttons.find(btn => btn.textContent === 'Fermer')
    const deleteButton = buttons.find(btn => btn.textContent === 'Suppression...')

    expect(cancelButton).toBeDisabled()
    expect(deleteButton?.textContent).toBe('Suppression...')
  })

  /**
   * Test: Ne pas afficher la dialog si open=false
   */
  it('should not render dialog content when open is false', () => {
    render(
      <EventDeleteDialog
        event={mockEvent}
        open={false}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={false}
      />
    )

    expect(screen.queryByTestId('dialog-content')).not.toBeInTheDocument()
  })

  /**
   * Test: Ne pas fermer la dialog pendant la suppression
   */
  it('should not close dialog during deletion when trying to close', async () => {
    const user = userEvent.setup()

    render(
      <EventDeleteDialog
        event={mockEvent}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={true}
      />
    )

    const cancelButton = screen.getByRole('button', { name: 'Fermer' })
    await user.click(cancelButton)

    // Pendant la suppression, onOpenChange ne doit PAS être appelé avec false
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false)
  })

  /**
   * Test: La gestion des erreurs est déléguée au hook useDeleteEvent
   * Le composant appelle onConfirm avec le bon eventId
   */
  it('should call onConfirm with correct eventId', async () => {
    const user = userEvent.setup()

    render(
      <EventDeleteDialog
        event={mockEvent}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={false}
      />
    )

    const deleteButton = screen.getByRole('button', { name: 'Supprimer' })
    await user.click(deleteButton)

    // onConfirm doit être appelé avec l'ID de l'événement
    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalledWith('event-123')
    })
  })

  /**
   * Test: event=null ne casse pas le composant
   */
  it('should handle null event gracefully', () => {
    render(
      <EventDeleteDialog
        event={null}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={false}
      />
    )

    // Le composant doit s'afficher même sans événement
    expect(screen.getByTestId('dialog-content')).toBeInTheDocument()
  })

  /**
   * Test: Variantes de boutons correctes
   * Le bouton Supprimer utilise variant="outline" avec styling rouge personnalisé
   */
  it('should have correct button variants', () => {
    render(
      <EventDeleteDialog
        event={mockEvent}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={false}
      />
    )

    const buttons = screen.getAllByRole('button')
    const cancelButton = buttons.find(btn => btn.textContent === 'Fermer')
    const deleteButton = buttons.find(btn => btn.textContent === 'Supprimer')

    // Le bouton « Fermer » est en variant="outline" et le bouton Supprimer en "outline-destructive"
    // (commit c9afcb8 — soften aggressive destructive buttons)
    expect(cancelButton?.dataset.variant).toBe('outline')
    expect(deleteButton?.dataset.variant).toBe('outline-destructive')
  })

  /**
   * Test: Avertissement couleur destructive
   */
  it('should have destructive color on title icon', () => {
    render(
      <EventDeleteDialog
        event={mockEvent}
        open={true}
        onOpenChange={mockOnOpenChange}
        onConfirm={mockOnConfirm}
        isDeleting={false}
      />
    )

    // Le titre a la classe text-destructive (sur DialogTitle)
    const title = screen.getByTestId('dialog-title')
    expect(title.className).toContain('text-destructive')

    // Il y a deux AlertTriangle (une dans le titre, une dans la zone d'avertissement)
    const icons = screen.getAllByTestId('alert-triangle')
    expect(icons.length).toBeGreaterThanOrEqual(1)
  })
})
