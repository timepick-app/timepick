import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEventSlots } from '../useEventSlots'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Slot } from '@/types/slot'

// Type for useAdminSlots mock
type MockUseAdminSlotsReturn = {
  slots: Slot[]
  isLoading: boolean
  error: string | null
  refetch: ReturnType<typeof vi.fn>
}

// Mock useAdminSlots hook
vi.mock('@/hooks/useAdminSlots', () => ({
  useAdminSlots: vi.fn()
}))

import { useAdminSlots } from '@/hooks/useAdminSlots'

const mockUseAdminSlots = useAdminSlots as unknown as ReturnType<typeof vi.fn> & { mockReturnValue: (v: MockUseAdminSlotsReturn) => void }

// Zone prescrite pour les assertions « piège UTC » (story 1.1, NFR1 — DST).
// Déterministes uniquement sous Europe/Paris → exécutées via `TZ=Europe/Paris`,
// skippées ailleurs (cf. lib/__tests__/utils.test.ts).
const isParisTZ = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Paris'

describe('useEventSlots', () => {
  const mockSlots: Slot[] = [
    {
      id: 'slot-1',
      eventId: 'event-1',
      startTime: '2026-01-26T09:00:00.000Z',
      endTime: '2026-01-26T10:00:00.000Z',
      capacity: 5,
      currentBookings: 0,
      availablePlaces: 5,
      createdAt: '2026-01-20T10:00:00.000Z',
      updatedAt: '2026-01-20T10:00:00.000Z',
      cancelledAt: null,
      cancellationReason: null,
    },
    {
      id: 'slot-2',
      eventId: 'event-1',
      startTime: '2026-01-26T10:00:00.000Z',
      endTime: '2026-01-26T11:00:00.000Z',
      capacity: 5,
      currentBookings: 3,
      availablePlaces: 2,
      createdAt: '2026-01-20T10:00:00.000Z',
      updatedAt: '2026-01-20T10:00:00.000Z',
      cancelledAt: null,
      cancellationReason: null,
    },
    {
      id: 'slot-3',
      eventId: 'event-1',
      startTime: '2026-01-26T11:00:00.000Z',
      endTime: '2026-01-26T12:00:00.000Z',
      capacity: 5,
      currentBookings: 5,
      availablePlaces: 0,
      createdAt: '2026-01-20T10:00:00.000Z',
      updatedAt: '2026-01-20T10:00:00.000Z',
      cancelledAt: null,
      cancellationReason: null,
    }
  ]

  const createWrapper = () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    })
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('General', () => {
    it('should call useAdminSlots with eventId', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      renderHook(() => useEventSlots('event-1'), { wrapper: createWrapper() })

      expect(mockUseAdminSlots).toHaveBeenCalledWith('event-1')
    })

    it('should delegate loading state from useAdminSlots', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [],
        isLoading: true,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.isLoading).toBe(true)
    })

    it('should delegate error state from useAdminSlots', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [],
        isLoading: false,
        error: 'Test error',
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.error).toBe('Test error')
    })

    it('should delegate refetch function from useAdminSlots', () => {
      const refetchMock = vi.fn()
      mockUseAdminSlots.mockReturnValue({
        slots: [],
        isLoading: false,
        error: null,
        refetch: refetchMock
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      result.current.refetch()
      expect(refetchMock).toHaveBeenCalled()
    })
  })

  describe('Slot → CalendarEvent transformation', () => {
    it('should transform slots to FullCalendar event format', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: mockSlots,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.events).toHaveLength(3)

      const firstEvent = result.current.events[0]
      expect(firstEvent.id).toBe('slot-1')
      expect(firstEvent.start).toBe('2026-01-26T09:00:00.000Z')
      expect(firstEvent.end).toBe('2026-01-26T10:00:00.000Z')
      expect(firstEvent.extendedProps).toBeDefined()
      expect(firstEvent.extendedProps.capacity).toBe(5)
      expect(firstEvent.extendedProps.currentBookings).toBe(0)
      expect(firstEvent.extendedProps.availablePlaces).toBe(5)
    })

    it('should format event title with French time range and booking count', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: mockSlots,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      const titles = result.current.events.map(e => e.title)

      // Expected format: "HHhMM → HHhMM | X/Y" (French format with 'h' separator + arrow)
      expect(titles[0]).toMatch(/\d{2}h\d{2} → \d{2}h\d{2} \| 0\/5/)
      // Check that times are present (may vary by timezone)
      expect(titles[0]).toMatch(/\d{2}h\d{2}/)
    })

    it('should set status to "available" for slots with no bookings', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [mockSlots[0]],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.events[0].extendedProps.status).toBe('available')
    })

    it('should set status to "partial" for slots with some bookings', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [mockSlots[1]],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.events[0].extendedProps.status).toBe('partial')
    })

    it('should set status to "full" for slots at capacity', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [mockSlots[2]],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.events[0].extendedProps.status).toBe('full')
    })

    it('should calculate availablePlaces correctly', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: mockSlots,
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.events[0].extendedProps.availablePlaces).toBe(5) // 5-0
      expect(result.current.events[1].extendedProps.availablePlaces).toBe(2) // 5-3
      expect(result.current.events[2].extendedProps.availablePlaces).toBe(0) // 5-5
    })
  })

  describe('Slot coloration with theme variables', () => {
    it('should use theme CSS variables for available slots', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [mockSlots[0]], // 0 bookings
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      const event = result.current.events[0]
      expect(event.classNames).toContain('bg-slotAvailable')
      expect(event.classNames).toContain('border-slotAvailable')
      expect(event.classNames).toContain('text-slotAvailable-foreground')
    })

    it('should use theme CSS variables for partial slots', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [mockSlots[1]], // 3 bookings out of 5
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      const event = result.current.events[0]
      expect(event.classNames).toContain('bg-slotPartial')
      expect(event.classNames).toContain('border-slotPartial')
      expect(event.classNames).toContain('text-slotPartial-foreground')
    })

    it('should use theme CSS variables for full slots', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [mockSlots[2]], // 5 bookings out of 5
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      const event = result.current.events[0]
      expect(event.classNames).toContain('bg-slotFull')
      expect(event.classNames).toContain('border-slotFull')
      expect(event.classNames).toContain('text-slotFull-foreground')
    })
  })

  describe('Créneaux multi-jours (Story 1.2)', () => {
    it('un créneau multi-jours produit allDay:true + classe fc-event--multiday', () => {
      const multiDay: Slot = {
        id: 'slot-md',
        eventId: 'event-1',
        startTime: '2026-03-15T09:00:00.000Z',
        endTime: '2026-03-17T17:00:00.000Z', // +2 jours calendaires (robuste TZ)
        capacity: 5,
        currentBookings: 0,
        availablePlaces: 5,
        createdAt: '2026-01-20T10:00:00.000Z',
        updatedAt: '2026-01-20T10:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      }
      mockUseAdminSlots.mockReturnValue({
        slots: [multiDay],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      const event = result.current.events[0]
      expect(event.allDay).toBe(true)
      expect(event.classNames).toContain('fc-event--multiday')
      // M1 — fin EXCLUSIVE en date locale (yyyy-MM-dd), pas l'ISO brut : FC
      // couvrirait sinon un jour de moins (le dernier). cf. getAllDayExclusiveEnd.
      expect(event.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // M3 — libellé COMPACT (« d MMM HHhmm → d MMM HHhmm ») + occupation. La
      // flèche prouve l'usage de formatSlotRangeCompact (forme longue « du … au … »
      // réservée au tooltip, non contraint en largeur).
      expect(event.extendedProps.multiDayLabel).toContain('→')
      expect(event.extendedProps.multiDayLabel).not.toMatch(/\bdu .+ au /)
      expect(event.extendedProps.multiDayLabel).toContain('0/5')
    })

    it('un créneau mono-jour reste allDay:false sans classe fc-event--multiday (FR12)', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [mockSlots[0]], // 09:00 → 10:00 même jour
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      const event = result.current.events[0]
      expect(event.allDay).toBe(false)
      expect(event.classNames).not.toContain('fc-event--multiday')
      // M1 — mono-jour : fin = ISO brut inchangé (event timed, pas all-day).
      expect(event.end).toBe(mockSlots[0].endTime)
      // M3 — pas de libellé multi-jours : la barre mono-jour utilise `title`.
      expect(event.extendedProps.multiDayLabel).toBeUndefined()
    })

    it.runIf(isParisTZ)(
      'allDay suit le jour calendaire LOCAL (piège UTC hiver) : 23h30→00h30 local → true',
      () => {
        // Paris CET : 22:30Z = 15 mars 23h30 local ; 23:30Z = 16 mars 00h30 local.
        // Même jour UTC (15) mais jours locaux différents → multi-jours en local.
        const utcTrap: Slot = {
          id: 'slot-utc-trap',
          eventId: 'event-1',
          startTime: '2026-03-15T22:30:00.000Z',
          endTime: '2026-03-15T23:30:00.000Z',
          capacity: 5,
          currentBookings: 0,
          availablePlaces: 5,
          createdAt: '2026-01-20T10:00:00.000Z',
          updatedAt: '2026-01-20T10:00:00.000Z',
          cancelledAt: null,
          cancellationReason: null,
        }
        mockUseAdminSlots.mockReturnValue({
          slots: [utcTrap],
          isLoading: false,
          error: null,
          refetch: vi.fn()
        })

        const { result } = renderHook(() => useEventSlots('event-1'), {
          wrapper: createWrapper()
        })

        expect(result.current.events[0].allDay).toBe(true)
      }
    )

    it.runIf(isParisTZ)(
      'barre multi-jours : fin exclusive = dernier jour occupé + 1 (date locale, AC1)',
      () => {
        // 15 mars 09h00Z → 17 mars 17h00Z = 18h00 Paris le 17 (dernier jour
        // occupé) → fin exclusive FC = 18 mars (sinon le 17 serait tronqué).
        const multiDay: Slot = {
          id: 'slot-md-end',
          eventId: 'event-1',
          startTime: '2026-03-15T09:00:00.000Z',
          endTime: '2026-03-17T17:00:00.000Z',
          capacity: 5,
          currentBookings: 0,
          availablePlaces: 5,
          createdAt: '2026-01-20T10:00:00.000Z',
          updatedAt: '2026-01-20T10:00:00.000Z',
          cancelledAt: null,
          cancellationReason: null,
        }
        mockUseAdminSlots.mockReturnValue({
          slots: [multiDay],
          isLoading: false,
          error: null,
          refetch: vi.fn()
        })

        const { result } = renderHook(() => useEventSlots('event-1'), {
          wrapper: createWrapper()
        })

        expect(result.current.events[0].end).toBe('2026-03-18')
      }
    )
  })

  describe('Edge cases', () => {
    it('should return empty events array when no slots', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.events).toEqual([])
    })

    it('should handle slots without availablePlaces property', () => {
      const slotWithoutAvailablePlaces: Slot = {
        id: 'slot-1',
        eventId: 'event-1',
        startTime: '2026-01-26T09:00:00.000Z',
        endTime: '2026-01-26T10:00:00.000Z',
        capacity: 5,
        currentBookings: 2,
        // availablePlaces not defined
        createdAt: '2026-01-20T10:00:00.000Z',
        updatedAt: '2026-01-20T10:00:00.000Z',
        cancelledAt: null,
        cancellationReason: null,
      }

      mockUseAdminSlots.mockReturnValue({
        slots: [slotWithoutAvailablePlaces],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      expect(result.current.events[0].extendedProps.availablePlaces).toBe(3) // 5-2 calculated
      expect(result.current.events[0].extendedProps.status).toBe('partial')
    })

    it('should use local French time for formatting', () => {
      mockUseAdminSlots.mockReturnValue({
        slots: [mockSlots[0]],
        isLoading: false,
        error: null,
        refetch: vi.fn()
      })

      const { result } = renderHook(() => useEventSlots('event-1'), {
        wrapper: createWrapper()
      })

      // Title must contain hours in French "h" separator format (HHhMM → HHhMM | X/Y)
      const title = result.current.events[0].title
      expect(title).toMatch(/\d{2}h\d{2} → \d{2}h\d{2}/)
    })
  })
})
