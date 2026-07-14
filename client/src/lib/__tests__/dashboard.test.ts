import { describe, it, expect } from 'vitest'
import {
  deriveEventStatus, computeKpis, computeAttentionItems, resolveChartEvent,
  computeDashboardVisibility, firstEventToInvite,
} from '../dashboard'
import type { Event } from '@/hooks/useEvents'
import type { EventStats } from '@/types/stats'
import type { EventActivity } from '@/types/analytics'
import type { EngagementStats } from '@/types/analytics'

const NOW = new Date('2026-06-01T12:00:00Z')
const ev = (o: Partial<Event>): Event => ({
  id: 'e1', name: 'Test', description: null, isPublished: true, opensAt: null,
  hasCustomInvitation: false, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  periodStart: null, periodEnd: null, ...o,
})
const st = (o: Partial<EventStats>): EventStats => ({
  eventId: 'e1', totalSlots: 0, filledSlots: 0, vacantSlots: 0, fillRate: 0,
  totalCapacity: 0, totalBookings: 0, ...o,
})

describe('deriveEventStatus', () => {
  it('Brouillon si non publié', () => {
    expect(deriveEventStatus(ev({ isPublished: false }), NOW)).toBe('draft')
  })
  it('À venir si période future', () => {
    expect(deriveEventStatus(ev({ periodStart: '2026-07-01', periodEnd: '2026-07-02' }), NOW)).toBe('upcoming')
  })
  it('Terminé si période passée', () => {
    expect(deriveEventStatus(ev({ periodStart: '2026-01-01', periodEnd: '2026-02-01' }), NOW)).toBe('past')
  })
  it('En cours si période englobe maintenant', () => {
    expect(deriveEventStatus(ev({ periodStart: '2026-05-01', periodEnd: '2026-07-01' }), NOW)).toBe('ongoing')
  })
  it('En cours si publié sans aucune période', () => {
    expect(deriveEventStatus(ev({ periodStart: null, periodEnd: null }), NOW)).toBe('ongoing')
  })
  it('En cours si seul le début est défini et passé', () => {
    expect(deriveEventStatus(ev({ periodStart: '2026-01-01', periodEnd: null }), NOW)).toBe('ongoing')
  })
  it('Terminé si seule la fin est définie et passée', () => {
    expect(deriveEventStatus(ev({ periodStart: null, periodEnd: '2026-02-01' }), NOW)).toBe('past')
  })
  it('En cours à la frontière de début (début == maintenant)', () => {
    expect(deriveEventStatus(ev({ periodStart: NOW.toISOString() }), NOW)).toBe('ongoing')
  })
  it('En cours à la frontière de fin (fin == maintenant)', () => {
    expect(deriveEventStatus(ev({ periodStart: '2026-05-01', periodEnd: NOW.toISOString() }), NOW)).toBe('ongoing')
  })
})

describe('computeKpis', () => {
  it('compte les événements et les publiés', () => {
    const k = computeKpis([ev({ isPublished: true }), ev({ id: 'e2', isPublished: false })], [], NOW)
    expect(k.totalEvents).toBe(2)
    expect(k.publishedEvents).toBe(1)
  })
  it('taux de remplissage moyen pondéré par capacité', () => {
    const k = computeKpis(
      [ev({ id: 'a' }), ev({ id: 'b' })],
      [st({ eventId: 'a', totalCapacity: 10, totalBookings: 5 }),
       st({ eventId: 'b', totalCapacity: 30, totalBookings: 30 })],
      NOW,
    )
    // (5 + 30) / (10 + 30) = 87.5 → 88
    expect(k.avgFillRate).toBe(88)
    expect(k.totalBookings).toBe(35)
    expect(k.totalCapacity).toBe(40)
  })
  it('taux de remplissage 0 sans capacité (pas de division par zéro)', () => {
    expect(computeKpis([ev({})], [], NOW).avgFillRate).toBe(0)
  })
})

describe('computeAttentionItems', () => {
  it('signale un brouillon avec créneaux', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', isPublished: false })],
      [st({ eventId: 'a', totalSlots: 2 })],
      undefined, NOW,
    )
    expect(items.some(i => i.kind === 'draft')).toBe(true)
    expect(items.find(i => i.kind === 'draft')?.count).toBe(1)
  })
  it('ignore un brouillon sans créneau', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', isPublished: false })],
      [st({ eventId: 'a', totalSlots: 0 })],
      undefined, NOW,
    )
    expect(items.some(i => i.kind === 'draft')).toBe(false)
  })
  it("signale une ouverture imminente (< 7 jours)", () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', opensAt: '2026-06-05T00:00:00Z' })],
      [st({ eventId: 'a', totalSlots: 1 })], undefined, NOW,
    )
    expect(items.some(i => i.kind === 'openingSoon')).toBe(true)
  })
  it('signale à venir & sous-rempli (< 50%)', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', periodStart: '2026-07-01', periodEnd: '2026-07-02' })],
      [st({ eventId: 'a', totalSlots: 5, vacantSlots: 4, fillRate: 20 })], undefined, NOW,
    )
    expect(items.some(i => i.kind === 'underfilled')).toBe(true)
    const uf = items.find(i => i.kind === 'underfilled')
    expect(uf?.count).toBe(4)
    expect(uf?.eventName).toBe('Test')
  })
  it('ne signale pas sous-rempli pour un événement en cours (alerte réservée aux « à venir »)', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', periodStart: '2026-05-01', periodEnd: '2026-07-01' })], // en cours (début passé, fin future)
      [st({ eventId: 'a', totalSlots: 5, vacantSlots: 4, fillRate: 20 })], undefined, NOW,
    )
    expect(items.some(i => i.kind === 'underfilled')).toBe(false)
  })
  it("affiche « aujourd'hui » quand l'ouverture est le jour même", () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', opensAt: NOW.toISOString() })],
      [st({ eventId: 'a', totalSlots: 1 })], undefined, NOW,
    )
    const item = items.find(i => i.kind === 'openingSoon')
    expect(item?.message).toContain("aujourd'hui")
    expect(item?.detail).toBe("aujourd'hui")
    expect(item?.eventName).toBe('Test')
  })
  it('signale un événement avec invitations sans réponse (> 3 jours)', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', name: 'Gala' })],
      [],
      [{ eventId: 'a', lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 3 }],
      NOW,
    )
    const u = items.find(i => i.kind === 'unanswered')
    expect(u).toBeDefined()
    expect(u?.eventId).toBe('a')
    expect(u?.message).toContain('Gala')
    expect(u?.message).toContain('3 invitation')
    expect(u?.count).toBe(3)
    expect(u?.eventName).toBe('Gala')
  })
  it('produit un bloc nominatif par événement concerné', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', name: 'Gala' }), ev({ id: 'b', name: 'Dîner' })],
      [],
      [
        { eventId: 'a', lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 2 },
        { eventId: 'b', lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 5 },
      ],
      NOW,
    )
    const u = items.filter(i => i.kind === 'unanswered')
    expect(u).toHaveLength(2)
    expect(u.map(i => i.eventId).sort()).toEqual(['a', 'b'])
  })
  it("n'alerte pas un événement à 0 non-répondant", () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', name: 'Gala' })],
      [],
      [{ eventId: 'a', lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 0 }],
      NOW,
    )
    expect(items.some(i => i.kind === 'unanswered')).toBe(false)
  })
  it("ignore l'activité d'un événement absent de la liste events", () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', name: 'Gala' })],
      [],
      [{ eventId: 'ghost', lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 4 }],
      NOW,
    )
    expect(items.some(i => i.kind === 'unanswered')).toBe(false)
  })
  it('regroupe plusieurs brouillons en une alerte sans eventId (pluriel)', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', isPublished: false }), ev({ id: 'b', isPublished: false })],
      [st({ eventId: 'a', totalSlots: 2 }), st({ eventId: 'b', totalSlots: 1 })],
      undefined, NOW,
    )
    const draft = items.find(i => i.kind === 'draft')
    expect(draft?.eventId).toBeUndefined()
    expect(draft?.message).toContain('événements')
    expect(draft?.count).toBe(2)
  })
  it('lie le brouillon unique à son événement', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', name: 'Fête de la lune', isPublished: false })],
      [st({ eventId: 'a', totalSlots: 2 })], undefined, NOW,
    )
    const draft = items.find(i => i.kind === 'draft')
    expect(draft?.eventId).toBe('a')
    expect(draft?.eventName).toBe('Fête de la lune')
    expect(draft?.message).toBe('« Fête de la lune » en brouillon — à publier')
  })
  it("n'alerte pas une ouverture à exactement 7 jours (borne exclue)", () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', opensAt: new Date(NOW.getTime() + 7 * 86_400_000).toISOString() })],
      [st({ eventId: 'a', totalSlots: 1 })], undefined, NOW,
    )
    expect(items.some(i => i.kind === 'openingSoon')).toBe(false)
  })
  it("n'alerte pas une ouverture déjà passée", () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', opensAt: '2026-05-01T00:00:00Z' })],
      [st({ eventId: 'a', totalSlots: 1 })], undefined, NOW,
    )
    expect(items.some(i => i.kind === 'openingSoon')).toBe(false)
  })
  it('ne signale pas sous-rempli à exactement 50% (borne exclue)', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', periodStart: '2026-07-01', periodEnd: '2026-07-02' })],
      [st({ eventId: 'a', totalSlots: 4, vacantSlots: 2, fillRate: 50 })], undefined, NOW,
    )
    expect(items.some(i => i.kind === 'underfilled')).toBe(false)
  })
  it('ne signale pas sous-rempli sans créneau vacant', () => {
    const items = computeAttentionItems(
      [ev({ id: 'a', periodStart: '2026-07-01', periodEnd: '2026-07-02' })],
      [st({ eventId: 'a', totalSlots: 4, vacantSlots: 0, fillRate: 20 })], undefined, NOW,
    )
    expect(items.some(i => i.kind === 'underfilled')).toBe(false)
  })
  it("n'alerte pas sans activité ni invitation en attente", () => {
    expect(computeAttentionItems([], [], undefined, NOW).some(i => i.kind === 'unanswered')).toBe(false)
    expect(
      computeAttentionItems(
        [ev({ id: 'a' })],
        [],
        [{ eventId: 'a', lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 0 }],
        NOW,
      ).some(i => i.kind === 'unanswered'),
    ).toBe(false)
  })
})

describe('resolveChartEvent', () => {
  const act = (o: Partial<EventActivity> & { eventId: string }): EventActivity => ({
    lastSentAt: null, lastBookingAt: null, unansweredOver3Days: 0, ...o,
  })

  it('renvoie null si aucun événement', () => {
    expect(resolveChartEvent([], [], 'nearest', NOW)).toBeNull()
  })

  it('priorise un événement en cours daté (tier 0) sur un futur lointain', () => {
    const ongoing = ev({ id: 'ongoing', periodStart: '2026-05-01', periodEnd: '2026-07-01' })
    const future = ev({ id: 'future', periodStart: '2026-12-01', periodEnd: '2026-12-02' })
    expect(resolveChartEvent([future, ongoing], [], 'nearest', NOW)).toBe('ongoing')
  })

  it('priorise le futur le plus proche', () => {
    const near = ev({ id: 'near', periodStart: '2026-06-10', periodEnd: '2026-06-11' })
    const far = ev({ id: 'far', periodStart: '2026-12-01', periodEnd: '2026-12-02' })
    expect(resolveChartEvent([far, near], [], 'nearest', NOW)).toBe('near')
  })

  it('un publié sans dates (tier 3) ne devient pas le défaut face à un daté à venir (tier 1)', () => {
    const noDates = ev({ id: 'nodates', periodStart: null, periodEnd: null })
    const upcoming = ev({ id: 'upcoming', periodStart: '2026-07-01', periodEnd: '2026-07-02' })
    expect(resolveChartEvent([noDates, upcoming], [], 'nearest', NOW)).toBe('upcoming')
  })

  it('un passé daté (tier 2) précède un publié sans dates (tier 3)', () => {
    const past = ev({ id: 'past', periodStart: '2026-01-01', periodEnd: '2026-02-01' })
    const noDates = ev({ id: 'nodates', periodStart: null, periodEnd: null })
    expect(resolveChartEvent([noDates, past], [], 'nearest', NOW)).toBe('past')
  })

  it('ignore les brouillons quand un publié daté existe', () => {
    const draft = ev({ id: 'draft', isPublished: false, periodStart: '2026-05-01', periodEnd: '2026-07-01' })
    const published = ev({ id: 'pub', isPublished: true, periodStart: '2026-07-01', periodEnd: '2026-07-02' })
    expect(resolveChartEvent([draft, published], [], 'nearest', NOW)).toBe('pub')
  })

  it('un createdAt invalide ne casse pas le tri (NaN → Infinity, classé en dernier)', () => {
    const bad = ev({ id: 'bad', periodStart: null, periodEnd: null, createdAt: 'not-a-date' })
    const good = ev({ id: 'good', periodStart: null, periodEnd: null, createdAt: '2026-05-01' })
    expect(resolveChartEvent([bad, good], [], 'nearest', NOW)).toBe('good')
  })

  it('départage deux futurs équidistants par id (ordre stable)', () => {
    const a = ev({ id: 'bbb', periodStart: '2026-07-01', periodEnd: '2026-07-02' })
    const b = ev({ id: 'aaa', periodStart: '2026-07-01', periodEnd: '2026-07-02' })
    expect(resolveChartEvent([a, b], [], 'nearest', NOW)).toBe('aaa')
  })

  it('recentCampaign : événement au dernier envoi le plus récent', () => {
    const activity = [
      act({ eventId: 'e1', lastSentAt: '2026-05-01T00:00:00Z' }),
      act({ eventId: 'e2', lastSentAt: '2026-05-20T00:00:00Z' }),
    ]
    expect(resolveChartEvent([ev({ id: 'e1' }), ev({ id: 'e2' })], activity, 'recentCampaign', NOW)).toBe('e2')
  })

  it('recentActivity : événement à la dernière réservation la plus récente', () => {
    const activity = [
      act({ eventId: 'e1', lastBookingAt: '2026-05-25T00:00:00Z' }),
      act({ eventId: 'e2', lastBookingAt: '2026-05-10T00:00:00Z' }),
    ]
    expect(resolveChartEvent([ev({ id: 'e1' }), ev({ id: 'e2' })], activity, 'recentActivity', NOW)).toBe('e1')
  })

  it('recentCampaign : égalité de date départagée par id', () => {
    const activity = [
      act({ eventId: 'zzz', lastSentAt: '2026-05-01T00:00:00Z' }),
      act({ eventId: 'aaa', lastSentAt: '2026-05-01T00:00:00Z' }),
    ]
    expect(resolveChartEvent([ev({ id: 'zzz' }), ev({ id: 'aaa' })], activity, 'recentCampaign', NOW)).toBe('aaa')
  })

  it('recentCampaign : repli sur nearest si aucune activité pertinente', () => {
    const upcoming = ev({ id: 'up', periodStart: '2026-07-01', periodEnd: '2026-07-02' })
    expect(resolveChartEvent([upcoming], [], 'recentCampaign', NOW)).toBe('up')
  })

  it('recentActivity : ignore une activité hors du pool (repli nearest)', () => {
    const up = ev({ id: 'up', periodStart: '2026-07-01', periodEnd: '2026-07-02' })
    const activity = [act({ eventId: 'ghost', lastBookingAt: '2026-05-25T00:00:00Z' })]
    expect(resolveChartEvent([up], activity, 'recentActivity', NOW)).toBe('up')
  })
})

const kpis0 = { totalEvents: 0, publishedEvents: 0, avgFillRate: 0, totalBookings: 0, totalCapacity: 0 }

describe('computeDashboardVisibility', () => {
  it('Cas vide : seul showEventsKpi=true, tout le reste false', () => {
    const result = computeDashboardVisibility(kpis0, undefined, [])
    expect(result.showEventsKpi).toBe(true)
    expect(result.showFillRateKpi).toBe(false)
    expect(result.showBookingsKpi).toBe(false)
    expect(result.showInvitedKpi).toBe(false)
    expect(result.showFunnel).toBe(false)
    expect(result.showDonut).toBe(false)
    expect(result.showAnalysis).toBe(false)
  })

  it('Cas plein : tous les flags vrais', () => {
    const kpis = { ...kpis0, totalCapacity: 100, totalBookings: 5 }
    const engagement: EngagementStats = { invited: 10, sent: 10, clicked: 3, booked: 5, unansweredOver3Days: 0 }
    const stats = [st({ totalSlots: 50 })]
    const result = computeDashboardVisibility(kpis, engagement, stats)
    expect(result.showEventsKpi).toBe(true)
    expect(result.showFillRateKpi).toBe(true)
    expect(result.showBookingsKpi).toBe(true)
    expect(result.showInvitedKpi).toBe(true)
    expect(result.showFunnel).toBe(true)
    expect(result.showDonut).toBe(true)
    expect(result.showAnalysis).toBe(true)
  })

  it('engagement undefined → showInvitedKpi=false ET showFunnel=false', () => {
    const kpis = { ...kpis0, totalCapacity: 100, totalBookings: 5 }
    const stats = [st({ totalSlots: 50 })]
    const result = computeDashboardVisibility(kpis, undefined, stats)
    expect(result.showInvitedKpi).toBe(false)
    expect(result.showFunnel).toBe(false)
    // Les autres flags ne dépendent pas d'engagement
    expect(result.showFillRateKpi).toBe(true)
    expect(result.showBookingsKpi).toBe(true)
    expect(result.showDonut).toBe(true)
  })

  it('showDonut=false si Σ stats[].totalSlots === 0', () => {
    const result = computeDashboardVisibility(kpis0, undefined, [st({ totalSlots: 0 })])
    expect(result.showDonut).toBe(false)
  })

  it('showDonut=true si Σ stats[].totalSlots >= 1', () => {
    const result = computeDashboardVisibility(kpis0, undefined, [st({ totalSlots: 1 })])
    expect(result.showDonut).toBe(true)
  })

  it('showDonut=true avec plusieurs stats dont la somme >= 1', () => {
    const stats = [st({ totalSlots: 0 }), st({ totalSlots: 1 })]
    const result = computeDashboardVisibility(kpis0, undefined, stats)
    expect(result.showDonut).toBe(true)
  })

  it('showFillRateKpi dépend de totalCapacity > 0', () => {
    expect(computeDashboardVisibility({ ...kpis0, totalCapacity: 1 }, undefined, []).showFillRateKpi).toBe(true)
    expect(computeDashboardVisibility({ ...kpis0, totalCapacity: 0 }, undefined, []).showFillRateKpi).toBe(false)
  })

  it('showBookingsKpi et showAnalysis dépendent de totalBookings >= 1', () => {
    const r0 = computeDashboardVisibility({ ...kpis0, totalBookings: 0 }, undefined, [])
    expect(r0.showBookingsKpi).toBe(false)
    expect(r0.showAnalysis).toBe(false)
    const r1 = computeDashboardVisibility({ ...kpis0, totalBookings: 1 }, undefined, [])
    expect(r1.showBookingsKpi).toBe(true)
    expect(r1.showAnalysis).toBe(true)
  })
})

describe('firstEventToInvite', () => {
  const act = (eventId: string, lastSentAt: string | null): EventActivity => ({
    eventId, lastSentAt, lastBookingAt: null, unansweredOver3Days: 0,
  })

  it('renvoie le plus ancien événement sans email envoyé', () => {
    const events = [
      ev({ id: 'b', createdAt: '2026-02-01' }),
      ev({ id: 'a', createdAt: '2026-01-01' }),
      ev({ id: 'c', createdAt: '2026-03-01' }),
    ]
    expect(firstEventToInvite(events, [])).toBe('a')
  })

  it('ignore les événements déjà relancés (lastSentAt non nul)', () => {
    const events = [
      ev({ id: 'a', createdAt: '2026-01-01' }),
      ev({ id: 'b', createdAt: '2026-02-01' }),
    ]
    expect(firstEventToInvite(events, [act('a', '2026-05-01T10:00:00Z'), act('b', null)])).toBe('b')
  })

  it('traite une activité absente comme « non envoyé »', () => {
    expect(firstEventToInvite([ev({ id: 'a', createdAt: '2026-01-01' })], undefined)).toBe('a')
  })

  it('renvoie undefined si tous les événements ont des emails envoyés', () => {
    expect(firstEventToInvite([ev({ id: 'a' })], [act('a', '2026-05-01T10:00:00Z')])).toBeUndefined()
  })

  it('renvoie undefined pour une liste vide', () => {
    expect(firstEventToInvite([], [])).toBeUndefined()
  })
})
