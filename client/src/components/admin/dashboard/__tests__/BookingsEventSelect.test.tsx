import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingsEventSelect } from '../BookingsEventSelect'
import type { Event } from '@/hooks/useEvents'

// Radix Select s'appuie sur releasePointerCapture (absent de jsdom, non couvert par le setup global)
beforeAll(() => {
  if (!('releasePointerCapture' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { value: vi.fn(), configurable: true })
  }
})

const ev = (o: Partial<Event> & { id: string; name: string }): Event => ({
  description: null, isPublished: true, opensAt: null, hasCustomInvitation: false,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', periodStart: null, periodEnd: null, ...o,
})
const events = [ev({ id: 'e1', name: 'Assemblée générale' }), ev({ id: 'e2', name: 'Permanence' })]

describe('BookingsEventSelect', () => {
  it('affiche le libellé du mode sélectionné (nearest par défaut)', () => {
    render(<BookingsEventSelect events={events} selection={{ kind: 'mode', mode: 'nearest' }} onSelectionChange={vi.fn()} />)
    expect(screen.getByTestId('bookings-event-select')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent(/actif|imminent/i)
  })

  it("affiche le nom de l'événement résolu sous le sélecteur", () => {
    render(
      <BookingsEventSelect
        events={events}
        selection={{ kind: 'mode', mode: 'nearest' }}
        resolvedEventName="Assemblée générale"
        onSelectionChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Assemblée générale')).toBeInTheDocument()
  })

  it('liste les 3 modes intelligents et un item par événement', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<BookingsEventSelect events={events} selection={{ kind: 'mode', mode: 'nearest' }} onSelectionChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox'))
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(3 + events.length)
    expect(screen.getByRole('option', { name: 'Permanence' })).toBeInTheDocument()
  })

  it('émet { kind:"event", id } en sélectionnant un événement', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSelectionChange = vi.fn()
    render(<BookingsEventSelect events={events} selection={{ kind: 'mode', mode: 'nearest' }} onSelectionChange={onSelectionChange} />)
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Assemblée générale' }))
    expect(onSelectionChange).toHaveBeenCalledWith({ kind: 'event', id: 'e1' })
  })

  it('émet { kind:"mode", mode } en sélectionnant un mode intelligent', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onSelectionChange = vi.fn()
    render(<BookingsEventSelect events={events} selection={{ kind: 'mode', mode: 'nearest' }} onSelectionChange={onSelectionChange} />)
    await user.click(screen.getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: /dernière campagne/i }))
    expect(onSelectionChange).toHaveBeenCalledWith({ kind: 'mode', mode: 'recentCampaign' })
  })
})
