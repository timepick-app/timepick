import { render, waitFor, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CalendarView } from '../CalendarView'
import type { Slot } from '@/types/slot'

/**
 * Régression anti-flash : la bascule mois↔semaine NE DOIT PAS remonter
 * FullCalendar.
 *
 * Contexte :
 * le flash blanc « de reconstruction » est un REMOUNT du composant FullCalendar
 * (`calendar.destroy()` → `.fc` détruit → reconstruit). `EventCalendarContent`
 * portait `key={viewMode}` sur `<CalendarView>`, qui forçait ce remount à chaque
 * changement de vue. La clé a été retirée ; CalendarView pilote désormais la vue
 * via `getApi().changeView()` (useLayoutEffect, sans remount).
 *
 * Ce test utilise le VRAI FullCalendar (pas de mock) pour vérifier au niveau DOM
 * que le nœud `.fc` est PRÉSERVÉ (===) à travers la bascule de vue, et que la vue
 * a bien changé (timegrid présent en semaine, absent en mois).
 */
describe('CalendarView — bascule de vue sans remount (anti-flash)', () => {
  const slots: Slot[] = [
    {
      id: 's1',
      eventId: 'e1',
      startTime: '2026-03-16T09:00:00Z',
      endTime: '2026-03-16T10:00:00Z',
      capacity: 5,
      currentBookings: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    },
    {
      id: 's2',
      eventId: 'e1',
      startTime: '2026-03-17T14:00:00Z',
      endTime: '2026-03-17T15:00:00Z',
      capacity: 5,
      currentBookings: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    },
  ]

  it('change la vue mois→semaine sans recréer le nœud .fc', async () => {
    const { container, rerender } = render(
      <CalendarView slots={slots} calendarViewMode="month" />
    )

    await waitFor(() => expect(container.querySelector('.fc')).not.toBeNull())
    const fcBefore = container.querySelector('.fc')
    // Vue mois : pas de grille horaire (timegrid).
    expect(container.querySelector('.fc-timegrid')).toBeNull()

    rerender(<CalendarView slots={slots} calendarViewMode="week" />)

    // changeView (useLayoutEffect) bascule en timeGridWeek → la grille horaire apparaît.
    await waitFor(() => expect(container.querySelector('.fc-timegrid')).not.toBeNull())

    // INVARIANT CLÉ : même nœud .fc → AUCUN remount (donc pas de flash blanc).
    expect(container.querySelector('.fc')).toBe(fcBefore)
  })

  it('change la vue semaine→mois sans recréer le nœud .fc', async () => {
    const { container, rerender } = render(
      <CalendarView slots={slots} calendarViewMode="week" />
    )

    await waitFor(() => expect(container.querySelector('.fc')).not.toBeNull())
    const fcBefore = container.querySelector('.fc')
    expect(container.querySelector('.fc-timegrid')).not.toBeNull()

    rerender(<CalendarView slots={slots} calendarViewMode="month" />)

    await waitFor(() => expect(container.querySelector('.fc-timegrid')).toBeNull())
    expect(container.querySelector('.fc')).toBe(fcBefore)
  })

  it('ferme le tooltip à la bascule de vue (anti-fantôme tactile)', async () => {
    const { container, rerender } = render(
      <CalendarView slots={slots} calendarViewMode="month" />
    )

    // Un événement monté porte le listener `mouseenter` + `data-tp-slot-id` posés
    // par `eventDidMount`. On simule le survol → ouvre le tooltip (état interne).
    const eventEl = await waitFor(() => {
      const el = container.querySelector<HTMLElement>('.fc-event[data-tp-slot-id]')
      if (!el) throw new Error('aucun événement monté')
      return el
    })
    act(() => {
      eventEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    })

    // Le tooltip (portal dans document.body) apparaît après le délai de 300 ms.
    await waitFor(
      () => expect(document.querySelector('[role="tooltip"]')).not.toBeNull(),
      { timeout: 2000 }
    )

    // Bascule de vue → handleTooltipClose() doit fermer le tooltip (sinon il resterait
    // ancré sur un nœud d'événement détruit par changeView = fantôme tactile).
    rerender(<CalendarView slots={slots} calendarViewMode="week" />)

    await waitFor(() => expect(document.querySelector('[role="tooltip"]')).toBeNull())
  })
})
