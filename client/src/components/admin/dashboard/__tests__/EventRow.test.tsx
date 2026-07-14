import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { EventRow } from '../EventRow'
import type { Event } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'

const NOW = new Date('2026-06-01T12:00:00Z')

const ev = (o: Partial<Event>): Event => ({
  id: 'e1', name: 'Test', description: null, isPublished: true, opensAt: null,
  hasCustomInvitation: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  periodStart: null, periodEnd: null, ...o,
})
const st = (o: Partial<EventStats>): EventStats => ({
  eventId: 'e1', totalSlots: 0, filledSlots: 0, vacantSlots: 0, fillRate: 0,
  totalCapacity: 0, totalBookings: 0, ...o,
})

const wrap = (ui: ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )

describe('EventRow', () => {
  it('affiche le nom et le badge de statut « Brouillon »', () => {
    wrap(<EventRow event={ev({ isPublished: false, name: 'Brouillon X' })} stats={st({})} now={NOW} />)
    expect(screen.getByText('Brouillon X')).toBeInTheDocument()
    expect(screen.getByText('Brouillon')).toBeInTheDocument()
  })

  it('dérive le badge « À venir » / « En cours » / « Terminé »', () => {
    wrap(<EventRow event={ev({ id: 'a', name: 'Futur', periodStart: '2026-07-01', periodEnd: '2026-07-02' })} now={NOW} />)
    expect(screen.getByText('À venir')).toBeInTheDocument()
  })

  it('affiche « X remplis · Y vacants »', () => {
    wrap(<EventRow event={ev({})} stats={st({ filledSlots: 6, vacantSlots: 4, fillRate: 60 })} now={NOW} />)
    expect(screen.getByText('6 remplis · 4 vacants')).toBeInTheDocument()
  })
})
