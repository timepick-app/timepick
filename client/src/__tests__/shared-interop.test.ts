/**
 * Preuve d'interop CJS→ESM : Vite (ESM) importe une valeur runtime depuis
 * @timepick/shared (CJS). Prérequis G4 du plan Phase 2.
 */
import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'
import { expect, it } from 'vitest'

it('interop CJS→ESM : @timepick/shared exporte MJ_BODY_BACKGROUND_COLOR comme valeur runtime', () => {
  // Le propos de ce test est l'interop CJS→ESM (la valeur survit au runtime),
  // PAS la valeur figée. Une assertion drift-proof évite que tout changement
  // de couleur casse ce test (cf. plan 2026-06-28-email-bg-color-dry).
  expect(typeof MJ_BODY_BACKGROUND_COLOR).toBe('string')
  expect(MJ_BODY_BACKGROUND_COLOR.length).toBeGreaterThan(0)
})
