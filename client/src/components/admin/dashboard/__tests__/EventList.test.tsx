import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventList } from '../EventList'
import { sortEvents } from '../eventListSort'
import type { Event } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'

vi.mock('../EventRow', () => ({ EventRow: () => <div data-testid="event-row" /> }))

const ev = (o: Partial<Event> = {}): Event => ({
  id: 'e1', name: 'Test', description: null, isPublished: true, opensAt: null,
  hasCustomInvitation: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  periodStart: null, periodEnd: null, ...o,
})
const st = (o: Partial<EventStats> = {}): EventStats => ({
  eventId: 'e1', totalSlots: 0, filledSlots: 0, vacantSlots: 0, fillRate: 0,
  totalCapacity: 0, totalBookings: 0, ...o,
})

describe('sortEvents', () => {
  const a = ev({ id: 'a', name: 'Charlie', periodStart: '2026-08-01' })
  const b = ev({ id: 'b', name: 'Alpha', periodStart: '2026-07-01' })
  const c = ev({ id: 'c', name: 'Bravo', periodStart: '2026-09-01' })
  const statsById = new Map<string, EventStats>([
    ['a', st({ eventId: 'a', fillRate: 10 })],
    ['b', st({ eventId: 'b', fillRate: 90 })],
    ['c', st({ eventId: 'c', fillRate: 50 })],
  ])

  it('trie par nom (alphabétique)', () => {
    expect(sortEvents([a, b, c], statsById, 'name').map((e) => e.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
  it('trie par remplissage (décroissant)', () => {
    expect(sortEvents([a, b, c], statsById, 'fill').map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })
  it('trie par date (début croissant)', () => {
    expect(sortEvents([a, b, c], statsById, 'date').map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('EventList', () => {
  describe('état vide (events=[])', () => {
    it('affiche « Aucun événement »', () => {
      render(<EventList events={[]} stats={[]} />)
      expect(screen.getByText('Aucun événement')).toBeInTheDocument()
    })

    it('masque les pills « Trier par »', () => {
      render(<EventList events={[]} stats={[]} />)
      expect(screen.queryByText('Trier par')).toBeNull()
    })

    it('n\'affiche aucune ligne événement', () => {
      render(<EventList events={[]} stats={[]} />)
      expect(screen.queryAllByTestId('event-row')).toHaveLength(0)
    })
  })

  describe('état non vide (events.length > 0)', () => {
    it('affiche les pills « Trier par » et les lignes événement', () => {
      const events = [ev({ id: 'a' }), ev({ id: 'b' })]
      const stats = [st({ eventId: 'a' }), st({ eventId: 'b' })]
      render(<EventList events={events} stats={stats} />)
      expect(screen.getByText('Trier par')).toBeInTheDocument()
      expect(screen.getAllByTestId('event-row')).toHaveLength(2)
    })

    it('n\'affiche pas le message vide', () => {
      render(<EventList events={[ev({ id: 'a' })]} stats={[st({ eventId: 'a' })]} />)
      expect(screen.queryByText('Aucun événement')).toBeNull()
    })
  })
})
