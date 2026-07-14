import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import { waitForGrapesEditorReady } from './helpers/email-editor'

/**
 * Story 26-4 — Spec 1 : invariants de structure verrouillée du
 * `<MjmlEditorOverlay>` au niveau **template général d'invitation**.
 *
 * Source de vérité (frozen 2026-05-13) — politique de structure verrouillée des emails, § « Structure fixe » :
 *   « Chaque email est composé de 3 blocs immuables : en-tête, corps, pied.
 *     Aucun ajout ni suppression de bloc à aucun niveau. »
 *
 * Tagged `@slow` — convention partagée par les 8 specs longues (cf. `git
 * grep "@slow" tests/e2e/`). Aucun filtre actif aujourd'hui dans
 * `playwright.config.ts` ni dans les npm scripts ; pour exclure ce tag à la
 * volée : `npx playwright test --grep-invert "@slow"`. Run local de cette
 * spec uniquement :
 *   ALLOW_TEST_ROUTES=true npm run dev   # terminal séparé
 *   npx playwright test email-shell-locked-structure --grep "@slow"
 *
 * Verrou en-tête / pied (`data-inherited="true"`, posé par bodyExtraction) : ces
 * 2 sections n'ont AUCUNE cible de sauvegarde au niveau d'édition courant
 * (cf. la politique de personnalisation de la coque email — « aucune modification ne peut être saisie
 * sur un élément qui ne sera pas sauvegardé »). Elles reçoivent donc le DEEP-LOCK
 * (`applyDeepLockForInheritedShell`) : root + TOUS descendants en `selectable=false`,
 * `editable=false`, `removable=false`, `draggable=false`, `copyable=false`,
 * `hoverable=false`. C'est l'invariant anti-silent-failure (Finding #3 du POC : la
 * story 26-2 passait les tests mockés mais cassait en runtime). Un futur leg de
 * save shell-parts ré-ouvrira l'édition de l'en-tête.
 */

interface GrapesComponentSnapshot {
  partKindCount: { header: number; footer: number }
  lockedShellCount: number
}

test.describe.configure({ timeout: 60_000 })
test.describe('@slow Story 26-4 — Email Shell verrou structurel', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  async function openEditor(page: Page): Promise<void> {
    await page.goto('/admin/settings?tab=email-template&subtab=template-invitation')
    await page.getByTestId('invitation-open-editor-btn').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)
  }

  test('les 2 blocs header/footer sont présents et identifiables', async ({
    page,
  }) => {
    await openEditor(page)

    const snapshot = await page.evaluate((): GrapesComponentSnapshot => {
      interface GrapesWrapper {
        find(sel: string): unknown[]
      }
      interface GrapesEditor {
        getWrapper(): GrapesWrapper
      }
      const win = window as unknown as { __grapesEditor?: GrapesEditor }
      const ed = win.__grapesEditor
      if (!ed) throw new Error('__grapesEditor non exposé sur window')
      const wrapper = ed.getWrapper()
      return {
        partKindCount: {
          header: wrapper.find('[data-part-kind="header"]').length,
          footer: wrapper.find('[data-part-kind="footer"]').length,
        },
        lockedShellCount: wrapper.find('[css-class~="locked-shell"]').length,
      }
    })

    expect(snapshot.partKindCount.header).toBe(1)
    expect(snapshot.partKindCount.footer).toBe(1)
    expect(snapshot.lockedShellCount).toBe(2)
  })

  test('les sections en-tête/pied sont immuables (selectable/removable/draggable=false)', async ({
    page,
  }) => {
    await openEditor(page)

    const result = await page.evaluate(() => {
      interface GrapesComp {
        get(key: string): unknown
      }
      interface GrapesWrapper {
        find(sel: string): GrapesComp[]
      }
      interface GrapesEditor {
        getWrapper(): GrapesWrapper
      }
      const win = window as unknown as { __grapesEditor?: GrapesEditor }
      const ed = win.__grapesEditor
      if (!ed) throw new Error('__grapesEditor non exposé sur window')
      const wrapper = ed.getWrapper()
      const partKinds: Array<'header' | 'footer'> = ['header', 'footer']
      const shellFlags = partKinds.map((kind) => {
        const comp = wrapper.find(`[data-part-kind="${kind}"]`)[0]
        if (!comp) return { kind, selectable: null, removable: null, draggable: null }
        return {
          kind,
          selectable: comp.get('selectable'),
          removable: comp.get('removable'),
          draggable: comp.get('draggable'),
        }
      })
      const card = wrapper.find('[css-class~="locked-card"]')[0]
      return {
        shellFlags,
        cardRemovable: card ? card.get('removable') : null,
      }
    })

    for (const f of result.shellFlags) {
      // deep-lock : selectable=false empêche toute sélection → immuable
      expect(f.selectable, `${f.kind} doit avoir selectable=false`).toBe(false)
      expect(f.removable, `${f.kind} doit avoir removable=false`).toBe(false)
      expect(f.draggable, `${f.kind} doit avoir draggable=false`).toBe(false)
    }
    expect(result.cardRemovable, 'locked-card doit avoir removable=false').toBe(false)
  })

  test('les 2 sections header/footer ne sont pas réordonnables (draggable=false)', async ({
    page,
  }) => {
    await openEditor(page)

    const draggables = await page.evaluate(() => {
      interface GrapesComp {
        get(key: string): unknown
      }
      interface GrapesWrapper {
        find(sel: string): GrapesComp[]
      }
      interface GrapesEditor {
        getWrapper(): GrapesWrapper
      }
      const win = window as unknown as { __grapesEditor?: GrapesEditor }
      const ed = win.__grapesEditor
      if (!ed) throw new Error('__grapesEditor non exposé sur window')
      const wrapper = ed.getWrapper()
      const partKinds: Array<'header' | 'footer'> = ['header', 'footer']
      return partKinds.map((kind) => {
        const comp = wrapper.find(`[data-part-kind="${kind}"]`)[0]
        return { kind, draggable: comp?.get('draggable') ?? null }
      })
    })

    for (const d of draggables) {
      expect(d.draggable, `${d.kind} doit avoir draggable=false`).toBe(false)
    }
  })

  // Sans cette assertion, la story 26-2 originelle (commit 6bbe10d4) avait passé les tests unit mockés
  // mais cassé en runtime. L'en-tête est deep-locké (data-inherited) : TOUS ses
  // descendants (mj-column, mj-text OU mj-image selon que le brand a un logo) sont
  // en lecture seule — l'invariant porte sur N'IMPORTE QUEL descendant.
  test('clic sur descendant du header ne contourne pas le verrou structurel', async ({
    page,
  }) => {
    await openEditor(page)

    const childrenFlags = await page.evaluate(() => {
      interface Comp {
        get: (key: string) => unknown
        components?: () => { models: Comp[] } | undefined
      }
      interface GrapesEditor {
        getWrapper(): { find(sel: string): Comp[] }
      }
      const win = window as unknown as { __grapesEditor?: GrapesEditor }
      const ed = win.__grapesEditor
      if (!ed) throw new Error('__grapesEditor non exposé sur window')
      const header = ed.getWrapper().find('[data-part-kind="header"]')[0]
      if (!header) return { found: 0, flags: [] }
      const descendants: Comp[] = []
      const walk = (c: Comp): void => {
        const children = c.components?.()?.models ?? []
        for (const child of children) {
          descendants.push(child)
          walk(child)
        }
      }
      walk(header)
      return {
        found: descendants.length,
        flags: descendants.map((d) => {
          const toolbar = d.get('toolbar') as unknown[] | undefined
          return {
            type: (d.get('type') as string | undefined) ?? 'unknown',
            removable: d.get('removable'),
            draggable: d.get('draggable'),
            copyable: d.get('copyable'),
            toolbarLength: Array.isArray(toolbar) ? toolbar.length : null,
            selectable: d.get('selectable'),
            editable: d.get('editable'),
          }
        }),
      }
    })

    expect(
      childrenFlags.found,
      'le header doit contenir au moins un descendant pour que la couverture soit non-vide',
    ).toBeGreaterThanOrEqual(1)

    for (const [i, f] of childrenFlags.flags.entries()) {
      const label = `descendant[${i}] (${f.type})`
      // En-tête data-inherited="true" → DEEP-LOCK : tous les descendants sont en
      // lecture seule (aucune cible de save). Invariant anti-silent-failure.
      expect(f.removable, `${label} doit avoir removable=false`).toBe(false)
      expect(f.draggable, `${label} doit avoir draggable=false`).toBe(false)
      expect(f.copyable, `${label} doit avoir copyable=false`).toBe(false)
      expect(f.selectable, `${label} doit avoir selectable=false (deep-lock)`).toBe(false)
      expect(f.editable, `${label} doit avoir editable=false (deep-lock)`).toBe(false)
    }
  })
})
