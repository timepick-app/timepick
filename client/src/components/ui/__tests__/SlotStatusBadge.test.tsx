import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Slot } from '../../../types/slot'
import { SlotStatusBadge } from '../SlotStatusBadge'

const HOUR = 60 * 60 * 1000

function makeSlot(overrides: Partial<Slot> = {}): Slot {
  const now = Date.now()
  return {
    id: 'slot-1',
    eventId: 'event-1',
    startTime: new Date(now + HOUR).toISOString(),
    endTime: new Date(now + 2 * HOUR).toISOString(),
    capacity: 2,
    currentBookings: 0,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    cancelledAt: null,
    cancellationReason: null,
    ...overrides,
  }
}

describe('SlotStatusBadge', () => {
  it('affiche le libellé court de l\'état disponible', () => {
    render(<SlotStatusBadge slot={makeSlot()} />)
    expect(screen.getByText('Disponible')).toBeInTheDocument()
  })

  it('affiche « Réservé » quand hasBooked', () => {
    render(<SlotStatusBadge slot={makeSlot()} hasBooked />)
    expect(screen.getByText('Réservé')).toBeInTheDocument()
  })

  it('accepte un status explicite (sans slot)', () => {
    render(<SlotStatusBadge status="cancelled" data-testid="badge" />)
    expect(screen.getByText('Annulé')).toBeInTheDocument()
    expect(screen.getByTestId('badge')).toHaveClass('bg-red-50', 'text-red-800')
  })

  it('applique les jetons de couleur de l\'état complet (orange)', () => {
    render(<SlotStatusBadge slot={makeSlot({ capacity: 2, currentBookings: 2 })} data-testid="badge" />)
    expect(screen.getByTestId('badge')).toHaveClass('bg-orange-50', 'text-orange-800')
  })

  it('propage data-testid et aria-label (forwarding ...rest)', () => {
    render(<SlotStatusBadge slot={makeSlot()} data-testid="slot-badge" aria-label="statut" />)
    const badge = screen.getByTestId('slot-badge')
    expect(badge).toHaveAttribute('aria-label', 'statut')
  })

  it('fusionne le className fourni', () => {
    render(<SlotStatusBadge slot={makeSlot()} data-testid="badge" className="custom-x" />)
    expect(screen.getByTestId('badge')).toHaveClass('custom-x')
  })
})
