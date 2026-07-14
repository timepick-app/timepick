import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useMyEvents } from '@/hooks/useMyEvents'
import { getStaticTitle, isMemberEventRoute } from '@/config/pageTitle'
import { EventSkeleton } from '@/components/EventSkeleton'
import type { MemberEvent } from '@/types/member'
import { AppShell } from './AppShell'
import type { NavEntry, NavLinkItem, NavSection } from './SidebarContent'

/**
 * nullSafeAsc / nullSafeDesc — tri `startDate` null-safe (nulls last, D7).
 * Un événement sans créneau actif a `startDate = null` (isUpcoming=false →
 * « Passés »). Sans ce garde, `a.startDate.localeCompare` lèverait sur null.
 */
const nullSafeAsc = (a: string | null, b: string | null): number => {
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b)
}
const nullSafeDesc = (a: string | null, b: string | null): number => {
  if (a === null) return 1
  if (b === null) return -1
  return b.localeCompare(a)
}

/**
 * Construit les items de la sidebar membre (D7) :
 *  - « Mon agenda » (NavItem, exact, `/me`) — toujours présent.
 *  - Section « À venir » (non-repliable, startDate ASC nulls last) — omise si vide.
 *  - Section « Passés » (repliable, defaultOpen=false, startDate DESC nulls last) — omise si vide.
 *
 * Sections omises si vides → AC4 (0 event = « Mon agenda » seul, pas d'en-têtes orphelins).
 */
function buildMemberItems(events: MemberEvent[]): NavEntry[] {
  const toLink = (e: MemberEvent): NavLinkItem => ({
    id: `me-evt-${e.uuid}`,
    label: e.name,
    href: `/me/events/${e.uuid}`,
  })

  const upcoming = events
    .filter((e) => e.isUpcoming)
    .sort((a, b) => nullSafeAsc(a.startDate, b.startDate))
  const past = events
    .filter((e) => !e.isUpcoming)
    .sort((a, b) => nullSafeDesc(a.startDate, b.startDate))

  const items: NavEntry[] = [
    { id: 'me-agenda', label: 'Mon agenda', href: '/me', icon: CalendarClock, exact: true },
  ]
  if (upcoming.length) {
    const upcomingSection: NavSection = {
      id: 'me-upcoming',
      label: 'À venir',
      collapsible: false,
      links: upcoming.map(toLink),
    }
    items.push(upcomingSection)
  }
  if (past.length) {
    const pastSection: NavSection = {
      id: 'me-past',
      label: 'Passés',
      collapsible: true,
      defaultOpen: false,
      links: past.map(toLink),
    }
    items.push(pastSection)
  }
  return items
}

/**
 * MemberLayout — layout-route React Router (élément `<Route element>` + `<Outlet/>`)
 * consommant `AppShell` (D1). La sidebar persiste à travers la navigation `/me/*`
 * (seul `<Outlet/>` swap) — meilleur UX que le pattern wrapper-per-page et évite
 * le refetch/re-mount de la sidebar à chaque nav (D1).
 *
 * Garde défensif minimal (D11) : `isLoading → null`, `!isAuthenticated → /login`.
 * Le routage complet (destination post-login, hasMemberAccess, magic-link landing,
 * 301 /events/:uuid) = Story 1.4, hors scope. Contrairement à l'admin,
 * MemberLayout ne branche PAS `useSessionTimeout` — la détection proactive
 * T-5min/T-1min est DEFERRED à 1.5+. Un 401 (session expirée) déclenche une
 * déconnexion + redirection vers `/login?reason=session_expired` via l'intercepteur
 * axios (`@/services/api`) ; plus de bannière in-app côté membre.
 */
export function MemberLayout() {
  const { isAuthenticated, isLoading } = useAuth()
  const { pathname } = useLocation()
  // Hook appelé avant tout retour (règle des hooks). Le cache React Query est au
  // provider : pas de refetch par nav (staleTime 5 min). `events ?? []` gère le
  // pending gracieusement (sidebar = « Mon agenda » seul puis se peuple, D7/PIège #8).
  const { data: events } = useMyEvents()

  // En-tête de la sidebar membre — hoisté pour réutilisation par la branche
  // isLoading (skeleton) et le rendu authentifié.
  const header = (
    <div className="p-6 border-b">
      <h1 className="text-xl font-bold">TimePick</h1>
      <p className="text-sm text-muted-foreground">Espace membre</p>
    </div>
  )

  // Chrome membre + skeleton au lieu d'un écran blanc pendant la
  // réhydratation auth (montage uniquement) → supprime le flash blanc de
  // cold load / hard refresh.
  if (isLoading) {
    return (
      <AppShell header={header} profilePath="/me/profile" shell="member">
        <EventSkeleton />
      </AppShell>
    )
  }
  if (!isAuthenticated) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />

  const items = buildMemberItems(events ?? [])
  // Route événement membre : le nom de l'événement est rendu en <h1> par
  // MemberEventStickyHeader → on supprime le pageTitle générique « Événement »
  // d'AppShell (desktop h1 + mobile div) pour éviter le double <h1>.
  const pageTitle = isMemberEventRoute(pathname)
    ? null
    : (getStaticTitle(pathname) ?? 'Mon espace')

  return (
    <AppShell
      items={items}
      header={header}
      pageTitle={pageTitle}
      profilePath="/me/profile"
      shell="member"
    >
      <Outlet />
    </AppShell>
  )
}
