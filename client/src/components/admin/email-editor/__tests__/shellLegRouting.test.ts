import { describe, expect, it } from 'vitest'
import { COMMON_SHELL_OWNER, routeShellLegAction } from '../shellLegRouting'

describe('shellLegRouting — routeShellLegAction (décision pure PUT/DELETE/skip)', () => {
  it('!dirty → skip (quels que soient les autres champs)', () => {
    expect(
      routeShellLegAction({
        dirty: false,
        canvasMatchesCascade: false,
        origin: 'template',
        ownerKind: 'template',
      }),
    ).toBe('skip')
  })

  it('dirty + canvas ≠ cascade → put', () => {
    expect(
      routeShellLegAction({
        dirty: true,
        canvasMatchesCascade: false,
        origin: 'brand',
        ownerKind: 'template',
      }),
    ).toBe('put')
  })

  it('dirty + canvas === cascade + origin === ownerKind → delete (relâche la surcharge)', () => {
    expect(
      routeShellLegAction({
        dirty: true,
        canvasMatchesCascade: true,
        origin: 'template',
        ownerKind: 'template',
      }),
    ).toBe('delete')
  })

  it('dirty + canvas === cascade + origin ≠ ownerKind → skip (aller-retour vers un parent)', () => {
    // En système, le header redirigé a origin 'template' (résolu depuis
    // template[invitation]) ; ownerKind est aussi 'template' (D8 → delete sur
    // match). Ici on prouve le cas symétrique : origin parent ≠ ownerKind → skip.
    expect(
      routeShellLegAction({
        dirty: true,
        canvasMatchesCascade: true,
        origin: 'brand',
        ownerKind: 'template',
      }),
    ).toBe('skip')
  })

  it('origin undefined ≠ ownerKind → skip sur match cascade', () => {
    expect(
      routeShellLegAction({
        dirty: true,
        canvasMatchesCascade: true,
        origin: undefined,
        ownerKind: 'template',
      }),
    ).toBe('skip')
  })
})

describe('shellLegRouting — COMMON_SHELL_OWNER (propriétaire commun γ)', () => {
  it('vaut { ownerKind: template, ownerId: invitation }', () => {
    expect(COMMON_SHELL_OWNER).toEqual({ ownerKind: 'template', ownerId: 'invitation' })
  })
})
