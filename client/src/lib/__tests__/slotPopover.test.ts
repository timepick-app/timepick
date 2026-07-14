import { describe, it, expect } from 'vitest'
import type { Slot, Volunteer } from '@/types/slot'
import {
  splitVolunteers,
  popoverStatusLabel,
  MAX_VISIBLE_VOLUNTEERS,
} from '../slotPopover'

const makeSlot = (overrides: Partial<Slot> = {}): Slot => ({
  id: 'slot-1',
  eventId: 'event-1',
  startTime: '2026-06-13T14:00:00Z',
  endTime: '2026-06-13T16:00:00Z',
  capacity: 4,
  currentBookings: 0,
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  cancelledAt: null,
  cancellationReason: null,
  ...overrides,
})

const named = (n: number): Volunteer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `u${i}`, name: `Prénom${i} Nom${i}` }))

describe('splitVolunteers', () => {
  it('au seuil (4) : tout affiché, aucun masqué', () => {
    const r = splitVolunteers(named(4))
    expect(r.shown).toHaveLength(4)
    expect(r.hiddenCount).toBe(0)
    expect(r.allUnnamed).toBe(false)
  })

  it('au-dessus du seuil (5) : 4 affichés + 1 masqué', () => {
    const r = splitVolunteers(named(5))
    expect(r.shown).toHaveLength(MAX_VISIBLE_VOLUNTEERS)
    expect(r.hiddenCount).toBe(1)
  })

  it('sous le seuil (3) : tout affiché', () => {
    const r = splitVolunteers(named(3))
    expect(r.shown).toHaveLength(3)
    expect(r.hiddenCount).toBe(0)
  })

  it('un réservant sans nom est exclu des lignes mais compté dans hiddenCount', () => {
    const list: Volunteer[] = [
      { id: 'a', name: 'Alice Martin' },
      { id: 'b', name: null },
      { id: 'c', name: 'Claire Morin' },
    ]
    const r = splitVolunteers(list)
    expect(r.shown).toEqual(['Alice Martin', 'Claire Morin'])
    expect(r.hiddenCount).toBe(1)
    expect(r.allUnnamed).toBe(false)
  })

  it('tous sans nom : allUnnamed=true, aucune ligne, comptés en hiddenCount', () => {
    const list: Volunteer[] = [
      { id: 'a', name: null },
      { id: 'b', name: '   ' },
    ]
    const r = splitVolunteers(list)
    expect(r.shown).toEqual([])
    expect(r.hiddenCount).toBe(2)
    expect(r.allUnnamed).toBe(true)
  })

  it('null / undefined / vide : aucune ligne, aucun masqué, pas de fallback', () => {
    for (const input of [null, undefined, [] as Volunteer[]]) {
      const r = splitVolunteers(input)
      expect(r.shown).toEqual([])
      expect(r.hiddenCount).toBe(0)
      expect(r.allUnnamed).toBe(false)
    }
  })
})

describe('popoverStatusLabel', () => {
  it('annulé : rouge, « Créneau annulé » (prime sur l\'occupation)', () => {
    const s = makeSlot({ cancelledAt: '2026-05-01T00:00:00Z', capacity: 4, currentBookings: 2 })
    expect(popoverStatusLabel(s)).toEqual({ label: 'Créneau annulé', tone: 'red' })
  })

  it('complet (0 place) : ambre, « Complet · N / N »', () => {
    const s = makeSlot({ capacity: 2, currentBookings: 2 })
    expect(popoverStatusLabel(s)).toEqual({ label: 'Complet · 2 / 2', tone: 'amber' })
  })

  it('presque complet (1 place) : ambre, singulier', () => {
    const s = makeSlot({ capacity: 4, currentBookings: 3 })
    expect(popoverStatusLabel(s)).toEqual({ label: '1 / 4 place', tone: 'amber' })
  })

  it('disponible (≥2 places) : neutre muted, pluriel', () => {
    const s = makeSlot({ capacity: 4, currentBookings: 2 })
    expect(popoverStatusLabel(s)).toEqual({ label: '2 / 4 places', tone: 'muted' })
  })
})
