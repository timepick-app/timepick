import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlotAgendaList } from '../SlotAgendaList'
import type { Slot } from '@/types/slot'

/**
 * Tests du composant agenda partagé (Direction A · places E2).
 * Horloge gelée au 19 juin 2026 : le créneau du 17 est « passé », ceux des
 * 20-22 sont à venir. TZ=Europe/Paris requis (cf. run-vitest-single).
 */

const ISO = '2026-06-01T00:00:00+02:00'
const LONG_DESC =
  'Observation de la lune, toute la nuit ! Places limitées, pensez à apporter une couverture chaude et un thermos.'

function makeSlot(partial: Partial<Slot> & Pick<Slot, 'id' | 'startTime' | 'endTime' | 'capacity' | 'currentBookings'>): Slot {
  return { eventId: 'evt', createdAt: ISO, updatedAt: ISO, cancelledAt: null, cancellationReason: null, ...partial }
}

const pastSlot = makeSlot({ id: 'past', startTime: '2026-06-17T09:00:00+02:00', endTime: '2026-06-17T10:00:00+02:00', capacity: 6, currentBookings: 0 })
const multiSlot = makeSlot({ id: 'multi', startTime: '2026-06-20T23:00:00+02:00', endTime: '2026-06-21T05:00:00+02:00', capacity: 10, currentBookings: 1, description: LONG_DESC })
const availSlot = makeSlot({ id: 'avail', startTime: '2026-06-22T14:00:00+02:00', endTime: '2026-06-22T16:00:00+02:00', capacity: 10, currentBookings: 2 })

const slots = [pastSlot, multiSlot, availSlot]

function renderList() {
  return render(
    <SlotAgendaList
      slots={slots}
      renderAction={(slot) => <button type="button">act-{slot.id}</button>}
      renderExtra={(slot) => <span>extra-{slot.id}</span>}
    />,
  )
}

describe('SlotAgendaList', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T12:00:00+02:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rend les descriptions en entier (jamais tronquées)', () => {
    renderList()
    expect(screen.getByText(LONG_DESC)).toBeInTheDocument()
  })

  it('regroupe par jour de début : un créneau multi-jours n\'apparaît qu\'une fois, sans « (suite) » (remarque #24)', () => {
    renderList()
    expect(screen.getAllByText('20 juin 23h00 → 21 juin 05h00')).toHaveLength(1)
    expect(screen.queryByText(/\(suite\)/)).not.toBeInTheDocument()
  })

  it('fusionne les places dans le badge (E2) pour les créneaux ouverts', () => {
    renderList()
    // Le badge est rendu pour les deux layouts (CSS-toggle) → au moins une occurrence.
    expect(screen.getAllByText('9 places').length).toBeGreaterThan(0)
    expect(screen.getAllByText('8 places').length).toBeGreaterThan(0)
    // E2 : plus de libellé qualitatif « Disponible »/« Partiel ».
    expect(screen.queryByText('Disponible')).not.toBeInTheDocument()
    expect(screen.queryByText('Partiel')).not.toBeInTheDocument()
  })

  it('affiche le badge « Passé » et atténue la rangée passée', () => {
    renderList()
    const passe = screen.getAllByText('Passé')[0]
    expect(passe.closest('li')).toHaveClass('opacity-60')
  })

  it('remarques #22/#23 : durée sans « · » de tête', () => {
    renderList()
    expect(screen.queryByText('· 2 jours')).not.toBeInTheDocument()
    expect(screen.queryByText('· 2h00')).not.toBeInTheDocument()
    expect(screen.queryByText('· 1h00')).not.toBeInTheDocument()
    expect(screen.getByText('2 jours')).toBeInTheDocument()
    expect(screen.getByText('2h00')).toBeInTheDocument()
  })

  it('délègue action et extra par créneau (multi-jours rendu une seule fois)', () => {
    renderList()
    expect(screen.getByText('act-avail')).toBeInTheDocument()
    expect(screen.getByText('extra-avail')).toBeInTheDocument()
    expect(screen.getAllByText('act-multi')).toHaveLength(1)
  })

  it('badge réservé : fusionne le nombre de places (remarque #26)', () => {
    const reserved = makeSlot({ id: 'res', startTime: '2026-06-25T10:00:00+02:00', endTime: '2026-06-25T11:00:00+02:00', capacity: 10, currentBookings: 3 })
    render(<SlotAgendaList slots={[reserved]} getHasBooked={() => true} renderAction={() => <button type="button">x</button>} />)
    expect(screen.getAllByText('Réservé · 7 places').length).toBeGreaterThan(0)
  })

  it('badge réservé : « complet » quand 0 place restante (remarque #26)', () => {
    const reservedFull = makeSlot({ id: 'resfull', startTime: '2026-06-25T10:00:00+02:00', endTime: '2026-06-25T11:00:00+02:00', capacity: 10, currentBookings: 10 })
    render(<SlotAgendaList slots={[reservedFull]} getHasBooked={() => true} renderAction={() => <button type="button">x</button>} />)
    expect(screen.getAllByText('Réservé · complet').length).toBeGreaterThan(0)
  })
})
