import { useState, useMemo, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePublicEvent } from '@/hooks/useEvents'
import { usePublicSlots } from '@/hooks/usePublicSlots'
import { useEventMode } from '@/hooks/useEventMode'
import { usePollingConfig } from '@/hooks/usePollingConfig'
import { useCreateReservation, useMyReservations, useCancelReservationBySlot } from '@/hooks/useReservations'
import { useViewMode } from '@/hooks/useViewMode'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useFilterParams } from '@/hooks/useFilterParams'
import { useFilteredSlots } from '@/hooks/useFilteredSlots'
import { useAuth } from '@/hooks/useAuth'
import { EventNotFound } from '@/components/EventNotFound'
import { EventNotPublished } from '@/components/EventNotPublished'
import { UnauthorizedAccess } from '@/components/UnauthorizedAccess'
import { EventSkeleton } from '@/components/EventSkeleton'
import { CalendarView } from './CalendarView'
import { SlotDetailDialog } from './SlotDetailDialog'
import { ConfirmCancelDialog } from './ConfirmCancelDialog'
import { PollingIndicator } from './PollingIndicator'
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator'
import { StatusBanner } from './StatusBanner'
import { ViewToggle } from './ViewToggle'
import { PublicSlotList } from './PublicSlotList'
import { SlotFiltersPanel } from './SlotFiltersPanel'
import { PublicEventHeader } from './PublicEventHeader'
import { PublicNavHeader } from './PublicNavHeader'
import { calculatePeriodRange } from '@/lib/utils'
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { Lock } from 'lucide-react'
import type { Slot } from '@/types/slot'
import type { Booking } from '@/types/booking'

/**
 * Type d'erreur avec response (pour Axios/React Query errors)
 */
interface ApiError {
  response?: {
    status?: number
    data?: {
      code?: string
    }
  }
}

/**
 * Contexte transmis au prop `renderHeader` (header injectable).
 */
export interface EventCalendarHeaderContext {
  eventName: string
  periodFormatted: string | null
  /**
   * Réservations du user SCOPÉES à cet événement (live — filtrées par
   * `slot.eventId === uuid`). Source de vérité du badge compteur (Story 1.6).
   * Décompte live (queryKey `['reservations']`, invalidé sur annulation) —
   * NE PAS utiliser `MemberEvent.myBookingCount` (stale, non invalidé).
   */
  eventReservations: Booking[]
  /**
   * Déclenche le flow d'annulation partagé (`handleCancelFromPanel` →
   * `ConfirmCancelDialog` → `useCancelReservationBySlot`). Le header consommateur
   * NE doit PAS recâbler sa propre mutation (Story 1.6 / AR11).
   */
  onCancelReservation?: (slotId: string) => void
  /**
   * `slotId` en cours d'annulation (mutation en vol) — pour désactiver / spinner
   * le bouton `[✕]` inline correspondant.
   */
  cancellingSlotId?: string
}

/**
 * Props pour EventCalendarContent
 */
export interface EventCalendarContentProps {
  /** UUID de l'événement à afficher (résolu par la page consommatrice). */
  uuid: string
  /**
   * Header injectable. Par défaut (omis), rend `<PublicNavHeader>` (route
   * publique `/events/:uuid`, destinée aux non-membres : bouton « Se connecter »
   * portant `?next=/me/events/:uuid`).
   *
   * En contexte membre (`MemberEventPage`), on passe un header SANS avatar
   * (`MemberEventStickyHeader`) afin de ne pas fuiter `PublicUserMenu`.
   */
  renderHeader?: (ctx: EventCalendarHeaderContext) => ReactNode
}

/**
 * EventCalendarContent — corps réutilisable du calendrier public.
 *
 * Extrait de `PublicCalendar` (Story 1.5, Décision clé) pour permettre la
 * réutilisation de toute l'orchestration (~12 hooks + 5 états d'erreur +
 * handlers de réservation/annulation) dans le shell membre SANS duplication.
 *
 * Divergence intentionnelle (décision produit) : la route publique ne rend plus
 * la carte de pied « Mes réservations » ; la redirection des membres authentifiés
 * vers `/me/events/:uuid` vit dans `PublicCalendar`.
 *
 * Ordre des early-returns préservé : `isLoading` → `404` →
 * `403/EVENT_NOT_PUBLISHED` → `403/autre` → `401` → `!event`.
 *
 * @see Story 1.5 — Vue événement membre (Décision clé — Réutilisation PublicCalendar)
 */
export function EventCalendarContent({ uuid, renderHeader }: EventCalendarContentProps) {
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuth()

  // Récupérer la configuration de polling depuis l'API admin
  const { data: pollingConfig } = usePollingConfig()
  const pollingInterval = pollingConfig?.interval ?? 30000

  // Récupérer l'événement public avec polling automatique pour détecter les changements de opensAt
  const { data: event, isLoading, error } = usePublicEvent(uuid, pollingInterval)

  // Récupérer les slots publics avec polling automatique (fréquence dynamique
  // depuis app_config). Polling désactivé (intervalle 0) tant que le calendrier
  // n'est pas affiché (`!canReserve`) : rien à rafraîchir en état verrouillé.
  const {
    data: slots = [],
    isLoading: isLoadingSlots,
    isRefetching,
    error: slotsError,
    failureCount,
    dataUpdatedAt,
  } = usePublicSlots(
    uuid,
    true,
    event?.canReserve ? pollingInterval : 0
  )

  // Handler pour le rechargement manuel (Story 8.3)
  const handleManualRetry = () => {
    queryClient.invalidateQueries({ queryKey: ['public-slots', uuid] })
  }

  // Date de la dernière mise à jour réussie des slots (Story 8.3)
  const lastSlotsUpdateDate = dataUpdatedAt ? new Date(dataUpdatedAt) : null

  // Détecter le mode consultatif
  const { isConsultative, opensAtDate } = useEventMode(event?.opensAt ?? null)

  // Récupérer les réservations de l'utilisateur pour afficher l'état de réservation
  const { data: myReservations } = useMyReservations(isAuthenticated)
  const myReservationsList = useMemo(() => myReservations || [], [myReservations])
  const myReservationsCount = myReservationsList.length

  // Hook pour créer une réservation
  const { mutate: createReservation, isPending: isBooking } = useCreateReservation()

  // Hook pour annuler une réservation (Story 6.6)
  const { mutate: cancelReservation, isPending: isCancelling } = useCancelReservationBySlot()

  // Mode d'affichage (calendrier/liste) avec persistance localStorage
  // Responsive default: mobile (< 768px) -> list, desktop (>= 768px) -> calendar
  const { viewMode, setViewMode } = useViewMode(uuid)

  useDocumentTitle({ title: event?.name ?? (isLoading ? 'Chargement...' : 'Événement') })

  // État pour le dialog de détails
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // État pour le dialog de confirmation d'annulation (Story 6.6)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Helper pour vérifier si l'utilisateur a réservé un créneau
  const hasUserBookedSlot = (slotId: string): boolean => {
    return myReservationsList.some(b => b.slotId === slotId)
  }

  // Set des IDs des créneaux réservés pour CalendarView (Story 6.7)
  const bookedSlotIds = useMemo(
    () => new Set<string>(myReservationsList.map(b => b.slotId)),
    [myReservationsList]
  )

  // État pour le filtre "Voir uniquement mes réservations" (Story 6.7 - Fix code review)
  const [showOnlyMyReservations, setShowOnlyMyReservations] = useState(false)

  // Story 19.7: Filtres avancés avec persistance URL
  const { filters, setFilters, resetFilters, activeFilterCount, hasActiveFilters } = useFilterParams()
  const timeFilteredSlots = useFilteredSlots(slots, filters)

  // Appliquer le filtre "mes réservations" en plus des filtres avancés
  const filteredSlots = useMemo(() => {
    return showOnlyMyReservations
      ? timeFilteredSlots.filter(slot => bookedSlotIds.has(slot.id))
      : timeFilteredSlots
  }, [timeFilteredSlots, showOnlyMyReservations, bookedSlotIds])

  // Handler pour sélectionner un créneau
  const handleSelectSlot = useCallback((slotId: string) => {
    const slot = slots.find((s) => s.id === slotId)
    if (slot) {
      setSelectedSlot(slot)
      setIsDetailOpen(true)
    }
  }, [slots])

  // État de chargement
  if (isLoading || isLoadingSlots) {
    return <EventSkeleton />
  }

  // Erreur 404 - Événement non trouvé
  if (error && (error as ApiError).response?.status === 404) {
    return <EventNotFound />
  }

  // Erreur 403 - Non publié ou non autorisé
  if (error && (error as ApiError).response?.status === 403) {
    const code = (error as ApiError).response?.data?.code
    if (code === 'EVENT_NOT_PUBLISHED') {
      return <EventNotPublished />
    }
    return <UnauthorizedAccess eventName={event?.name} />
  }

  // Erreur 401 - Non authentifié
  if (error && (error as ApiError).response?.status === 401) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-lg border border-border bg-muted p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Connectez-vous pour accéder à cet événement.
          </p>
        </div>
      </div>
    )
  }

  // Événement non chargé
  if (!event) {
    return <EventNotFound />
  }


  // Handler pour réserver un créneau
  const handleBookSlot = async (slotId: string) => {
    try {
      await createReservation({ slotId })
      setIsDetailOpen(false)
    } catch (error) {
      // Le toast d'erreur est géré par le onError de useCreateReservation (si ajouté)
      if (import.meta.env.DEV) {
        console.error('[EventCalendarContent] Error booking slot:', error)
      }
    }
  }

  // Handler pour cliquer sur le bouton "Annuler" (Story 6.6)
  const handleCancelClick = () => {
    setShowCancelConfirm(true)
  }

  // Handler pour confirmer l'annulation (Story 6.6)
  const handleConfirmCancel = async () => {
    if (selectedSlot) {
      await cancelReservation(selectedSlot.id)
      setShowCancelConfirm(false)
      setIsDetailOpen(false)
    }
  }

  // Handler pour annuler la dialog de confirmation (Story 6.6)
  const handleCloseCancelDialog = () => {
    setShowCancelConfirm(false)
  }

  // Handler pour annuler une réservation (depuis PublicSlotList ou le header membre)
  const handleCancelFromPanel = async (slotId: string) => {
    setShowCancelConfirm(true)
    // Pré-sélectionner le slot pour confirmation
    const slot = slots.find((s) => s.id === slotId)
    if (slot) {
      setSelectedSlot(slot)
    }
  }

  // Cas « accès réservé » (B) : visiteur non connecté sur un événement privé
  // (`canReserve=false` hors mode consultatif). On masque le descriptif — un
  // événement non ouvert à la consultation publique ne doit pas révéler sa
  // nature. Les états « pas encore ouvert » (A/C, `isConsultative`) gardent la
  // description et portent leur propre bandeau de statut.
  const isLockedAnonymous = !event.canReserve && !isConsultative

  return (
    <>
      {/* Navigation header with event context (injectable — default = PublicNavHeader) */}
      {renderHeader
        ? renderHeader({
            eventName: event.name,
            periodFormatted: calculatePeriodRange(slots)?.formatted ?? null,
            // Story 1.6 — réservations du user scopées à cet événement (live).
            // Filtre côté client : useMyReservations() renvoie toutes les réservations
            // cross-événements ; on retient celles dont le slot appartient à cet event.
            eventReservations: myReservationsList.filter(
              (b) => b.slot?.eventId === uuid,
            ),
            onCancelReservation: handleCancelFromPanel,
            cancellingSlotId: isCancelling && selectedSlot ? selectedSlot.id : undefined,
          })
        : (
          <PublicNavHeader
            eventName={event.name}
            periodFormatted={calculatePeriodRange(slots)?.formatted}
            loginHref={`/login?next=${encodeURIComponent('/me/events/' + uuid)}`}
          />
        )}

      <div className="mx-auto max-w-7xl px-4 py-4">
      {/* Status banner + description + connection indicators */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <PublicEventHeader
          eventDescription={isLockedAnonymous ? undefined : (event.description ?? undefined)}
          statusBanner={<StatusBanner slots={slots} opensAt={event.opensAt} />}
        />

        {/* Indicateurs de connexion — masqués quand le calendrier n'est pas
            affiché (état verrouillé) : aucune donnée à rafraîchir. */}
        {event.canReserve && (
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <PollingIndicator isRefetching={isRefetching} />
            <ConnectionStatusIndicator
              error={slotsError}
              isRefetching={isRefetching}
              onRetry={handleManualRetry}
              lastUpdateDate={lastSlotsUpdateDate}
              failureCount={failureCount}
            />
          </div>
        )}
      </div>

      {/* Contenu principal - Calendrier */}
      {event.canReserve ? (
        <>
          {/* Toggle Vue Calendrier/Liste + Filtres (Story 19.7) */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <ViewToggle
              viewMode={viewMode}
              onChange={setViewMode}
            />
            <SlotFiltersPanel
              filters={filters}
              onFiltersChange={setFilters}
              onReset={resetFilters}
              filteredCount={filteredSlots.length}
              totalCount={slots.length}
              hasActiveFilters={hasActiveFilters}
              activeFilterCount={activeFilterCount}
              showMyReservations={showOnlyMyReservations}
              onShowMyReservationsChange={setShowOnlyMyReservations}
              myReservationsCount={myReservationsCount}
            />
          </div>

          {/* Contenu principal — Calendrier ou Liste.
              Conteneur à hauteur plancher (vues calendrier seulement) : réserve
              l'espace pour qu'un (re)montage/teardown de FullCalendar n'effondre pas
              la mise en page (anti-saut). La vue Liste garde sa hauteur naturelle.
              `CalendarView` n'a plus de `key={viewMode}` : la bascule mois↔semaine
              se fait par changeView (cf. CalendarView) sans remount = sans flash. */}
          <div className={viewMode === 'list' ? undefined : 'min-h-[36rem]'}>
            {(viewMode === 'calendar' || viewMode === 'week') && (
              <CalendarView
                slots={filteredSlots}
                slotRangeSource={slots}
                allSlotsCount={slots.length}
                isFiltered={showOnlyMyReservations || hasActiveFilters}
                onSelectSlot={handleSelectSlot}
                disabled={isConsultative}
                bookedSlotIds={bookedSlotIds}
                calendarViewMode={viewMode === 'week' ? 'week' : 'month'}
              />
            )}
            {viewMode === 'list' && (
              <PublicSlotList
                slots={filteredSlots}
                allSlotsCount={slots.length}
                isFiltered={showOnlyMyReservations}
                onReserveSlot={handleBookSlot}
                onCancelSlot={handleCancelFromPanel}
                disabled={isConsultative}
                bookedSlotIds={bookedSlotIds}
              />
            )}
          </div>

        </>
      ) : (
        <Card className="mx-auto max-w-md">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Lock className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
            <CardTitle as="h2">
              {isConsultative ? 'Inscriptions non ouvertes' : 'Accès réservé'}
            </CardTitle>
            <CardDescription>
              {isConsultative
                ? 'Les inscriptions ne sont pas encore ouvertes pour cet événement.'
                : 'Cet événement n\'est pas ouvert à la consultation publique. Si vous êtes membre, connectez-vous pour accéder aux créneaux.'}
            </CardDescription>
          </CardContent>
        </Card>
      )}

      {/* Dialog de détails du créneau */}
      <SlotDetailDialog
        slot={selectedSlot}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onBook={handleBookSlot}
        isBooking={isBooking}
        isConsultative={isConsultative}
        opensAtDate={opensAtDate}
        hasBooked={selectedSlot ? hasUserBookedSlot(selectedSlot.id) : false}
        onCancel={handleCancelClick}
        isCancelling={isCancelling}
      />

      {/* Dialog de confirmation d'annulation (Story 6.6) */}
      <ConfirmCancelDialog
        open={showCancelConfirm}
        onConfirm={handleConfirmCancel}
        onCancel={handleCloseCancelDialog}
        isCancelling={isCancelling}
      />
    </div>
    </>
  )
}
