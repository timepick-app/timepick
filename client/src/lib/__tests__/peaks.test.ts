import { describe, it, expect } from 'vitest'
import {
  GRANULARITY_LABELS,
  pickAutoGranularity,
  bucketize,
  findPeak,
  granularityForSpan,
  pickAutoPreset,
  presetWindow,
  bucketizeRange,
  eventExtent,
  toNaiveLocal,
  formatAxisTick,
  formatFull,
  formatWindowLabel,
  defaultWindow,
  formatDayMonth,
  bucketDurationLabel,
  cumulativeAreaBuckets,
  stepFor,
  type PeakBucket,
  type Extent,
} from '../peaks'

const DAY = 86_400_000

// Instants de référence (UTC) — l'été, Paris est en CEST (+2).
const JUN12_1430_PARIS = Date.UTC(2026, 5, 12, 12, 30, 0) // 2026-06-12T12:30:00Z → 14:30 Paris
const JAN1 = Date.UTC(2026, 0, 1, 0, 0, 0)
const APR1 = Date.UTC(2026, 3, 1, 0, 0, 0) // 90 j après le 1er janv.
const JAN31 = Date.UTC(2026, 0, 31, 0, 0, 0) // 30 j après le 1er janv.
const OCT1 = Date.UTC(2026, 9, 1, 0, 0, 0) // ~273 j après le 1er janv.

describe('GRANULARITY_LABELS', () => {
  it('expose les libellés FR attendus', () => {
    expect(GRANULARITY_LABELS).toEqual({
      tenmin: '10 min',
      month: 'Mois',
      week: 'Semaine',
      day: 'Jour',
      hour: 'Heure',
    })
  })
})

describe('pickAutoGranularity', () => {
  it('vide → jour', () => {
    expect(pickAutoGranularity([])).toBe('day')
  })

  it('amplitude < 2 j → heure (cas 9 h)', () => {
    const ts = [Date.UTC(2026, 5, 12, 12, 0, 0), Date.UTC(2026, 5, 12, 21, 0, 0)] // 14 h→23 h Paris
    expect(pickAutoGranularity(ts)).toBe('hour')
  })

  it('amplitude ~30 j → jour', () => {
    expect(pickAutoGranularity([JAN1, JAN31])).toBe('day')
  })

  it('amplitude ~90 j → semaine (le quotidien dépasserait 90 barres)', () => {
    expect(bucketize([JAN1, APR1], 'day').length).toBeGreaterThan(90)
    expect(pickAutoGranularity([JAN1, APR1])).toBe('week')
  })

  it('amplitude > 180 j → mois', () => {
    expect(pickAutoGranularity([JAN1, OCT1])).toBe('month')
  })

  it('garde-fou densité : ~100 j passe du jour à la semaine', () => {
    const ts = [JAN1, JAN1 + 100 * DAY]
    // Le choix de base (jour) produirait > 90 barres → cran plus grossier.
    expect(bucketize(ts, 'day').length).toBeGreaterThan(90)
    expect(pickAutoGranularity(ts)).toBe('week')
  })
})

describe('bucketize', () => {
  it('vide → tableau vide', () => {
    expect(bucketize([], 'day')).toEqual([])
  })

  it('gap-fill : insère des buckets à 0 entre deux instants espacés', () => {
    const buckets = bucketize([JAN1, JAN1 + 3 * DAY], 'day')
    expect(buckets.map(b => b.count)).toEqual([1, 0, 0, 1])
  })

  it('ordonne les buckets ascendant par clé', () => {
    // Entrée non triée volontairement.
    const buckets = bucketize([JAN1 + 3 * DAY, JAN1], 'day')
    const keys = buckets.map(b => b.key)
    expect([...keys]).toEqual([...keys].sort((a, b) => a - b))
  })

  it('cumulative : monotone non décroissant et final = nombre total de timestamps', () => {
    const ts = [JAN1, JAN1 + DAY, JAN1 + DAY, JAN1 + 5 * DAY, JAN1 + 5 * DAY, JAN1 + 5 * DAY]
    const buckets = bucketize(ts, 'day')
    const cumulative = buckets.map(b => b.cumulative)
    expect(cumulative).toEqual([...cumulative].sort((a, b) => a - b))
    expect(cumulative[cumulative.length - 1]).toBe(ts.length)
  })

  it('un instant UTC est (été) tombe dans le bucket heure Paris attendu (14 h)', () => {
    const buckets = bucketize([JUN12_1430_PARIS], 'hour')
    expect(buckets).toHaveLength(1)
    expect(buckets[0].key).toBe(Date.UTC(2026, 5, 12, 14))
    expect(buckets[0].label).toMatch(/14\s*h/)
  })

  it('semaine : ancre chaque bucket au lundi local', () => {
    // 2026-06-12 est un vendredi → lundi = 2026-06-08.
    const buckets = bucketize([Date.UTC(2026, 5, 12, 10, 0, 0)], 'week')
    expect(buckets[0].key).toBe(Date.UTC(2026, 5, 8))
    expect(buckets[0].label).toMatch(/8\s+juin/)
    expect(buckets[0].fullLabel).toMatch(/semaine du 8\s+juin/)
  })

  it('mois : gap-fill à travers un changement de mois', () => {
    const buckets = bucketize([Date.UTC(2026, 5, 15), Date.UTC(2026, 7, 20)], 'month')
    expect(buckets.map(b => b.count)).toEqual([1, 0, 1]) // juin, juillet, août
    expect(buckets[0].fullLabel).toMatch(/juin\s+2026/)
  })
})

describe('findPeak', () => {
  const mk = (count: number, key = 0): PeakBucket => ({
    key,
    label: '',
    fullLabel: '',
    count,
    cumulative: count,
  })

  it('renvoie le bucket au compte maximal', () => {
    const buckets = [mk(1, 1), mk(5, 2), mk(3, 3)]
    expect(findPeak(buckets)?.key).toBe(2)
  })

  it('renvoie le PREMIER en cas d\'égalité', () => {
    const buckets = [mk(4, 1), mk(4, 2), mk(4, 3)]
    expect(findPeak(buckets)?.key).toBe(1)
  })

  it('null sur liste vide', () => {
    expect(findPeak([])).toBeNull()
  })

  it('null si tous les comptes valent 0', () => {
    expect(findPeak([mk(0, 1), mk(0, 2)])).toBeNull()
  })
})

// --- Modèle fenêtre / preset / granularité (extension contrat) ---------------

const HOUR = 3_600_000

describe('granularityForSpan', () => {
  it('paliers : 2h→tenmin, 1j→hour, 7j→day, 31j→day, 60j→week, 500j→month', () => {
    expect(granularityForSpan(2 * HOUR)).toBe('tenmin')
    expect(granularityForSpan(DAY)).toBe('hour')
    expect(granularityForSpan(7 * DAY)).toBe('day')
    expect(granularityForSpan(31 * DAY)).toBe('day')
    expect(granularityForSpan(60 * DAY)).toBe('week')
    expect(granularityForSpan(500 * DAY)).toBe('month')
  })
})

describe('pickAutoPreset', () => {
  const extent: Extent = { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 6, 31) }

  it('amplitude 9h → day', () => {
    const ts = [Date.UTC(2026, 5, 12, 9, 0), Date.UTC(2026, 5, 12, 18, 0)] // 9 h d'écart
    expect(pickAutoPreset(extent, ts)).toBe('day')
  })

  it('amplitude 3j → week', () => {
    const ts = [Date.UTC(2026, 5, 12, 9, 0), Date.UTC(2026, 5, 15, 9, 0)] // 3 j
    expect(pickAutoPreset(extent, ts)).toBe('week')
  })

  it('vide → all', () => {
    expect(pickAutoPreset(extent, [])).toBe('all')
  })
})

describe('presetWindow', () => {
  const extent: Extent = { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 6, 31) }

  it("day : fenêtre calendaire [minuit, minuit+24h] du jour CONTENANT LE PIC", () => {
    const ts = [Date.UTC(2026, 5, 15, 12, 0)] // pic mi-juin
    const w = presetWindow('day', extent, ts)
    expect(w.from).toBe(Date.UTC(2026, 5, 15)) // minuit du jour du pic
    expect(w.to).toBe(Date.UTC(2026, 5, 16)) // minuit du lendemain
    expect(w.to - w.from).toBe(DAY) // 24 h pile
    expect(w.from).toBeGreaterThanOrEqual(extent.from)
    expect(w.to).toBeLessThanOrEqual(extent.to) // ⊆ extent
  })

  it("hour : fenêtre [hh:00, hh:00+1h] de l'heure du pic", () => {
    const ts = [Date.UTC(2026, 5, 15, 14, 25)] // pic dans la tranche 14h-15h
    const w = presetWindow('hour', extent, ts)
    expect(w.from).toBe(Date.UTC(2026, 5, 15, 14)) // 14h00
    expect(w.to).toBe(Date.UTC(2026, 5, 15, 15)) // 15h00
    expect(w.to - w.from).toBe(HOUR)
  })

  it("week : fenêtre commençant un LUNDI (lundi→dimanche)", () => {
    // 2026-06-17 est un mercredi → lundi de la semaine = 2026-06-15.
    const ts = [Date.UTC(2026, 5, 17, 9, 0)]
    const w = presetWindow('week', extent, ts)
    expect(w.from).toBe(Date.UTC(2026, 5, 15)) // lundi 15 juin
    expect(w.to).toBe(Date.UTC(2026, 5, 22)) // lundi suivant (7 j)
    expect(w.to - w.from).toBe(7 * DAY)
  })
})

describe('bucketizeRange', () => {
  it('ne compte pas hors fenêtre, gap-fill, cumulative finale = nb de ts DANS la fenêtre', () => {
    const from = Date.UTC(2026, 5, 12, 0, 0)
    const to = Date.UTC(2026, 5, 12, 23, 59)
    const inside = [
      Date.UTC(2026, 5, 12, 10, 0),
      Date.UTC(2026, 5, 12, 10, 30),
      Date.UTC(2026, 5, 12, 14, 0),
    ]
    const outside = Date.UTC(2026, 5, 13, 10, 0) // lendemain → hors fenêtre
    const buckets = bucketizeRange([...inside, outside], from, to, 'hour')
    expect(buckets).toHaveLength(24) // 00:00 → 23:00, gap-fill
    expect(buckets[buckets.length - 1].cumulative).toBe(inside.length)
    const ten = buckets.find(b => b.key === Date.UTC(2026, 5, 12, 10))
    expect(ten?.count).toBe(2) // 10:00 + 10:30 dans le même bucket heure
  })
})

describe('eventExtent', () => {
  it('from = minuit du jour d\'opensAt ; to = minuit du lendemain du jour d\'endDate', () => {
    const ext = eventExtent({
      opensAt: '2026-06-01T08:00:00Z',
      createdAt: '2026-05-01T00:00:00Z',
      endDate: '2026-08-31T20:00:00Z',
      localTimestamps: [],
    })
    // CEST (+2) : 08:00Z → 10:00 Paris le 1ᵉʳ juin ; 20:00Z → 22:00 Paris le 31 août.
    // Arrondi jours entiers : début = minuit du 1ᵉʳ juin ; fin = minuit du 1ᵉʳ sept.
    expect(ext.from).toBe(Date.UTC(2026, 5, 1))
    expect(ext.to).toBe(Date.UTC(2026, 8, 1))
  })

  it('repli to = minuit du lendemain du dernier timestamp si endDate null', () => {
    const early = toNaiveLocal(Date.UTC(2026, 5, 10, 0, 0))
    const last = toNaiveLocal(Date.UTC(2026, 5, 15, 12, 0)) // 12:00Z → 14:00 Paris le 15 juin
    const ext = eventExtent({
      opensAt: '2026-06-01T00:00:00Z',
      createdAt: '2026-06-01T00:00:00Z',
      endDate: null,
      localTimestamps: [early, last],
    })
    expect(ext.from).toBe(Date.UTC(2026, 5, 1)) // minuit du 1ᵉʳ juin
    expect(ext.to).toBe(Date.UTC(2026, 5, 16)) // minuit du lendemain du 15 juin
  })

  it('arrondi jours : opensAt/endDate same-day → fenêtre de 24 h exacte', () => {
    const ext = eventExtent({
      opensAt: '2026-06-15T13:45:00Z', // 15:45 Paris le 15 juin
      createdAt: '2026-06-01T00:00:00Z',
      endDate: '2026-06-15T08:00:00Z', // 10:00 Paris le 15 juin
      localTimestamps: [],
    })
    expect(ext.from).toBe(Date.UTC(2026, 5, 15)) // minuit du 15 juin
    expect(ext.to).toBe(Date.UTC(2026, 5, 16)) // minuit du lendemain
    expect(ext.to - ext.from).toBe(DAY)
  })
})

describe('toNaiveLocal', () => {
  it('2026-06-22T12:02:00Z (été, UTC+2) → parts Paris 14:02', () => {
    const naive = toNaiveLocal(Date.UTC(2026, 5, 22, 12, 2))
    const d = new Date(naive)
    expect(d.getUTCHours()).toBe(14)
    expect(d.getUTCMinutes()).toBe(2)
    expect(d.getUTCDate()).toBe(22)
  })
})

describe('formatage horaire (h sans espace)', () => {
  it("tenmin : axe '14h10' ; complet '12 juin, 14h10'", () => {
    const k = Date.UTC(2026, 5, 12, 14, 10) // naïf-local 14:10 le 12 juin
    expect(formatAxisTick(k, 'tenmin')).toBe('14h10')
    expect(formatFull(k, 'tenmin')).toMatch(/^12\s+juin, 14h10$/)
  })

  it("hour : axe '14h' ; complet '12 juin, 14h'", () => {
    const k = Date.UTC(2026, 5, 12, 14, 0) // naïf-local 14h le 12 juin
    expect(formatAxisTick(k, 'hour')).toBe('14h')
    expect(formatFull(k, 'hour')).toMatch(/^12\s+juin, 14h$/)
  })
})

describe('formatWindowLabel', () => {
  it("hour-gran (fenêtre ~1 jour) → 'lundi 22 juin'", () => {
    // 2026-06-22 est un lundi.
    expect(formatWindowLabel(Date.UTC(2026, 5, 22), Date.UTC(2026, 5, 23), 'hour')).toBe('lundi 22 juin')
  })

  it("tenmin-gran (fenêtre ~1 h) → '22 juin, 14h–15h'", () => {
    expect(formatWindowLabel(Date.UTC(2026, 5, 22, 14), Date.UTC(2026, 5, 22, 15), 'tenmin')).toBe('22 juin, 14h–15h')
  })

  it("day-gran multi-jours, même mois → '15 – 21 juin'", () => {
    expect(formatWindowLabel(Date.UTC(2026, 5, 15), Date.UTC(2026, 5, 22), 'day')).toBe('15 – 21 juin')
  })
})

describe('eventExtent — repli createdAt quand opensAt null', () => {
  it('opensAt null → début = minuit du jour de createdAt (pas la 1re réservation)', () => {
    const ext = eventExtent({
      opensAt: null,
      createdAt: '2026-06-10T09:30:00.000Z',
      endDate: '2026-07-01T15:00:00.000Z',
      localTimestamps: [toNaiveLocal(Date.UTC(2026, 5, 19, 12)), toNaiveLocal(Date.UTC(2026, 5, 22, 12))],
    })
    expect(ext.from).toBe(Date.UTC(2026, 5, 10)) // minuit du 10 juin (jour de createdAt), pas le 19
    expect(ext.to).toBe(Date.UTC(2026, 6, 2)) // minuit du 2 juillet (lendemain du dernier créneau, 1er juillet)
  })
})

describe('defaultWindow — encadre toute l’activité', () => {
  it('contient la 1re et la dernière réservation, clampé dans l’extent', () => {
    const extent = { from: Date.UTC(2026, 5, 10), to: Date.UTC(2026, 6, 2) }
    const first = toNaiveLocal(Date.UTC(2026, 5, 19, 13))
    const last = toNaiveLocal(Date.UTC(2026, 5, 22, 12))
    const w = defaultWindow(extent, [first, last])
    expect(w.from).toBeLessThanOrEqual(first)
    expect(w.to).toBeGreaterThanOrEqual(last)
    expect(w.from).toBeGreaterThanOrEqual(extent.from)
    expect(w.to).toBeLessThanOrEqual(extent.to)
  })
  it('liste vide → extent', () => {
    const extent = { from: 0, to: DAY }
    expect(defaultWindow(extent, [])).toEqual(extent)
  })
})

describe('stepFor', () => {
  it('pas (ms) par granularité', () => {
    expect(stepFor('tenmin')).toBe(600_000)
    expect(stepFor('hour')).toBe(3_600_000)
    expect(stepFor('day')).toBe(DAY)
    expect(stepFor('week')).toBe(7 * DAY)
    expect(stepFor('month')).toBe(30 * DAY)
  })
})

describe('formatDayMonth', () => {
  it("borne d'extent → 'jour mois' FR (été CEST)", () => {
    expect(formatDayMonth(Date.UTC(2026, 5, 10))).toBe('10 juin')
  })
  it('bord de fin (minuit du lendemain − 1 j) → dernier jour', () => {
    expect(formatDayMonth(Date.UTC(2026, 6, 1) - DAY)).toBe('30 juin')
  })
})

describe('bucketDurationLabel', () => {
  it('chaque granularité → durée humaine FR', () => {
    expect(bucketDurationLabel('tenmin')).toBe('10 min')
    expect(bucketDurationLabel('hour')).toBe('une heure')
    expect(bucketDurationLabel('day')).toBe('un jour')
    expect(bucketDurationLabel('week')).toBe('une semaine')
    expect(bucketDurationLabel('month')).toBe('un mois')
  })
})

describe('defaultWindow — alignement sur la grille du panorama (alignGran)', () => {
  const extent = { from: Date.UTC(2026, 5, 14), to: Date.UTC(2026, 5, 18) }
  // Activité ~2 jours → fenêtre heure ; sans alignGran les bords ne sont pas calés jour.
  const ts = [Date.UTC(2026, 5, 16, 14), Date.UTC(2026, 5, 16, 22), Date.UTC(2026, 5, 17, 17)]

  it("alignGran='day' → bords calés sur des jours entiers (slide englobe les barres)", () => {
    const w = defaultWindow(extent, ts, 'day')
    expect(w.from).toBe(Date.UTC(2026, 5, 16)) // minuit 16 juin
    expect(w.to).toBe(Date.UTC(2026, 5, 18))   // minuit 18 juin (clampé à l'extent)
  })

  it('sans alignGran → bords à la granularité de la fenêtre (heure, non calés jour)', () => {
    const w = defaultWindow(extent, ts)
    expect(w.from).toBe(Date.UTC(2026, 5, 16, 9)) // 09h, pas minuit
  })
})

describe('cumulativeAreaBuckets — cumul global, ordre-indépendant', () => {
  const from = Date.UTC(2026, 5, 22, 14)
  const to = Date.UTC(2026, 5, 22, 15)
  const before1 = Date.UTC(2026, 5, 22, 10)
  const before2 = Date.UTC(2026, 5, 22, 11)
  const inside = Date.UTC(2026, 5, 22, 14, 30)

  it('ajoute aux buckets le cumul des réservations avant la fenêtre', () => {
    const b = cumulativeAreaBuckets([before1, before2, inside], from, to, 'tenmin')
    expect(b[0].cumulative).toBe(2)
    expect(b[b.length - 1].cumulative).toBe(3)
  })

  it('compte le bon offset même si localTimestamps non trié', () => {
    const b = cumulativeAreaBuckets([inside, before2, before1], from, to, 'tenmin')
    expect(b[0].cumulative).toBe(2)
    expect(b[b.length - 1].cumulative).toBe(3)
  })
})
