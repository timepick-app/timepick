import { describe, it, expect } from 'vitest'
import { isMultiDaySlot, formatSlotRange, formatSlotRangeCompact, formatSlotDuration, buildSlotsByDate, calculatePeriodRange } from '../utils'
import { isSameDay } from 'date-fns'

// Détection de la zone de test prescrite (story 1.1, NFR1 — piège DST).
// Les assertions « piège UTC » ne sont déterministes que sous Europe/Paris :
// on les exécute via `TZ=Europe/Paris npx vitest run` et on les skip ailleurs
// pour ne pas casser un run projet-wide sous une autre zone.
const isParisTZ = Intl.DateTimeFormat().resolvedOptions().timeZone === 'Europe/Paris'

describe('isMultiDaySlot', () => {
  it('retourne false pour un créneau le même jour calendaire', () => {
    expect(isMultiDaySlot('2026-03-15T09:00:00', '2026-03-15T11:00:00')).toBe(false)
  })

  it('retourne true pour 2 jours consécutifs', () => {
    expect(isMultiDaySlot('2026-03-15T22:00:00', '2026-03-16T01:00:00')).toBe(true)
  })

  it('retourne true au passage de fin de mois (31 mars → 1 avril)', () => {
    expect(isMultiDaySlot('2026-03-31T22:00:00', '2026-04-01T02:00:00')).toBe(true)
  })

  it('retourne true pour la plage DST de référence (29 → 31 mars)', () => {
    expect(isMultiDaySlot('2026-03-29T10:00:00', '2026-03-31T16:00:00')).toBe(true)
  })

  it.runIf(isParisTZ)(
    'DST entrée : span qui traverse la bascule (28→29 mars) reste mono-jour en local malgré 2 jours UTC',
    () => {
      // Paris bascule CET→CEST le 29 mars à 01:00Z (02:00→03:00 local). Début
      // 28 mars 23:30Z = 29 mars 00:30 CET ; fin 29 mars 02:30Z = 29 mars 04:30
      // CEST : même jour LOCAL (29) → false. Les jours UTC diffèrent (28≠29),
      // donc une comparaison `.toISOString().slice(0,10)` répondrait true à tort.
      expect(isMultiDaySlot('2026-03-28T23:30:00Z', '2026-03-29T02:30:00Z')).toBe(false)
    }
  )

  it.runIf(isParisTZ)(
    'DST sortie : span qui traverse la bascule (24→25 oct) reste mono-jour en local malgré 2 jours UTC',
    () => {
      // Paris bascule CEST→CET le 25 oct à 01:00Z (03:00→02:00 local). Début
      // 24 oct 22:30Z = 25 oct 00:30 CEST ; fin 25 oct 03:30Z = 25 oct 04:30
      // CET : même jour LOCAL (25) → false. Les jours UTC diffèrent (24≠25),
      // donc une comparaison UTC brute répondrait true à tort.
      expect(isMultiDaySlot('2026-10-24T22:30:00Z', '2026-10-25T03:30:00Z')).toBe(false)
    }
  )

  it.runIf(isParisTZ)(
    'piège UTC (hiver) : 23h30→00h30 local traverse minuit local mais PAS minuit UTC → true',
    () => {
      // Paris CET (UTC+1) le 15 mars. Local 15 à 23h30 = 22:30Z ; local 16 à
      // 00h30 = 23:30Z : même jour calendaire UTC (15) mais jours locaux 15≠16.
      // Une comparaison naïve via .toISOString().slice(0,10) renverrait false.
      expect(isMultiDaySlot('2026-03-15T22:30:00Z', '2026-03-15T23:30:00Z')).toBe(true)
    }
  )

  it.runIf(isParisTZ)(
    'piège UTC (été) : créneau 01h30→03h30 local le même jour, à cheval sur minuit UTC → false',
    () => {
      // Paris CEST (UTC+2) le 15 juin. Local 15 à 01h30 = 14 juin 23:30Z ;
      // local 15 à 03h30 = 15 juin 01:30Z : jours UTC 14≠15 mais même jour local 15.
      // Une comparaison naïve via UTC renverrait true à tort.
      expect(isMultiDaySlot('2026-06-14T23:30:00Z', '2026-06-15T01:30:00Z')).toBe(false)
    }
  )
})

describe('formatSlotRange', () => {
  it('même jour → format compact « HH\'h\'mm → HH\'h\'mm »', () => {
    expect(formatSlotRange('2026-03-15T09:00:00', '2026-03-15T11:00:00')).toBe('09h00 → 11h00')
  })

  it('multi-jours → format long « du <jour d MMM HHhmm> au … »', () => {
    expect(formatSlotRange('2026-03-15T09:00:00', '2026-03-17T17:00:00')).toBe(
      'du dim. 15 mars 09h00 au mar. 17 mars 17h00'
    )
  })

  it('multi-jours au bord de mois (31 mars → 1 avril)', () => {
    expect(formatSlotRange('2026-03-31T22:00:00', '2026-04-01T06:00:00')).toBe(
      'du mar. 31 mars 22h00 au mer. 1 avr. 06h00'
    )
  })
})

describe('formatSlotRangeCompact', () => {
  it('même jour → identique à formatSlotRange (« HH\'h\'mm → HH\'h\'mm »)', () => {
    expect(formatSlotRangeCompact('2026-03-15T09:00:00', '2026-03-15T11:00:00')).toBe('09h00 → 11h00')
  })

  it('multi-jours → forme compacte sans jour de semaine ni « du … au », flèche « → »', () => {
    expect(formatSlotRangeCompact('2026-03-15T09:00:00', '2026-03-17T17:00:00')).toBe(
      '15 mars 09h00 → 17 mars 17h00'
    )
  })

  it('multi-jours au bord de mois (31 mars → 1 avril)', () => {
    expect(formatSlotRangeCompact('2026-03-31T22:00:00', '2026-04-01T06:00:00')).toBe(
      '31 mars 22h00 → 1 avr. 06h00'
    )
  })
})

describe('formatSlotDuration', () => {
  it('même jour → durée horaire compacte (réutilise formatDurationFrench)', () => {
    expect(formatSlotDuration('2026-03-15T09:00:00', '2026-03-15T11:30:00')).toBe('2h30')
  })

  it('multi-jours → « N jours » (jours calendaires inclusifs)', () => {
    expect(formatSlotDuration('2026-03-15T09:00:00', '2026-03-17T17:00:00')).toBe('3 jours')
  })

  it('multi-jours 2 jours consécutifs → « 2 jours »', () => {
    expect(formatSlotDuration('2026-03-15T22:00:00', '2026-03-16T01:00:00')).toBe('2 jours')
  })
})

describe('buildSlotsByDate', () => {
  type TestSlot = { id: string; startTime: string; endTime: string }
  const slot = (id: string, startTime: string, endTime: string): TestSlot => ({ id, startTime, endTime })

  it('mono-jour → exactement un bucket (FR12)', () => {
    const s = slot('a', '2026-06-11T09:00:00', '2026-06-11T17:00:00')
    const map = buildSlotsByDate([s])
    expect([...map.keys()]).toEqual(['2026-06-11'])
    expect(map.get('2026-06-11')).toEqual([s])
  })

  it('multi-jours 11→13 juin → un bucket par jour couvert, milieu inclus (FR10)', () => {
    const s = slot('a', '2026-06-11T09:00:00', '2026-06-13T17:00:00')
    const map = buildSlotsByDate([s])
    expect([...map.keys()].sort()).toEqual(['2026-06-11', '2026-06-12', '2026-06-13'])
    expect(map.get('2026-06-12')).toEqual([s])
  })

  it('multi-jours 2 jours consécutifs → 2 buckets', () => {
    const s = slot('a', '2026-06-11T22:00:00', '2026-06-12T01:00:00')
    const map = buildSlotsByDate([s])
    expect([...map.keys()].sort()).toEqual(['2026-06-11', '2026-06-12'])
  })

  it('partage la MÊME référence de slot entre les buckets (pas de copie)', () => {
    const s = slot('a', '2026-06-11T09:00:00', '2026-06-13T17:00:00')
    const map = buildSlotsByDate([s])
    expect(map.get('2026-06-11')?.[0]).toBe(s)
    expect(map.get('2026-06-12')?.[0]).toBe(s)
    expect(map.get('2026-06-13')?.[0]).toBe(s)
  })

  it('conserve l\'ordre intra-jour (ordre d\'entrée des slots)', () => {
    const a = slot('a', '2026-06-11T09:00:00', '2026-06-11T10:00:00')
    const b = slot('b', '2026-06-10T22:00:00', '2026-06-11T12:00:00') // multi-jours couvrant aussi le 11
    const map = buildSlotsByDate([a, b])
    expect(map.get('2026-06-11')).toEqual([a, b])
  })

  it('bord de mois (31 mars → 1 avril) → buckets corrects', () => {
    const s = slot('a', '2026-03-31T22:00:00', '2026-04-01T06:00:00')
    const map = buildSlotsByDate([s])
    expect([...map.keys()].sort()).toEqual(['2026-03-31', '2026-04-01'])
  })

  it('découpe par jours calendaires locaux à travers la bascule DST (28→30 mars)', () => {
    // 29 mars 2026 = jour court (spring-forward 02h→03h) ; l'énumération reste 28/29/30.
    const s = slot('a', '2026-03-28T10:00:00', '2026-03-30T16:00:00')
    const map = buildSlotsByDate([s])
    expect([...map.keys()].sort()).toEqual(['2026-03-28', '2026-03-29', '2026-03-30'])
  })

  it.runIf(isParisTZ)(
    'énumère les jours LOCAUX et non UTC sur un span à cheval sur minuit UTC (NFR1)',
    () => {
      // Paris CEST (UTC+2) en juin. 11 juin 23:00Z = 12 juin 01:00 local ;
      // 13 juin 01:00Z = 13 juin 03:00 local → jours LOCAUX 12 et 13 (2 buckets).
      // Une énumération UTC brute donnerait 11/12/13 (3 buckets) à tort.
      const s = slot('a', '2026-06-11T23:00:00Z', '2026-06-13T01:00:00Z')
      const map = buildSlotsByDate([s])
      expect([...map.keys()].sort()).toEqual(['2026-06-12', '2026-06-13'])
    }
  )

  it('fin à minuit local pile → jour de fin (0 s occupée) exclu, aligné sur la barre', () => {
    // Créneau de nuit 12 juin 20:00 → 13 juin 00:00 : occupe le 12, 0 s le 13.
    // getAllDayExclusiveEnd (Story 1.2) borne la barre au 12 → le drawer fait pareil
    // (sinon : entrée drawer le 13 sur une cellule sans barre).
    const s = slot('a', '2026-06-12T20:00:00', '2026-06-13T00:00:00')
    const map = buildSlotsByDate([s])
    expect([...map.keys()].sort()).toEqual(['2026-06-12'])
  })

  it('plein-jour 00:00→00:00 lendemain → exactement le jour couvert (1 bucket)', () => {
    const s = slot('a', '2026-06-11T00:00:00', '2026-06-12T00:00:00')
    const map = buildSlotsByDate([s])
    expect([...map.keys()].sort()).toEqual(['2026-06-11'])
  })
})

describe('calculatePeriodRange', () => {
  it('AC1 — créneau multi-jours : endDate dérive de max(endTime)', () => {
    // 17 juin 22h → 18 juin 04h : un seul créneau à cheval sur deux jours.
    // endDate doit valoir le 18 (max(endTime)) et NON le 17 (max(startTime)).
    const result = calculatePeriodRange([
      { startTime: '2026-06-17T22:00:00', endTime: '2026-06-18T04:00:00' },
    ])
    expect(result).not.toBeNull()
    expect(result!.endDate.getDate()).toBe(18)
    expect(result!.endDate.getMonth()).toBe(5) // juin (0-indexé)
    expect(result!.formatted).toContain('18 juin') // la date de fin réelle apparaît
  })

  it('AC1 — régression du bug : le même slot ne tronque PLUS à la date de début', () => {
    // Avant le correctif, endDate = max(startTime) = 17 juin → libellé jour-unique
    // « 17 juin 2026 » (faux). Le correctif produit une plage : on verrouille ce point.
    const result = calculatePeriodRange([
      { startTime: '2026-06-17T22:00:00', endTime: '2026-06-18T04:00:00' },
    ])
    expect(result).not.toBeNull()
    expect(result!.formatted).not.toBe('17 juin 2026') // verrouille la non-troncature (bug d'origine)
    expect(result!.formatted).toBe('Du 17 juin au 18 juin 2026') // valeur exacte attendue
  })

  it('AC2 — créneau même jour : format jour-unique inchangé', () => {
    const result = calculatePeriodRange([
      { startTime: '2026-03-15T09:00:00', endTime: '2026-03-15T11:00:00' },
    ])
    expect(result).not.toBeNull()
    expect(result!.formatted).toBe('15 mars 2026')
    expect(isSameDay(result!.startDate, result!.endDate)).toBe(true) // pas de « Du … au … »
  })

  it('tableau vide → null', () => {
    expect(calculatePeriodRange([])).toBeNull()
  })

  it('multi-jours à cheval sur deux mois → format multi-mois', () => {
    const result = calculatePeriodRange([
      { startTime: '2026-03-31T22:00:00', endTime: '2026-04-01T06:00:00' },
    ])
    expect(result).not.toBeNull()
    expect(result!.endDate.getDate()).toBe(1)
    expect(result!.endDate.getMonth()).toBe(3) // avril (0-indexé)
    expect(result!.formatted).toBe('Du 31 mars au 1 avril 2026') // branche mois-différents, année présente
  })

  it('plusieurs créneaux : startDate=min(startTime), endDate=max(endTime)', () => {
    const result = calculatePeriodRange([
      { startTime: '2026-03-15T09:00:00', endTime: '2026-03-15T11:00:00' },
      { startTime: '2026-03-17T09:00:00', endTime: '2026-03-17T11:00:00' },
    ])
    expect(result).not.toBeNull()
    expect(result!.startDate.getDate()).toBe(15)
    expect(result!.endDate.getDate()).toBe(17)
    // Format réel de la branche même-mois (monthFormat sur le début, dayFormat sur la fin) —
    // le bloc de formatage n'est pas modifié par ce correctif (seule la source de endDate change).
    expect(result!.formatted).toBe('Du 15 mars au 17 mars 2026')
  })
})
