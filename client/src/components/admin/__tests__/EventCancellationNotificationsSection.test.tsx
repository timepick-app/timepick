import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventCancellationNotificationsSection } from '../EventCancellationNotificationsSection'
import type { PendingNotifications } from '@/hooks/useCancellationNotifications'

const mockMutate = vi.fn()
let mockQueryData: PendingNotifications | undefined

vi.mock('@/hooks/useCancellationNotifications', () => ({
  useCancellationNotifications: () => ({ data: mockQueryData }),
  useResendCancellationNotifications: () => ({ mutate: mockMutate, isPending: false }),
}))

const onePending: PendingNotifications = {
  pending: 2,
  events: [
    {
      eventId: 'event-a',
      eventName: 'Événement A',
      pendingCount: 2,
      slots: [
        {
          slotId: 'slot-a',
          startTime: '2026-06-15T09:00:00.000Z',
          endTime: '2026-06-15T11:00:00.000Z',
          cancellationReason: 'Reporté',
          recipients: [
            { bookingId: 'bk-1', email: 'alice@example.com', firstName: 'Alice', lastName: null },
            { bookingId: 'bk-2', email: 'bob@example.com', firstName: 'Bob', lastName: null },
          ],
        },
      ],
    },
  ],
}

describe('EventCancellationNotificationsSection (Surface B)', () => {
  beforeEach(() => {
    mockMutate.mockClear()
    mockQueryData = undefined
  })

  it('ne rend rien quand aucune notification en attente pour cet événement', () => {
    mockQueryData = { pending: 0, events: [] }
    render(<EventCancellationNotificationsSection eventId="event-a" />)
    expect(screen.queryByTestId('event-cancellation-notifications-section')).toBeNull()
  })

  it('liste les destinataires en attente quand pending > 0', () => {
    mockQueryData = onePending
    render(<EventCancellationNotificationsSection eventId="event-a" />)

    expect(screen.getByTestId('event-cancellation-notifications-section')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument()
  })

  it('« Renvoyer » est scoppé à l\'événement (mutate(eventId))', async () => {
    mockQueryData = onePending
    render(<EventCancellationNotificationsSection eventId="event-a" />)

    await userEvent.click(screen.getByRole('button', { name: /renvoyer/i }))
    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockMutate).toHaveBeenCalledWith('event-a')
  })
})
