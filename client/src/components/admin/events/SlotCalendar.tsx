import { useMemo, useState, useCallback, useEffect, useRef, Component, type ReactNode } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import multiMonthPlugin from '@fullcalendar/multimonth'
import interactionPlugin from '@fullcalendar/interaction'
import frLocale from '@fullcalendar/core/locales/fr'
import type { EventClickArg, EventMountArg } from '@fullcalendar/core'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { useEventSlots } from './hooks/useEventSlots'
import { useAdminSlots } from '@/hooks/useAdminSlots'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Calendar, CalendarPlus, CalendarRange, Clock, List } from 'lucide-react'
import { SlotEditDialog } from '../SlotEditDialog'
import { SlotDeleteDialog } from './SlotDeleteDialog'
import { SlotContextMenu } from './SlotContextMenu'
import { SlotList } from '../SlotList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Typography } from '@/components/ui/typography'
import { useCompactMode } from '@/hooks/useCompactMode'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import { popoverStatusLabel, splitVolunteers } from '@/lib/slotPopover'
import type { Slot } from '@/types/slot'
import { getInitialCalendarDate } from '@/lib/calendarInitialDate'
import { renderWeekDayHeader } from '@/lib/calendarDayHeader'
import { formatSlotRange, formatTimeRangeFrench, isMultiDaySlot } from '@/lib/utils'

interface SlotCalendarProps {
  eventId: string
}

type ViewMode = 'week' | 'month' | 'year' | 'list'

// Mapping vue logique → nom de vue FullCalendar (les vues calendrier uniquement).
const FC_VIEW = { week: 'timeGridWeek', month: 'dayGridMonth', year: 'multiMonthYear' } as const

// Onglets de vue (icône + libellé) — pattern data-driven comme SUBTAB_ITEMS.
const VIEW_TABS = [
  { value: 'week', label: 'Semaine', icon: Clock },
  { value: 'month', label: 'Mois', icon: Calendar },
  { value: 'year', label: 'Année', icon: CalendarRange },
  { value: 'list', label: 'Liste', icon: List },
] as const

/**
 * Error Boundary pour attraper les crashes de FullCalendar
 * Class component requis (Error Boundary ne peut pas être un functional component avec hooks)
 */
class CalendarErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('[SlotCalendar] FullCalendar error:', error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

/**
 * FloatingPortalTooltip - Renders a Portal-based tooltip at document.body level
 *
 * This component creates a tooltip that renders via React Portal at the document.body level,
 * escaping all parent overflow constraints (including FullCalendar's nested containers).
 *
 * The tooltip positioning is calculated based on the target element's position in the viewport,
 * ensuring it appears above the hovered event (not covering it) with a subtle fade-in animation.
 */
interface FloatingPortalTooltipProps {
  title: string
  description?: string
  /** Créneau survolé — alimente l'encart de statut unifié. */
  slot?: Slot
  targetElement: HTMLElement | null
  visible: boolean
}

function FloatingPortalTooltip({ title, description, slot, targetElement, visible }: FloatingPortalTooltipProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!visible || !targetElement) return

    // Calculate tooltip position based on target element
    const updatePosition = () => {
      if (!targetElement) return

      const rect = targetElement.getBoundingClientRect()
      const viewportWidth = window.innerWidth

      // Position the tooltip ABOVE the slot (at the top edge of the event element)
      // x is centered horizontally on the slot
      // y is at the top edge of the slot (with a small gap)
      let x = rect.left + rect.width / 2
      let y = rect.top

      // Adjust horizontal position if too close to right edge
      if (x > viewportWidth - 150) {
        x = viewportWidth - 150
      }

      // Adjust horizontal position if too close to left edge
      if (x < 75) {
        x = 75
      }

      // If too close to top edge, position below instead
      if (y < 50) {
        y = rect.bottom
      }

      setPosition({ x, y })
    }

    updatePosition()

    // Update position on scroll and resize
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [visible, targetElement])

  if (!visible) return null

  // Statut + réservants rendus localement en texte nu (cf. lib/slotPopover) —
  // wording terse propre au popover admin.
  const status = slot ? popoverStatusLabel(slot) : null
  const { shown, hiddenCount, allUnnamed } = slot
    ? splitVolunteers(slot.volunteers)
    : { shown: [], hiddenCount: 0, allUnnamed: false }
  const statusToneClass =
    status?.tone === 'red'
      ? 'text-red-700 font-semibold'
      : status?.tone === 'amber'
        ? 'text-amber-700 font-medium'
        : 'text-muted-foreground'

  // Render tooltip in a Portal at document.body level
  // Uses custom CSS animation for subtle fade-in with small upward slide
  return createPortal(
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%) translateY(-4px)',
        animation: 'tooltip-fade-in 0.15s ease-out forwards',
      }}
    >
      <style>{`
        @keyframes tooltip-fade-in {
          from {
            opacity: 0;
            transform: translate(-50%, -100%) translateY(0px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -100%) translateY(-4px);
          }
        }
      `}</style>
      <div className="bg-popover text-popover-foreground border rounded-md px-3 py-2 text-xs shadow-lg max-w-xs">
        {/* ① Identité du créneau (description) ; fallback : horaire en titre */}
        <div className="text-sm font-semibold leading-snug break-words">
          {description || title}
        </div>
        {/* ② Plage horaire (secondaire) — masquée si elle sert déjà de titre */}
        {description && (
          <div className="mt-0.5 text-sm text-muted-foreground">{title}</div>
        )}
        {/* ③ Statut de remplissage — texte nu (pas de pilule, pas d'icône) */}
        {status && (
          <div className={`mt-1 text-xs ${statusToneClass}`}>{status.label}</div>
        )}
        {/* ④ Réservants — liste texte simple sous séparateur léger */}
        {(shown.length > 0 || allUnnamed) && (
          <div className="mt-2 border-t pt-1.5">
            <ul className="space-y-0.5">
              {shown.map((name, i) => (
                <li key={i} className="break-words">{name}</li>
              ))}
              {allUnnamed && <li className="text-muted-foreground">Sans nom</li>}
            </ul>
            {!allUnnamed && hiddenCount > 0 && (
              <div className="mt-0.5 text-muted-foreground">+{hiddenCount} autre{hiddenCount > 1 ? 's' : ''}</div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

/**
 * SlotCalendar Component
 *
 * Affiche les créneaux d'un événement dans un FullCalendar avec la vue mensuelle par défaut.
 *
 * Fonctionnalités:
 * - Vue mensuelle par défaut (dayGridMonth)
 * - Coloration des créneaux par statut (disponible/partiel/plein)
 * - 4 vues disponibles: Année, Mois, Semaine, Liste
 * - Ordre des onglets: Année, Mois, Semaine, Liste
 * - Création de créneaux via bouton "Créer un créneau" (Story 12.3)
 * - Création rapide via clic-droit sur date vide (Story 13.2)
 *   * NOTE: Utilise un listener natif 'contextmenu' car FullCalendar dateClick ne se déclenche pas sur clic-droit
 * - Menu contextuel avec option "Nouveau créneau"
 * - Fallback clavier pour accessibilité (Menu, Shift+F10)
 * - Gestion des états de chargement et d'erreur
 * - Locale française
 * - Error Boundary pour la récupération en cas de crash
 *
 * @see Story 12.1: Intégration FullCalendar avec Vue Annuelle
 * @see Story 12.3: Créer créneau via bouton
 * @see Story 13.2: Création rapide via menu contextuel (clic-droit)
 * @see Story 13.3: Édition/Suppression via menu contextuel sur événement
 */
export function SlotCalendar({ eventId }: SlotCalendarProps) {
  const { t } = useTranslation()
  const { events, isLoading, error } = useEventSlots(eventId)
  // Récupérer la liste brute des slots pour le mode édition et les opérations admin
  const { slots, deleteSlotAsync, isDeleting } = useAdminSlots(eventId)

  // Vue active : pilote à la fois le rendu (calendrier vs liste) et la vue FullCalendar.
  const [view, setView] = useState<ViewMode>('week')
  // Réf vers l'instance FullCalendar pour changer de vue en place (sans démontage).
  const calendarRef = useRef<FullCalendar>(null)
  // Repli responsive : bascule TabsList → Select quand la barre est trop étroite (DS pattern).
  const { ref: tabsToolbarRef, compact: tabsCompact } = useCompactMode<HTMLDivElement>({ contentSelector: '[data-measure]' })

  // Bascule FullCalendar en place quand la vue change vers une vue calendrier.
  // Le cas 'list' rend <SlotList> à la place : FullCalendar est démonté puis
  // remonté au retour (initialView dérive de `view` → pas de flash de vue mois).
  useEffect(() => {
    if (view !== 'list') {
      calendarRef.current?.getApi().changeView(FC_VIEW[view])
    }
  }, [view])

  // State pour la modale de création/édition de créneau
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)

  // State pour la dialog de suppression de créneau
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; slot: Slot | null }>({
    open: false,
    slot: null
  })

  // State pour le menu contextuel (Story 13.2)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    dateStr: string
  } | null>(null)

  // State pour le menu contextuel sur les événements (Story 13.3)
  const [eventContextMenu, setEventContextMenu] = useState<{
    x: number
    y: number
    slot: Slot
  } | null>(null)

  // State pour le tooltip flottant (Portal-based)
  const [tooltipState, setTooltipState] = useState<{
    title: string
    description?: string
    slot?: Slot
    targetElement: HTMLElement | null
    visible: boolean
  }>({
    title: '',
    description: undefined,
    slot: undefined,
    targetElement: null,
    visible: false,
  })

  // Refs pour observer et cleanup (persiste à travers les changements de vue)
  const observerRef = useRef<MutationObserver | null>(null)
  const cleanupHandlersRef = useRef<(() => void) | null>(null)

  /**
   * Handler pour créer un créneau depuis une date spécifique
   * Utilisé par le menu contextuel (Story 13.2)
   *
   * @param dateStr - Date au format YYYY-MM-DD (optionnel, défaut: aujourd'hui)
   * @see Story 13.2: Création rapide via menu contextuel (clic-droit)
   */
  const handleCreateSlotFromDate = useCallback((dateStr?: string) => {
    const targetDate = dateStr ? new Date(dateStr) : new Date()

    // Heures par défaut: 09:00-10:00
    const defaultStart = new Date(targetDate)
    defaultStart.setHours(9, 0, 0, 0)

    const defaultEnd = new Date(targetDate)
    defaultEnd.setHours(10, 0, 0, 0)

    const newSlot: Slot = {
      // 'new' est l'ID spécial pour le mode création
      // SlotEditDialog détecte le mode création quand slot.id === 'new'
      id: 'new',
      eventId,
      startTime: defaultStart.toISOString(),
      endTime: defaultEnd.toISOString(),
      capacity: 1, // Valeur par défaut
      currentBookings: 0,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    setSelectedSlot(newSlot)
    setDialogOpen(true)
    // Fermer le menu contextuel si ouvert
    setContextMenu(null)
  }, [eventId])

  /**
   * Handler pour éditer un créneau existant via clic sur l'événement FullCalendar
   * Trouve le slot correspondant via son ID et ouvre la modale d'édition
   * Ignore les clics-droits (gérés par dateClick pour le menu contextuel)
   *
   * @see Story 13.1: Modale Édition Créneau
   * @see Story 13.2: Création rapide via menu contextuel (clic-droit)
   */
  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    // Ignorer les clics-droits (gérés par dateClick pour le menu contextuel)
    if (clickInfo.jsEvent.button === 2) {
      return
    }

    const slotId = clickInfo.event.id

    // Trouver le slot correspondant dans la liste des slots bruts
    // Utiliser optional chaining pour éviter les erreurs si slots est undefined
    const slotToEdit = slots?.find((slot) => slot.id === slotId)

    if (slotToEdit) {
      setSelectedSlot(slotToEdit)
      setDialogOpen(true)
    } else {
      console.error(`[SlotCalendar] Slot non trouvé: ${slotId}`)
    }
  }, [slots])

  /**
   * Handler pour fermer les menus contextuels
   */
  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null)
    setEventContextMenu(null)
  }, [])

  /**
   * Handler pour éditer un créneau depuis le menu contextuel (Story 13.3)
   */
  const handleEditSlotFromMenu = useCallback((slot: Slot) => {
    setSelectedSlot(slot)
    setDialogOpen(true)
    setEventContextMenu(null)
  }, [])

  /**
   * Handler pour supprimer un créneau depuis le menu contextuel (Story 13.3)
   * Ouvre la dialog de confirmation au lieu de supprimer directement
   */
  const handleDeleteSlotFromMenu = useCallback((slot: Slot) => {
    setDeleteDialog({ open: true, slot })
    setEventContextMenu(null)
  }, [])

  /**
   * Handler pour confirmer la suppression depuis la dialog
   */
  const handleDeleteConfirm = useCallback(async (slotId: string, cancellationReason?: string, hadReservations?: boolean) => {
    try {
      await deleteSlotAsync(slotId, cancellationReason, hadReservations)
      setDeleteDialog({ open: false, slot: null })
      // Cache invalidation happens automatically in the hook
    } catch {
      // Error handled by hook
    }
  }, [deleteSlotAsync])

  /**
   * Handler pour le menu contextuel via clavier (accessibilité WCAG 2.1 AA)
   * Détecte: touche Menu, Shift+F10, ou Entrée avec Cmd/Ctrl sur une date
   *
   * Les cellules de date sont rendues keyboard-focusable via tabindex="0" dans attachHandlers
   * L'utilisateur peut Tab sur une date, puis utiliser Menu/Shift+F10 ou Cmd/Ctrl+Enter
   *
   * @see Story 13.2: Fallback clavier pour accessibilité
   * @see AC: "Focus sur une date vide + touche Menu (ou Shift+F10) OU focus + touche Entrée avec Cmd/Ctrl"
   */
  const handleKeyboardMenu = useCallback((e: KeyboardEvent) => {
    const isMenuKey = e.key === 'Menu' || (e.key === 'F10' && e.shiftKey)
    const isEnterWithModifier = e.key === 'Enter' && (e.metaKey || e.ctrlKey)

    if (!isMenuKey && !isEnterWithModifier) return

    const target = e.target as HTMLElement
    const dateCell = target.closest('[data-date]') as HTMLElement | null

    if (dateCell) {
      e.preventDefault()
      const dateStr = dateCell.getAttribute('data-date')
      if (dateStr) {
        const rect = dateCell.getBoundingClientRect()
        setContextMenu({
          x: rect.left + rect.width / 2,
          y: rect.bottom,
          dateStr
        })
      }
    }
  }, [])

  /**
   * Effect pour fermer les menus contextuels lorsqu'on clique ailleurs
   * Écoute les clics sur document et ferme les menus si on clique en dehors
   *
   * Note: Retourne toujours une fonction de cleanup pour éviter les memory leaks
   */
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu || eventContextMenu) {
        setContextMenu(null)
        setEventContextMenu(null)
      }
    }

    if (contextMenu || eventContextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => {
        document.removeEventListener('click', handleClickOutside)
      }
    }
    // Retour explicite même sans cleanup (évite warning React)
    return undefined
  }, [contextMenu, eventContextMenu])

  /**
   * Effect pour le menu contextuel clavier (accessibilité WCAG 2.1 AA)
   * Attache le listener pour Menu/Shift+F10 lors du montage du composant
   */
  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardMenu)
    return () => {
      document.removeEventListener('keydown', handleKeyboardMenu)
    }
  }, [handleKeyboardMenu])

  /**
   * Effect pour attacher les listeners contextmenu sur les cellules de date (Story 13.2)
   * Utilise refs pour persister l'observer à travers les changements de vue
   * Les handlers sont ré-attachés via le callback datesSet dans calendarOptions
   *
   * @see Story 13.2: Création rapide via menu contextuel (clic-droit)
   */
  useEffect(() => {
    // Fonction pour attacher les handlers - sera appelée au mount et à chaque changement de vue
    const attachHandlers = () => {
      const fcEl = document.querySelector('.fc')

      if (!fcEl) {
        return
      }

      // Clean up previous observer and handlers
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      if (cleanupHandlersRef.current) {
        cleanupHandlersRef.current()
        cleanupHandlersRef.current = null
      }

      // Fonction pour attacher le listener à un élément de date
      const attachListenerToCell = (element: HTMLElement) => {
        // Rendre la cellule keyboard-focusable pour l'accessibilité WCAG 2.1 AA
        if (!element.hasAttribute('tabindex')) {
          element.setAttribute('tabindex', '0')
        }

        // Ajouter un aria-label pour les lecteurs d'écran
        const dateStr = element.getAttribute('data-date')
        if (dateStr && !element.hasAttribute('aria-label')) {
          const date = new Date(dateStr)
          const formatter = new Intl.DateTimeFormat('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
          element.setAttribute('aria-label', formatter.format(date))
        }

        // Retirer l'ancien listener si existant
        const oldHandler = (element as unknown as { _contextMenuHandler?: (e: MouseEvent) => void })._contextMenuHandler
        if (oldHandler) {
          element.removeEventListener('contextmenu', oldHandler)
        }

        // Créer et attacher le nouveau handler
        const handleContextMenu = (e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          let cellDateStr = element.getAttribute('data-date')
          if (!cellDateStr) {
            const parent = element.closest('[data-date]')
            cellDateStr = parent?.getAttribute('data-date') || null
          }
          if (cellDateStr) {
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              dateStr: cellDateStr
            })
          }
        }

        element.addEventListener('contextmenu', handleContextMenu)
        ;(element as unknown as { _contextMenuHandler: (e: MouseEvent) => void })._contextMenuHandler = handleContextMenu
      }

      // Attacher à tous les éléments de date existants
      const cellsWithDate = fcEl.querySelectorAll('[role="gridcell"][data-date]')
      cellsWithDate.forEach((cell) => attachListenerToCell(cell as HTMLElement))

      // MutationObserver pour détecter les nouvelles cellules ajoutées dynamiquement
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              if (node.getAttribute('role') === 'gridcell' && node.hasAttribute('data-date')) {
                attachListenerToCell(node)
              }
              const cellsWithDate = node.querySelectorAll('[role="gridcell"][data-date]')
              cellsWithDate.forEach((cell) => attachListenerToCell(cell as HTMLElement))
            }
          })
        })
      })

      // Observer les changements dans le conteneur du calendrier
      const fcViewContainer = fcEl.querySelector('.fc-view')
      if (fcViewContainer) {
        observer.observe(fcViewContainer, { childList: true, subtree: true })
      }

      // Store observer in ref
      observerRef.current = observer

      // Create cleanup function
      const cleanup = () => {
        observer.disconnect()
        const cellsWithDate = fcEl.querySelectorAll('[role="gridcell"][data-date]')
        cellsWithDate.forEach((cell) => {
          const el = cell as HTMLElement
          const handler = (el as unknown as { _contextMenuHandler?: (e: MouseEvent) => void })._contextMenuHandler
          if (handler) {
            el.removeEventListener('contextmenu', handler)
          }
        })
      }

      cleanupHandlersRef.current = cleanup

      return cleanup
    }

    // Attendre que le DOM soit prêt
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attachHandlers)
      return () => document.removeEventListener('DOMContentLoaded', attachHandlers)
    }

    attachHandlers()
  }, [setContextMenu])

  /**
   * Handler pour la fermeture de la modale
   */
  const handleDialogClose = useCallback(() => {
    setDialogOpen(false)
    setSelectedSlot(null)
  }, [])

  // Configuration FullCalendar - mémorisée pour éviter les recréations
  // Les événements sont transformés ici directement (pas besoin de useMemo séparé)
  const calendarOptions = useMemo(() => ({
    plugins: [dayGridPlugin, timeGridPlugin, multiMonthPlugin, interactionPlugin],
    initialView: view === 'list' ? 'timeGridWeek' : FC_VIEW[view], // Dérivé de la vue courante (remontage propre au retour depuis 'list')
    initialDate: getInitialCalendarDate(slots), // Ouvre sur le 1er créneau à venir (sinon aujourd'hui)
    height: 'auto',
    // D2 (plan 2026-06-11) : une ligne par heure en vue Semaine. Purement visuel
    // (supprime les lignes pointillées de demi-heure) ; aucun impact sur le snap —
    // les créneaux sont édités au clic, pas en glisser-déposer.
    slotDuration: '01:00:00',
    // R5 / Option A (plan 2026-06-11) : minimum d'événement NATIF FullCalendar (px),
    // appliqué dans computeSegVCoords AVANT l'algorithme de placement → réflow correct,
    // contrairement à un `min-height` CSS (post-layout) qui faisait déborder le bloc
    // hors de son harness et chevaucher les suivants (tâches Drawbridge #57/#58).
    // 24px = plancher du clamp --fc-hour-height (1.5rem @16px root) : un créneau ≥ 1h
    // (hauteur ≥ plancher) n'est JAMAIS étiré → tient exactement dans sa cellule, zéro
    // débordement ; seuls les créneaux < 1h reçoivent ce plancher tactile (D4), avec
    // empilement géré par FC (pas de chevauchement visuel).
    eventMinHeight: 24,
    eventDisplay: 'block',
    dayMaxEvents: 3,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      // Tous les changements de vue passent par le Tabs externe (Semaine/Mois/Année/Liste)
      right: ''
    },
    // Texte personnalisé pour les boutons de vue
    buttonText: {
      today: t('calendar.today'),
      year: t('calendar.year'),
      month: t('calendar.month'),
      week: t('calendar.week'),
      day: t('calendar.day'),
      list: t('calendar.list')
    },
    locale: frLocale, // French locale (imported, not string)
    firstDay: 1, // Monday as first day of week
    allDayText: 'Journée', // Compact all-day label (instead of "Toute la journée")
    dayHeaderContent: renderWeekDayHeader, // En-têtes Semaine partagés (tâche Drawbridge #19)
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      // Multi-jours → barre continue (Mois) / bandeau « Journée » (Semaine).
      // Le libellé (title = formatTimeRangeFrench) porte déjà les heures réelles.
      allDay: event.allDay,
      extendedProps: event.extendedProps,
      // Use 'className' property for event-specific CSS classes (FullCalendar standard)
      className: event.classNames
    })),
    // Custom event content renderer - simplified (no title attribute)
    // Tooltips are handled via data-tooltip attribute in eventDidMount
    eventContent: (eventInfo: import('@fullcalendar/core').EventContentArg) => {
      // Soft-delete : badge « Annulé » épinglé + titre barré (la barre ne porte
      // que sur le libellé, pas sur le badge — cf. CSS .slot-cancelled)
      const isCancelled = eventInfo.event.extendedProps.cancelledAt != null
      const badge = isCancelled
        ? `<span class="tp-slot-cancelled-badge">Annulé</span>`
        : ''
      // Barre multi-jours : afficher la plage RÉELLE jour-aware (« du … au … »)
      // pré-calculée par useEventSlots, sinon le `title` mono-jour (« 09h00-17h00
      // | 0/5 »). Le `title` reste inchangé : il alimente le tooltip (scope 1.4).
      const label = (eventInfo.event.extendedProps.multiDayLabel as string | undefined) ?? eventInfo.event.title
      return {
        html: `<div class="fc-event-title-truncate"><span class="tp-event-label">${label}</span>${badge}</div>`
      }
    },
    eventClick: handleEventClick, // Handler pour éditer un créneau au clic (ignore clic-droit)
    // datesSet callback pour ré-attacher les handlers contextmenu lors des changements de vue
    // FullCalendar remplace l'élément .fc-view lors des changements de vue, donc l'observer
    // attaché à l'ancien élément ne peut plus observer les mutations sur le nouvel élément.
    datesSet: () => {
      // Equalize week rows: set table height = tallest row × row count
      // Deferred to next frame so FC has rendered events into cells
      // Clear explicit height before measuring to prevent Firefox feedback loop
      // (inflated height → inflated measurement → even larger height → cycle)
      requestAnimationFrame(() => {
        const fcEl = document.querySelector<HTMLElement>('.fc')
        if (!fcEl) return
        const table = fcEl.querySelector<HTMLTableElement>('.fc-scrollgrid-sync-table')
        const rows = table?.querySelectorAll(':scope > tbody > tr')
        if (!table || !rows || rows.length === 0) return

        // Clear previous explicit height to measure natural row heights
        table.style.height = ''

        const maxRowHeight = Math.max(...Array.from(rows).map(r => r.getBoundingClientRect().height))
        table.style.height = `${maxRowHeight * rows.length}px`
        fcEl.style.setProperty('--fc-week-rows', String(rows.length))
        // Ré-attacher les handlers à toutes les cellules de date dans la nouvelle vue
        const cellsWithDate = fcEl.querySelectorAll('[role="gridcell"][data-date]')
        cellsWithDate.forEach((cell) => {
          const element = cell as HTMLElement

          // Skip si déjà a un handler
          if ((element as unknown as { _contextMenuHandler?: (e: MouseEvent) => void })._contextMenuHandler) {
            return
          }

          // Rendre keyboard-focusable
          if (!element.hasAttribute('tabindex')) {
            element.setAttribute('tabindex', '0')
          }

          // Ajouter aria-label
          const dateStr = element.getAttribute('data-date')
          if (dateStr && !element.hasAttribute('aria-label')) {
            const date = new Date(dateStr)
            const formatter = new Intl.DateTimeFormat('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })
            element.setAttribute('aria-label', formatter.format(date))
          }

          // Attacher le handler contextmenu
          const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            let cellDateStr = element.getAttribute('data-date')
            if (!cellDateStr) {
              const parent = element.closest('[data-date]')
              cellDateStr = parent?.getAttribute('data-date') || null
            }
            if (cellDateStr) {
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                dateStr: cellDateStr
              })
            }
          }

          element.addEventListener('contextmenu', handleContextMenu)
          ;(element as unknown as { _contextMenuHandler: (e: MouseEvent) => void })._contextMenuHandler = handleContextMenu
        })

        // === Gestion spécifique pour la vue timeGridWeek ===
        // La vue semaine utilise une structure DOM différente: data-date est sur les
        // en-têtes de colonnes (.fc-col-header-cell), pas sur les cellules de créneaux
        const isTimeGridView = fcEl.querySelector('.fc-timegrid')
        if (isTimeGridView) {
          // ROOT CAUSE: .fc-timegrid-col-bg (z-index: 2) and .fc-timegrid-col-events (z-index: 3)
          // overlay .fc-timegrid-slots (z-index: 1), blocking events from reaching slot-lane elements.
          // Solution: Attach handler to .fc-timegrid-body (parent of all layers) instead of slots.
          const timeGridBody = fcEl.querySelector('.fc-timegrid-body')

          if (timeGridBody && !timeGridBody.getAttribute('data-timegrid-handler')) {
            timeGridBody.setAttribute('data-timegrid-handler', 'true')

            // Utiliser l'event delegation pour attraper les événements sur toute la zone timegrid
            const handleTimeGridContextMenu = (e: Event) => {
              const mouseEvent = e as MouseEvent

              // Ignorer si le clic est sur un événement existant (géré par eventDidMount)
              const targetEl = mouseEvent.target as HTMLElement
              const isEvent = targetEl.closest('.fc-event')
              if (isEvent) {
                return
              }

              mouseEvent.preventDefault()
              mouseEvent.stopPropagation()

              // IMPORTANT: Query DOM fresh each time to handle week navigation
              // Old colHeaders references become stale when week changes
              const colHeaders = Array.from(fcEl.querySelectorAll('.fc-col-header-cell[data-date]'))

              // Trouver l'index de colonne en vérifiant quel en-tête contient la position du clic (e.clientX)
              const targetHeader = colHeaders.find((header) => {
                const headerRect = header.getBoundingClientRect()
                return mouseEvent.clientX >= headerRect.left && mouseEvent.clientX < headerRect.right
              })

              if (targetHeader) {
                const dateStr = targetHeader.getAttribute('data-date')
                if (dateStr) {
                  setContextMenu({
                    x: mouseEvent.clientX,
                    y: mouseEvent.clientY,
                    dateStr: dateStr
                  })
                }
              }
            }

            // Attacher au body qui est le parent de tous les layers (slots, col-bg, col-events)
            timeGridBody.addEventListener('contextmenu', handleTimeGridContextMenu, true)
          }
        }
        // === Fin gestion timeGridWeek ===
      })
    },
    // Add eventDidMount for right-click handling on events (Story 13.3)
    // Also sets up Portal-based tooltip for calendar events
    eventDidMount: (info: EventMountArg) => {
      const slotId = info.event.id
      const slotToEdit = slots?.find((slot) => slot.id === slotId)

      // Portal-based tooltip setup - hover handlers
      const description = info.event.extendedProps.description as string | undefined

      const handleMouseEnter = () => {
        // Titre = plage horaire/jours SANS occupation : « 1/4 » serait redondant
        // avec le bandeau de statut (« 3 places disponibles sur 4 ») et reste de
        // toute façon visible sur la barre. Multi-jours → plage complète
        // « du … au … » (aligné sur le tooltip public ; corrige aussi le
        // « 14h00-14h00 » trompeur du title FullCalendar) ; mono-jour → « HHhmm-HHhmm ».
        const tooltipTitle = slotToEdit
          ? isMultiDaySlot(slotToEdit.startTime, slotToEdit.endTime)
            ? formatSlotRange(slotToEdit.startTime, slotToEdit.endTime)
            : formatTimeRangeFrench(slotToEdit.startTime, slotToEdit.endTime)
          : info.event.title
        setTooltipState({
          title: tooltipTitle,
          description,
          slot: slotToEdit,
          targetElement: info.el,
          visible: true,
        })
      }

      const handleMouseLeave = () => {
        setTooltipState((prev) => ({
          ...prev,
          visible: false,
        }))
      }

      info.el.addEventListener('mouseenter', handleMouseEnter)
      info.el.addEventListener('mouseleave', handleMouseLeave)

      // Store tooltip handlers for cleanup
      ;(info.el as unknown as { _tooltipEnterHandler?: () => void })._tooltipEnterHandler = handleMouseEnter
      ;(info.el as unknown as { _tooltipLeaveHandler?: () => void })._tooltipLeaveHandler = handleMouseLeave

      if (slotToEdit) {
        const handleEventContextMenu = (e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          setEventContextMenu({
            x: e.clientX,
            y: e.clientY,
            slot: slotToEdit
          })
        }

        info.el.addEventListener('contextmenu', handleEventContextMenu)

        // Store handler for cleanup
        ;(info.el as unknown as { _eventContextMenuHandler?: (e: MouseEvent) => void })._eventContextMenuHandler = handleEventContextMenu
      }
    },
    // Add eventWillUnmount for cleanup
    eventWillUnmount: (info: EventMountArg) => {
      // Cleanup context menu handler
      const handler = (info.el as unknown as { _eventContextMenuHandler?: (e: MouseEvent) => void })._eventContextMenuHandler
      if (handler) {
        info.el.removeEventListener('contextmenu', handler)
      }

      // Cleanup tooltip handlers
      const enterHandler = (info.el as unknown as { _tooltipEnterHandler?: () => void })._tooltipEnterHandler
      const leaveHandler = (info.el as unknown as { _tooltipLeaveHandler?: () => void })._tooltipLeaveHandler
      if (enterHandler) {
        info.el.removeEventListener('mouseenter', enterHandler)
      }
      if (leaveHandler) {
        info.el.removeEventListener('mouseleave', leaveHandler)
      }
    }
    // NOTE: dayCellDidMount retiré - utilisation d'un useEffect à la place (Story 13.2)
  }), [events, handleEventClick, t, slots, setContextMenu, setEventContextMenu, view])

  // Loading state - Skeleton with multiple bars to simulate structure
  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  // Error state - with normalized message
  if (error) {
    const errorMessage = userFacingErrorMessage(
      error,
      "Les créneaux n'ont pas pu être chargés. Rafraîchissez la page pour réessayer."
    )
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 bg-destructive/10 rounded-lg border border-destructive/20">
        <AlertCircle className="h-12 w-12 text-destructive mb-3" />
        <h2 className="text-lg font-medium text-destructive-foreground mb-2">Erreur</h2>
        <p className="text-destructive-foreground/80 text-center">{errorMessage}</p>
      </div>
    )
  }

  // Error boundary fallback UI
  const errorFallback = (
    <div className="flex flex-col items-center justify-center py-12 px-4 bg-destructive/10 rounded-lg border border-destructive/20">
      <AlertCircle className="h-12 w-12 text-destructive mb-3" />
      <h2 className="text-lg font-medium text-destructive-foreground mb-2">Erreur de calendrier</h2>
      <p className="text-destructive-foreground/80 text-center">Le calendrier n'a pas pu être affiché. Veuillez rafraîchir la page.</p>
    </div>
  )

  // Normal calendar render with error boundary
  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header : titre sur sa propre ligne, puis tablist + bouton créer en dessous */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Typography variant="h3" as="h2">Créneaux</Typography>
            {slots.length > 0 && <Badge variant="info" size="sm">{slots.length}</Badge>}
          </div>
          <div className="flex items-center gap-3">
            {/* Wrapper mesuré : bascule TabsList → Select quand trop étroit (DS pattern useCompactMode). */}
            <div ref={tabsToolbarRef} className="flex-1 min-w-0 overflow-hidden [contain:inline-size]">
              {tabsCompact && (
                <Select value={view} onValueChange={(v) => setView(v as ViewMode)}>
                  <SelectTrigger className="text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIEW_TABS.map(({ value, label, icon: Icon }) => (
                      <SelectItem key={value} value={value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Tabs contrôlé SANS TabsContent : rendu du contenu géré plus bas (view === 'list' → SlotList). */}
              {!tabsCompact && (
                <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                  <TabsList data-measure className="flex-nowrap">
                    {VIEW_TABS.map(({ value, label, icon: Icon }) => (
                      <TabsTrigger key={value} value={value} className="gap-1.5 shrink-0">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            </div>
            <Button variant="outline" onClick={() => handleCreateSlotFromDate()}>
              <CalendarPlus />
              Créer un créneau
            </Button>
          </div>
        </div>

        {/* Vue Liste (SlotList) ou Calendrier (FullCalendar) selon `view` */}
        {view === 'list' ? (
          <SlotList eventId={eventId} />
        ) : (
          <CalendarErrorBoundary fallback={errorFallback}>
            <div className="slot-calendar-container tp-calendar">
              <style>{`
                /* Couleur de statut des événements en bloc mono-jour (vues Mois + Année) :
                 * .slot-calendar-container .fc-h-event { background: transparent !important }
                 * neutralise les utilitaires bg-slot* sur les mono-jours devenus .fc-h-event
                 * après eventDisplay:'block'. On ré-affirme depuis les mêmes jetons --slot-*. */
                .slot-calendar-container .fc-h-event.bg-slotAvailable {
                  background-color: hsl(var(--slot-available)) !important;
                  border-color: hsl(var(--slot-available)) !important;
                }
                .slot-calendar-container .fc-h-event.bg-slotPartial {
                  background-color: hsl(var(--slot-partial)) !important;
                  border-color: hsl(var(--slot-partial)) !important;
                }
                .slot-calendar-container .fc-h-event.bg-slotFull {
                  background-color: hsl(var(--slot-full)) !important;
                  border-color: hsl(var(--slot-full)) !important;
                }
                .slot-calendar-container .fc-h-event.slot-cancelled {
                  background-color: #f3f4f6 !important; /* gray-100 */
                  border-color: #d1d5db !important;    /* gray-300 */
                }
                .slot-calendar-container .fc-event:hover {
                  filter: brightness(1.1);
                }
                /* Neutralise le fond/bordure bleus par défaut des événements en bloc
                 * du daygrid (.fc-h-event = vues Année/Mois) pour laisser apparaître
                 * le fond porté par les utilitaires bg-slot* de l'ancre. Le texte
                 * (blanc pour les colorés, gris pour les annulés) est géré par le
                 * calque partagé .tp-calendar dans index.css. */
                .slot-calendar-container .fc-h-event {
                  background-color: transparent !important;
                  border-color: transparent !important;
                }
                .slot-calendar-container .fc-more-link {
                  font-size: 0.7rem;
                  font-weight: 500;
                  color: hsl(var(--primary));
                }
                /* Spécifique admin : bordure pointillée des créneaux annulés (le
                 * grisé + barré + badge sont mutualisés dans .tp-calendar). */
                .slot-calendar-container .fc-event.slot-cancelled {
                  border-style: dashed !important;
                }
                /* Le badge « Annulé » suit le libellé en flux inline (pas de flex
                 * gap comme côté public) : on rétablit l'espacement à gauche. */
                .slot-calendar-container .tp-slot-cancelled-badge {
                  margin-left: 0.25rem;
                }
              `}</style>
              <FullCalendar {...calendarOptions} ref={calendarRef} />
            </div>
          </CalendarErrorBoundary>
        )}

        {/* Menu contextuel pour clic-droit sur cellule vide (Story 13.2) */}
        {contextMenu && (
          <SlotContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            dateStr={contextMenu.dateStr}
            isOpen={true}
            onOpenChange={handleContextMenuClose}
            onCreateSlot={handleCreateSlotFromDate}
          />
        )}

        {/* Menu contextuel pour clic-droit sur événement (Story 13.3) */}
        {eventContextMenu && (
          <SlotContextMenu
            x={eventContextMenu.x}
            y={eventContextMenu.y}
            dateStr="" // Not used in event mode
            isOpen={true}
            onOpenChange={handleContextMenuClose}
            onCreateSlot={handleCreateSlotFromDate} // Not used in event mode, but required
            slot={eventContextMenu.slot}
            onEditSlot={handleEditSlotFromMenu}
            onDeleteSlot={handleDeleteSlotFromMenu}
          />
        )}

        {/* Modale de création/édition de créneau */}
        {selectedSlot && (
          <SlotEditDialog
            slot={selectedSlot}
            open={dialogOpen}
          onOpenChange={handleDialogClose}
        />
      )}

        {/* Dialog de confirmation de suppression de créneau */}
        <SlotDeleteDialog
          slot={deleteDialog.slot}
          open={deleteDialog.open}
          onOpenChange={(open) => setDeleteDialog({ open, slot: null })}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
        />

        {/* Portal-based tooltip for calendar events */}
        <FloatingPortalTooltip
          title={tooltipState.title}
          description={tooltipState.description}
          slot={tooltipState.slot}
          targetElement={tooltipState.targetElement}
          visible={tooltipState.visible}
        />
      </div>
    </TooltipProvider>
  )
}
