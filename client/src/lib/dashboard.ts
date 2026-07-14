import type { Event } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'
import type { EventActivity, EngagementStats } from '@/types/analytics'

export type EventStatusKey = 'draft' | 'upcoming' | 'ongoing' | 'past'

const OPENING_SOON_DAYS = 7
const UNDERFILLED_RATE = 50
const DAY_MS = 86_400_000

export function deriveEventStatus(event: Event, now: Date = new Date()): EventStatusKey {
  if (!event.isPublished) return 'draft'
  const start = event.periodStart ? new Date(event.periodStart) : null
  const end = event.periodEnd ? new Date(event.periodEnd) : null
  if (start && start.getTime() > now.getTime()) return 'upcoming'
  if (end && end.getTime() < now.getTime()) return 'past'
  return 'ongoing'
}

export interface DashboardKpis {
  totalEvents: number
  publishedEvents: number
  avgFillRate: number
  totalBookings: number
  totalCapacity: number
}

export function computeKpis(events: Event[], stats: EventStats[], _now: Date = new Date()): DashboardKpis {
  const totalCapacity = stats.reduce((s, x) => s + x.totalCapacity, 0)
  const totalBookings = stats.reduce((s, x) => s + x.totalBookings, 0)
  return {
    totalEvents: events.length,
    publishedEvents: events.filter(e => e.isPublished).length,
    avgFillRate: totalCapacity > 0 ? Math.round((totalBookings / totalCapacity) * 100) : 0,
    totalBookings,
    totalCapacity,
  }
}

export type ChartEventMode = 'nearest' | 'recentCampaign' | 'recentActivity'

/**
 * Résout l'événement à afficher dans le graphique « Réservations dans le temps ».
 *
 * - `nearest` : l'événement le plus pertinent par paliers — en cours daté (tier 0),
 *   à venir le plus proche (tier 1), passé le plus récent (tier 2), puis repli par
 *   date de création (tier 3 : sans dates / brouillon). Départage déterministe par `id`.
 * - `recentCampaign` / `recentActivity` : dernier envoi / dernière réservation le plus
 *   récent (repli sur `nearest` si aucune activité pertinente).
 *
 * Pool : les événements publiés s'ils existent, sinon tous (les brouillons ne masquent
 * jamais un publié). Note : `periodStart`/`periodEnd` viennent de MIN/MAX des créneaux,
 * donc un publié sans créneau est tier 3 (jamais le défaut « actif ») — comportement assumé.
 */
export function resolveChartEvent(
  events: Event[],
  activity: EventActivity[],
  mode: ChartEventMode,
  now: Date = new Date(),
): string | null {
  if (events.length === 0) return null
  const published = events.filter(e => e.isPublished)
  const pool = published.length > 0 ? published : events

  const nearest = (): string => {
    const score = (e: Event) => {
      const status = deriveEventStatus(e, now)
      const start = e.periodStart ? new Date(e.periodStart).getTime() : null
      const end = e.periodEnd ? new Date(e.periodEnd).getTime() : null
      const hasDates = start != null || end != null
      if (status === 'ongoing' && hasDates) return { tier: 0, distance: 0 }
      if (status === 'upcoming' && start != null) return { tier: 1, distance: Math.abs(start - now.getTime()) }
      if (status === 'past' && end != null) return { tier: 2, distance: Math.abs(end - now.getTime()) }
      const created = new Date(e.createdAt).getTime() // tier 3 : sans dates / brouillon / ancres manquantes
      return { tier: 3, distance: Number.isNaN(created) ? Number.POSITIVE_INFINITY : now.getTime() - created }
    }
    return [...pool].sort((a, b) => {
      const sa = score(a), sb = score(b)
      return sa.tier - sb.tier || sa.distance - sb.distance || a.id.localeCompare(b.id)
    })[0].id
  }

  if (mode === 'recentCampaign' || mode === 'recentActivity') {
    const key = mode === 'recentCampaign' ? 'lastSentAt' : 'lastBookingAt'
    const ids = new Set(pool.map(e => e.id))
    const ranked = activity
      .filter(a => ids.has(a.eventId) && a[key])
      .sort((x, y) => new Date(y[key]!).getTime() - new Date(x[key]!).getTime() || x.eventId.localeCompare(y.eventId))
    return ranked.length > 0 ? ranked[0].eventId : nearest()
  }
  return nearest()
}

export type AttentionKind = 'draft' | 'openingSoon' | 'underfilled' | 'unanswered'

export interface AttentionItem {
  kind: AttentionKind
  /** Phrase complète — sert de nom accessible (aria-label) au rendu de la ligne. */
  message: string
  /** Compte actionnable (brouillons, créneaux vacants, invitations sans réponse…). */
  count?: number
  /** Nom de l'événement concerné (rendu comme sujet de la ligne). */
  eventName?: string
  /** Détail court contextuel (ex. « aujourd'hui » / « dans 3 j » pour openingSoon). */
  detail?: string
  eventId?: string
  action: 'publish' | 'manage' | 'invite' | 'resend'
}

export function computeAttentionItems(
  events: Event[],
  stats: EventStats[],
  activity: EventActivity[] | undefined,
  now: Date = new Date(),
): AttentionItem[] {
  const statsById = new Map(stats.map(s => [s.eventId, s]))
  const items: AttentionItem[] = []

  // Brouillons à publier (avec ≥ 1 créneau)
  const drafts = events.filter(e => !e.isPublished && (statsById.get(e.id)?.totalSlots ?? 0) > 0)
  if (drafts.length > 0) {
    const name = drafts.length === 1 ? drafts[0].name : undefined
    items.push({
      kind: 'draft',
      message: name
        ? `« ${name} » en brouillon — à publier`
        : `${drafts.length} événements en brouillon — à publier`,
      count: drafts.length,
      eventName: name,
      eventId: drafts.length === 1 ? drafts[0].id : undefined,
      action: 'publish',
    })
  }

  // Ouverture imminente (< 7 jours)
  for (const e of events) {
    if (!e.opensAt) continue
    const days = (new Date(e.opensAt).getTime() - now.getTime()) / DAY_MS
    if (days >= 0 && days < OPENING_SOON_DAYS) {
      const inDays = Math.ceil(days)
      const when = inDays <= 0 ? "aujourd'hui" : `dans ${inDays} jour${inDays > 1 ? 's' : ''}`
      items.push({
        kind: 'openingSoon',
        message: `« ${e.name} » ouvre les inscriptions ${when}`,
        eventName: e.name,
        detail: when,
        eventId: e.id, action: 'manage',
      })
    }
  }

  // À venir & sous-rempli (< 50 %, créneaux vacants).
  // Réservé aux événements « à venir » (design « À venir & sous-rempli ») : un
  // événement en cours n'est pas signalé ici, ses créneaux ne sont plus « à venir ».
  for (const e of events) {
    const s = statsById.get(e.id)
    if (!s) continue
    if (deriveEventStatus(e, now) === 'upcoming' && s.vacantSlots > 0 && s.fillRate < UNDERFILLED_RATE) {
      items.push({
        kind: 'underfilled',
        message: `« ${e.name} » : ${s.vacantSlots} créneau${s.vacantSlots > 1 ? 'x' : ''} vacant${s.vacantSlots > 1 ? 's' : ''} à venir`,
        eventName: e.name,
        count: s.vacantSlots,
        eventId: e.id, action: 'invite',
      })
    }
  }

  // Invitations sans réponse (par événement — un bloc nominatif chacun).
  // L'activité serveur porte déjà le compte unansweredOver3Days par événement ;
  // on ne signale que les événements présents dans `events` (sinon ignorés).
  if (activity) {
    const eventsById = new Map(events.map(e => [e.id, e]))
    for (const a of activity) {
      const e = eventsById.get(a.eventId)
      if (a.unansweredOver3Days <= 0) continue
      // L'activité serveur peut référencer un événement absent de `events`
      // (filtré, supprimé) : on l'ignore en le signalant plutôt qu'en silence.
      if (!e) {
        console.debug(`[dashboard] activité unanswered ignorée: event ${a.eventId} absent de la liste events`)
        continue
      }
      items.push({
        kind: 'unanswered',
        eventId: e.id,
        eventName: e.name,
        count: a.unansweredOver3Days,
        message: `« ${e.name} » — ${a.unansweredOver3Days} invitation${a.unansweredOver3Days > 1 ? 's' : ''} sans réponse depuis plus de 3 jours`,
        action: 'resend',
      })
    }
  }

  return items
}

export interface DashboardVisibility {
  showEventsKpi: boolean
  showFillRateKpi: boolean
  showBookingsKpi: boolean
  showInvitedKpi: boolean
  showFunnel: boolean
  showDonut: boolean
  showAnalysis: boolean
}

/**
 * Calcule la visibilité conditionnelle des widgets du tableau de bord.
 * Chaque flag est activé dès que la donnée nécessaire existe (seuils validés).
 */
export function computeDashboardVisibility(
  kpis: DashboardKpis,
  engagement: EngagementStats | undefined,
  stats: EventStats[],
): DashboardVisibility {
  const totalSlots = stats.reduce((s, x) => s + x.totalSlots, 0)
  const sent = engagement?.sent ?? 0
  return {
    showEventsKpi: true,
    showFillRateKpi: kpis.totalCapacity > 0,
    showBookingsKpi: kpis.totalBookings >= 1,
    showInvitedKpi: sent >= 1,
    showFunnel: sent >= 1,
    showDonut: totalSlots >= 1,
    showAnalysis: kpis.totalBookings >= 1,
  }
}

/**
 * Premier événement (par date de création croissante) pour lequel aucune invitation n'a
 * encore été envoyée (`activity.lastSentAt` nul, ou aucune activité connue). Sert à diriger
 * le CTA d'onboarding « Inviter… » vers l'onglet « Invités » de l'événement concret à traiter
 * plutôt que vers la liste générique. Renvoie `undefined` si aucun candidat (la liste sert de repli).
 */
export function firstEventToInvite(events: Event[], activity: EventActivity[] | undefined): string | undefined {
  const lastSentByEvent = new Map((activity ?? []).map((a) => [a.eventId, a.lastSentAt]))
  const target = [...events]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .find((e) => (lastSentByEvent.get(e.id) ?? null) === null)
  return target?.id
}
