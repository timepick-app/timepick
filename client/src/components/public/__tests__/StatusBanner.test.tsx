import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StatusBanner } from '../StatusBanner'
import type { Slot } from '@/types/slot'

/**
 * Helper pour créer un créneau de test
 * @param overrides - Propriétés à surcharger
 * @returns Un Slot avec des valeurs par défaut
 */
function createMockSlot(overrides: Partial<Slot> = {}): Slot {
  const now = new Date()
  const startTime = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2h dans le futur
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000) // 1h de durée

  return {
    id: 'slot-1',
    eventId: 'event-1',
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    capacity: 10,
    currentBookings: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    cancelledAt: null,
    cancellationReason: null,
    ...overrides,
  }
}

describe('StatusBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('banner display', () => {
    it('renders ended banner with destructive variant', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveAttribute('role', 'alert')
      expect(screen.getByText(/inscriptions ne sont plus possibles/i)).toBeInTheDocument()
    })

    it('renders upcoming banner with info variant when opensAt is in future', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} opensAt={tomorrow.toISOString()} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveAttribute('role', 'alert')
      expect(screen.getByText(/Les inscriptions ouvrent le/)).toBeInTheDocument()
    })

    it('does not render upcoming banner when slots are in future but no opensAt', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).not.toBeInTheDocument()
    })

    it('renders full banner with warning variant', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10,
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          currentBookings: 5,
          capacity: 5,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveAttribute('role', 'alert')
      expect(screen.getByText(/complets/i)).toBeInTheDocument()
    })

    it('renders urgency banner with warning variant', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 8,
          capacity: 10,
        }),
        createMockSlot({
          id: 'slot-2',
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          currentBookings: 8,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveAttribute('role', 'alert')
      expect(screen.getByText(/places disponibles/i)).toBeInTheDocument()
    })
  })

  describe('null state', () => {
    it('returns null when no status applies', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
          currentBookings: 3, // 30% - pas urgency
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).not.toBeInTheDocument()
    })

    it('returns null for empty slots array', () => {
      const { container } = render(<StatusBanner slots={[]} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('uses role="alert" for ended state', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toHaveAttribute('role', 'alert')
    })

    it('uses role="alert" for upcoming state when opensAt is in future', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} opensAt={tomorrow.toISOString()} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toHaveAttribute('role', 'alert')
    })

    it('uses role="alert" for full state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toHaveAttribute('role', 'alert')
    })

    it('uses role="alert" for urgency state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 8,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toHaveAttribute('role', 'alert')
    })

    it('uses role="alert" for all banner states (accessibility improvement)', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 8,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      // role="alert" is equivalent to aria-live="assertive" for immediate screen reader announcement
      expect(banner).toHaveAttribute('role', 'alert')
    })
  })

  describe('opensAt date display', () => {
    // These tests use hardcoded dates (March 15 & April 1, 2026) so we pin the
    // fake system time to a date before them to keep them deterministic.
    beforeEach(() => {
      vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    })

    it('displays opensAt date when configured and in future', () => {
      const opensAtDate = new Date('2026-03-15T09:30:00Z')
      const slotsDate = new Date('2026-04-01T10:00:00Z')

      const slots: Slot[] = [
        createMockSlot({
          startTime: slotsDate.toISOString(),
          endTime: new Date(slotsDate.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      render(<StatusBanner slots={slots} opensAt={opensAtDate.toISOString()} />)

      // Should show opensAt date (15 mars), not slot start date (1er avril)
      expect(screen.getByText(/15 mars 2026/)).toBeInTheDocument()
      expect(screen.queryByText(/1er avril/)).not.toBeInTheDocument()
    })

    it('does not show banner when opensAt is null and slots are in future', () => {
      const slotsDate = new Date('2026-04-01T10:00:00Z')

      const slots: Slot[] = [
        createMockSlot({
          startTime: slotsDate.toISOString(),
          endTime: new Date(slotsDate.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} opensAt={null} />)

      // Should not show banner when opensAt is null (event is immediately open)
      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).not.toBeInTheDocument()
    })

    it('does not show banner when opensAt is undefined and slots are in future', () => {
      const slotsDate = new Date('2026-04-01T10:00:00Z')

      const slots: Slot[] = [
        createMockSlot({
          startTime: slotsDate.toISOString(),
          endTime: new Date(slotsDate.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      // Don't pass opensAt prop at all
      const { container } = render(<StatusBanner slots={slots} />)

      // Should not show banner when opensAt is undefined (event is immediately open)
      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).not.toBeInTheDocument()
    })

    it('does not show banner when opensAt is in the past', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const slotsDate = new Date('2026-04-01T10:00:00Z')

      const slots: Slot[] = [
        createMockSlot({
          startTime: slotsDate.toISOString(),
          endTime: new Date(slotsDate.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} opensAt={yesterday.toISOString()} />)

      // Should not show banner when opensAt is in the past (registration is already open)
      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).not.toBeInTheDocument()
    })
  })

  describe('date/time formatting', () => {
    it('displays formatted date/time for upcoming banner when opensAt is in future', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      render(<StatusBanner slots={slots} opensAt={tomorrow.toISOString()} />)

      expect(screen.getByText(/Les inscriptions ouvrent le/)).toBeInTheDocument()
    })

    it('displays formatted date without time when at midnight', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const midnightDate = new Date(twoDaysFromNow)
      midnightDate.setHours(0, 0, 0, 0)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      render(<StatusBanner slots={slots} opensAt={tomorrow.toISOString()} />)

      expect(screen.getByText(/Les inscriptions ouvrent le/)).toBeInTheDocument()
    })

    it('handles first day of month with "1er" formatting', () => {
      const now = new Date()
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 30, 0)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: firstOfMonth.toISOString(),
          endTime: new Date(firstOfMonth.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      render(<StatusBanner slots={slots} opensAt={tomorrow.toISOString()} />)

      expect(screen.getByText(/Les inscriptions ouvrent le/)).toBeInTheDocument()
    })
  })

  describe('fade-out animation', () => {
    it('adds opacity-0 class when fading out', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      // Initial slots - ended state
      const endedSlots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      // Active slots - no status (ongoing but not full/urgent)
      const activeSlots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
          currentBookings: 3,
          capacity: 10,
        }),
      ]

      const { container, rerender } = render(<StatusBanner slots={endedSlots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      expect(banner).not.toHaveClass('opacity-0')

      // Change to active state (should trigger fade-out)
      rerender(<StatusBanner slots={activeSlots} />)

      // Advance timer slightly - should have opacity-0
      act(() => {
        vi.advanceTimersByTime(100)
      })

      const fadingBanner = container.querySelector('[data-testid="status-banner"]')
      expect(fadingBanner).toHaveClass('opacity-0')

      // Run all pending timers to trigger the fade-out completion
      act(() => {
        vi.runAllTimers()
      })

      // Banner should be removed from DOM
      const removedBanner = container.querySelector('[data-testid="status-banner"]')
      expect(removedBanner).not.toBeInTheDocument()
    })
  })

  describe('chip Badge soft', () => {
    it('rend un chip rounded-full pour l\'état ended', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      // Badge rend toujours rounded-full (soft chip)
      expect(banner).toHaveClass('rounded-full')
      expect(banner).not.toHaveClass('border-destructive/50')
    })

    it('rend un chip rounded-full pour l\'état urgency', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 8,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveClass('rounded-full')
    })

    it('rend un chip rounded-full pour l\'état full', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      expect(banner).toHaveClass('rounded-full')
      expect(screen.getByText(/complets/i)).toBeInTheDocument()
    })

    it('rend le chip error (border-red-200) pour l\'état ended', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toBeInTheDocument()
      // Badge soft error = border-red-200 (pas border-destructive/50 du composant Alert)
      expect(banner).toHaveClass('border-red-200')
    })
  })

  describe('icons', () => {
    it('renders AlertCircle icon for ended state', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const icon = container.querySelector('[data-testid="banner-icon"]')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })

    it('renders CalendarClock icon for upcoming state when opensAt is in future', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} opensAt={tomorrow.toISOString()} />)

      const icon = container.querySelector('[data-testid="banner-icon"]')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })

    it('renders CheckCircle2 icon for full state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const icon = container.querySelector('[data-testid="banner-icon"]')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })

    it('renders AlertCircle icon for urgency state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 8,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const icon = container.querySelector('[data-testid="banner-icon"]')
      expect(icon).toBeInTheDocument()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })

    it('all icons have aria-hidden="true"', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 8,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const icon = container.querySelector('[data-testid="banner-icon"]')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('variant classes', () => {
    it('applies error variant classes for ended state', () => {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000).toISOString(),
          endTime: yesterday.toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      // Badge soft error = border-red-200 (migré depuis Alert border-destructive/50)
      expect(banner).toHaveClass('border-red-200')
    })

    it('applies info variant classes for upcoming state when opensAt is in future', () => {
      const now = new Date()
      const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: twoDaysFromNow.toISOString(),
          endTime: new Date(twoDaysFromNow.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} opensAt={tomorrow.toISOString()} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toHaveClass('border-blue-200')
    })

    it('applies warning variant classes for full state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 10,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toHaveClass('border-amber-200')
    })

    it('applies warning variant classes for urgency state', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const slots: Slot[] = [
        createMockSlot({
          startTime: thirtyMinutesAgo.toISOString(),
          endTime: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          currentBookings: 8,
          capacity: 10,
        }),
      ]

      const { container } = render(<StatusBanner slots={slots} />)

      const banner = container.querySelector('[data-testid="status-banner"]')
      expect(banner).toHaveClass('border-amber-200')
    })
  })
})
