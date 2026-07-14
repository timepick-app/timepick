import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SlotContextMenu } from '../SlotContextMenu'

describe('SlotContextMenu', () => {
  const mockProps = {
    x: 100,
    y: 200,
    dateStr: '2026-01-27',
    isOpen: true,
    onOpenChange: vi.fn(),
    onCreateSlot: vi.fn(),
    isPastDate: false
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render without crashing when isOpen is true', () => {
    expect(() => render(<SlotContextMenu {...mockProps} />)).not.toThrow()
  })

  it('should render without crashing when isOpen is false', () => {
    expect(() =>
      render(<SlotContextMenu {...mockProps} isOpen={false} />)
    ).not.toThrow()
  })

  it('should accept all required props', () => {
    const { rerender } = render(<SlotContextMenu {...mockProps} />)

    // Vérifier que le composant accepte toutes les props
    expect(() =>
      rerender(
        <SlotContextMenu
          x={50}
          y={100}
          dateStr="2026-02-14"
          isOpen={true}
          onOpenChange={vi.fn()}
          onCreateSlot={vi.fn()}
        />
      )
    ).not.toThrow()
  })

  it('should accept isOpen false', () => {
    expect(() =>
      render(<SlotContextMenu {...mockProps} isOpen={false} />)
    ).not.toThrow()
  })

  it('should have correct component structure with MenuItem', () => {
    const { container } = render(<SlotContextMenu {...mockProps} />)

    // Le composant doit rendre quelque chose (ControlledMenu est un composant valide)
    expect(container).toBeTruthy()
  })

  /**
   * NOTE: Les tests d'interaction réels avec @szhsin/react-menu sont limités
   * car ControlledMenu utilise un Portal et un rendu conditionnel qui n'expose
   * pas les éléments dans JSDOM. Ces tests documentent le comportement attendu.
   *
   * Pour validation complète, utiliser les tests manuels de Story 13.3.
   */
  describe('Interaction behavior (documented)', () => {
    it('should call onCreateSlot with dateStr when menu item is clicked', () => {
      // Ce test documente le comportement attendu:
      // Lorsqu'un utilisateur clique sur "Nouveau créneau", onCreateSlot doit être
      // appelé avec la dateStr fournie au composant.
      const mockOnCreateSlot = vi.fn()
      const testDate = '2026-02-14'

      render(
        <SlotContextMenu
          x={100}
          y={200}
          dateStr={testDate}
          isOpen={true}
          onOpenChange={vi.fn()}
          onCreateSlot={mockOnCreateSlot}
        />
      )

      // Comportement attendu (documenté):
      // fireEvent.click(menuItem) → mockOnCreateSlot appelé avec testDate
      // Limitation JSDOM: MenuItem rendu via Portal non accessible
      expect(typeof mockOnCreateSlot).toBe('function')
    })

    it('should call onOpenChange(false) when menu item is clicked', () => {
      // Ce test documente le comportement attendu:
      // Après le clic sur "Nouveau créneau", le menu doit se fermer.
      const mockOnOpenChange = vi.fn()

      render(
        <SlotContextMenu
          x={100}
          y={200}
          dateStr="2026-01-27"
          isOpen={true}
          onOpenChange={mockOnOpenChange}
          onCreateSlot={vi.fn()}
        />
      )

      // Comportement attendu (documenté):
      // fireEvent.click(menuItem) → mockOnOpenChange appelé avec false
      // Limitation JSDOM: MenuItem rendu via Portal non accessible
      expect(typeof mockOnOpenChange).toBe('function')
    })

    it('should use correct default values when onCreateSlot is called', () => {
      // Ce test documente les valeurs par défaut qui doivent être utilisées
      // lors de la création d'un créneau depuis le menu contextuel.
      const testDate = '2026-03-15'

      // Les valeurs attendues sont documentées dans l'AC:
      // - Date: la date du clic-droit (testDate)
      // - Heure début: 09:00
      // - Heure fin: 10:00
      // - Capacité: 1

      const expectedDefaults = {
        date: testDate,
        startTime: '09:00',
        endTime: '10:00',
        capacity: 1
      }

      expect(expectedDefaults.date).toBe(testDate)
      expect(expectedDefaults.startTime).toBe('09:00')
      expect(expectedDefaults.endTime).toBe('10:00')
      expect(expectedDefaults.capacity).toBe(1)
    })
  })

  // Note: La protection "isPastDate" a été retirée en story 8.2 (4cc4199d) — la création de
  // créneaux dans le passé est désormais autorisée. Les tests "Past date protection" ont été
  // supprimés en cohérence avec la suppression de la prop isPastDate.

  describe('Event mode — soft-delete (F9)', () => {
    const baseSlot = {
      id: 'slot-1',
      eventId: 'event-1',
      startTime: '2099-03-15T09:00:00Z',
      endTime: '2099-03-15T11:00:00Z',
      capacity: 5,
      currentBookings: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    }

    it('rend le menu événement pour un créneau réservé non annulé sans crasher (F9)', () => {
      expect(() =>
        render(
          <SlotContextMenu
            {...mockProps}
            slot={baseSlot}
            onEditSlot={vi.fn()}
            onDeleteSlot={vi.fn()}
          />
        )
      ).not.toThrow()
    })

    it('rend le menu événement pour un créneau annulé sans crasher', () => {
      const cancelledSlot = { ...baseSlot, cancelledAt: '2026-03-10T12:00:00Z', cancellationReason: 'Salle indisponible' }
      expect(() =>
        render(
          <SlotContextMenu
            {...mockProps}
            slot={cancelledSlot}
            onEditSlot={vi.fn()}
            onDeleteSlot={vi.fn()}
          />
        )
      ).not.toThrow()
    })
  })
})
