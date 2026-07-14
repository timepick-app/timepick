import { useParams } from 'react-router-dom'
import { useMyEvents } from '@/hooks/useMyEvents'
import { EventCalendarContent } from '@/components/public'
import { MemberEventStickyHeader } from '@/components/member/MemberEventStickyHeader'
import { EventSkeleton } from '@/components/EventSkeleton'
import { EventNotFound } from '@/components/EventNotFound'

/**
 * MemberEventPage — cible de route `/me/events/:uuid` (Story 1.5).
 *
 * Réutilise `EventCalendarContent` (corps du calendrier public) dans le shell
 * membre, avec un header sticky membre SANS avatar (`MemberEventStickyHeader`).
 *
 * **Garde de rattachement côté client (AC3, pattern D-AC3 story 1.4) :** la
 * liste `GET /api/me/events` est déjà filtrée
 * côté serveur par `event_users.user_id` — un `uuid` absent du cache
 * `useMyEvents()` signifie donc « non rattaché » (ou inexistant). On affiche un
 * état **neutre** (`EventNotFound`) couvrant les deux cas afin de ne pas fuiter
 * l'existence d'un événement (pas de distinction 404 vs 403).
 *
 * **Défense en profondeur (AC3, déjà en place) :** `EventCalendarContent` →
 * `usePublicEvent(uuid)` retourne **403** côté serveur si l'utilisateur
 * authentifié n'est pas rattaché (`isUserAuthorizedForEvent`) → branche
 * `<UnauthorizedAccess />`. Filet conservé (T3.3).
 *
 * États :
 * - chargement (`useMyEvents` en cours ou `events === undefined`) → `<EventSkeleton />`
 * - `events !== undefined && !event` → `<EventNotFound />` (neutre)
 * - `event` trouvé → `<EventCalendarContent renderHeader={member header} />`
 *
 * `useMyEvents` est appelé sans `enabled` : cette page vit derrière le guard
 * `MemberLayout` (`!isAuthenticated → /login`), donc la requête est légitime.
 */
export function MemberEventPage() {
  const { uuid } = useParams<{ uuid: string }>()
  const { data: events, isLoading: eventsLoading } = useMyEvents()
  const event = events?.find((e) => e.uuid === uuid)

  // Garde de chargement : cache `useMyEvents` non encore résolu.
  if (eventsLoading || events === undefined) {
    return <EventSkeleton />
  }

  // Garde de rattachement (neutre) : uuid absent du cache = inexistant OU
  // non rattaché. Pas de fuite (pas de distinction 404/403 côté client).
  if (!event) {
    return <EventNotFound />
  }

  // Événement rattaché : calendrier complet dans le shell membre, header
  // injecté SANS avatar. La période est calculée par `EventCalendarContent`
  // (`calculatePeriodRange(slots)`) puis transmise via `renderHeader`.
  return (
    <EventCalendarContent
      uuid={uuid ?? ''}
      renderHeader={(ctx) => <MemberEventStickyHeader {...ctx} />}
    />
  )
}
