import { describe, it, expect } from 'vitest'
import type { Slot } from '../../types/slot'
import {
  getSlotStatus,
  getSlotStatusDescriptor,
  resolveSlotStatusDescriptor,
  SLOT_STATUS_VARIANTS,
  type SlotStatus,
} from '../slotStatus'

const HOUR = 60 * 60 * 1000

/**
 * Fabrique un créneau « disponible / futur » par défaut, surchargeable.
 * Les dates sont relatives à maintenant pour tester `isSlotPast` sans timers.
 */
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

const pastSlot = (overrides: Partial<Slot> = {}) =>
  makeSlot({
    startTime: new Date(Date.now() - 3 * HOUR).toISOString(),
    endTime: new Date(Date.now() - 2 * HOUR).toISOString(),
    ...overrides,
  })

describe('getSlotStatus — ordre de priorité', () => {
  it('« Annulé » l\'emporte sur tout (passé + complet + réservé)', () => {
    const slot = pastSlot({ capacity: 2, currentBookings: 2, cancelledAt: '2026-05-01T00:00:00Z' })
    expect(getSlotStatus(slot, { hasBooked: true })).toBe('cancelled')
  })

  it('« Passé » l\'emporte sur réservé et complet (hors annulé)', () => {
    const slot = pastSlot({ capacity: 2, currentBookings: 2 })
    expect(getSlotStatus(slot, { hasBooked: true })).toBe('past')
  })

  it('« Réservé » l\'emporte sur complet/partiel/disponible (créneau futur)', () => {
    const slot = makeSlot({ capacity: 2, currentBookings: 2 })
    expect(getSlotStatus(slot, { hasBooked: true })).toBe('reserved')
  })

  it('« Complet » quand currentBookings >= capacity et non réservé', () => {
    expect(getSlotStatus(makeSlot({ capacity: 2, currentBookings: 2 }))).toBe('full')
  })

  it('« Partiel » quand 0 < currentBookings < capacity', () => {
    expect(getSlotStatus(makeSlot({ capacity: 3, currentBookings: 1 }))).toBe('partial')
  })

  it('« Disponible » quand aucune réservation', () => {
    expect(getSlotStatus(makeSlot({ capacity: 3, currentBookings: 0 }))).toBe('available')
  })

  it('hasBooked par défaut à false', () => {
    expect(getSlotStatus(makeSlot({ capacity: 2, currentBookings: 2 }))).toBe('full')
  })
})

describe('SLOT_STATUS_VARIANTS — exhaustivité', () => {
  const allStatuses: SlotStatus[] = ['cancelled', 'past', 'reserved', 'full', 'partial', 'available']

  it('déclare les 6 états', () => {
    expect(Object.keys(SLOT_STATUS_VARIANTS).sort()).toEqual([...allStatuses].sort())
  })

  it.each(allStatuses)('l\'état « %s » expose icône, libellés et classes', (status) => {
    const v = SLOT_STATUS_VARIANTS[status]
    // Icône React valide : fonction simple (CheckCircleSolid) ou objet forwardRef (lucide)
    expect(['function', 'object']).toContain(typeof v.Icon)
    expect(v.Icon).toBeTruthy()
    expect(v.badgeLabel.length).toBeGreaterThan(0)
    expect(v.bannerLabel.length).toBeGreaterThan(0)
    expect(v.ariaLabel.length).toBeGreaterThan(0)
    expect(v.classes.surface).toMatch(/bg-\w+-\d+/)
    expect(v.classes.icon).toMatch(/text-\w+-\d+/)
    expect(v.classes.fill).toMatch(/bg-\w+-\d+/)
    expect(v.classes.borderLeft).toMatch(/border-l-\w+-\d+/)
  })
})

describe('getSlotStatusDescriptor — libellés', () => {
  it('« Réservé » : pastille « Réservé », encart de confirmation, palette bleue', () => {
    const d = getSlotStatusDescriptor(makeSlot(), { hasBooked: true })
    expect(d.status).toBe('reserved')
    expect(d.badgeLabel).toBe('Réservé')
    expect(d.bannerLabel).toBe('Vous avez réservé ce créneau')
    expect(d.classes.surface).toContain('bg-blue-50')
  })

  it('« Disponible » : encart = nombre de places (pluriel), palette verte', () => {
    const d = getSlotStatusDescriptor(makeSlot({ capacity: 3, currentBookings: 0 }))
    expect(d.status).toBe('available')
    expect(d.badgeLabel).toBe('Disponible')
    expect(d.bannerLabel).toBe('3 places disponibles sur 3')
    expect(d.ariaLabel).toBe('3 places disponibles sur 3')
    expect(d.classes.surface).toContain('bg-green-50')
  })

  it('« Partiel » : encart = nombre de places (singulier), palette ambre', () => {
    const d = getSlotStatusDescriptor(makeSlot({ capacity: 2, currentBookings: 1 }))
    expect(d.status).toBe('partial')
    expect(d.badgeLabel).toBe('Partiel')
    expect(d.bannerLabel).toBe('1 place disponible sur 2')
    expect(d.classes.surface).toContain('bg-amber-50')
  })

  it('« Complet » : palette orange (pas rouge)', () => {
    const d = getSlotStatusDescriptor(makeSlot({ capacity: 2, currentBookings: 2 }))
    expect(d.status).toBe('full')
    expect(d.badgeLabel).toBe('Complet')
    expect(d.bannerLabel).toBe('Complet')
    expect(d.classes.surface).toContain('bg-orange-50')
  })

  it('« Annulé » : palette rouge, barre de remplissage neutre', () => {
    const d = getSlotStatusDescriptor(makeSlot({ cancelledAt: '2026-05-01T00:00:00Z' }))
    expect(d.status).toBe('cancelled')
    expect(d.badgeLabel).toBe('Annulé')
    expect(d.bannerLabel).toBe('Créneau annulé')
    expect(d.classes.surface).toContain('bg-red-50')
    expect(d.classes.fill).toBe('bg-gray-400')
  })

  it('« Passé » : palette grise atténuée', () => {
    const d = getSlotStatusDescriptor(pastSlot())
    expect(d.status).toBe('past')
    expect(d.badgeLabel).toBe('Passé')
    expect(d.bannerLabel).toBe('Créneau passé')
    expect(d.classes.surface).toContain('text-gray-500')
  })
})

describe('resolveSlotStatusDescriptor — slot ou status explicite', () => {
  it('utilise le status explicite (libellés statiques, pas de calcul de places)', () => {
    const d = resolveSlotStatusDescriptor({ status: 'available' })
    expect(d.status).toBe('available')
    expect(d.badgeLabel).toBe('Disponible')
    expect(d.bannerLabel).toBe('Disponible')
  })

  it('le status explicite prime sur le slot', () => {
    const d = resolveSlotStatusDescriptor({ slot: makeSlot({ capacity: 2, currentBookings: 2 }), status: 'reserved' })
    expect(d.status).toBe('reserved')
  })

  it('calcule depuis le slot quand status absent', () => {
    const d = resolveSlotStatusDescriptor({ slot: makeSlot({ capacity: 3, currentBookings: 0 }) })
    expect(d.status).toBe('available')
    expect(d.bannerLabel).toBe('3 places disponibles sur 3')
  })

  it('lève une erreur si ni slot ni status', () => {
    expect(() => resolveSlotStatusDescriptor({})).toThrow()
  })
})
