import { describe, expect, it } from 'vitest'
import { COMMON_SHELL_OWNER, routeEventShellLegAction, routeShellLegAction } from '../shellLegRouting'

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

describe('shellLegRouting — routeEventShellLegAction (niveau événement, référence = parent)', () => {
  it.each([
    // [dirty, canvas = parent, ligne event, attendu, pourquoi]
    [true, false, false, 'put', 'bloc déverrouillé puis modifié : la surcharge naît'],
    [true, false, true, 'put', 'surcharge existante modifiée'],
    [false, false, true, 'skip', 'surcharge existante intacte : rien à écrire'],
    [false, false, false, 'skip', 'rien de modifié, rien en base'],
    [false, true, false, 'skip', 'bloc déverrouillé non modifié : aucune écriture'],
    // Origine périmée juste après un PUT : la ligne existe mais `editorContext`
    // dit encore « modèle ». Le retour au parent doit quand même supprimer.
    [true, true, false, 'delete', 'retour au parent avec origine périmée'],
    [true, true, true, 'delete', 'retour au parent : la surcharge meurt'],
    [false, true, true, 'delete', 'surcharge fantôme (identique au parent) supprimée au save'],
  ] as const)('dirty=%s, =parent=%s, ligne=%s → %s (%s)', (dirty, canvasMatchesParent, hasEventRow, expected, _why) => {
    expect(routeEventShellLegAction({ dirty, canvasMatchesParent, hasEventRow })).toBe(expected)
  })
})

describe('shellLegRouting — COMMON_SHELL_OWNER (propriétaire commun γ)', () => {
  it('vaut { ownerKind: template, ownerId: invitation }', () => {
    expect(COMMON_SHELL_OWNER).toEqual({ ownerKind: 'template', ownerId: 'invitation' })
  })
})
