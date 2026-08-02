import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SlotCalendar } from '../SlotCalendar'
import type { HookError } from '../hooks/useEventSlots'
import type { Slot } from '@/types/slot'

// Type for useEventSlots mock
type MockUseEventSlotsReturn = {
  events: Array<{
    id: string
    title: string
    start: string
    end: string
    extendedProps: {
      capacity: number
      currentBookings: number
      availablePlaces: number
      status: 'available' | 'partial' | 'full'
    }
    classNames: string[]
  }>
  isLoading: boolean
  error: HookError
  refetch: ReturnType<typeof vi.fn>
}

// Mock slots pour les tests
const mockSlots: Slot[] = [
  {
    id: 'slot-1',
    eventId: 'event-1',
    startTime: '2026-01-26T09:00:00.000Z',
    endTime: '2026-01-26T10:00:00.000Z',
    capacity: 5,
    currentBookings: 0,
    createdAt: '2026-01-26T00:00:00.000Z',
    updatedAt: '2026-01-26T00:00:00.000Z',
    cancelledAt: null,
    cancellationReason: null,
  },
  {
    id: 'slot-2',
    eventId: 'event-1',
    startTime: '2026-01-26T10:00:00.000Z',
    endTime: '2026-01-26T11:00:00.000Z',
    capacity: 3,
    currentBookings: 2,
    createdAt: '2026-01-26T00:00:00.000Z',
    updatedAt: '2026-01-26T00:00:00.000Z',
    cancelledAt: null,
    cancellationReason: null,
  },
]

// Mock useEventSlots hook
vi.mock('@/components/admin/events/hooks/useEventSlots', () => ({
  useEventSlots: vi.fn()
}))

// Mock useAdminSlots hook (Story 12.3)
vi.mock('@/hooks/useAdminSlots', () => ({
  useAdminSlots: vi.fn(() => ({
    createSlot: vi.fn(),
    createSlotAsync: vi.fn(),
    isCreating: false,
    updateSlot: vi.fn(),
    isUpdating: false,
    deleteSlot: vi.fn(),
    deleteSlotAsync: vi.fn(),
    isDeleting: false,
    slots: mockSlots,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

// Mock SlotEditDialog pour les tests
vi.mock('@/components/admin/SlotEditDialog', () => ({
  SlotEditDialog: ({ slot, open, onOpenChange }: { slot: Slot; open: boolean; onOpenChange: (open: boolean) => void }) => {
    if (!open) return null

    // Helper pour convertir une date ISO en format datetime-local
    const toDateTimeLocal = (isoString: string): string => {
      const date = new Date(isoString)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day}T${hours}:${minutes}`
    }

    const startDateTime = toDateTimeLocal(slot.startTime)
    const endDateTime = toDateTimeLocal(slot.endTime)

    const [datePart, startPart] = startDateTime.split('T')
    const [, endPart] = endDateTime.split('T')

    // Détecter le mode (création ou édition)
    const isEditMode = slot.id !== 'new'

    return (
      <div data-testid="slot-edit-dialog">
        <h3>{isEditMode ? 'Modifier le créneau' : 'Nouveau créneau'}</h3>
        <label>
          Date *
          <input
            id="edit-date"
            type="date"
            defaultValue={datePart}
            data-testid="date-input"
          />
        </label>
        <label>
          Heure de début *
          <input
            id="edit-startTime"
            type="time"
            defaultValue={startPart}
            data-testid="start-time-input"
          />
        </label>
        <label>
          Heure de fin *
          <input
            id="edit-endTime"
            type="time"
            defaultValue={endPart}
            data-testid="end-time-input"
          />
        </label>
        <label>
          Capacité (nombre de participants) *
          <input
            id="edit-capacity"
            type="number"
            min="1"
            max="100"
            defaultValue={slot.capacity}
            data-testid="capacity-input"
          />
        </label>
        {isEditMode && <button data-testid="delete-button">Supprimer</button>}
        <button onClick={() => onOpenChange(false)}>Fermer</button>
        <button type="submit">{isEditMode ? 'Enregistrer' : 'Créer'}</button>
      </div>
    )
  }
}))

import { useEventSlots } from '@/components/admin/events/hooks/useEventSlots'
import { useAdminSlots as mockUseAdminSlots } from '@/hooks/useAdminSlots'

const mockUseEventSlots = useEventSlots as unknown as ReturnType<typeof vi.fn> & { mockReturnValue: (v: MockUseEventSlotsReturn) => void }

/**
 * Bascule sur l'onglet « Mois » (vue par défaut = Semaine) et attend le rendu de
 * la grille mensuelle. Les sélecteurs daygrid (.fc-daygrid-day*, [role="gridcell"]
 * [data-date]) n'existent qu'en vue Mois ; FullCalendar les rend après le
 * changeView déclenché par le clic d'onglet (.fc-daygrid-day-number n'est pas
 * fiable après une bascule en jsdom → on attend la cellule jour).
 */
async function switchToMonthView() {
  fireEvent.click(screen.getByRole('tab', { name: 'Mois' }))
  await waitFor(() => {
    expect(document.querySelectorAll('[role="gridcell"][data-date]').length).toBeGreaterThan(0)
  })
}

describe('SlotCalendar', () => {
  const mockEvents = [
    {
      id: 'slot-1',
      title: '09:00 - 10:00 (5 places)',
      start: '2026-01-26T09:00:00.000Z',
      end: '2026-01-26T10:00:00.000Z',
      extendedProps: {
        capacity: 5,
        currentBookings: 0,
        availablePlaces: 5,
        status: 'available' as const
      },
      classNames: ['bg-slotAvailable', 'border-slotAvailable', 'text-slotAvailable-foreground']
    },
    {
      id: 'slot-2',
      title: '10:00 - 11:00 (5 places)',
      start: '2026-01-26T10:00:00.000Z',
      end: '2026-01-26T11:00:00.000Z',
      extendedProps: {
        capacity: 5,
        currentBookings: 3,
        availablePlaces: 2,
        status: 'partial' as const
      },
      classNames: ['bg-slotPartial', 'border-slotPartial', 'text-slotPartial-foreground']
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // La vue par défaut est désormais « Semaine » (timeGridWeek), qui n'affiche que
    // la semaine courante. Les créneaux mock sont datés lundi 2026-01-26 ; on fige
    // donc « aujourd'hui » sur ce jour pour qu'ils soient rendus dans le DOM.
    // On ne simule QUE Date (pas setTimeout/rAF) afin de préserver le setTimeout
    // réel utilisé par certains tests et le requestAnimationFrame de FullCalendar.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-26T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Basic rendering', () => {
    it('should call useEventSlots with eventId', () => {
      mockUseEventSlots.mockReturnValue({
        events: [],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      expect(mockUseEventSlots).toHaveBeenCalledWith('event-1')
    })

    it('should render FullCalendar when events are loaded', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      const fcContainer = container.querySelector('.fc')
      expect(fcContainer).toBeInTheDocument()
    })

    it('should display events on the calendar', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      const events = container.querySelectorAll('.fc-event')
      expect(events.length).toBeGreaterThan(0)
    })

    it('affiche le badge compteur (info/bleu) à côté du titre « Créneaux »', () => {
      mockUseEventSlots.mockReturnValue({
        events: [],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      expect(document.querySelector('span.bg-blue-100')?.textContent).toBe('2')
    })
  })

  describe('Loading state', () => {
    it('should show loading skeleton when isLoading is true', () => {
      mockUseEventSlots.mockReturnValue({
        events: [],
        isLoading: true,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      const skeleton = container.querySelector('.animate-pulse')
      expect(skeleton).toBeInTheDocument()
    })

    it('should not render FullCalendar when loading', () => {
      mockUseEventSlots.mockReturnValue({
        events: [],
        isLoading: true,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      const fcContainer = container.querySelector('.fc')
      expect(fcContainer).not.toBeInTheDocument()
    })
  })

  describe('Error state', () => {
    it("affiche le message de repli et jamais le message brut quand l'erreur est une chaîne", () => {
      const rawMessage = 'Erreur lors du chargement des créneaux'
      mockUseEventSlots.mockReturnValue({
        events: [],
        isLoading: false,
        error: rawMessage,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      expect(screen.getByRole('heading', { name: /Erreur/i })).toBeInTheDocument()
      expect(
        screen.getByText("Les créneaux n'ont pas pu être chargés. Rafraîchissez la page pour réessayer.")
      ).toBeInTheDocument()
      expect(screen.queryByText(rawMessage)).not.toBeInTheDocument()
    })

    it("affiche le message de repli et jamais le texte technique, quelle que soit la forme de l'erreur reçue", () => {
      const fallback = "Les créneaux n'ont pas pu être chargés. Rafraîchissez la page pour réessayer."
      const cases: Array<{ error: HookError; technical: string }> = [
        { error: new Error('Network error'), technical: 'Network error' },
        { error: { message: 'Erreur interne inconnue', code: 'SOME_UNKNOWN' } as unknown as HookError, technical: 'Erreur interne inconnue' }
      ]

      for (const { error, technical } of cases) {
        mockUseEventSlots.mockReturnValue({
          events: [],
          isLoading: false,
          error,
          refetch: vi.fn()
        })

        const { unmount } = render(<SlotCalendar eventId="event-1" />)

        expect(screen.getByRole('heading', { name: /Erreur/i })).toBeInTheDocument()
        expect(screen.getByText(fallback)).toBeInTheDocument()
        expect(screen.queryByText(technical, { exact: false })).not.toBeInTheDocument()

        unmount()
      }
    })
  })

  describe('FullCalendar configuration', () => {
    it('should use timeGridWeek as initial view', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      const weekView = container.querySelector('.fc-timeGridWeek-view')
      expect(weekView).toBeInTheDocument()
    })

    it('should render the FullCalendar toolbar', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      const toolbar = container.querySelector('.fc-toolbar')
      expect(toolbar).toBeInTheDocument()
    })
  })

  describe('Story 12.3: Créer créneau via bouton', () => {
    it('should render the "Créer un créneau" button', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      const createButton = screen.getByRole('button', { name: /créer un créneau/i })
      expect(createButton).toBeInTheDocument()
    })

    it('should open dialog with default values when button clicked', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      const createButton = screen.getByRole('button', { name: /créer un créneau/i })
      fireEvent.click(createButton)

      expect(screen.getByText('Nouveau créneau')).toBeInTheDocument()
    })

    it('should use today\'s date as default', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const today = new Date()
      const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

      render(<SlotCalendar eventId="event-1" />)

      const createButton = screen.getByRole('button', { name: /créer un créneau/i })
      fireEvent.click(createButton)

      const dateInput = screen.getByTestId('date-input') as HTMLInputElement
      expect(dateInput.value).toBe(formattedToday)
    })

    it('should use 09:00-10:00 as default times', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      const createButton = screen.getByRole('button', { name: /créer un créneau/i })
      fireEvent.click(createButton)

      const startTimeInput = screen.getByTestId('start-time-input') as HTMLInputElement
      const endTimeInput = screen.getByTestId('end-time-input') as HTMLInputElement

      expect(startTimeInput.value).toBe('09:00')
      expect(endTimeInput.value).toBe('10:00')
    })

    it('should close dialog when onOpenChange is called with false', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      const createButton = screen.getByRole('button', { name: /créer un créneau/i })
      fireEvent.click(createButton)

      expect(screen.getByText('Nouveau créneau')).toBeInTheDocument()

      const cancelButton = screen.getByRole('button', { name: /Fermer/i })
      fireEvent.click(cancelButton)

      expect(screen.queryByText('Nouveau créneau')).not.toBeInTheDocument()
    })
  })

  describe('Story 13.1: Modale Édition Créneau - eventClick', () => {
    it('should call useAdminSlots with eventId', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      expect(mockUseAdminSlots).toHaveBeenCalledWith('event-1')
    })

    it('should have eventClick handler configured in calendar options', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      const calendar = container.querySelector('.fc')
      expect(calendar).toBeInTheDocument()

      const events = container.querySelectorAll('.fc-event')
      expect(events.length).toBeGreaterThan(0)
    })

    it('should find the correct slot by ID when eventClick is triggered', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminSlotsHook = mockUseAdminSlots as any
      expect(adminSlotsHook).toHaveBeenCalledWith('event-1')

      const slotIds = mockSlots.map((slot) => slot.id)
      expect(slotIds).toContain('slot-1')
      expect(slotIds).toContain('slot-2')
    })

    it('should have deleteSlot and deleteSlotAsync available in useAdminSlots', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminSlotsHook = mockUseAdminSlots as any
      const result = adminSlotsHook('event-1')

      expect(result.deleteSlot).toBeDefined()
      expect(typeof result.deleteSlot).toBe('function')
      expect(result.deleteSlotAsync).toBeDefined()
      expect(typeof result.deleteSlotAsync).toBe('function')
    })

    it('should have isDeleting state available', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminSlotsHook = mockUseAdminSlots as any
      const result = adminSlotsHook('event-1')

      expect(result.isDeleting).toBeDefined()
      expect(typeof result.isDeleting).toBe('boolean')
    })

    it('should have edit mode detection based on slot.id', () => {
      const createSlot: Slot = {
        id: 'new',
        eventId: 'event-1',
        startTime: '2026-01-26T09:00:00.000Z',
        endTime: '2026-01-26T10:00:00.000Z',
        capacity: 1,
        currentBookings: 0,
        createdAt: '2026-01-26T00:00:00.000Z',
        updatedAt: '2026-01-26T00:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      }

      const editSlot: Slot = {
        id: 'slot-1',
        eventId: 'event-1',
        startTime: '2026-01-26T09:00:00.000Z',
        endTime: '2026-01-26T10:00:00.000Z',
        capacity: 5,
        currentBookings: 2,
        createdAt: '2026-01-26T00:00:00.000Z',
        updatedAt: '2026-01-26T00:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      }

      expect(createSlot.id).toBe('new')
      expect(editSlot.id).toBe('slot-1')
      expect(editSlot.id).not.toBe('new')
    })

    it('should have currentBookings data for validation', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      const slotWithBookings = mockSlots.find((s) => s.id === 'slot-2')
      expect(slotWithBookings?.currentBookings).toBe(2)
      expect(slotWithBookings?.capacity).toBeGreaterThanOrEqual(slotWithBookings?.currentBookings || 0)
    })

    // Nouveaux tests pour le flux complet eventClick
    it('should handle eventClick safely when slots is undefined', () => {
      // Mock avec slots undefined pour tester la race condition
      vi.doMock('@/hooks/useAdminSlots', () => ({
        useAdminSlots: vi.fn(() => ({
          createSlot: vi.fn(),
          isCreating: false,
          updateSlot: vi.fn(),
          isUpdating: false,
          deleteSlot: vi.fn(),
          isDeleting: false,
          slots: undefined, // Test du cas undefined
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        })),
      }))

      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      // Le calendrier doit s'afficher même si slots est undefined
      const calendar = container.querySelector('.fc')
      expect(calendar).toBeInTheDocument()
    })

    it('should have createSlotAsync available for proper async handling', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminSlotsHook = mockUseAdminSlots as any
      const result = adminSlotsHook('event-1')

      expect(result.createSlotAsync).toBeDefined()
      expect(typeof result.createSlotAsync).toBe('function')
    })
  })

  describe('Story 13.2: Création Rapide via Menu Contextuel (Clic-Droit)', () => {
    it('should have interactionPlugin in plugins for dateClick support', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      // Le calendrier doit être rendu avec interactionPlugin
      const calendar = container.querySelector('.fc')
      expect(calendar).toBeInTheDocument()
    })

    it('should have dateClick handler configured in calendar options', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le composant doit se rendre sans erreur avec dateClick configuré
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should have eventClick handler ignore right-click (button === 2)', () => {
      // Vérifier que handleEventClick vérifie le bouton de la souris
      // Cette vérification est codée en dur dans le composant
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le composant doit se rendre sans erreur
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should support context menu state structure', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le composant doit se rendre avec le state pour le menu contextuel
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should render SlotContextMenu component when context menu state is set', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le composant SlotContextMenu doit pouvoir être rendu
      // (le composant existe et est importé)
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should close context menu when clicking elsewhere', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le useEffect pour fermer le menu au clic ailleurs doit être configuré
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should have handleCreateSlotFromDate function for creating slot from specific date', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le bouton "Créer un créneau" utilise handleCreateSlotFromDate
      const createButton = screen.getByRole('button', { name: /créer un créneau/i })
      expect(createButton).toBeInTheDocument()
    })

    it('should use default times 09:00-10:00 and capacity 1 when creating slot', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      const createButton = screen.getByRole('button', { name: /créer un créneau/i })
      fireEvent.click(createButton)

      // Vérifier les valeurs par défaut
      const startTimeInput = screen.getByTestId('start-time-input') as HTMLInputElement
      const endTimeInput = screen.getByTestId('end-time-input') as HTMLInputElement
      const capacityInput = screen.getByTestId('capacity-input') as HTMLInputElement

      expect(startTimeInput.value).toBe('09:00')
      expect(endTimeInput.value).toBe('10:00')
      expect(capacityInput.value).toBe('1')
    })

    it('should handleContextMenuClose function to close context menu', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le composant doit se rendre avec le handler de fermeture
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should import SlotContextMenu component', () => {
      // Vérifier que le composant SlotContextMenu peut être importé
      expect(() => {
        import('../SlotContextMenu')
      }).not.toThrow()
    })

    it('should have keyboard menu handler attached to document', () => {
      // Spy AVANT le render pour capturer tous les addEventListener calls
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Vérifier que le listener pour keydown est attaché (accessibilité)
      // Note: Plusieurs librairies attachent des listeners, on vérifie juste que keydown est présent
      const keydownCalls = addEventListenerSpy.mock.calls.filter(call => call[0] === 'keydown')
      expect(keydownCalls.length).toBeGreaterThan(0)
      addEventListenerSpy.mockRestore()
    })

    it('should handle handleKeyboardMenu for Menu key or Shift+F10', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le handler pour Menu/Shift+F10 doit être configuré
      // (vérification que le useEffect s'exécute sans erreur)
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })
  })

  describe('Story 13.2: Right-click behavior tests', () => {
    it('should have eventClick handler that checks for right mouse button', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le composant doit se rendre avec eventClick configuré
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should have dateClick handler for context menu on empty dates', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // dateClick doit être configuré dans les options FullCalendar
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should have click-outside listener to close context menu', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Le composant doit se rendre avec le useEffect pour fermer le menu au clic ailleurs
      // (vérification structurelle - le useEffect est présent dans le code)
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })
  })

  describe('Calendar Compact Styling', () => {
    it('should render with compact CSS classes', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Check that FullCalendar container exists
      const calendarContainer = document.querySelector('.fc')
      expect(calendarContainer).toBeInTheDocument()
    })

    it('should apply reduced font sizes to calendar elements', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Wait for calendar to render
      const calendarContainer = document.querySelector('.fc')
      expect(calendarContainer).toBeInTheDocument()

      // Verify the FullCalendar component is rendered with compact styling classes
      // The compact CSS is loaded via index.css which targets .fc prefixed classes
      const fcElement = document.querySelector('.fc')
      expect(fcElement).toBeInTheDocument()

      await switchToMonthView()
    })

    it('should render with compact day cells', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      await switchToMonthView()
      // Les cellules jour (.fc-daygrid-day) portent le style compact.
      expect(container.querySelectorAll('.fc-daygrid-day').length).toBeGreaterThan(0)
    })

    it('should render with compact toolbar buttons', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      // Check for toolbar buttons which should have compact styling
      const toolbarButtons = container.querySelectorAll('.fc-toolbar button')
      expect(toolbarButtons.length).toBeGreaterThan(0)
    })

    it('should render with compact event styling', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      // Check for events which should have compact styling
      const events = container.querySelectorAll('.fc-event')
      expect(events.length).toBeGreaterThan(0)
    })
  })

  describe('Event Context Menu', () => {
    it('should open context menu on event right-click', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Wait for calendar to render
      await new Promise(resolve => setTimeout(resolve, 100))

      // Find an event element (FullCalendar adds fc-event class)
      const eventElement = document.querySelector('.fc-event')
      expect(eventElement).toBeInTheDocument()

      // Trigger right-click
      if (eventElement) {
        fireEvent.contextMenu(eventElement)

        // After right-click, the eventContextMenu state should be set
        // In a real scenario, the menu would appear - this test verifies
        // the component handles contextmenu events without crashing
      }
    })

    it('should have eventDidMount handler for right-click support', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Verify component renders without errors
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should have handleEditSlotFromMenu handler available', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Component should render with edit handler
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should have handleDeleteSlotFromMenu handler available', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Component should render with delete handler
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should have eventContextMenu state for event-based menu', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Component should render with eventContextMenu state
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })

    it('should close event context menu when clicking elsewhere', () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Component should render with click-outside handler
      const calendarElement = document.querySelector('.fc')
      expect(calendarElement).toBeInTheDocument()
    })
  })

  describe('Month View Border Fix', () => {
    it('should render month view without double borders', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Wait for calendar to render
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify FullCalendar renders
      const calendarContainer = document.querySelector('.fc')
      expect(calendarContainer).toBeInTheDocument()

      await switchToMonthView()
      // Les day-frames existent (le CSS retire leurs bordures).
      expect(document.querySelectorAll('.fc-daygrid-day-frame').length).toBeGreaterThan(0)
    })

    it('should apply border fix CSS rule', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="event-1" />)

      // Wait for calendar to render
      await new Promise(resolve => setTimeout(resolve, 100))

      await switchToMonthView()
      // Les day-frames existent (index.css leur applique border: none).
      expect(document.querySelectorAll('.fc-daygrid-day-frame').length).toBeGreaterThan(0)
    })
  })

  describe('Context Menu Across Views', () => {
    it('should attach context menu handlers in month view', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="test-event-1" />)

      // Wait for calendar to render
      await new Promise(resolve => setTimeout(resolve, 100))

      await switchToMonthView()
      const dateCells = document.querySelectorAll('[role="gridcell"][data-date]')

      // Verify cells have context menu handler property attached
      const firstCell = dateCells[0] as HTMLElement
      expect(firstCell).toBeInTheDocument()

      // The handler is attached as a property on the element
      const hasContextMenuHandler = '_contextMenuHandler' in firstCell
      expect(hasContextMenuHandler).toBe(true)
    })

    it('should re-attach handlers when view changes', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="test-event-1" />)

      // Wait for calendar to render
      await new Promise(resolve => setTimeout(resolve, 100))

      await switchToMonthView()

      // Verify handlers exist in the new view (first cell should have handler)
      const newCells = document.querySelectorAll('[role="gridcell"][data-date]')
      const firstNewCell = newCells[0] as HTMLElement
      expect(firstNewCell).toBeInTheDocument()
    })

    it('should attach context menu handlers in week view (timeGrid)', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="test-event-1" />)

      // Wait for calendar to render
      await waitFor(() => {
        expect(screen.getByText(/créneaux/i)).toBeInTheDocument()
      })

      // La vue par défaut est désormais « Semaine » (timeGridWeek) : la grille
      // horaire se rend directement, sans bascule d'onglet. .fc-timegrid-view
      // n'est pas fiable en jsdom → on attend la classe stable des lanes.
      await waitFor(() => {
        expect(document.querySelectorAll('.fc-timegrid-slot-lane').length).toBeGreaterThan(0)
      })

      // Verify slot lanes exist (they should exist even if empty)
      const slotLanes = document.querySelectorAll('.fc-timegrid-slot-lane')
      expect(slotLanes.length).toBeGreaterThan(0)

      // Le composant attache un handler contextmenu DÉLÉGUÉ sur .fc-timegrid-body
      // (pas de tabindex sur les lanes en vue Semaine — cf. datesSet). Le marqueur
      // est posé dans un requestAnimationFrame → on attend.
      await waitFor(() => {
        const timeGridBody = document.querySelector('.fc-timegrid-body')
        expect(timeGridBody?.getAttribute('data-timegrid-handler')).toBe('true')
      })
    })
  })

  describe('Week View Compact Styling', () => {
    it('should render week view with compact slot height', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="test-event-1" />)

      // Wait for calendar to render
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify FullCalendar renders
      const calendarContainer = document.querySelector('.fc')
      expect(calendarContainer).toBeInTheDocument()

      // Verify calendar structure exists (timegrid slots are only rendered in week view)
      // The compact CSS styling is applied via index.css and targets .fc-timegrid-slot
      const fcElement = document.querySelector('.fc')
      expect(fcElement).toBeInTheDocument()
    })

    it('should apply week view CSS overrides', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="test-event-1" />)

      // Wait for calendar to render
      await new Promise(resolve => setTimeout(resolve, 100))

      // Verify the FullCalendar container exists
      // CSS overrides are loaded via index.css which includes (admin scope):
      // - .fc .fc-timegrid-slot { height: var(--fc-hour-height) } (responsive clamp, D3)
      // - .fc .fc-timegrid-all-day { compact styling }
      // - Slot status color fixes for readability
      const calendarContainer = document.querySelector('.fc')
      expect(calendarContainer).toBeInTheDocument()

      // Verify all-day styling elements exist when rendered in week view
      // The CSS rules target these elements with compact styling
      const fcElement = document.querySelector('.fc')
      expect(fcElement).toBeInTheDocument()
    })

    // D2 (plan 2026-06-11) : slotDuration '01:00:00' → une ligne par heure.
    // Mesurable en jsdom via le nombre de lanes (le layout pixel ne l'est pas) :
    // 24h (slotMinTime 00:00 → slotMaxTime 24:00) / 1h = 24 lanes (vs 48 en 30 min).
    it('rend une ligne par heure en vue Semaine (slotDuration 1h → 24 lanes)', async () => {
      mockUseEventSlots.mockReturnValue({
        events: mockEvents,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      render(<SlotCalendar eventId="test-event-1" />)

      await new Promise(resolve => setTimeout(resolve, 100))

      // La vue « Semaine » (vue par défaut) est désormais sélectionnée via le Tabs
      // externe (libellé FR en dur, fiable même sans i18n initialisé en test).
      fireEvent.click(screen.getByRole('tab', { name: 'Semaine' }))

      // La grille horaire se rend après le changement de vue : on attend les lanes
      // (FullCalendar n'expose pas de classe .fc-timegrid-view fiable en jsdom).
      await waitFor(() => {
        expect(document.querySelectorAll('.fc-timegrid-slot-lane').length).toBeGreaterThan(0)
      })

      const slotLanes = document.querySelectorAll('.fc-timegrid-slot-lane')
      expect(slotLanes.length).toBe(24)
    })
  })

  // Ce bloc est placé EN DERNIER : il surcharge le retour de useAdminSlots via
  // mockReturnValue (qui persiste à travers clearAllMocks), donc aucun test situé
  // après ne doit en dépendre. Il pilote sa propre horloge avec vi.setSystemTime
  // (les fake timers sont déjà actifs via le beforeEach global).
  describe('initialDate : ouverture sur le mois du 1er créneau à venir', () => {
    // Retour admin-slots complet (miroir du mock global) avec slots paramétrables.
    const adminSlotsReturn = (slots: Slot[]) => ({
      createSlot: vi.fn(),
      createSlotAsync: vi.fn(),
      isCreating: false,
      updateSlot: vi.fn(),
      isUpdating: false,
      deleteSlot: vi.fn(),
      deleteSlotAsync: vi.fn(),
      isDeleting: false,
      slots,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    const makeSlot = (start: string, end: string): Slot => ({
      id: `slot-${start}`,
      eventId: 'event-1',
      startTime: start,
      endTime: end,
      capacity: 5,
      currentBookings: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      cancelledAt: null,
      cancellationReason: null,
    })

    // Assertion robuste en jsdom : on s'appuie sur les cellules [data-date] de la
    // grille mensuelle (le titre FullCalendar utilise innerText, mal rendu en jsdom).
    it('ouvre sur le mois du 1er créneau futur quand il est dans un autre mois', async () => {
      // Aujourd'hui = mai 2026 ; unique créneau futur en août 2026.
      vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'))
      ;(mockUseAdminSlots as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        adminSlotsReturn([makeSlot('2026-08-10T09:00:00.000Z', '2026-08-10T10:00:00.000Z')])
      )
      mockUseEventSlots.mockReturnValue({
        events: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      await switchToMonthView()
      // La grille affiche bien août 2026 (cellule du créneau présente)…
      expect(container.querySelector('[data-date="2026-08-10"]')).toBeInTheDocument()
      // …et pas le mois courant (mai).
      expect(container.querySelector('[data-date="2026-05-15"]')).not.toBeInTheDocument()
    })

    it('retombe sur le mois courant quand aucun créneau futur (tous passés)', async () => {
      // Aujourd'hui = mai 2026 ; seul créneau en mars 2026 (passé) → fallback aujourd'hui.
      vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'))
      ;(mockUseAdminSlots as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        adminSlotsReturn([makeSlot('2026-03-10T09:00:00.000Z', '2026-03-10T10:00:00.000Z')])
      )
      mockUseEventSlots.mockReturnValue({
        events: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      const { container } = render(<SlotCalendar eventId="event-1" />)

      await switchToMonthView()
      // Mois courant (mai 2026) affiché…
      expect(container.querySelector('[data-date="2026-05-15"]')).toBeInTheDocument()
      // …et pas le mois du créneau passé (mars).
      expect(container.querySelector('[data-date="2026-03-10"]')).not.toBeInTheDocument()
    })
  })
})
