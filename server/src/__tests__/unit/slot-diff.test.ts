import { describe, it, expect } from '@jest/globals'
import { computeSlotDiff } from '../../utils/slot-diff'

/**
 * Tests unitaires purs de computeSlotDiff.
 * Zéro dépendance externe. TZ=Europe/Paris (contexte du runner de test).
 */
describe('computeSlotDiff', () => {
  // Valeurs de base partagées entre les cas (composantes locales → indépendant TZ)
  const baseStart = new Date(2026, 5, 17, 10, 0) // 2026-06-17 10:00 heure locale
  const baseEnd   = new Date(2026, 5, 17, 12, 0) // 2026-06-17 12:00 heure locale
  const baseDesc  = 'Description initiale'

  const base = { start_time: baseStart, end_time: baseEnd, description: baseDesc }

  it('cas 1 — aucun champ changé → fields: []', () => {
    const diff = computeSlotDiff(base, { ...base })
    expect(diff.fields).toEqual([])
  })

  it('cas 2 — start_time seul changé → fields: ["start_time"]', () => {
    const after = { ...base, start_time: new Date(2026, 5, 17, 11, 0) }
    const diff = computeSlotDiff(base, after)
    expect(diff.fields).toEqual(['start_time'])
  })

  it('cas 3 — end_time seul changé → fields: ["end_time"]', () => {
    const after = { ...base, end_time: new Date(2026, 5, 17, 14, 0) }
    const diff = computeSlotDiff(base, after)
    expect(diff.fields).toEqual(['end_time'])
  })

  it('cas 4 — description seule changée → fields: ["description"]', () => {
    const after = { ...base, description: 'Nouveau contenu' }
    const diff = computeSlotDiff(base, after)
    expect(diff.fields).toEqual(['description'])
  })

  it('cas 5 — start_time + end_time changés → fields: ["start_time","end_time"]', () => {
    const after = {
      ...base,
      start_time: new Date(2026, 5, 17, 11, 0),
      end_time:   new Date(2026, 5, 17, 13, 0),
    }
    const diff = computeSlotDiff(base, after)
    expect(diff.fields).toEqual(['start_time', 'end_time'])
  })

  it('cas 6 — les 3 champs changés → fields: ["start_time","end_time","description"]', () => {
    const after = {
      start_time: new Date(2026, 5, 17, 11, 0),
      end_time:   new Date(2026, 5, 17, 13, 0),
      description: 'Description modifiée',
    }
    const diff = computeSlotDiff(base, after)
    expect(diff.fields).toEqual(['start_time', 'end_time', 'description'])
  })

  it('cas 7 — null ≡ "" pour description (les deux sens → fields: [])', () => {
    const withNull  = { ...base, description: null }
    const withEmpty = { ...base, description: '' }

    // null → '' : pas de changement
    expect(computeSlotDiff(withNull, withEmpty).fields).toEqual([])
    // '' → null : pas de changement
    expect(computeSlotDiff(withEmpty, withNull).fields).toEqual([])
  })

  it('cas 8 — deux Date représentant le même instant → fields: [] ; before/after portent les 3 champs', () => {
    // Deux instances Date distinctes avec la même valeur ms : getTime() identique → aucun diff.
    const dateA = new Date('2026-06-17T10:00:00.000Z')
    const dateB = new Date('2026-06-17T10:00:00.000Z')

    const snapshotA = { start_time: dateA, end_time: baseEnd, description: 'Test' }
    const snapshotB = { start_time: dateB, end_time: baseEnd, description: 'Test' }

    const diff = computeSlotDiff(snapshotA, snapshotB)
    expect(diff.fields).toEqual([])

    // before et after contiennent toujours les 3 champs (même quand aucun changement)
    expect(diff.before).toHaveProperty('start_time')
    expect(diff.before).toHaveProperty('end_time')
    expect(diff.before).toHaveProperty('description')
    expect(diff.after).toHaveProperty('start_time')
    expect(diff.after).toHaveProperty('end_time')
    expect(diff.after).toHaveProperty('description')
  })
})
