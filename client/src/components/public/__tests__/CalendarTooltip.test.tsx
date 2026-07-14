import { render, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CalendarTooltip, type CalendarTooltipData } from '../CalendarTooltip'
import type { Slot } from '@/types/slot'

// Mock react-dom to render portal in place
vi.mock('react-dom', () => ({
  createPortal: (children: React.ReactNode) => children,
}))

// Mock date-fns format
vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns')
  return {
    ...actual,
    format: vi.fn((date: Date | string, formatStr: string) => {
      const d = typeof date === 'string' ? new Date(date) : date
      if (formatStr === 'HH:mm') {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
      if (formatStr === 'EEEE d MMMM yyyy') {
        return 'Samedi 15 mars 2026'
      }
      return String(d)
    }),
  }
})

describe('CalendarTooltip', () => {
  // Daté dans le futur : ces tests vérifient les statuts disponible/complet/réservé,
  // qui priment seulement sur un créneau non passé (cf. ordre de priorité du socle).
  const mockSlot: Slot = {
    id: 'slot-1',
    eventId: 'event-1',
    startTime: '2099-03-15T09:00:00Z',
    endTime: '2099-03-15T10:00:00Z',
    capacity: 5,
    currentBookings: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    description: 'Créneau du matin',
    cancelledAt: null,
    cancellationReason: null,
  }

  const mockTargetElement = document.createElement('div')
  mockTargetElement.getBoundingClientRect = () => ({
    left: 100,
    top: 100,
    width: 50,
    height: 30,
    right: 150,
    bottom: 130,
    x: 100,
    y: 100,
    toJSON: () => '{}',
  })

  beforeEach(() => {
    vi.useFakeTimers()
    document.body.appendChild(mockTargetElement)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.removeChild(mockTargetElement)
    vi.clearAllMocks()
  })

  describe('Visibility (AC4)', () => {
    it('should not render when visible is false', () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: mockSlot,
        isBooked: false,
      }

      const { container } = render(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={false}
        />
      )

      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument()
    })

    it('should not render when data is null', () => {
      const { container } = render(
        <CalendarTooltip
          data={null}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument()
    })
  })

  describe('AC3: Délai de 300ms', () => {
    it('should not show tooltip before 300ms delay', () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: mockSlot,
        isBooked: false,
      }

      const { container, rerender } = render(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      // Before 300ms
      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument()

      // After 300ms
      act(() => {
        vi.advanceTimersByTime(300)
      })

      rerender(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument()
    })

    it('réapplique le délai de 300ms à chaque réouverture', () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: mockSlot,
        isBooked: false,
      }

      const { container, rerender } = render(
        <CalendarTooltip data={data} targetElement={mockTargetElement} visible={true} />
      )

      // Première ouverture : affiché après 300ms
      act(() => {
        vi.advanceTimersByTime(300)
      })
      rerender(<CalendarTooltip data={data} targetElement={mockTargetElement} visible={true} />)
      expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument()

      // Fermeture : disparition immédiate
      rerender(<CalendarTooltip data={data} targetElement={mockTargetElement} visible={false} />)
      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument()

      // Réouverture : le délai est ré-armé, donc pas affiché instantanément
      rerender(<CalendarTooltip data={data} targetElement={mockTargetElement} visible={true} />)
      expect(container.querySelector('[role="tooltip"]')).not.toBeInTheDocument()

      // Après un nouveau délai de 300ms : ré-affiché
      act(() => {
        vi.advanceTimersByTime(300)
      })
      rerender(<CalendarTooltip data={data} targetElement={mockTargetElement} visible={true} />)
      expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument()
    })
  })

  describe('AC2: Tooltip créneau (vue semaine)', () => {
    it('should display slot time and available places', async () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: mockSlot,
        isBooked: false,
      }

      const { container, rerender } = render(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      // Wait for delay
      act(() => {
        vi.advanceTimersByTime(300)
      })

      rerender(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      const tooltip = container.querySelector('[role="tooltip"]')
      expect(tooltip).toBeInTheDocument()
      // Should show available places (5 - 2 = 3)
      expect(tooltip?.textContent).toContain('3 places disponibles')
    })

    it('multi-jours : le titre affiche la plage complète (formatSlotRange « du … au … »)', () => {
      // 3 jours inclusifs ; `date-fns.format` est mocké (en-tête) → on teste la
      // STRUCTURE « du … au … » (littéraux portés par formatSlotRange), pas les
      // dates exactes. isMultiDaySlot s'appuie sur parseISO/isSameDay (non mockés).
      const multiDaySlot: Slot = {
        ...mockSlot,
        startTime: '2099-03-15T09:00:00Z',
        endTime: '2099-03-17T17:00:00Z',
      }
      const data: CalendarTooltipData = { mode: 'slot', slot: multiDaySlot, isBooked: false }

      const { container, rerender } = render(
        <CalendarTooltip data={data} targetElement={mockTargetElement} visible={true} />
      )
      act(() => {
        vi.advanceTimersByTime(300)
      })
      rerender(
        <CalendarTooltip data={data} targetElement={mockTargetElement} visible={true} />
      )

      // Multi-jours : la plage complète « du … au … » est affichée. Depuis
      // l'unification de hiérarchie, l'horaire n'est plus le 1er enfant (c'est
      // l'identité/description) ; on assert sur le tooltip entier. La regex
      // « du … au … » n'est satisfaite que par l'horaire (la description
      // « Créneau du matin » n'a pas de « au »).
      const tooltip = container.querySelector('[role="tooltip"]')
      expect(tooltip).toHaveTextContent(/du .+ au /)
    })

    it('should display "Complet" when no places available', async () => {
      const fullSlot: Slot = {
        ...mockSlot,
        currentBookings: 5,
      }

      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: fullSlot,
        isBooked: false,
      }

      const { container, rerender } = render(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      act(() => {
        vi.advanceTimersByTime(300)
      })

      rerender(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      const tooltip = container.querySelector('[role="tooltip"]')
      expect(tooltip?.textContent).toContain('Complet')
    })

    it('should display "Réservé" when user has booked the slot', async () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: mockSlot,
        isBooked: true,
      }

      const { container, rerender } = render(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      act(() => {
        vi.advanceTimersByTime(300)
      })

      rerender(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      const tooltip = container.querySelector('[role="tooltip"]')
      expect(tooltip?.textContent).toContain('réservé')
    })

    it('rend un badge coloré selon l\'état (annulé → palette rouge)', () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: { ...mockSlot, cancelledAt: '2026-05-01T00:00:00Z' },
        isBooked: false,
      }

      const { container, rerender } = render(
        <CalendarTooltip data={data} targetElement={mockTargetElement} visible={true} />
      )

      act(() => {
        vi.advanceTimersByTime(300)
      })

      rerender(
        <CalendarTooltip data={data} targetElement={mockTargetElement} visible={true} />
      )

      expect(container.querySelector('[role="tooltip"]')?.textContent).toContain('Créneau annulé')
      // Badge compact = palette sémantique du descripteur (cancelled → red-50).
      expect(container.querySelector('[role="tooltip"] .bg-red-50')).toBeInTheDocument()
    })

    it('should display slot description if present', async () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: mockSlot,
        isBooked: false,
      }

      const { container, rerender } = render(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      act(() => {
        vi.advanceTimersByTime(300)
      })

      rerender(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      const tooltip = container.querySelector('[role="tooltip"]')
      expect(tooltip?.textContent).toContain('Créneau du matin')
    })
  })

  describe('AC6: Accessibilité clavier (ESC pour fermer)', () => {
    it('should close on ESC key press', async () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: mockSlot,
        isBooked: false,
      }

      const onClose = vi.fn()

      const { rerender } = render(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
          onClose={onClose}
        />
      )

      // Wait for tooltip to appear
      act(() => {
        vi.advanceTimersByTime(300)
      })

      rerender(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
          onClose={onClose}
        />
      )

      // Press ESC
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' })
      })

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('AC5: Positionnement intelligent', () => {
    it('should position tooltip above element by default', async () => {
      const data: CalendarTooltipData = {
        mode: 'slot',
        slot: mockSlot,
        isBooked: false,
      }

      const { container, rerender } = render(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      act(() => {
        vi.advanceTimersByTime(300)
      })

      rerender(
        <CalendarTooltip
          data={data}
          targetElement={mockTargetElement}
          visible={true}
        />
      )

      const tooltip = container.querySelector('[role="tooltip"]')
      expect(tooltip).toBeInTheDocument()
      // Floating UI applique la stratégie 'fixed' + placement résolu ; en jsdom
      // (sans layout) le flip ne se déclenche pas, donc placement reste 'top'.
      expect(tooltip).toHaveClass('slide-in-from-top-[10px]')
    })
  })
})
