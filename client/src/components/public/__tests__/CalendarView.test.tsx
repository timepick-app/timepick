import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CalendarView } from '../CalendarView'
import FullCalendar from '@fullcalendar/react'
import type { Slot } from '@/types/slot'

// Zone prescrite pour les assertions « piège UTC » (story 1.1, NFR1 — DST).
// Déterministes uniquement sous Europe/Paris → exécutées via `TZ=Europe/Paris`,
// skippées ailleurs (cf. lib/__tests__/utils.test.ts).
const isParisTZ = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Paris'

// Mock FullCalendar to avoid complex DOM testing.
// NOTE: ce mock est un composant FONCTION sans forwardRef → la `ref` posée par
// CalendarView (calendarRef) NE s'attache PAS ici. La logique de bascule de vue
// (useLayoutEffect → getApi().changeView()) est donc un no-op silencieux dans CETTE
// suite et n'y est PAS couverte. Couverture réelle (vrai FullCalendar, nœud .fc
// préservé + reset tooltip) : CalendarView.viewchange.test.tsx.
vi.mock('@fullcalendar/react', () => ({
  default: vi.fn(({
    events,
    eventClick,
    dateClick,
    eventContent,
    eventDidMount,
    eventWillUnmount,
    moreLinkClick,
    headerToolbar,
    buttonText,
    locale,
    firstDay,
    initialView,
    editable,
    selectable,
    droppable,
    plugins,
    dayMaxEvents,
    allDaySlot,
    allDayText,
    slotMinTime,
    slotMaxTime,
    slotDuration,
    eventMinHeight,
    scrollTime,
    expandRows,
    validRange,
    initialDate,
  }) => (
    <div data-testid="full-calendar-mock">
      <div data-testid="fc-locale">{locale}</div>
      <div data-testid="fc-first-day">{firstDay}</div>
      <div data-testid="fc-initial-view">{initialView}</div>
      <div data-testid="fc-editable">{String(editable)}</div>
      <div data-testid="fc-selectable">{String(selectable)}</div>
      <div data-testid="fc-droppable">{String(droppable)}</div>
      <div data-testid="fc-plugins-count">{plugins?.length || 0}</div>
      <div data-testid="fc-day-max-events">{dayMaxEvents}</div>
      <div data-testid="fc-header-toolbar">{JSON.stringify(headerToolbar)}</div>
      <div data-testid="fc-button-text">{JSON.stringify(buttonText)}</div>
      <div data-testid="fc-events-count">{events.length}</div>
      <div data-testid="fc-expand-rows">{String(expandRows)}</div>
      <div data-testid="fc-valid-range">{JSON.stringify(validRange ?? null)}</div>
      <div data-testid="fc-initial-date">{initialDate ?? ''}</div>
      {/* Week view props */}
      <div data-testid="fc-all-day-slot">{String(allDaySlot)}</div>
      <div data-testid="fc-all-day-text">{allDayText}</div>
      <div data-testid="fc-slot-min-time">{slotMinTime}</div>
      <div data-testid="fc-slot-max-time">{slotMaxTime}</div>
      <div data-testid="fc-slot-duration">{slotDuration}</div>
      <div data-testid="fc-event-min-height">{eventMinHeight}</div>
      <div data-testid="fc-scroll-time">{scrollTime}</div>
      <div data-testid="fc-has-event-content">{String(!!eventContent)}</div>
      <div data-testid="fc-has-event-did-mount">{String(!!eventDidMount)}</div>
      <div data-testid="fc-has-event-will-unmount">{String(!!eventWillUnmount)}</div>
      <div data-testid="fc-has-more-link-click">{String(!!moreLinkClick)}</div>
      {events.map((e: { id: string; title: string; start: string; end?: string; allDay?: boolean; classNames?: string[] }) => (
        <div
          key={e.id}
          data-testid={`event-${e.id}`}
          data-classnames={JSON.stringify(e.classNames ?? [])}
          data-allday={String(e.allDay)}
          data-start={String(e.start)}
          data-end={String(e.end)}
          onClick={() => eventClick?.({ event: { id: e.id } })}
        >
          {e.title} - {e.start}
        </div>
      ))}
      {/* Render eventContent output for testing */}
      {eventContent && (() => {
        const availableResult = eventContent({
          event: {
            id: 'test-available',
            extendedProps: {
              slot: { id: 'test-slot', capacity: 5, currentBookings: 2, startTime: '2026-03-15T09:00:00Z', endTime: '2026-03-15T10:00:00Z' },
              status: 'available',
              isBooked: false,
            },
          },
          timeText: '09:00',
          view: { type: initialView },
        })
        const bookedResult = eventContent({
          event: {
            id: 'test-booked',
            extendedProps: {
              slot: { id: 'test-slot-2', capacity: 2, currentBookings: 1, startTime: '2026-03-15T10:00:00Z', endTime: '2026-03-15T11:00:00Z' },
              status: 'partial',
              isBooked: true,
            },
          },
          timeText: '10:00',
          view: { type: initialView },
        })
        const cancelledResult = eventContent({
          event: {
            id: 'test-cancelled',
            extendedProps: {
              slot: { id: 'test-slot-3', capacity: 2, currentBookings: 1, startTime: '2026-03-15T11:00:00Z', endTime: '2026-03-15T12:00:00Z', cancelledAt: '2026-03-10T12:00:00Z' },
              status: 'partial',
              isBooked: true,
            },
          },
          timeText: '11:00',
          view: { type: initialView },
        })
        return (
          <>
            <div data-testid="event-content-available" dangerouslySetInnerHTML={{ __html: availableResult.html }} />
            <div data-testid="event-content-booked" dangerouslySetInnerHTML={{ __html: bookedResult.html }} />
            <div data-testid="event-content-cancelled" dangerouslySetInnerHTML={{ __html: cancelledResult.html }} />
          </>
        )
      })()}
      {/* Render all-day (multi-day) eventContent output for testing */}
      {eventContent && (() => {
        const allDayResult = eventContent({
          event: {
            id: 'test-allday',
            allDay: true,
            extendedProps: {
              slot: { id: 'test-slot-md', capacity: 5, currentBookings: 0, startTime: '2026-03-15T09:00:00Z', endTime: '2026-03-17T17:00:00Z' },
              status: 'available',
              isBooked: false,
            },
          },
          timeText: '',
          view: { type: initialView },
        })
        return (
          <div data-testid="event-content-allday" dangerouslySetInnerHTML={{ __html: allDayResult.html }} />
        )
      })()}
      {/* Button to simulate moreLinkClick */}
      {moreLinkClick && (
        <button
          data-testid="more-link-trigger"
          onClick={() => {
            const result = moreLinkClick({ date: new Date('2026-03-15') })
            // Store the return value for test assertions
            const el = document.querySelector('[data-testid="more-link-trigger"]')
            if (el) el.setAttribute('data-return', String(result ?? 'void'))
          }}
        >
          +N more
        </button>
      )}
      {/* Button to simulate dateClick for drawer */}
      <button
        data-testid="date-click-trigger"
        onClick={() => dateClick?.({ date: new Date('2026-03-15') })}
      >
        Trigger Date Click
      </button>
    </div>
  )),
}))

// Mock @fullcalendar/daygrid
vi.mock('@fullcalendar/daygrid', () => ({
  default: {},
}))

// Mock @fullcalendar/timegrid
vi.mock('@fullcalendar/timegrid', () => ({
  default: {},
}))

// Mock @fullcalendar/core/locales/fr
vi.mock('@fullcalendar/core/locales/fr', () => ({
  default: { code: 'fr' },
}))

// Mock date-fns format
vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns')
  return {
    ...actual,
    format: vi.fn((date: Date | string, formatStr: string) => {
      const d = typeof date === 'string' ? new Date(date) : date
      if (formatStr === 'yyyy-MM-dd') {
        return d.toISOString().split('T')[0]
      }
      if (formatStr === 'HH:mm') {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
      if (formatStr === 'HH') {
        return String(d.getHours()).padStart(2, '0')
      }
      if (formatStr === 'mm') {
        return String(d.getMinutes()).padStart(2, '0')
      }
      if (formatStr === "HH'h'mm") {
        return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
      }
      return String(d)
    }),
  }
})

describe('CalendarView', () => {
  const mockSlots: Slot[] = [
    {
      id: 'slot-1',
      eventId: 'event-1',
      startTime: '2026-03-15T09:00:00Z',
      endTime: '2026-03-15T10:00:00Z',
      capacity: 5,
      currentBookings: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    },
    {
      id: 'slot-2',
      eventId: 'event-1',
      startTime: '2026-03-15T14:00:00Z',
      endTime: '2026-03-15T15:00:00Z',
      capacity: 5,
      currentBookings: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    },
    {
      id: 'slot-3',
      eventId: 'event-1',
      startTime: '2026-03-16T10:00:00Z',
      endTime: '2026-03-16T11:00:00Z',
      capacity: 2,
      currentBookings: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendu de base', () => {
    it('rend le composant FullCalendar', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('full-calendar-mock')).toBeInTheDocument()
    })

    it('configure la locale française', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-locale')).toHaveTextContent('fr')
    })

    it('configure le lundi comme premier jour de la semaine', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-first-day')).toHaveTextContent('1')
    })

    it('configure le header toolbar avec navigation', () => {
      vi.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00Z'))
      render(<CalendarView slots={mockSlots} />)
      const headerToolbar = JSON.parse(screen.getByTestId('fc-header-toolbar').textContent || '{}')
      expect(headerToolbar.left).toContain('prev')
      expect(headerToolbar.left).toContain('next')
      expect(headerToolbar.left).toContain('today')
      expect(headerToolbar.center).toBe('title')
      vi.useRealTimers()
    })

    it('configure le bouton "Aujourd\'hui" en français', () => {
      render(<CalendarView slots={mockSlots} />)
      const buttonText = JSON.parse(screen.getByTestId('fc-button-text').textContent || '{}')
      expect(buttonText.today).toBe("Aujourd'hui")
    })

    it('utilise les plugins dayGridPlugin et timeGridPlugin', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-plugins-count')).toHaveTextContent('2')
    })

    it('configure la vue par défaut dayGridMonth', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-initial-view')).toHaveTextContent('dayGridMonth')
    })

    it('désactive editable pour le mode lecture seule', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-editable')).toHaveTextContent('false')
    })

    it('désactive selectable pour le mode lecture seule', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-selectable')).toHaveTextContent('false')
    })

    it('désactive droppable pour le mode lecture seule', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-droppable')).toHaveTextContent('false')
    })

    it('configure dayMaxEvents pour limiter les événements par cellule', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-day-max-events')).toHaveTextContent('2')
    })
  })

  describe('Transformation des slots en événements', () => {
    it('passe tous les slots comme événements en vue mois', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      expect(screen.getByTestId('fc-events-count')).toHaveTextContent('3')
    })

    it('passe tous les slots comme événements en vue semaine', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-events-count')).toHaveTextContent('3')
    })

    it('un créneau réservé conserve sa couleur de remplissage (pas de fond bleu)', () => {
      // slot-2 : capacité 5, 3 réservations → statut "partial".
      // Réservé par l'utilisateur, il doit garder bg-slotPartial et NE PAS recevoir bg-slotBooked.
      render(<CalendarView slots={mockSlots} bookedSlotIds={new Set(['slot-2'])} calendarViewMode="month" />)
      const classNames = JSON.parse(
        screen.getByTestId('event-slot-2').getAttribute('data-classnames') || '[]'
      )
      expect(classNames).toContain('bg-slotPartial')
      expect(classNames).not.toContain('bg-slotBooked')
    })

    it('un créneau annulé reçoit slot-cancelled et aucune couleur de statut', () => {
      const cancelled: Slot = {
        id: 'slot-annule',
        eventId: 'event-1',
        startTime: '2026-03-15T09:00:00Z',
        endTime: '2026-03-15T10:00:00Z',
        capacity: 4,
        currentBookings: 2,
        cancelledAt: '2026-03-10T00:00:00Z',
        cancellationReason: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      render(<CalendarView slots={[cancelled]} calendarViewMode="month" />)
      const classNames: string[] = JSON.parse(
        screen.getByTestId('event-slot-annule').getAttribute('data-classnames') || '[]'
      )
      // L'annulé prime : marqueur slot-cancelled + gris figés, aucune couleur de statut.
      expect(classNames).toContain('slot-cancelled')
      expect(classNames).toContain('bg-gray-100')
      expect(classNames.some((c) => c.startsWith('bg-slot'))).toBe(false)
    })

    it('aria-label : annonce « — Réservé » / « — Annulé » selon le statut (eventDidMount)', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      const calls = (FullCalendar as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls
      const props = calls.at(-1)?.[0] as {
        eventDidMount?: (info: {
          event: { extendedProps: { slot?: Slot; isBooked?: boolean } }
          el: HTMLElement
        }) => void
      }
      const base: Slot = {
        id: 's-aria',
        eventId: 'event-1',
        startTime: '2026-03-15T09:00:00Z',
        endTime: '2026-03-15T10:00:00Z',
        capacity: 3,
        currentBookings: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        cancelledAt: null,
        cancellationReason: null,
      }
      const labelFor = (slot: Slot, isBooked?: boolean) => {
        const el = document.createElement('div')
        props.eventDidMount?.({ event: { extendedProps: { slot, isBooked } }, el })
        return el.getAttribute('aria-label') ?? ''
      }
      // Réservé (non annulé) → suffixe « — Réservé » (seul porteur du sens, le ✓ est aria-hidden).
      expect(labelFor(base, true)).toContain('— Réservé')
      // Annulé → « — Annulé » prioritaire, jamais « — Réservé » (même si réservé).
      const cancelled: Slot = { ...base, cancelledAt: '2026-03-10T00:00:00Z' }
      expect(labelFor(cancelled, true)).toContain('— Annulé')
      expect(labelFor(cancelled, true)).not.toContain('— Réservé')
      // Ni réservé ni annulé → aucun suffixe (le séparateur d'heure « - » n'est pas un tiret cadratin).
      expect(labelFor(base, false)).not.toContain('—')
    })
  })

  describe('Créneaux multi-jours (Story 1.2)', () => {
    const multiDay: Slot = {
      id: 'slot-md',
      eventId: 'event-1',
      startTime: '2026-03-15T09:00:00Z',
      endTime: '2026-03-17T17:00:00Z', // +2 jours calendaires (robuste TZ)
      capacity: 5,
      currentBookings: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    }

    it('un créneau multi-jours produit allDay:true + classe fc-event--multiday', () => {
      render(<CalendarView slots={[multiDay]} calendarViewMode="month" />)
      const el = screen.getByTestId('event-slot-md')
      expect(el).toHaveAttribute('data-allday', 'true')
      const classNames: string[] = JSON.parse(el.getAttribute('data-classnames') || '[]')
      expect(classNames).toContain('fc-event--multiday')
      // M1 — fin EXCLUSIVE en date locale (yyyy-MM-dd) pour couvrir le bon
      // nombre de jours (FC ignore l'heure de fin all-day). cf. getAllDayExclusiveEnd.
      expect(el.getAttribute('data-end')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('un créneau mono-jour reste allDay:false sans classe fc-event--multiday (FR12)', () => {
      render(<CalendarView slots={[mockSlots[0]]} calendarViewMode="month" />)
      const el = screen.getByTestId('event-slot-1')
      expect(el).toHaveAttribute('data-allday', 'false')
      const classNames: string[] = JSON.parse(el.getAttribute('data-classnames') || '[]')
      expect(classNames).not.toContain('fc-event--multiday')
      // M1 — mono-jour : fin = ISO brut inchangé (event timed, pas all-day).
      expect(el.getAttribute('data-end')).toBe(mockSlots[0].endTime)
    })

    it('la barre all-day affiche la plage multi-jours réelle + occupation (eventContent)', () => {
      render(<CalendarView slots={[multiDay]} calendarViewMode="week" />)
      const content = screen.getByTestId('event-content-allday')
      // Layout flex-row réutilisé + occupation inscrits/capacité.
      expect(content.innerHTML).toContain('tp-event-content')
      expect(content.innerHTML).toContain('0/5')
      // formatSlotRangeCompact (multi-jours) : forme compacte avec flèche, sans
      // « du … au » (réservé au tooltip/aria-label). La flèche prouve l'usage du
      // formateur compact ; les dates exactes dépendent de la locale (format mocké).
      expect(content.textContent).toContain('→')
      expect(content.textContent).not.toContain(' au ')
    })

    it.runIf(isParisTZ)(
      'snap < 30 min ignoré pour un multi-jours en vue semaine (start inchangé)',
      () => {
        // Paris CET : 22:50Z = 15 mars 23h50 local ; 23:05Z = 16 mars 00h05 local.
        // Multi-jours LOCAL (15≠16) MAIS durée 15 min < 30 → sans le garde-fou
        // !isMultiDay, le snap s'appliquerait à tort à un event all-day.
        const shortMultiDay: Slot = {
          id: 'slot-short-md',
          eventId: 'event-1',
          startTime: '2026-03-15T22:50:00Z',
          endTime: '2026-03-15T23:05:00Z',
          capacity: 5,
          currentBookings: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          cancelledAt: null,
          cancellationReason: null,
        }
        render(<CalendarView slots={[shortMultiDay]} calendarViewMode="week" />)
        const el = screen.getByTestId('event-slot-short-md')
        expect(el).toHaveAttribute('data-allday', 'true')
        // start NON snappé : conserve l'ISO brut (pas de réécriture local sans Z).
        expect(el).toHaveAttribute('data-start', '2026-03-15T22:50:00Z')
      }
    )

    it.runIf(isParisTZ)(
      'snap < 30 min toujours appliqué pour un mono-jour court en vue semaine (non-régression)',
      () => {
        // Mono-jour LOCAL, durée 15 min < 30 → le snap s'applique (start réécrit
        // sans suffixe Z), allDay reste false.
        const shortMonoDay: Slot = {
          id: 'slot-short-mono',
          eventId: 'event-1',
          startTime: '2026-03-15T10:10:00Z',
          endTime: '2026-03-15T10:25:00Z',
          capacity: 5,
          currentBookings: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          cancelledAt: null,
          cancellationReason: null,
        }
        render(<CalendarView slots={[shortMonoDay]} calendarViewMode="week" />)
        const el = screen.getByTestId('event-slot-short-mono')
        expect(el).toHaveAttribute('data-allday', 'false')
        // start snappé → réécrit en ISO local SANS Z (cf. logique de snap).
        expect(el.getAttribute('data-start')).not.toContain('Z')
      }
    )

    it('aria-label multi-jours : plage + « créneau multi-jours » + statut (eventDidMount)', () => {
      // buildSlotAriaLabel s'appuie sur isMultiDaySlot/formatSlotRange. `format`
      // est mocké (UTC) → on teste la STRUCTURE (« du … au … » + « multi-jours »),
      // pas la chaîne de date locale exacte (cf. intelligence 1.3).
      render(<CalendarView slots={[multiDay]} calendarViewMode="month" />)
      const calls = (FullCalendar as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls
      const props = calls.at(-1)?.[0] as {
        eventDidMount?: (info: {
          event: { extendedProps: { slot?: Slot; isBooked?: boolean } }
          el: HTMLElement
        }) => void
      }
      const labelFor = (slot: Slot, isBooked?: boolean) => {
        const el = document.createElement('div')
        props.eventDidMount?.({ event: { extendedProps: { slot, isBooked } }, el })
        return el.getAttribute('aria-label') ?? ''
      }
      const label = labelFor(multiDay, false)
      expect(label).toContain('créneau multi-jours')
      expect(label).toContain('du ')
      expect(label).toContain(' au ')
      // Mono-jour (FR12) : pas de mention « multi-jours ».
      expect(labelFor(mockSlots[0], false)).not.toContain('multi-jours')
    })
  })

  describe('Durcissement 1.6 — barre multi-jours a11y & statut (AC4, AC5)', () => {
    // Multi-jours déterministe (3 jours calendaires inclusifs). `date-fns.format`
    // est mocké en UTC (cf. en-tête) → on teste la STRUCTURE (« du … au » +
    // « créneau multi-jours » + suffixe de statut), jamais la chaîne de date locale.
    const multiDay: Slot = {
      id: 'slot-md-16',
      eventId: 'event-1',
      startTime: '2026-03-15T09:00:00Z',
      endTime: '2026-03-17T17:00:00Z',
      capacity: 5,
      currentBookings: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      cancelledAt: null,
      cancellationReason: null,
    }

    // Invoque le vrai handler eventDidMount sur un élément DOM neuf (comme
    // FullCalendar l'appellerait au montage) → on inspecte role/tabindex/aria-label
    // RÉELLEMENT posés (pas une reconstruction). Lacune revue 1.4 (L-4) : la
    // combinaison multi-jours × statut n'était couverte qu'isolément.
    const mountEvent = (slot: Slot, isBooked?: boolean): HTMLElement => {
      render(<CalendarView slots={[slot]} calendarViewMode="month" />)
      const calls = (FullCalendar as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }).mock.calls
      const props = calls.at(-1)?.[0] as {
        eventDidMount?: (info: {
          event: { extendedProps: { slot?: Slot; isBooked?: boolean } }
          el: HTMLElement
        }) => void
      }
      const el = document.createElement('div')
      props.eventDidMount?.({ event: { extendedProps: { slot, isBooked } }, el })
      return el
    }

    it('AC4 : la barre multi-jours est focusable (role="button" + tabindex="0")', () => {
      const el = mountEvent(multiDay, false)
      expect(el.getAttribute('role')).toBe('button')
      expect(el.getAttribute('tabindex')).toBe('0')
    })

    it('AC5 : aria-label multi-jours RÉSERVÉ → plage + « créneau multi-jours » + suffixe « — Réservé »', () => {
      const label = mountEvent(multiDay, true).getAttribute('aria-label') ?? ''
      expect(label).toContain('du ')
      expect(label).toContain(' au ')
      expect(label).toContain('créneau multi-jours')
      expect(label).toContain('— Réservé')
    })

    it('AC5 : aria-label multi-jours ANNULÉ → « créneau multi-jours » + « — Annulé » (jamais « — Réservé »)', () => {
      const cancelled: Slot = { ...multiDay, cancelledAt: '2026-03-10T00:00:00Z' }
      const label = mountEvent(cancelled, true).getAttribute('aria-label') ?? ''
      expect(label).toContain('créneau multi-jours')
      expect(label).toContain('— Annulé')
      expect(label).not.toContain('— Réservé')
    })
  })

  describe('Durcissement 1.6 — procédure axe DevTools manuelle (AC4)', () => {
    /**
     * NOTE : jsdom ne layoute pas FullCalendar (pas de géométrie, pas de couleur
     * calculée). Le CONTRASTE du sous-titre d'heures sur la barre colorée de
     * statut ne se vérifie donc qu'en navigateur réel. Pattern projet (cf.
     * SlotContextMenu.accessibility.test.tsx) : assertions clavier/aria
     * automatisées (ci-dessus) + procédure axe manuelle documentée ici.
     * AUCUNE dépendance @axe-core ajoutée (hors périmètre 1.6).
     *
     * La régression visuelle réelle (barre Mois / bandeau Semaine, 1280 + 375)
     * vit dans tests/e2e/multiday-calendar-visual.spec.ts.
     */

    it('⚠️ WCAG 1.4.3 Contraste : REQUIERT un scan axe DevTools manuel', () => {
      // ACTION REQUISE (navigateur réel, calendrier public d'un événement multi-jours) :
      // 1. Ouvrir le calendrier public → vue Mois puis vue Semaine, à 375px et 1280px.
      // 2. Lancer axe DevTools (extension Chrome) → onglet « Scan ».
      // 3. Vérifier « Color Contrast » sur la barre multi-jours :
      //    - libellé d'heures / plage (.tp-event-label)
      //      sur le fond de statut (bg-slot*) → ratio ≥ 4.5:1 (texte normal).
      //    - badge « Annulé » (.tp-slot-cancelled-badge) sur fond grisé → ≥ 4.5:1.
      // 4. Aucune violation « serious »/« critical » attendue.
      const manualChecks = [
        'Color Contrast ≥ 4.5:1 — heures sur barre de statut (Mois + Semaine)',
        'Color Contrast ≥ 4.5:1 — badge « Annulé » sur fond grisé',
        'Aucune violation axe serious/critical',
      ]
      expect(manualChecks.length).toBeGreaterThan(0)
    })

    it('⚠️ WCAG 2.1.1 Clavier : REQUIERT un test clavier manuel (focus + Entrée)', () => {
      // ACTION REQUISE (navigateur réel) :
      // 1. Tab jusqu'à une barre multi-jours → un contour de focus doit être visible.
      // 2. Le lecteur d'écran annonce l'aria-label : plage « du … au … » +
      //    « créneau multi-jours » (+ « — Réservé »/« — Annulé » le cas échéant).
      //    (Logique couverte en automatisé ci-dessus ; restitution vocale à confirmer.)
      // 3. Entrée/Espace ouvre le détail du créneau (SlotDetailDialog).
      expect(true).toBe(true) // Placeholder — test manuel requis
    })
  })

  describe('FullCalendar props — both views', () => {
    it('eventContent est passé en vue mois', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      expect(screen.getByTestId('fc-has-event-content')).toHaveTextContent('true')
    })

    it('eventContent est passé en vue semaine', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-has-event-content')).toHaveTextContent('true')
    })

    it('eventDidMount est passé en vue mois', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      expect(screen.getByTestId('fc-has-event-did-mount')).toHaveTextContent('true')
    })

    it('eventDidMount est passé en vue semaine', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-has-event-did-mount')).toHaveTextContent('true')
    })

    it('eventWillUnmount est passé en vue mois', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      expect(screen.getByTestId('fc-has-event-will-unmount')).toHaveTextContent('true')
    })

    it('moreLinkClick est passé en vue mois', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      expect(screen.getByTestId('fc-has-more-link-click')).toHaveTextContent('true')
    })

    it('moreLinkClick est passé en vue semaine', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-has-more-link-click')).toHaveTextContent('true')
    })

    it('expandRows=false en vue mois', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      expect(screen.getByTestId('fc-expand-rows')).toHaveTextContent('false')
    })

    it('expandRows=true en vue semaine', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-expand-rows')).toHaveTextContent('true')
    })
  })

  describe('Mode lecture seule', () => {
    it('propage les clics sur les événements vers onSelectSlot', () => {
      const onSelectSlot = vi.fn()
      render(<CalendarView slots={mockSlots} onSelectSlot={onSelectSlot} calendarViewMode="week" />)

      const event = screen.getByTestId('event-slot-1')
      event.click()

      expect(onSelectSlot).toHaveBeenCalledWith('slot-1')
    })

    it('ne propage pas les clics quand disabled est true', () => {
      const onSelectSlot = vi.fn()
      render(<CalendarView slots={mockSlots} onSelectSlot={onSelectSlot} disabled calendarViewMode="week" />)

      const event = screen.getByTestId('event-slot-1')
      event.click()

      expect(onSelectSlot).not.toHaveBeenCalled()
    })
  })

  describe('États vides', () => {
    it('affiche un message quand il n\'y a pas de créneaux', () => {
      render(<CalendarView slots={[]} />)
      expect(screen.getByText('Aucun créneau disponible')).toBeInTheDocument()
    })

    it('n\'affiche pas le message quand il y a des créneaux', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.queryByText('Aucun créneau disponible')).not.toBeInTheDocument()
    })
  })

  describe('Filtrage', () => {
    it('affiche l\'indicateur de filtrage quand isFiltered est true', () => {
      render(<CalendarView slots={mockSlots} allSlotsCount={10} isFiltered />)
      expect(screen.getByText('3 / 10 créneaux affichés')).toBeInTheDocument()
    })

    it('n\'affiche pas l\'indicateur de filtrage quand isFiltered est false', () => {
      render(<CalendarView slots={mockSlots} allSlotsCount={10} isFiltered={false} />)
      expect(screen.queryByText(/créneaux affichés/)).not.toBeInTheDocument()
    })
  })

  describe('Drawer intégration', () => {
    vi.mock('../DaySlotDrawer', () => ({
      DaySlotDrawer: ({ open, date, slots, onOpenChange }: {
        open: boolean
        date: Date | null
        slots: Slot[]
        onOpenChange: (open: boolean) => void
      }) => (
        <div
          data-testid="day-slot-drawer"
          data-open={String(open)}
          data-date={date?.toISOString() || 'null'}
          data-slots-count={slots.length}
        >
          <button onClick={() => onOpenChange(false)}>Close Drawer</button>
        </div>
      ),
    }))

    it('ne rend pas le drawer par défaut', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.queryByTestId('day-slot-drawer')).not.toBeInTheDocument()
    })

    it('rend le drawer quand enableDrawer est true', () => {
      render(<CalendarView slots={mockSlots} enableDrawer />)
      expect(screen.getByTestId('day-slot-drawer')).toBeInTheDocument()
    })

    it('active selectable quand enableDrawer est true', () => {
      render(<CalendarView slots={mockSlots} enableDrawer />)
      expect(screen.getByTestId('fc-selectable')).toHaveTextContent('true')
    })
  })

  describe('Vue semaine avec grille horaire', () => {
    it('utilise dayGridMonth par défaut', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-initial-view')).toHaveTextContent('dayGridMonth')
    })

    it('utilise timeGridWeek quand calendarViewMode="week"', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-initial-view')).toHaveTextContent('timeGridWeek')
    })

    it('configure allDaySlot=true (bandeau « toute la journée » pour les multi-jours, Story 1.2)', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-all-day-slot')).toHaveTextContent('true')
    })

    it('configure allDayText="Journée" (cohérence avec l\'admin)', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-all-day-text')).toHaveTextContent('Journée')
    })

    it('configure slotDuration (1h — D5a, cohérence admin)', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-slot-duration')).toHaveTextContent('01:00:00')
    })

    it('configure eventMinHeight=24 (plancher natif réflow-aware, anti-débordement)', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-event-min-height')).toHaveTextContent('24')
    })

    it('configure scrollTime', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      expect(screen.getByTestId('fc-scroll-time')).toHaveTextContent('08:00:00')
    })
  })

  describe('Week view event content rendering', () => {
    it('renders availability in X/Y format', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      const availableContent = screen.getByTestId('event-content-available')
      expect(availableContent.textContent).toContain('2/5')
      // Format aligné admin : « HHhMM → HHhMM | inscrits/capacité » (tâches 51-52).
      expect(availableContent.textContent).toMatch(/\d{2}h\d{2} → \d{2}h\d{2} \| 2\/5/)
    })

    it('renders booked events with check-circle badge', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      const bookedContent = screen.getByTestId('event-content-booked')
      expect(bookedContent.innerHTML).toContain('fc-event-booked-badge')
      // Pastille ronde = SVG check-circle partagé (tracé Heroicons), plus de glyphe ✓
      expect(bookedContent.innerHTML).toContain('M10 18a8')
      expect(bookedContent.innerHTML).not.toContain('Réservé')
      expect(bookedContent.innerHTML).not.toContain('✓')
    })

    it('renders cancelled events with « Annulé » badge (prime sur « Réservé »)', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      const cancelledContent = screen.getByTestId('event-content-cancelled')
      expect(cancelledContent.innerHTML).toContain('tp-slot-cancelled-badge')
      expect(cancelledContent.innerHTML).toContain('Annulé')
      expect(cancelledContent.innerHTML).not.toContain('Réservé')
      expect(cancelledContent.innerHTML).not.toContain('booked-badge')
    })

    it('includes timegrid CSS styles', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      const styleElement = document.querySelector('.calendar-view-public style')
      const cssText = styleElement?.textContent || ''
      expect(cssText).toContain('.fc-timegrid-slot')
      expect(cssText).toContain('.fc-timegrid-col')
      // D5 (plan 2026-06-11) : hauteur de ligne responsive via le clamp partagé.
      expect(cssText).toContain('--fc-hour-height')
      expect(cssText).toContain('clamp(')
    })

    it('includes mobile responsive styles', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      const styleElement = document.querySelector('.calendar-view-public style')
      const cssText = styleElement?.textContent || ''
      expect(cssText).toContain('@media (max-width: 768px)')
      expect(cssText).toContain('.fc-timegrid-slot')
      expect(cssText).toContain('font-size: 0.625rem')
    })
  })

  describe('Month view event content rendering', () => {
    it('renders unified month label (plage « h » + « | » + occupation, aligné admin)', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      const availableContent = screen.getByTestId('event-content-available')
      // Libellé unifié aligné sur l'admin : un seul span .tp-event-label.
      expect(availableContent.innerHTML).toContain('tp-event-content')
      expect(availableContent.innerHTML).toContain('tp-event-label')
      // Tâches 53-54 : plage « h » complète (séparateur flèche) + « | » + occupation.
      expect(availableContent.textContent).toMatch(/\d{2}h\d{2} → \d{2}h\d{2} \| 2\/5/)
    })

    it('renders check-circle badge in month view', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      const bookedContent = screen.getByTestId('event-content-booked')
      expect(bookedContent.innerHTML).toContain('fc-event-booked-badge')
      expect(bookedContent.innerHTML).toContain('M10 18a8')
      expect(bookedContent.innerHTML).not.toContain('Réservé')
      expect(bookedContent.innerHTML).not.toContain('✓')
    })

    it('renders cancelled badge in month view', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      const cancelledContent = screen.getByTestId('event-content-cancelled')
      expect(cancelledContent.innerHTML).toContain('tp-slot-cancelled-badge')
      expect(cancelledContent.innerHTML).toContain('Annulé')
    })

    it('includes month event CSS styles', () => {
      render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      const styleElement = document.querySelector('.calendar-view-public style')
      const cssText = styleElement?.textContent || ''
      expect(cssText).toContain('.tp-event-content')
      expect(cssText).toContain('.tp-event-label')
    })
  })

  describe('Navigation identique entre vues', () => {
    it('utilise la même configuration de navigation en mode mois et semaine', () => {
      const { rerender } = render(<CalendarView slots={mockSlots} calendarViewMode="month" />)
      const monthToolbar = JSON.parse(screen.getByTestId('fc-header-toolbar').textContent || '{}')

      rerender(<CalendarView slots={mockSlots} calendarViewMode="week" />)
      const weekToolbar = JSON.parse(screen.getByTestId('fc-header-toolbar').textContent || '{}')

      expect(weekToolbar.left).toBe(monthToolbar.left)
      expect(weekToolbar.center).toBe(monthToolbar.center)
    })
  })

  describe('moreLinkClick behavior', () => {
    it('returns "popover" when enableDrawer is false', () => {
      render(<CalendarView slots={mockSlots} enableDrawer={false} />)
      const trigger = screen.getByTestId('more-link-trigger')
      trigger.click()
      expect(trigger.getAttribute('data-return')).toBe('popover')
    })

    it('opens drawer and returns void when enableDrawer is true', () => {
      render(<CalendarView slots={mockSlots} enableDrawer />)
      const trigger = screen.getByTestId('more-link-trigger')
      act(() => { trigger.click() })
      expect(trigger.getAttribute('data-return')).toBe('void')
      expect(screen.getByTestId('day-slot-drawer')).toHaveAttribute('data-open', 'true')
    })
  })

  describe('Accessibilité', () => {
    it('a le data-testid "calendar-view"', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('calendar-view')).toBeInTheDocument()
    })
  })

  describe('validRange et initialDate', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('calcule validRange couvrant le mois complet (vue mois)', () => {
      render(<CalendarView slots={mockSlots} />)
      const validRange = JSON.parse(screen.getByTestId('fc-valid-range').textContent || 'null')
      // Mois de mars complet : 1er mars au 1er avril (exclusif)
      expect(validRange).toEqual({ start: '2026-03-01', end: '2026-04-01' })
    })

    it('calcule initialDate depuis le slot le plus tôt', () => {
      render(<CalendarView slots={mockSlots} />)
      expect(screen.getByTestId('fc-initial-date')).toHaveTextContent('2026-03-15')
    })

    it('utilise slotRangeSource prioritairement sur slots pour le range', () => {
      const widerSlots: Slot[] = [
        {
          id: 'wider-1',
          eventId: 'event-1',
          startTime: '2026-02-01T09:00:00Z',
          endTime: '2026-02-01T10:00:00Z',
          capacity: 5,
          currentBookings: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          cancelledAt: null,
          cancellationReason: null,
        },
      ]
      render(<CalendarView slots={mockSlots} slotRangeSource={widerSlots} />)
      const validRange = JSON.parse(screen.getByTestId('fc-valid-range').textContent || 'null')
      // Mois de février complet : 1er fév au 1er mars (exclusif)
      expect(validRange.start).toBe('2026-02-01')
      expect(validRange.end).toBe('2026-03-01')
      // Events still come from filtered slots
      expect(screen.getByTestId('fc-events-count')).toHaveTextContent('3')
    })

    it('masque le bouton "Aujourd\'hui" quand la date courante est avant la période', () => {
      vi.useFakeTimers().setSystemTime(new Date('2026-01-15T12:00:00Z'))
      render(<CalendarView slots={mockSlots} />)
      const headerToolbar = JSON.parse(screen.getByTestId('fc-header-toolbar').textContent || '{}')
      expect(headerToolbar.left).not.toContain('today')
      expect(headerToolbar.left).toContain('prev')
      expect(headerToolbar.left).toContain('next')
    })

    it('masque le bouton "Aujourd\'hui" quand la date courante est après la période', () => {
      vi.useFakeTimers().setSystemTime(new Date('2026-12-25T12:00:00Z'))
      render(<CalendarView slots={mockSlots} />)
      const headerToolbar = JSON.parse(screen.getByTestId('fc-header-toolbar').textContent || '{}')
      expect(headerToolbar.left).not.toContain('today')
    })

    it('affiche le bouton "Aujourd\'hui" quand la date courante est dans la période', () => {
      vi.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00Z'))
      render(<CalendarView slots={mockSlots} />)
      const headerToolbar = JSON.parse(screen.getByTestId('fc-header-toolbar').textContent || '{}')
      expect(headerToolbar.left).toContain('today')
    })

    it('gère un slot unique correctement (end = mois suivant)', () => {
      const singleSlot: Slot[] = [
        {
          id: 'single-1',
          eventId: 'event-1',
          startTime: '2026-06-10T09:00:00Z',
          endTime: '2026-06-10T10:00:00Z',
          capacity: 5,
          currentBookings: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          cancelledAt: null,
          cancellationReason: null,
        },
      ]
      render(<CalendarView slots={singleSlot} />)
      const validRange = JSON.parse(screen.getByTestId('fc-valid-range').textContent || 'null')
      // Mois de juin complet
      expect(validRange).toEqual({ start: '2026-06-01', end: '2026-07-01' })
    })

    it('affiche le placeholder quand slots est vide (pas de FullCalendar)', () => {
      render(<CalendarView slots={[]} />)
      expect(screen.queryByTestId('full-calendar-mock')).not.toBeInTheDocument()
      expect(screen.getByText('Aucun créneau disponible')).toBeInTheDocument()
    })
  })
})
