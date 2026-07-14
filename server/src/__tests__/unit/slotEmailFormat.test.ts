import { describe, it, expect } from '@jest/globals'
import {
  isMultiDaySlotServer,
  formatSlotEmailDate,
  formatSlotEmailTime,
} from '../../utils/slotEmailFormat'

/**
 * Story 1.5 (créneaux multi-jours, e-mails) : helper SERVEUR de pré-format des
 * variables `slot_date` / `slot_time`. Miroir minimal de `formatSlotRange`
 * (client, inaccessible côté serveur). Test unitaire PUR (zéro DB, non flaky).
 *
 * Décision D-1 (revue 1.4) : les e-mails affichent la PLAGE DE DATES
 * (« du … au … »), jamais un décompte « N jours ». Le `slot_time` suit la
 * convention DS des plages horaires : notation « h » + flèche (« HHhmm → HHhmm »),
 * identique en mono ET multi (la plage de dates est portée par `slot_date`).
 *
 * Les `Date` sont construites avec des composantes LOCALES (`new Date(y, m, d,
 * h, min)`) pour coller au comportement des callers (timestamptz → heure locale
 * serveur) et rendre les assertions indépendantes de la TZ du runner.
 */
describe('slotEmailFormat — helper serveur de pré-format e-mail', () => {
  describe('isMultiDaySlotServer', () => {
    it('false pour deux instants le même jour calendaire local', () => {
      const start = new Date(2026, 5, 11, 9, 0)
      const end = new Date(2026, 5, 11, 17, 0)
      expect(isMultiDaySlotServer(start, end)).toBe(false)
    })

    it('true quand début et fin tombent des jours calendaires différents', () => {
      const start = new Date(2026, 5, 11, 9, 0)
      const end = new Date(2026, 5, 13, 17, 0)
      expect(isMultiDaySlotServer(start, end)).toBe(true)
    })
  })

  describe('formatSlotEmailDate', () => {
    it('mono-jour : `dd/MM/yyyy` strictement inchangé (FR12)', () => {
      const start = new Date(2026, 5, 11, 9, 0)
      const end = new Date(2026, 5, 11, 17, 0)
      expect(formatSlotEmailDate(start, end)).toBe('11/06/2026')
    })

    it('multi-jours : « du JJ/MM/AAAA au JJ/MM/AAAA » (FR11)', () => {
      const start = new Date(2026, 5, 11, 9, 0)
      const end = new Date(2026, 5, 13, 17, 0)
      expect(formatSlotEmailDate(start, end)).toBe('du 11/06/2026 au 13/06/2026')
    })

    it('bord de mois : 31/03 → 01/04 produit une plage correcte', () => {
      const start = new Date(2026, 2, 31, 22, 0)
      const end = new Date(2026, 3, 1, 2, 0)
      expect(formatSlotEmailDate(start, end)).toBe('du 31/03/2026 au 01/04/2026')
    })
  })

  describe('formatSlotEmailTime', () => {
    it('mono-jour : « HHhmm → HHhmm » (convention DS)', () => {
      const start = new Date(2026, 5, 11, 9, 0)
      const end = new Date(2026, 5, 11, 17, 0)
      expect(formatSlotEmailTime(start, end)).toBe('09h00 → 17h00')
    })

    it('multi-jours : « HHhmm → HHhmm » (la plage de dates est portée par slot_date)', () => {
      const start = new Date(2026, 5, 11, 9, 0)
      const end = new Date(2026, 5, 13, 17, 30)
      expect(formatSlotEmailTime(start, end)).toBe('09h00 → 17h30')
    })
  })
})
