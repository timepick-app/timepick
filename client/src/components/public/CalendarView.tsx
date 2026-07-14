import { useMemo, useCallback, useState, useRef, useEffect, useLayoutEffect, memo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import frLocale from '@fullcalendar/core/locales/fr'
import type { EventContentArg, EventMountArg, MoreLinkArg, DatesSetArg } from '@fullcalendar/core'
import { format, startOfWeek, endOfWeek, addDays, startOfMonth, addMonths } from 'date-fns'
import type { Slot } from '../../types/slot'
import { getAvailabilityStatus } from '../../types/slot'
import { getSlotClassNames } from '../../lib/slotClassNames'
import { renderWeekDayHeader } from '../../lib/calendarDayHeader'
import { isMultiDaySlot, formatSlotRange, formatSlotRangeCompact, formatTimeRangeFrench, getAllDayExclusiveEnd, buildSlotsByDate } from '../../lib/utils'
import { CHECK_CIRCLE_SOLID_PATH } from '../ui/CheckCircleSolid'
import { DaySlotDrawer } from './DaySlotDrawer'
import { CalendarTooltip, type CalendarTooltipData } from './CalendarTooltip'

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of events to display in a day cell before showing "+X more" */
const DAY_MAX_EVENTS = 2

/** ID for the calendar tooltip (used for aria-describedby) */
const CALENDAR_TOOLTIP_ID = 'calendar-tooltip'

/**
 * Calendar view mode for FullCalendar configuration
 * Story 19.5: 'month' for dayGridMonth, 'week' for timeGridWeek
 */
type CalendarViewMode = 'month' | 'week'

/**
 * Props pour le composant CalendarView
 */
export interface CalendarViewProps {
  slots: Slot[]
  allSlotsCount?: number // Story 6.7 - Nombre total de slots (pour indicateur de filtrage)
  isFiltered?: boolean // Story 6.7 - Indique si l'affichage est filtré
  onSelectSlot?: (slotId: string) => void
  disabled?: boolean
  bookedSlotIds?: Set<string> // Story 6.7 - IDs des créneaux réservés par l'utilisateur
  enableDrawer?: boolean // Story 19.3 - Activer le drawer au clic sur un jour
  calendarViewMode?: CalendarViewMode // Story 19.5 - 'month' ou 'week' (défaut: 'month')
  slotRangeSource?: Slot[] // Slots non-filtrés pour le calcul du range de navigation
}

/**
 * Libellé accessible d'un créneau : plage horaire + statut annoncé au lecteur
 * d'écran (annulé prioritaire, puis réservé). La plage conserve le séparateur
 * espacé « - » (meilleure diction), distinct du tiret cadratin du suffixe.
 */
// Options FullCalendar statiques — déclarées au niveau module pour référence stable
// (évite que resetOptions les revoie comme "changées" à chaque render)
const FC_PLUGINS = [dayGridPlugin, timeGridPlugin]
const FC_LOCALES = [frLocale]
const FC_BUTTON_TEXT = { today: "Aujourd'hui" }

function buildSlotAriaLabel(slot: Slot, isBooked: boolean): string {
  const isMulti = isMultiDaySlot(slot.startTime, slot.endTime)
  // Plage via le formateur canonique : mono-jour « 09h00 → 10h00 », multi-jours
  // « du … au … ». `nature` explicite le multi-jours pour les lecteurs d'écran.
  const range = formatSlotRange(slot.startTime, slot.endTime)
  const nature = isMulti ? ', créneau multi-jours' : ''
  const suffix = slot.cancelledAt != null ? ' — Annulé' : isBooked ? ' — Réservé' : ''
  return `${range}${nature}${suffix}`
}
/**
 * Rendu custom des événements (vues Mois ET Semaine) : un libellé unique
 * uniforme `.tp-event-label`, identique au calendrier admin (source de vérité
 * partagée). Le contenu vient des formateurs canoniques `lib/utils` :
 *  - mono-jour   → `formatTimeRangeFrench` (« 18h00 → 19h00 | 0/3 »)
 *  - multi-jours → `formatSlotRangeCompact` + occupation (« 13 juin 14h00 → 15 juin 14h00 | 1/4 »)
 * Le séparateur « h », le « | » et l'occupation sont donc portés par les
 * formateurs — plus aucun formateur local divergent côté public.
 */
function renderEventContent(eventInfo: EventContentArg): { html: string } {
  const slot = eventInfo.event.extendedProps.slot as Slot | undefined
  const isBooked = eventInfo.event.extendedProps.isBooked as boolean | undefined
  const isCancelled = slot ? slot.cancelledAt != null : false

  // Libellé aligné sur l'admin : multi-jours en forme compacte DST-safe (la
  // cellule est étroite, la forme longue « du … au » déborde — réservée au
  // tooltip/aria-label) ; mono-jour en plage française complète. L'occupation
  // (inscrits/capacité) est suffixée par « | », cohérente avec l'admin.
  let label: string
  if (slot) {
    label = eventInfo.event.allDay
      ? `${formatSlotRangeCompact(slot.startTime, slot.endTime)} | ${slot.currentBookings ?? 0}/${slot.capacity}`
      : formatTimeRangeFrench(slot.startTime, slot.endTime, slot.currentBookings ?? 0, slot.capacity)
  } else {
    label = eventInfo.timeText
  }

  // « Annulé » prime sur « réservé » (un créneau annulé n'est visible que pour
  // son inscrit). Badge « Annulé » : pastille texte rouge épinglée après le
  // libellé (barré porté par le calque partagé .tp-calendar sur .tp-event-label).
  const cancelledBadge = isCancelled ? `<span class="tp-slot-cancelled-badge">Annulé</span>` : ''
  // Badge « réservé » : pastille ronde check-circle poussée à droite
  // (margin-left:auto). Décoratif (aria-hidden) ; son sens est porté par
  // l'aria-label de l'événement (cf. handleEventDidMount). Disque blanc, le ✓
  // laissant transparaître la teinte du créneau.
  const bookedBadge =
    isBooked && !isCancelled
      ? `<svg class="fc-event-booked-badge" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fill-rule="evenodd" d="${CHECK_CIRCLE_SOLID_PATH}" clip-rule="evenodd"></path></svg>`
      : ''

  return {
    html: `<div class="tp-event-content"><span class="tp-event-label">${label}</span>${cancelledBadge}${bookedBadge}</div>`,
  }
}

/**
 * Composant CalendarView pour le calendrier public
 * Affiche les créneaux dans une grille mensuelle FullCalendar en lecture seule
 *
 * Fonctionnalités:
 * - Vue mensuelle (dayGridMonth) par défaut
 * - Vue semaine avec grille horaire (timeGridWeek) - Story 19.5
 * - Lecture seule: pas de drag-drop, pas de création
 * - Locale française
 * - Indicateurs visuels de disponibilité dans les cellules jour
 * - Navigation entre mois/semaines
 *
 * @see Story 19.1: Intégration FullCalendar Vue Mois Public
 * @see Story 19.5: Vue Semaine avec Grille Horaire
 */
function CalendarViewInner({
  slots,
  allSlotsCount,
  isFiltered = false,
  onSelectSlot,
  disabled = false,
  bookedSlotIds,
  enableDrawer = false,
  calendarViewMode = 'month',
  slotRangeSource,
}: CalendarViewProps) {
  // Story 19.3: State pour le drawer
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Story 19.6: State pour le tooltip
  const [tooltipData, setTooltipData] = useState<CalendarTooltipData | null>(null)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipTarget, setTooltipTarget] = useState<HTMLElement | null>(null)
  const calendarContainerRef = useRef<HTMLDivElement>(null)
  // Réf FullCalendar : pilote le changement de vue (mois↔semaine) sans remonter
  // le composant — cf. useLayoutEffect plus bas.
  const calendarRef = useRef<FullCalendar>(null)

  // bookedSlotIds (réservations de l'utilisateur) arrive en ASYNCHRONE après le
  // montage des événements FullCalendar, et `eventDidMount` ne se rejoue pas. On lit
  // donc l'état de réservation FRAIS — via cette ref pour le popover, via l'effet
  // plus bas pour l'aria-label — plutôt que la valeur figée au montage (sinon
  // « Réservé » n'apparaîtrait jamais une fois les réservations chargées).
  const bookedSlotIdsRef = useRef(bookedSlotIds)
  useEffect(() => {
    bookedSlotIdsRef.current = bookedSlotIds
  }, [bookedSlotIds])
  const slotsById = useMemo(() => {
    const map = new Map<string, Slot>()
    slots.forEach((s) => map.set(s.id, s))
    return map
  }, [slots])

  // Grouper les slots par jour calendaire LOCAL. Un créneau multi-jours est
  // rangé dans CHAQUE jour qu'il couvre (y compris ceux du milieu) → un clic
  // sur n'importe quelle cellule jour ouvre le drawer avec ce créneau
  // (FR8/FR10). Mono-jour : un seul bucket (FR12). Fan-out en jours RÉELS
  // inclusifs — voir buildSlotsByDate (NE PAS confondre avec la fin exclusive
  // de rendu getAllDayExclusiveEnd, Story 1.2).
  const slotsByDate = useMemo(() => buildSlotsByDate(slots), [slots])

  // Calculer le range de navigation depuis les slots non-filtrés
  // Étendu aux semaines/mois complets pour éviter les jours grisés dans les semaines/mois visibles
  const slotRange = useMemo(() => {
    const source = slotRangeSource ?? slots
    if (source.length === 0) return null

    const timestamps = source.map(s => new Date(s.startTime).getTime())
    const earliest = new Date(Math.min(...timestamps))
    const latest = new Date(Math.max(...timestamps))

    // Vue mois : couvrir les mois entiers (du 1er au dernier jour)
    // Vue semaine : couvrir les semaines entières (du lundi au dimanche)
    const rangeStart = calendarViewMode === 'month'
      ? startOfMonth(earliest)
      : startOfWeek(earliest, { weekStartsOn: 1 })
    const rangeEnd = calendarViewMode === 'month'
      ? addMonths(startOfMonth(latest), 1) // 1er du mois suivant (exclusif)
      : addDays(endOfWeek(latest, { weekStartsOn: 1 }), 1) // lundi suivant (exclusif)

    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const showToday = now >= rangeStart && now < rangeEnd

    // Construire les dates en local (pas de toISOString qui shift UTC)
    const pad = (n: number) => String(n).padStart(2, '0')
    const localDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

    return {
      validRange: {
        start: localDateStr(rangeStart),
        end: localDateStr(rangeEnd),
      },
      initialDate: localDateStr(earliest),
      showToday,
    }
  }, [slotRangeSource, slots, calendarViewMode])
  const headerToolbar = useMemo(() => ({
    left: slotRange?.showToday !== false ? 'prev,next today' : 'prev,next',
    center: 'title',
    right: '',
  }), [slotRange?.showToday])


  // Transformer les slots en events FullCalendar
  const calendarEvents = useMemo(() => {
    return slots.map((slot) => {
      const status = getAvailabilityStatus(slot)
      const isBooked = bookedSlotIds?.has(slot.id)
      const isCancelled = slot.cancelledAt != null
      // Multi-jours (jour calendaire LOCAL, DST-safe) → événement all-day :
      // barre continue (Mois) / bandeau « Journée » (Semaine).
      const isMultiDay = isMultiDaySlot(slot.startTime, slot.endTime)

      // Week view: slots shorter than 30 min snap start to previous half-hour
      // for readability (Apple Calendar convention). Text shows exact times.
      let start: string | Date = slot.startTime
      // Un event all-day n'a pas d'heure de grille à caler : on saute le snap.
      if (calendarViewMode === 'week' && !isMultiDay) {
        const startDate = new Date(slot.startTime)
        const endDate = new Date(slot.endTime)
        const durationMin = (endDate.getTime() - startDate.getTime()) / 60000
        if (durationMin < 30) {
          const minutes = startDate.getMinutes()
          startDate.setMinutes(minutes < 30 ? 0 : 30, 0, 0)
          // Format as local ISO string (no Z suffix) so FC treats it as local time
          const pad = (n: number) => String(n).padStart(2, '0')
          start = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}T${pad(startDate.getHours())}:${pad(startDate.getMinutes())}:00`
        }
      }

      const isPast = new Date(slot.endTime) < new Date()
      // Classes de coloration partagées avec l'admin (source unique : lib/slotClassNames).
      // Un créneau annulé prime : style grisé + marqueur `slot-cancelled` (barré via CSS).
      // Un créneau réservé conserve sa couleur de remplissage (le badge ✓ porté par
      // `renderEventContent` signale la réservation, plus aucun fond bleu dédié).
      return {
        id: slot.id,
        title: '',
        start,
        // Multi-jours : fin EXCLUSIVE en date locale pour que la barre all-day
        // couvre le bon nombre de jours (FC ignore l'heure de fin — cf.
        // getAllDayExclusiveEnd). Mono-jour : ISO brut inchangé.
        end: isMultiDay ? getAllDayExclusiveEnd(slot.endTime) : slot.endTime,
        allDay: isMultiDay,
        classNames: isMultiDay
          ? [...getSlotClassNames(status, { isCancelled, isPast }), 'fc-event--multiday']
          : getSlotClassNames(status, { isCancelled, isPast }),
        extendedProps: {
          slot,
          status,
          isBooked,
        },
      }
    })
  }, [slots, bookedSlotIds, calendarViewMode])

  // Handler pour le clic sur un événement (mémorisé pour éviter les re-rendus)
  const handleEventClick = useCallback(
    (clickInfo: { event: { id: string } }) => {
      if (disabled || !onSelectSlot) return
      onSelectSlot(clickInfo.event.id)
    },
    [disabled, onSelectSlot]
  )

  // Story 19.3: Handler pour le clic sur une cellule jour
  const handleDateClick = useCallback(
    (clickInfo: { date: Date }) => {
      if (!enableDrawer) return

      const dateStr = format(clickInfo.date, 'yyyy-MM-dd')
      const daySlots = slotsByDate.get(dateStr) || []

      // AC8: Ne pas ouvrir le drawer si le jour n'a pas de créneaux
      if (daySlots.length === 0) return

      setSelectedDate(clickInfo.date)
      setIsDrawerOpen(true)
    },
    [enableDrawer, slotsByDate]
  )

  // Story 19.3: Slots du jour sélectionné pour le drawer
  const selectedDaySlots = useMemo(() => {
    if (!selectedDate) return []
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    return slotsByDate.get(dateStr) || []
  }, [selectedDate, slotsByDate])

  // moreLinkClick: ouvre le drawer ou affiche le popover natif
  const handleMoreLinkClick = useCallback(
    (arg: MoreLinkArg) => {
      if (!enableDrawer) return 'popover' as const
      setSelectedDate(arg.date)
      setIsDrawerOpen(true)
      // Return void to suppress FullCalendar's default popover
    },
    [enableDrawer]
  )

  // Equalize week rows: set table height = tallest row × row count
  // Deferred to next frame so FC has rendered events into cells
  // Clear explicit height before measuring to prevent Firefox feedback loop
  // (inflated height → inflated measurement → even larger height → cycle)
  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    // L'équaliseur de hauteur ne concerne que la grille Mois
    // (`.fc-scrollgrid-sync-table` + `--fc-week-rows`). Depuis que `allDaySlot`
    // est actif en Semaine (Story 1.2), garder explicitement la vue Mois évite
    // de mesurer/forcer la hauteur d'une table de sync du timegrid (R2).
    if (arg.view.type !== 'dayGridMonth') return
    requestAnimationFrame(() => {
      const el = calendarContainerRef.current
      if (!el) return
      const table = el.querySelector<HTMLTableElement>('.fc-scrollgrid-sync-table')
      const rows = table?.querySelectorAll(':scope > tbody > tr')
      if (!table || !rows || rows.length === 0) return

      // Clear previous explicit height to measure natural row heights
      table.style.height = ''

      const maxRowHeight = Math.max(...Array.from(rows).map(r => r.getBoundingClientRect().height))
      table.style.height = `${maxRowHeight * rows.length}px`
      el.style.setProperty('--fc-week-rows', String(rows.length))
    })
  }, [])

  // Story 19.3: Handler pour la sélection d'un créneau dans le drawer
  const handleDrawerSelectSlot = useCallback(
    (slotId: string) => {
      if (onSelectSlot) {
        onSelectSlot(slotId)
      }
    },
    [onSelectSlot]
  )

  // ============================================
  // Story 19.6: Tooltips
  // ============================================

  // Fermer le tooltip
  const handleTooltipClose = useCallback(() => {
    setTooltipVisible(false)
    setTooltipData(null)
    setTooltipTarget(null)
  }, [])

  // eventDidMount pour les tooltips (both month and week views)
  const handleEventDidMount = useCallback(
    (info: EventMountArg) => {
      const slot = info.event.extendedProps.slot as Slot | undefined

      if (!slot) return

      // État de réservation lu FRAIS au moment du survol (cf. bookedSlotIdsRef) :
      // il peut changer après le montage, quand les réservations asynchrones arrivent.
      const isBookedNow = () => bookedSlotIdsRef.current?.has(slot.id) ?? false

      // Handler mouseenter
      const handleMouseEnter = () => {
        setTooltipData({ mode: 'slot', slot, isBooked: isBookedNow() })
        setTooltipTarget(info.el)
        setTooltipVisible(true)
      }

      // Handler mouseleave
      const handleMouseLeave = () => {
        setTooltipVisible(false)
      }

      // Handler focus (AC6: accessibilité clavier)
      const handleFocus = () => {
        setTooltipData({ mode: 'slot', slot, isBooked: isBookedNow() })
        setTooltipTarget(info.el)
        setTooltipVisible(true)
      }

      // Handler blur
      const handleBlur = () => {
        setTooltipVisible(false)
      }

      // Rendre l'élément focusable et accessible. L'aria-label initial reflète l'état
      // connu au montage (extendedProps) ; l'effet plus bas le rafraîchit ensuite
      // quand les réservations arrivent (repère : data-tp-slot-id).
      info.el.dataset.tpSlotId = slot.id
      info.el.setAttribute('tabindex', '0')
      info.el.setAttribute('role', 'button')
      info.el.setAttribute('aria-label', buildSlotAriaLabel(slot, (info.event.extendedProps.isBooked as boolean | undefined) ?? false))
      info.el.setAttribute('aria-describedby', CALENDAR_TOOLTIP_ID)

      info.el.addEventListener('mouseenter', handleMouseEnter)
      info.el.addEventListener('mouseleave', handleMouseLeave)
      info.el.addEventListener('focus', handleFocus)
      info.el.addEventListener('blur', handleBlur)

      // AC7: Long-press pour mobile
      let longPressTimer: ReturnType<typeof setTimeout> | null = null

      const handleTouchStart = () => {
        longPressTimer = setTimeout(() => {
          setTooltipData({ mode: 'slot', slot, isBooked: isBookedNow() })
          setTooltipTarget(info.el)
          setTooltipVisible(true)
        }, 500)
      }

      const handleTouchEnd = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer)
          longPressTimer = null
        }
      }

      info.el.addEventListener('touchstart', handleTouchStart, { passive: true })
      info.el.addEventListener('touchend', handleTouchEnd)
      info.el.addEventListener('touchcancel', handleTouchEnd)

      // Stocker les handlers sur l'élément pour le cleanup dans eventWillUnmount
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(info.el as any)._tooltipHandlers = {
        mouseenter: handleMouseEnter,
        mouseleave: handleMouseLeave,
        focus: handleFocus,
        blur: handleBlur,
        touchstart: handleTouchStart,
        touchend: handleTouchEnd,
        touchcancel: handleTouchEnd,
        longPressTimer: () => longPressTimer,
      }
    },
    []
  )

  // Story 19.6: Cleanup des event listeners quand un événement est démonté
  const handleEventWillUnmount = useCallback(
    (info: EventMountArg) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (info.el as any)?._tooltipHandlers
      if (!handlers) return

      info.el.removeEventListener('mouseenter', handlers.mouseenter)
      info.el.removeEventListener('mouseleave', handlers.mouseleave)
      info.el.removeEventListener('focus', handlers.focus)
      info.el.removeEventListener('blur', handlers.blur)
      info.el.removeEventListener('touchstart', handlers.touchstart)
      info.el.removeEventListener('touchend', handlers.touchend)
      info.el.removeEventListener('touchcancel', handlers.touchcancel)

      // Clear any pending long-press timer
      const timer = handlers.longPressTimer()
      if (timer) clearTimeout(timer)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (info.el as any)._tooltipHandlers
    },
    []
  )

  // Les réservations (bookedSlotIds) arrivant après le montage des événements,
  // on rafraîchit l'aria-label des événements déjà montés quand elles changent.
  // (Le badge ✓, lui, est rafraîchi par renderEventContent à chaque rendu ; le
  // popover lit l'état frais via bookedSlotIdsRef au survol.)
  useEffect(() => {
    const container = calendarContainerRef.current
    if (!container) return
    container.querySelectorAll<HTMLElement>('.fc-event[data-tp-slot-id]').forEach((el) => {
      const slot = slotsById.get(el.dataset.tpSlotId ?? '')
      if (slot) {
        el.setAttribute('aria-label', buildSlotAriaLabel(slot, bookedSlotIds?.has(slot.id) ?? false))
      }
    })
  }, [bookedSlotIds, slotsById])

  // Bascule mois↔semaine SANS remount de FullCalendar. `EventCalendarContent` ne
  // porte plus de `key={viewMode}` (qui détruisait/reconstruisait tout le calendrier
  // = flash blanc « de reconstruction »). On change la vue impérativement : le
  // changement de prop `calendarViewMode` a déjà déclenché resetOptions (validRange,
  // events, expandRows recalculés pour la nouvelle vue) ; on bascule le TYPE de vue
  // en layout-effect (avant paint) pour éviter une frame intermédiaire. Première
  // passe = no-op (la vue courante vaut déjà initialView).
  //
  // INVARIANT load-bearing : `initialView` (props FullCalendar plus bas) DOIT rester
  // dérivé de ce même `calendarViewMode`. C'est lui — pas cet effet — qui garantit la
  // bonne vue dans le cas-bord où FullCalendar est DÉMONTÉ au moment du changement
  // (slots vides → branche `slots.length === 0`, ref null → cet effet est un no-op)
  // puis remonté quand les créneaux reviennent. Ne pas désynchroniser les deux, sinon
  // la bascule serait perdue silencieusement dans ce cas.
  useLayoutEffect(() => {
    const api = calendarRef.current?.getApi()
    if (!api) return
    const targetView = calendarViewMode === 'week' ? 'timeGridWeek' : 'dayGridMonth'
    if (api.view.type !== targetView) {
      api.changeView(targetView)
      // Sans remount, l'état du tooltip survit à la bascule : une cible affichée via
      // long-press tactile (pas de mouseleave/blur) pointerait un nœud d'événement
      // détruit par changeView → tooltip fantôme. On le ferme explicitement (le
      // remount le faisait implicitement avant le retrait de `key={viewMode}`).
      handleTooltipClose()
    }
  }, [calendarViewMode, handleTooltipClose])

  return (
    <div data-testid="calendar-view" className="calendar-view-public">
      {/* Indicateur de filtrage si actif */}
      {isFiltered && allSlotsCount !== undefined && (
        <div className="mb-4 flex items-center justify-end">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {slots.length} / {allSlotsCount} créneaux affichés
          </span>
        </div>
      )}

      {/* Message si aucun créneau */}
      {slots.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <svg
            className="h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            role="img"
            aria-label="Calendrier vide"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
            />
          </svg>
          <h2 className="mt-2 text-sm font-medium text-gray-900">Aucun créneau disponible</h2>
          <p className="mt-1 text-sm text-gray-500">
            Les créneaux de participation seront affichés ici.
          </p>
        </div>
      ) : (
        <div ref={calendarContainerRef} className="fc-public-calendar tp-calendar">
          {/* Vue Semaine (plan 2026-06-11) :
              - D5a : slotDuration 1h (cohérence admin), fenêtre 06h–22h conservée.
              - R5/Option A : eventMinHeight NATIF (px, réflow-aware) = plancher du clamp
                --fc-hour-height → un créneau >= 1h tient exactement dans sa cellule, pas de
                débordement/chevauchement (cf. admin #57/#58). */}
          <FullCalendar
            ref={calendarRef}
            plugins={FC_PLUGINS}
            initialView={calendarViewMode === 'week' ? 'timeGridWeek' : 'dayGridMonth'}
            locale="fr"
            locales={FC_LOCALES}
            events={calendarEvents}
            validRange={slotRange?.validRange}
            initialDate={slotRange?.initialDate}
            headerToolbar={headerToolbar}
            buttonText={FC_BUTTON_TEXT}
            editable={false}
            selectable={enableDrawer}
            droppable={false}
            dayMaxEvents={DAY_MAX_EVENTS}
            eventDisplay="block"
            eventClick={handleEventClick}
            dateClick={handleDateClick}
            eventContent={renderEventContent}
            eventDidMount={handleEventDidMount}
            eventWillUnmount={handleEventWillUnmount}
            moreLinkClick={handleMoreLinkClick}
            datesSet={handleDatesSet}
            firstDay={1}
            dayHeaderContent={renderWeekDayHeader}
            height="auto"
            allDaySlot
            allDayText="Journée"
            slotDuration="01:00:00"
            eventMinHeight={24}
            scrollTime="08:00:00"
            slotEventOverlap={false}
            expandRows={calendarViewMode === 'week'}
          />
        </div>
      )}

      {/* Story 19.3: Drawer latéral pour les créneaux du jour */}
      {enableDrawer && (
        <DaySlotDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          date={selectedDate}
          slots={selectedDaySlots}
          bookedSlotIds={bookedSlotIds}
          onSelectSlot={handleDrawerSelectSlot}
        />
      )}

      {/* Story 19.6: Tooltip pour le calendrier public */}
      <CalendarTooltip
        id={CALENDAR_TOOLTIP_ID}
        data={tooltipData}
        targetElement={tooltipTarget}
        visible={tooltipVisible}
        onClose={handleTooltipClose}
      />

      {/* Styles CSS pour le calendrier public */}
      <style>{`
        .fc-public-calendar .fc {
          font-family: inherit;
        }

        /* Day grid */
        .fc-public-calendar .fc-daygrid-day {
          border: 1px solid hsl(var(--border) / 0.5) !important;
        }

        .fc-public-calendar .fc-daygrid-day-frame,
        .fc-public-calendar .fc-scrollgrid-sync-inner,
        .fc-public-calendar .fc-daygrid-day-bg {
          border: none !important;
        }

        /* NE PAS clipper horizontalement : une barre multi-jours (harness absolu
           .fc-daygrid-event-harness-abs) déborde sa cellule de début via un right
           négatif pour s'étaler sur les jours couverts. Un overflow:hidden ici la
           rognait à la SEULE colonne de début (vue Mois ET bandeau « Journée » de la
           vue Semaine, qui partagent la structure daygrid). cf. admin SlotCalendar,
           sans cette règle, qui s'étale correctement. */
        .fc-public-calendar .fc-daygrid-day-events {
          border: none !important;
        }

        .fc-public-calendar .fc-daygrid {
          border-collapse: separate;
          border-spacing: 0;
        }

        .fc-public-calendar .fc-daygrid-body {
          border: none !important;
        }

        .fc-public-calendar .fc-daygrid-day-number {
          display: inline-block;
          color: hsl(var(--foreground));
          font-weight: 500;
          text-decoration: none;
          padding: 0;
        }

        .fc-public-calendar .fc-day-today {
          background: transparent !important;
        }


        /* Events */
        .fc-public-calendar .fc-event {
          border-radius: 0.25rem;
          padding: 0.125rem 0.375rem;
          font-size: 0.75rem;
          margin: 1px 2px;
        }

        .fc-public-calendar .fc-event:hover {
          filter: brightness(1.1);
        }

        .fc-public-calendar .fc-event-title {
          font-weight: 500;
          color: inherit;
        }

        .fc-public-calendar .fc-daygrid-event-dot {
          display: none;
        }

        /* More link */
        .fc-public-calendar .fc-more-link {
          color: hsl(var(--primary));
          font-size: 0.75rem;
          font-weight: 500;
        }

        /* Cap FC popover z-index below Radix dialog overlay (z-50 = 50) */
        .fc-public-calendar .fc-popover {
          z-index: 40 !important;
        }

        /* Contenu d'événement unifié (vues Mois ET Semaine), aligné sur l'admin :
         * un seul libellé .tp-event-label (0.7rem / 400 / opacité 1) suivi du
         * badge « réservé » poussé à droite. Le format « h », le « | » et
         * l'occupation viennent des formateurs canoniques (cf. renderEventContent). */
        .fc-public-calendar .tp-event-content {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          overflow: hidden;
          min-width: 0;
          max-width: 100%;
        }
        .fc-public-calendar .tp-event-label {
          font-size: 0.7rem;
          font-weight: 400;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
        }
        /* Badge « réservé » : pastille ronde check-circle poussée à droite
         * (margin-left:auto). Disque blanc, ✓ en transparence (laisse voir la
         * teinte du créneau). */
        .fc-public-calendar .fc-event-booked-badge {
          width: 0.875rem;
          height: 0.875rem;
          flex-shrink: 0;
          margin-left: auto;
          color: #fff;
        }

        /* Week view (timeGrid) styles */

        /* Les créneaux qui se recouvrent dans le temps sont répartis côte à côte par
         * FullCalendar (slotEventOverlap={false}). On NE force PLUS la pleine largeur
         * (ancien left/right:0 !important) : elle empilait les créneaux concurrents
         * (ex. plusieurs annulés au même horaire) en les rendant illisibles. */

        /* Padding du bloc ramené à 0 (le 2px/6px de .fc-event empilait inutilement
         * de l'espace) : l'espace texte↔bord doit être identique sur les 4 côtés
         * (≈ la bordure), cf. .tp-event-content qui retire aussi son padding inline.
         * La hauteur minimale d'un créneau court (< 1h) est gérée par l'option NATIVE
         * eventMinHeight (réflow-aware), PAS par un min-height CSS post-layout qui
         * faisait déborder le bloc hors de sa cellule (cf. admin #57/#58). */
        .fc-public-calendar .fc-timegrid-event {
          padding: 0;
        }

        /* D5 (plan 2026-06-11) : hauteur de ligne responsive, identique à l'admin
         * (--fc-hour-height = même clamp svh+rem). Public n'affiche que 06h–22h (16h)
         * → grille toujours courte, pas de scroll vertical interne. */
        .fc-public-calendar {
          --fc-hour-height: clamp(1.5rem, (100svh - 18rem) / 24, 2.75rem);
        }

        .fc-public-calendar .fc-timegrid-slot,
        .fc-public-calendar .fc-timegrid-slot-label {
          height: var(--fc-hour-height);
          line-height: 1;
          border-color: hsl(var(--border) / 0.5) !important;
        }

        .fc-public-calendar .fc-timegrid-col {
          border-color: hsl(var(--border) / 0.5) !important;
        }

        .fc-public-calendar .fc-timegrid-axis {
          font-size: 0.75rem;
          color: hsl(var(--muted-foreground));
          border-color: hsl(var(--border) / 0.5) !important;
        }

        .fc-public-calendar .fc-timegrid-col-header {
          font-size: 0.75rem;
          font-weight: 500;
        }

        /* Créneau passé (slot-past), créneau annulé (slot-cancelled : grisé +
         * barré + couleur de texte forcée par-dessus le blanc FullCalendar) et
         * badge « Annulé » (.tp-slot-cancelled-badge) sont définis une seule fois
         * dans le calque partagé .tp-calendar (index.css), commun public et admin. */

        /* Vue semaine (timeGrid) : le contenu occupe la hauteur du créneau et
         * s'épingle en haut (le libellé ne se centre pas dans un créneau long) ;
         * padding inline retiré (le bloc .fc-event le porte déjà). */
        .fc-public-calendar .fc-timegrid .tp-event-content {
          height: 100%;
          align-items: flex-start;
          padding: 0;
        }

        /* Week view current time indicator */
        .fc-public-calendar .fc-timegrid-now-indicator-line {
          border-color: hsl(var(--primary));
          border-width: 2px;
        }

        .fc-public-calendar .fc-timegrid-now-indicator-arrow {
          border-color: hsl(var(--primary));
          border-top-color: transparent;
          border-bottom-color: transparent;
        }

        /* Responsive - mobile breakpoint */
        @media (max-width: 768px) {
          .fc-public-calendar .tp-event-label { font-size: 0.625rem; }

          .fc-public-calendar .fc-timegrid-axis {
            font-size: 0.625rem;
          }

        }

        /* Axe horaire figé à gauche — vue Semaine < sm. .fc-scroller-harness (overflow:hidden
         * via classe FC) et .fc-scroller (overflow posé inline par FC, d'où !important)
         * capturent le contexte sticky : on les passe visible pour que .fc-view-harness (seul
         * scrollport) ancre les cellules d'axe. CE scrollport public (.fc-view-harness
         * overflow-x:auto) et les min-width sont définis dans le bloc Phase 3 d'index.css
         * (~343-360) — ne pas les retirer. left:0 (LTR, .fc-direction-ltr). z:10 > events
         * (z:3), < popover. :not(.fc-timegrid-col) exclut le spacer du calque events (même
         * classe) dont le fond opaque masquerait les labels d'heures. */
        @media (max-width: 639.98px) {
          .fc-public-calendar .fc-timeGridWeek-view .fc-scroller-harness {
            overflow: visible;
          }
          .fc-public-calendar .fc-timeGridWeek-view .fc-scroller {
            overflow: visible !important;
          }
          .fc-public-calendar .fc-timeGridWeek-view .fc-timegrid-axis:not(.fc-timegrid-col),
          .fc-public-calendar .fc-timeGridWeek-view .fc-timegrid-slot-label {
            position: sticky;
            left: 0;
            z-index: 10;
            background: hsl(var(--background));
            /* FC peint les bordures G/D de l'axe via la table → elles défilent et disparaissent
             * au scroll. On les masque (border-*-style:hidden) et on les redessine en box-shadow
             * avec la cellule sticky → visibles à tout scroll. /0.5 pour matcher les filets FC. */
            box-shadow: inset 1px 0 0 hsl(var(--border) / 0.5), inset -1px 0 0 hsl(var(--border) / 0.5);
            border-left-style: hidden;
            border-right-style: hidden;
          }
          /* .fc-scrollgrid (border-collapse:separate) a une bordure externe gauche hors portée
           * des border-*-style ci-dessus → elle jouxte le box-shadow gauche à scroll=0 → double
           * filet. On la retire : le box-shadow de l'axe reste l'unique filet gauche. */
          .fc-public-calendar .fc-timeGridWeek-view .fc-scrollgrid {
            border-left: 0;
          }
          /* Double filet à droite à scroll=0 : le calque events (.fc-timegrid-cols, table
           * absolue) a un spacer d'axe EXCLU de la règle sticky dont la bordure jouxte le
           * border-left de la 1ère colonne-jour. Au scroll ce calque glisse sous l'axe (z:10)
           * → déjà masqué. On retire ce seul border-left ; les inter-jours restent intacts. */
          .fc-public-calendar .fc-timeGridWeek-view .fc-timegrid-col.fc-timegrid-axis + .fc-timegrid-col {
            border-left-style: hidden;
          }
          /* .fc-timegrid-slots (relative + z-index:1) crée un contexte d'empilement qui plafonne
           * les labels d'axe (z:10) sous .fc-timegrid-col-events (z:3) → un event qui défile
           * masquait les heures. z-index:auto le supprime (ordre lanes/events inchangé). */
          .fc-public-calendar .fc-timeGridWeek-view .fc-timegrid-slots {
            z-index: auto;
          }
          /* En border-collapse, la ligne d'heure (1px de la table) est peinte sous le slot
           * (z:3), non couverte par le fond opaque → elle transparaissait. Pseudo peint avec la
           * cellule sticky (z:10) : redessine la ligne (/0.5, comme les filets FC). */
          .fc-public-calendar .fc-timeGridWeek-view .fc-timegrid-slot-label::after {
            content: '';
            position: absolute;
            inset: -1px 0 auto 0;
            height: 1px;
            background: hsl(var(--border) / 0.5);
            pointer-events: none;
          }
        }
      `}</style>
    </div>
  )
}
export const CalendarView = memo(CalendarViewInner)
