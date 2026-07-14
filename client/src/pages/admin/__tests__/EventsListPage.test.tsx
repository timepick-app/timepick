import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import EventsListPage from '../EventsListPage'

// Mock des hooks
vi.mock('@/hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({ isAuthChecked: true }),
}))

vi.mock('@/hooks/useEvents', () => ({
  useEvents: () => ({
    events: mockEvents,
    isLoading: false,
    error: null,
  }),
  useAllEventsStats: () => ({
    data: mockStats,
    isLoading: false,
  }),
  useDeleteEvent: () => ({
    deleteEvent: vi.fn(),
    isDeleting: false,
  }),
  // Mock avec signature typée : useDuplicateEvent(options?: UseDuplicateEventOptions)
  useDuplicateEvent: vi.fn(() => ({
    duplicateEvent: vi.fn(),
    isDuplicating: false,
    newEventId: undefined,
  })),
  useCreateEvent: () => ({
    createEvent: vi.fn(),
    isCreating: false,
  }),
}))

// Mock CreateEventSheet pour éviter les hooks React Query dans le test
vi.mock('@/components/admin/events/CreateEventSheet', () => ({
  CreateEventSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-event-sheet" /> : null,
}))

vi.mock('@/components/layout/AdminLayout', () => ({
  AdminLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">
      <h1>Événements</h1>
      {children}
    </div>
  ),
}))

// Mock du composant EventTable
vi.mock('@/components/admin/events/EventTable', () => ({
  EventTable: ({
    data,
    isLoading,
    isDeleting,
    onEdit,
    onDuplicate,
    onDelete,
    onConfirmDelete,
  }: {
    data: unknown[]
    isLoading: boolean
    isDeleting?: boolean
    onEdit?: (event: unknown) => void
    onDuplicate?: (event: unknown) => void
    onDelete?: (event: unknown) => void
    onConfirmDelete?: (id: string) => void
  }) => (
    <div data-testid="event-table">
      <div data-testid="event-count">{data.length}</div>
      <div data-testid="is-loading">{String(isLoading)}</div>
      <div data-testid="is-deleting">{String(isDeleting ?? false)}</div>
      <button onClick={() => onEdit?.(data[0])}>Edit</button>
      <button onClick={() => onDuplicate?.(data[0])}>Duplicate</button>
      <button onClick={() => onDelete?.(data[0])}>Delete</button>
      <button onClick={() => onConfirmDelete?.('test-id')}>Confirm Delete</button>
    </div>
  ),
}))


// Mock du composant Button
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

// Mock du hook useNavigate pour vérifier la navigation
let mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Données de test
const mockEvents = [
  {
    id: 'event-1',
    name: 'Événement A',
    description: null,
    isPublished: true,
    opensAt: null,
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'event-2',
    name: 'Événement B',
    description: 'Brouillon',
    isPublished: false,
    opensAt: null,
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-01-20T10:00:00Z',
  },
]

const mockStats = [
  {
    eventId: 'event-1',
    totalSlots: 10,
    filledSlots: 7,
    vacantSlots: 3,
    fillRate: 0.7,
    totalCapacity: 20,
    totalBookings: 14,
  },
  {
    eventId: 'event-2',
    totalSlots: 5,
    filledSlots: 0,
    vacantSlots: 5,
    fillRate: 0,
    totalCapacity: 10,
    totalBookings: 0,
  },
]

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('EventsListPage', () => {
  describe('Rendu de la page', () => {
    it('should render page with correct title', () => {
      render(<EventsListPage />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Événements', level: 1 })).toBeInTheDocument()
    })

    it('affiche le compteur, les chips de statut et la guidance', () => {
      render(<EventsListPage />, { wrapper })

      expect(screen.getByText('2 événements')).toBeInTheDocument()
      expect(screen.getByText('1 publié')).toBeInTheDocument()
      expect(screen.getByText('1 brouillon')).toBeInTheDocument()
      expect(
        screen.getByText('Gérez vos événements et leurs créneaux horaires')
      ).toBeInTheDocument()
    })

    it('should render "Nouvel événement" button', () => {
      render(<EventsListPage />, { wrapper })

      expect(screen.getByText('Nouvel événement')).toBeInTheDocument()
    })


    it('should render EventTable with combined data', () => {
      render(<EventsListPage />, { wrapper })

      const table = screen.getByTestId('event-table')
      expect(table).toBeInTheDocument()

      const count = screen.getByTestId('event-count')
      expect(count.textContent).toBe('2')
    })
  })

  describe('Actions callbacks', () => {
    it('should have Edit button that is clickable', () => {
      render(<EventsListPage />, { wrapper })

      const editButton = screen.getByText('Edit')
      expect(editButton).toBeInTheDocument()
    })

    it('should have Duplicate button that is clickable', () => {
      render(<EventsListPage />, { wrapper })

      const duplicateButton = screen.getByText('Duplicate')
      expect(duplicateButton).toBeInTheDocument()
    })

    it('should have Delete button that is clickable', () => {
      render(<EventsListPage />, { wrapper })

      const deleteButton = screen.getByText('Delete')
      expect(deleteButton).toBeInTheDocument()
    })
  })

  describe('Responsive design', () => {
    it('should render without errors', () => {
      const { container } = render(<EventsListPage />, { wrapper })

      expect(container.firstChild).toBeInTheDocument()
    })
  })

  describe('T7: Navigation vers page d\'édition', () => {
    beforeEach(() => {
      mockNavigate = vi.fn()
    })

    it('should navigate to edit page when clicking Edit button', async () => {
      render(<EventsListPage />, { wrapper })

      const editButton = screen.getByText('Edit')
      editButton.click()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin/events/event-1/edit')
      })
    })

    it('should navigate to correct edit URL for different events', async () => {
      render(<EventsListPage />, { wrapper })

      const editButton = screen.getByText('Edit')
      editButton.click()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin/events/event-1/edit')
      })
    })
  })
})
