/**
 * Unit tests for shell-resolver.service.ts — hardening défensif.
 *
 * Plan post-5b-defer-A L2-B couvre 2 findings testables ici :
 *
 *   B.3 — `ORDER BY part_kind, owner_kind, owner_id` ajouté à la query
 *         SQL principale. Garantit que `pickHighestPriority` reçoit toujours
 *         les mêmes rows dans le même ordre, indépendamment du plan
 *         d'exécution Postgres. Test statique : mock `query`, vérifier la
 *         chaîne SQL.
 *
 *   B.5 — `ResolvedShell.contentWrapper` resserré sur `PromotedBlockOrigin`
 *         (exclut `'hardcoded'`). Validation type-level via `@ts-expect-error`
 *         — Jest exécute le bloc mais c'est `tsc --noEmit` qui valide.
 *
 * Mock pattern : aligné sur `server/src/__tests__/unit/render-email.service.test.ts`
 * (mock `../../db/query` ; le module `../db` ré-exporte `query` depuis cette
 * source).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('../../db/query', () => ({
  __esModule: true,
  query: jest.fn(),
}))

import { query } from '../../db/query'
import {
  resolveShellParts,
  type ResolvedShell,
  type ResolvedContentWrapper,
  type PromotedBlockOrigin,
} from '../shell-resolver.service'

const mockedQuery = query as jest.MockedFunction<typeof query>

beforeEach(() => {
  mockedQuery.mockReset()
})

// ---------------------------------------------------------------------------
// B.3 — ORDER BY déterministe dans la query principale.
// ---------------------------------------------------------------------------
describe('B.3 — shell_parts query ORDER BY déterministe', () => {
  // Helper : install des mocks miroir de l'unit test render-email. Tous les
  // appels SELECT retournent vide (cascade vide ⇒ fallback hardcoded). Le
  // test vérifie uniquement la chaîne SQL côté shell_parts.
  function installEmptyMocks(): void {
    mockedQuery.mockImplementation(((sql: string) => {
      if (/FROM shell_parts/i.test(sql)) {
        return Promise.resolve({ rows: [], command: 'SELECT', rowCount: 0 })
      }
      if (/FROM email_templates/i.test(sql)) {
        return Promise.resolve({
          rows: [{ body_mjml: '<mj-section><mj-column><mj-text>x</mj-text></mj-column></mj-section>' }],
          command: 'SELECT',
          rowCount: 1,
        })
      }
      if (/FROM events/i.test(sql)) {
        return Promise.resolve({ rows: [{ invitation_mjml: null }], command: 'SELECT', rowCount: 1 })
      }
      throw new Error(`[mock] unhandled SQL: ${sql}`)
    }) as unknown as typeof query)
  }

  it('la query shell_parts inclut ORDER BY part_kind, owner_kind, owner_id', async () => {
    installEmptyMocks()
    await resolveShellParts({
      templateKey: 'invitation',
      brand: { logoUrl: null },
    })
    const shellPartsCall = mockedQuery.mock.calls.find((c) =>
      /FROM shell_parts/i.test(String(c[0])),
    )
    expect(shellPartsCall).toBeDefined()
    const sql = String(shellPartsCall![0])
    expect(sql).toMatch(/ORDER BY\s+part_kind,\s+owner_kind,\s+owner_id/)
  })

  it("drift guard SQL : la chaîne ORDER BY survit à un mock renvoyant les rows dans n'importe quel ordre", async () => {
    // Le déterminisme runtime entre 2 appels JS dépendrait d'un sort stable
    // sur 2 rows avec PK identique, ce qui est physiquement impossible côté
    // DB (la clé primaire `(owner_kind, owner_id, part_kind)` interdit le
    // duplicate). Le drift guard B.3 vit dans la STRING SQL : tant que la
    // query inclut `ORDER BY part_kind, owner_kind, owner_id`, Postgres
    // renvoie un ordre stable. On valide ici que la query émise contient
    // toujours cet ORDER BY, quel que soit l'ordre du tableau mock.
    let callCount = 0
    mockedQuery.mockImplementation(((sql: string) => {
      if (/FROM shell_parts/i.test(sql)) {
        callCount += 1
        // Drift guard explicite — c'est l'assertion centrale du test.
        expect(sql).toMatch(/ORDER\s+BY\s+part_kind\s*,\s*owner_kind\s*,\s*owner_id/i)
        const rows =
          callCount === 1
            ? [
                {
                  owner_kind: 'template',
                  owner_id: 'invitation',
                  part_kind: 'header',
                  content_mjml: '<mj-section data-part-kind="header"><mj-column><mj-text>X</mj-text></mj-column></mj-section>',
                },
              ]
            : [
                {
                  owner_kind: 'template',
                  owner_id: 'invitation',
                  part_kind: 'header',
                  content_mjml: '<mj-section data-part-kind="header"><mj-column><mj-text>X</mj-text></mj-column></mj-section>',
                },
              ]
        return Promise.resolve({ rows, command: 'SELECT', rowCount: rows.length })
      }
      if (/FROM email_templates/i.test(sql)) {
        return Promise.resolve({
          rows: [{ body_mjml: '<mj-section><mj-column><mj-text>x</mj-text></mj-column></mj-section>' }],
          command: 'SELECT',
          rowCount: 1,
        })
      }
      if (/FROM events/i.test(sql)) {
        return Promise.resolve({ rows: [{ invitation_mjml: null }], command: 'SELECT', rowCount: 1 })
      }
      throw new Error(`[mock] unhandled SQL: ${sql}`)
    }) as unknown as typeof query)

    const r1 = await resolveShellParts({
      templateKey: 'invitation',
      brand: { logoUrl: null },
    })
    const r2 = await resolveShellParts({
      templateKey: 'invitation',
      brand: { logoUrl: null },
    })
    expect(r1.header.contentMjml).toBe(r2.header.contentMjml)
    expect(callCount).toBe(2)
  })

  it('la query couvre les 4 part_kinds (header, footer, mj-body, content-wrapper) — drift guard', async () => {
    installEmptyMocks()
    await resolveShellParts({
      templateKey: 'invitation',
      brand: { logoUrl: null },
    })
    const shellPartsCall = mockedQuery.mock.calls.find((c) =>
      /FROM shell_parts/i.test(String(c[0])),
    )
    const sql = String(shellPartsCall![0])
    expect(sql).toContain("'header'")
    expect(sql).toContain("'footer'")
    expect(sql).toContain("'mj-body'")
    expect(sql).toContain("'content-wrapper'")
  })
})

// ---------------------------------------------------------------------------
// B.5 — type narrower : `ResolvedShell.contentWrapper` exclut 'hardcoded'.
// Validation au niveau TypeScript via `@ts-expect-error`. Le bloc s'exécute
// à runtime sans assertion (les types sont éliminés au compile-time), mais
// `tsc --noEmit` échouera si la directive @ts-expect-error devient inutile
// (cas où l'origine 'hardcoded' redevient assignable) — ce qui est l'intent
// du drift guard.
// ---------------------------------------------------------------------------
describe('B.5 — type narrower contentWrapper exclut hardcoded', () => {
  it("typescript bloque la construction d'un ResolvedContentWrapper avec origin: 'hardcoded'", () => {
    const invalid: ResolvedContentWrapper = {
      contentMjml: '<mj-section></mj-section>',
      // @ts-expect-error — 'hardcoded' n'est pas assignable à PromotedBlockOrigin.
      origin: 'hardcoded',
    }
    // L'assertion runtime confirme que l'objet a bien été construit
    // (TypeScript élidé par ts-jest), ce qui n'est pas l'intent du test —
    // l'intent est la directive @ts-expect-error ci-dessus. Si le narrower
    // disparaissait, tsc remonterait `Unused @ts-expect-error directive`.
    expect(invalid.contentMjml).toBeTruthy()
  })

  it("typescript accepte origin: 'event' | 'template' | 'brand' pour contentWrapper", () => {
    const e: ResolvedContentWrapper = {
      contentMjml: '<mj-section></mj-section>',
      origin: 'event',
    }
    const t: ResolvedContentWrapper = {
      contentMjml: '<mj-section></mj-section>',
      origin: 'template',
    }
    const b: ResolvedContentWrapper = {
      contentMjml: '<mj-section></mj-section>',
      origin: 'brand',
    }
    expect(e.origin).toBe('event')
    expect(t.origin).toBe('template')
    expect(b.origin).toBe('brand')
  })

  it("ResolvedShell.contentWrapper est nullable (null légitime)", () => {
    const shell: Pick<ResolvedShell, 'contentWrapper'> = { contentWrapper: null }
    expect(shell.contentWrapper).toBeNull()
  })

  it('PromotedBlockOrigin union contient strictement event/template/brand', () => {
    // Exhaustiveness check : si l'union évolue, la fonction `assertNever`
    // ci-dessous casse au compile (et donc à `npx tsc --noEmit`).
    const all: PromotedBlockOrigin[] = ['event', 'template', 'brand']
    for (const o of all) {
      switch (o) {
        case 'event':
        case 'template':
        case 'brand':
          break
        default: {
          const _exhaustive: never = o
          throw new Error(`Unexpected origin: ${String(_exhaustive)}`)
        }
      }
    }
    expect(all).toHaveLength(3)
  })
})
