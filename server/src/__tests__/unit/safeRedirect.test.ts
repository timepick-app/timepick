import { describe, it, expect } from '@jest/globals'
import { isSafeInternalPath } from '../../utils/safeRedirect'

/**
 * Tests unitaires purs de isSafeInternalPath (protection open-redirect).
 * Zéro dépendance externe.
 */
describe('isSafeInternalPath', () => {
  describe('accepte les chemins internes valides', () => {
    const valid: Array<[string, string]> = [
      ['/me', 'racine espace membre'],
      ['/admin', 'racine admin'],
      ['/me/events/11111111-2222-3333-4444-555555555555', 'vue événement membre'],
      ['/me/profile', 'profil membre'],
      ['/me/events/abc?tab=details', 'chemin avec query'],
      ['/a', 'chemin mono-caractère'],
    ]
    for (const [value, label] of valid) {
      it(`accepte ${JSON.stringify(value)} (${label})`, () => {
        expect(isSafeInternalPath(value)).toBe(true)
      })
    }
  })

  describe('rejette les chemins non sûrs', () => {
    const invalid: Array<[unknown, string]> = [
      ['', 'chaîne vide (pas de / initial)'],
      ['me/events/x', 'relatif sans slash initial'],
      ['//evil.com', 'double slash (scheme authority)'],
      ['/\\evil', 'backslash'],
      ['http://evil', 'scheme http'],
      ['https://evil', 'scheme https'],
      ['javascript:alert(1)', 'scheme javascript'],
      ['/me\nevil', 'caractère de contrôle \\n'],
      ['/me\tevil', 'caractère de contrôle \\t'],
      ['/me\u007fevil', 'caractère DEL (0x7f)'],
      [null, 'null'],
      [undefined, 'undefined'],
      [123, 'nombre'],
      [{}, 'objet'],
    ]
    for (const [value, label] of invalid) {
      it(`rejette ${JSON.stringify(value)} (${label})`, () => {
        expect(isSafeInternalPath(value)).toBe(false)
      })
    }
  })

  it('agit comme type guard (rétrécit vers string)', () => {
    const input: unknown = '/me'
    if (isSafeInternalPath(input)) {
      // Si le type guard fonctionne, `input` est `string` ici.
      expect(input.toUpperCase()).toBe('/ME')
    } else {
      throw new Error('devrait être reconnu comme chemin sûr')
    }
  })
})
