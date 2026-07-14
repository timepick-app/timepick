import type { EventCalendarHeaderContext } from '@/components/public'
import { MemberReservationsPopover } from './MemberReservationsPopover'

/**
 * Props du header sticky membre — consomme le contexte transmis par
 * `EventCalendarContent.renderHeader`. Story 1.5 : `{ eventName, periodFormatted }`.
 * Story 1.6 : extension additive `{ eventReservations, onCancelReservation,
 * cancellingSlotId }` consommée par le popover « Mes réservations ».
 */
export type MemberEventStickyHeaderProps = EventCalendarHeaderContext

/**
 * MemberEventStickyHeader — barre de contexte sticky pour la vue événement
 * membre (`/me/events/:uuid`).
 *
 * Affiche `{nom de l'événement} · {période début→fin}` + (Story 1.6) un
 * **badge compteur** ouvrant un Popover (desktop) / bottom Sheet (mobile)
 * listant les réservations du user pour CET événement, avec annulation inline.
 * Si `periodFormatted` est `null` (aucun créneau actif), seul le nom s'affiche.
 *
 * **Aucun avatar / menu utilisateur / lien « Se connecter »** (AC2, UX-DR2) :
 * l'identité membre est déjà portée par `NavUser` en pied de sidebar (stories
 * 1.3/1.4). Ce header remplace volontairement `<PublicNavHeader>` (qui fuitait
 * `PublicUserMenu`) dans le shell membre. Le badge réservations n'est PAS une
 * surface d'auth — il est neutre et contextuel à l'événement.
 *
 * `z-40` : strictement inférieur au header mobile `AppShell` (`z-50`) afin
 * d'éviter la collision de paint. Les overlays Popover/Sheet portent leur
 * propre `z-50` (overlay Radix) → pas de conflit avec le `z-40` du header.
 * `sticky top-0` côté desktop ; le chevauchement mobile éventuel (header
 * AppShell ~57px) est à valider par le smoke CP3 (T5.6).
 *
 * Le nom est rendu dans un `<h1>` sémantique (titre de page). Sur la route
 * événement, `MemberLayout` passe `pageTitle={null}` à `AppShell` (qui ne
 * rend plus le `<h1>` générique « Événement ») — le nom de l'événement est
 * donc ici le titre principal (résolution du double-h1 déféré en 1.5).
 *
 * @see Story 1.5 — AC2 / Décision clé (renderHeader membre)
 * @see Story 1.6 — AC1 (badge compteur), AC2/AC3 (overlay responsive)
 */
export function MemberEventStickyHeader({
  eventName,
  periodFormatted,
  eventReservations,
  onCancelReservation,
  cancellingSlotId,
}: MemberEventStickyHeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-background border-b py-2">
      <div className="flex items-center gap-2 max-w-7xl mx-auto min-w-0">
        <h1 className="text-sm sm:text-base font-semibold text-foreground truncate max-w-[200px] sm:max-w-[320px] lg:max-w-[500px]">
          {eventName}
        </h1>
        {periodFormatted && (
          <>
            <span className="hidden sm:inline text-muted-foreground" aria-hidden="true">·</span>
            <span
              data-testid="event-period"
              className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap"
            >
              {periodFormatted}
            </span>
          </>
        )}
        {/* Story 1.6 — badge « Mes réservations » (Popover desktop / Sheet mobile).
            `ml-auto` pousse le badge à droite ; `shrink-0` évite la compression
            quand le nom d'événement truncate. Le popover gère son propre état `open`. */}
        <div className="ml-auto shrink-0" data-testid="member-reservations-slot">
          <MemberReservationsPopover
            eventName={eventName}
            eventReservations={eventReservations}
            onCancelReservation={onCancelReservation}
            cancellingSlotId={cancellingSlotId}
          />
        </div>
      </div>
    </header>
  )
}
