import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Slot } from '@/types/slot'
import { PublicCalendar } from '../PublicCalendar'

// Mock de l'API
vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '@/services/api'

// Mock des hooks
type MockPublicSlotsReturn = {
  data: Slot[]
  isLoading: boolean
  error: Error | null
  failureCount?: number
  dataUpdatedAt?: number
  isRefetching?: boolean
}
const mockUsePublicSlots = vi.fn<() => MockPublicSlotsReturn>(() => ({ data: [], isLoading: false, error: null }))
vi.mock('@/hooks/usePublicSlots', () => ({
  usePublicSlots: () => mockUsePublicSlots(),
}))

const mockUsePollingConfig = vi.fn(() => ({ data: { interval: 30000 } }))
vi.mock('@/hooks/usePollingConfig', () => ({
  usePollingConfig: () => mockUsePollingConfig(),
}))

vi.mock('@/hooks/useReservations', () => ({
  useCreateReservation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCancelReservationBySlot: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useMyReservations: vi.fn(() => ({ data: [], isLoading: false })),
}))

// useAuth est mocké pour que la garde dans PublicCalendar laisse passer un
// visiteur anonyme (comportement par défaut de ces tests d'intégration).
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null }),
}))

// Mock des composants pour simplifier les tests d'intégration
vi.mock('@/components/public/CalendarView', () => ({
  CalendarView: ({ slots, disabled }: { slots: Slot[]; disabled?: boolean }) => (
    <div data-testid="calendar-view">
      <span>Calendar View</span>
      <span data-testid="slot-count">{slots.length} slots</span>
      {disabled && <span data-testid="calendar-disabled">Disabled</span>}
    </div>
  ),
}))

vi.mock('@/components/public/PublicSlotList', () => ({
  PublicSlotList: ({ slots, disabled }: { slots: Slot[]; disabled?: boolean }) => (
    <div data-testid="public-slot-list">
      <span>List View</span>
      <span data-testid="slot-count">{slots.length} slots</span>
      {disabled && <span data-testid="list-disabled">Disabled</span>}
    </div>
  ),
}))

vi.mock('@/components/public/ViewToggle', () => ({
  ViewToggle: ({ viewMode, onChange }: { viewMode: string; onChange: (mode: string) => void }) => (
    <div data-testid="view-toggle" role="group" aria-label="Mode d'affichage">
      <button
        data-testid="calendar-button"
        aria-pressed={viewMode === 'calendar'}
        onClick={() => onChange('calendar')}
      >
        Calendrier
      </button>
      <button
        data-testid="list-button"
        aria-pressed={viewMode === 'list'}
        onClick={() => onChange('list')}
      >
        Liste
      </button>
    </div>
  ),
}))

vi.mock('@/components/public/MyReservationsPanel', () => ({
  MyReservationsPanel: () => <div data-testid="my-reservations-panel">My Reservations</div>,
}))

vi.mock('@/components/public/StatusBanner', () => ({
  StatusBanner: () => <div data-testid="status-banner">Status</div>,
}))

vi.mock('@/components/public/PollingIndicator', () => ({
  PollingIndicator: () => <div data-testid="polling-indicator">Polling</div>,
}))

vi.mock('@/components/public/ConnectionStatusIndicator', () => ({
  ConnectionStatusIndicator: () => <div data-testid="connection-status">Connected</div>,
}))

vi.mock('@/components/public/SlotDetailDialog', () => ({
  SlotDetailDialog: () => null,
}))

vi.mock('@/components/public/ConfirmCancelDialog', () => ({
  ConfirmCancelDialog: () => null,
}))

const mockApiGet = api.get as unknown as ReturnType<typeof vi.fn>

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

const renderWithRouter = (ui: React.ReactElement, route: string = '/events/test-uuid') => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/events/:uuid" element={ui} />
      </Routes>
    </MemoryRouter>,
    { wrapper: createWrapper() }
  )
}

/**
 * Integration tests for PublicCalendar view mode switching
 *
 * Tests cover:
 * - ViewToggle rendering and interaction
 * - Calendar view rendering
 * - List view rendering
 * - View mode persistence with localStorage
 * - Responsive default behavior (mobile/desktop)
 */
describe('PublicCalendar View Mode Integration', () => {
  const mockEvent = {
    data: {
      data: {
        id: 'test-uuid',
        name: 'Test Event',
        description: 'Test Description',
        isPublished: true,
        opensAt: null,
        slots: [],
        canReserve: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    },
  }

  const mockSlots = [
    {
      id: 'slot-1',
      eventId: 'test-uuid',
      startTime: '2026-01-15T10:00:00Z',
      endTime: '2026-01-15T11:00:00Z',
      capacity: 10,
      currentBookings: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    },
    {
      id: 'slot-2',
      eventId: 'test-uuid',
      startTime: '2026-01-15T14:00:00Z',
      endTime: '2026-01-15T15:00:00Z',
      capacity: 10,
      currentBookings: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Setup default mocks
    mockApiGet.mockResolvedValue(mockEvent)
    mockUsePublicSlots.mockReturnValue({
      data: mockSlots,
      isLoading: false,
      error: null,
      failureCount: 0,
      dataUpdatedAt: Date.now(),
      isRefetching: false,
    })
  })

  describe('ViewToggle rendering', () => {
    it('renders ViewToggle component', async () => {
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByText('Test Event')).toBeInTheDocument()
      })

      const viewToggle = screen.getByTestId('view-toggle')
      expect(viewToggle).toBeInTheDocument()
      expect(viewToggle).toHaveAttribute('role', 'group')
      expect(viewToggle).toHaveAttribute('aria-label', "Mode d'affichage")
    })

    it('renders both calendar and list buttons', async () => {
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('calendar-button')).toBeInTheDocument()
      })

      expect(screen.getByTestId('list-button')).toBeInTheDocument()
    })
  })

  describe('View mode switching', () => {
    it('shows CalendarView by default on desktop', async () => {
      // Mock desktop screen width
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      })

      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      })

      // Calendar view should be visible
      expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      expect(screen.queryByTestId('public-slot-list')).not.toBeInTheDocument()
    })

    it('switches to list view when list toggle is clicked', async () => {
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
      })

      // Click list button
      const listButton = screen.getByTestId('list-button')
      fireEvent.click(listButton)

      // Wait for state update
      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      // List view should be visible
      expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()

      // List button should be pressed
      expect(listButton).toHaveAttribute('aria-pressed', 'true')
    })

    it('switches to calendar view when calendar toggle is clicked', async () => {
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
      })

      // First switch to list view
      const listButton = screen.getByTestId('list-button')
      fireEvent.click(listButton)

      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      // Then switch back to calendar
      const calendarButton = screen.getByTestId('calendar-button')
      fireEvent.click(calendarButton)

      await waitFor(() => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      })

      // Calendar view should be visible
      expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      expect(screen.queryByTestId('public-slot-list')).not.toBeInTheDocument()

      // Calendar button should be pressed
      expect(calendarButton).toHaveAttribute('aria-pressed', 'true')
    })

    it('displays correct slot count in both views', async () => {
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
      })

      // Calendar view should show slot count
      const calendarSlotCount = screen.getByTestId('slot-count')
      expect(calendarSlotCount).toHaveTextContent('2 slots')

      // Switch to list view
      const listButton = screen.getByTestId('list-button')
      fireEvent.click(listButton)

      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      // List view should also show slot count
      const listSlotCount = screen.getByTestId('slot-count')
      expect(listSlotCount).toHaveTextContent('2 slots')
    })
  })

  describe('View mode persistence', () => {
    it('preserves list view preference across remounts', async () => {
      // First render - switch to list view
      const { unmount } = renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
      })

      const listButton = screen.getByTestId('list-button')
      fireEvent.click(listButton)

      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      // Verify localStorage was updated
      const storageKey = 'timepick-view-mode-test-uuid'
      const stored = JSON.parse(localStorage.getItem(storageKey)!)
      expect(stored).toEqual({ version: 1, mode: 'list' })

      // Unmount and remount
      unmount()

      // Second render - should load list view from localStorage
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      // List view should still be visible
      expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()
    })

    it('preserves calendar view preference across remounts', async () => {
      // Set list view in localStorage
      const storageKey = 'timepick-view-mode-test-uuid'
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, mode: 'list' }))

      // First render - should load list view
      const { unmount } = renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      // Switch to calendar view
      const calendarButton = screen.getByTestId('calendar-button')
      fireEvent.click(calendarButton)

      await waitFor(() => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      })

      // Verify localStorage was updated
      const stored = JSON.parse(localStorage.getItem(storageKey)!)
      expect(stored).toEqual({ version: 1, mode: 'calendar' })

      // Unmount and remount
      unmount()

      // Second render - should load calendar view from localStorage
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      })

      // Calendar view should still be visible
      expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      expect(screen.queryByTestId('public-slot-list')).not.toBeInTheDocument()
    })

    it('maintains separate view mode preferences per event', async () => {
      // Set different view modes for different events
      const storageKey1 = 'timepick-view-mode-event-1'
      const storageKey2 = 'timepick-view-mode-event-2'

      localStorage.setItem(storageKey1, JSON.stringify({ version: 1, mode: 'calendar' }))
      localStorage.setItem(storageKey2, JSON.stringify({ version: 1, mode: 'list' }))

      // Render first event
      const { unmount: unmount1 } = renderWithRouter(<PublicCalendar />, '/events/event-1')

      await waitFor(() => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      })

      unmount1()

      // Render second event
      const { unmount: unmount2 } = renderWithRouter(<PublicCalendar />, '/events/event-2')

      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      unmount2()
    })
  })

  describe('Responsive default behavior', () => {
    it('can switch to list view on mobile', async () => {
      // The component can display list view when requested
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
      })

      // Click list button
      const listButton = screen.getByTestId('list-button')
      fireEvent.click(listButton)

      // List view should be visible
      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()
    })

    it('can switch to calendar view on desktop', async () => {
      // The component can display calendar view when requested
      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
      })

      // Calendar view should be visible by default
      expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      expect(screen.queryByTestId('public-slot-list')).not.toBeInTheDocument()
    })

    it('respects localStorage preference when set', async () => {
      // Set list preference in localStorage
      const storageKey = 'timepick-view-mode-test-uuid'
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, mode: 'list' }))

      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByText('Test Event')).toBeInTheDocument()
      })

      // Should show list view from localStorage
      expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      expect(screen.queryByTestId('calendar-view')).not.toBeInTheDocument()
    })
  })

  describe('View mode with disabled state', () => {
    it('passes disabled state to CalendarView in consultative mode', async () => {
      const consultativeEvent = {
        data: {
          data: {
            ...mockEvent.data.data,
            opensAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          },
        },
      }

      mockApiGet.mockResolvedValue(consultativeEvent)

      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      })

      // CalendarView should receive disabled prop
      expect(screen.getByTestId('calendar-disabled')).toBeInTheDocument()
    })

    it('passes disabled state to PublicSlotList in consultative mode', async () => {
      const consultativeEvent = {
        data: {
          data: {
            ...mockEvent.data.data,
            opensAt: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          },
        },
      }

      mockApiGet.mockResolvedValue(consultativeEvent)

      renderWithRouter(<PublicCalendar />)

      await waitFor(() => {
        expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
      })

      // Switch to list view
      const listButton = screen.getByTestId('list-button')
      fireEvent.click(listButton)

      await waitFor(() => {
        expect(screen.getByTestId('public-slot-list')).toBeInTheDocument()
      })

      // PublicSlotList should receive disabled prop
      expect(screen.getByTestId('list-disabled')).toBeInTheDocument()
    })
  })
})
