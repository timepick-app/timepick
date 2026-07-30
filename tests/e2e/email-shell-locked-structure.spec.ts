import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import { waitForGrapesEditorReady } from './helpers/email-editor'

/**
 * Story 26-4 — Spec 1 : invariants de structure verrouillée du
 * `<MjmlEditorOverlay>`, aux DEUX niveaux où la coque se comporte différemment.
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
 * Deux verrous DISTINCTS, à ne pas confondre :
 *
 * 1. Niveau **template Invitation** (1er `describe`) — la coque a une cible de
 *    sauvegarde (propriétaire commun `template[invitation]`, cf.
 *    `shellLegRouting.ts`). `bodyExtraction` n'y pose donc PAS `data-inherited`,
 *    et `applyShellLocks` applique le verrou de RACINE seul
 *    (`SHELL_ROOT_LOCKED_FLAGS` = `removable`/`copyable`/`draggable` à false,
 *    plus `toolbar: []`). `selectable`/`editable`/`hoverable` restent à `true` :
 *    c'est l'affordance qui ouvre le Style Manager sur la section (fond,
 *    padding, bordures par côté). Les descendants gardent leur comportement par
 *    défaut — § « Liberté de contenu » de la politique de la coque email.
 *
 * 2. Niveau **système** (2nd `describe`) — la coque est héritée, aucune cible de
 *    sauvegarde au niveau courant. `bodyExtraction` pose `data-inherited="true"`
 *    → DEEP-LOCK (`applyDeepLockForInheritedShell`) : root + TOUS descendants en
 *    `selectable`/`editable`/`removable`/`draggable`/`copyable`/`hoverable` à
 *    false. C'est l'invariant anti-silent-failure (« aucune modification ne peut
 *    être saisie sur un élément qui ne sera pas sauvegardé »), Finding #3 du POC :
 *    la story 26-2 passait les tests mockés mais cassait en runtime.
 *
 * Historique — pourquoi ce fichier a changé de contrat le 2026-07-27 : jusqu'à
 * l'amendement L3b/L4 de la politique (2026-06-06), faute de leg de save
 * shell-parts, le deep-lock était posé INCONDITIONNELLEMENT, y compris sur
 * l'onglet Invitation (filet transitoire de la story 26-2). Ce leg existe
 * depuis, l'en-tête commun est éditable depuis l'onglet Invitation, et asserter
 * le deep-lock à ce niveau contredit désormais et la policy et
 * `SHELL_ROOT_LOCKED_FLAGS`. Constaté à la main dans l'éditeur réel le
 * 2026-07-27 : la section en-tête se sélectionne, mais Suppr / Retour arrière /
 * `core:component-delete` sont sans effet et sa barre d'outils est vide.
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

  test('les sections en-tête/pied sont figées structurellement (removable/copyable/draggable=false, barre d\'outils vide)', async ({
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
        if (!comp) return { kind, found: false }
        const toolbar = comp.get('toolbar') as unknown[] | undefined
        return {
          kind,
          found: true,
          selectable: comp.get('selectable'),
          removable: comp.get('removable'),
          copyable: comp.get('copyable'),
          draggable: comp.get('draggable'),
          toolbarLength: Array.isArray(toolbar) ? toolbar.length : null,
        }
      })
      const card = wrapper.find('[css-class~="locked-card"]')[0]
      return {
        shellFlags,
        cardFound: !!card,
        cardRemovable: card ? card.get('removable') : null,
        cardDraggable: card ? card.get('draggable') : null,
      }
    })

    for (const f of result.shellFlags) {
      expect(f.found, `section ${f.kind} introuvable dans le canvas`).toBe(true)
      expect(f.removable, `${f.kind} doit avoir removable=false`).toBe(false)
      expect(f.copyable, `${f.kind} doit avoir copyable=false`).toBe(false)
      expect(f.draggable, `${f.kind} doit avoir draggable=false`).toBe(false)
      // Les flags seuls ne suffisent pas : grapesjs met la barre d'outils en
      // cache à la création du composant, AVANT la passe de verrou. Sans
      // `toolbar: []`, les boutons Supprimer / Déplacer / Dupliquer survivent
      // aux flags (régression Lot 2). La policy les veut absentes des 3 blocs.
      expect(f.toolbarLength, `${f.kind} doit avoir une barre d'outils vide`).toBe(0)
      // Contre-partie assumée, pas un oubli : la section RESTE sélectionnable,
      // sinon le Style Manager (fond, padding, bordures par côté) devient
      // inatteignable. Verrouiller ici serait une régression d'affordance.
      expect(f.selectable, `${f.kind} doit rester selectable=true`).toBe(true)
    }
    // La carte content-wrapper vient de la cascade γ (row factory `brand/1`
    // posée par la migration 012). Son absence signale une base non migrée ou
    // un test qui a effacé la row factory — pas un canvas légitime.
    expect(result.cardFound, 'la carte content-wrapper doit être présente').toBe(true)
    expect(result.cardRemovable, 'locked-card doit avoir removable=false').toBe(false)
    expect(result.cardDraggable, 'locked-card doit avoir draggable=false').toBe(false)
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

  // Contre-partie du verrou de racine : à ce niveau la coque a une cible de
  // sauvegarde, donc le CONTENU des blocs reste libre — § « Liberté de contenu »
  // de la politique de la coque email : « à chaque niveau, dans chaque bloc,
  // liberté totale du contenu (logo, couleurs, bordures, polices, textes
  // multiples) ». Re-verrouiller les descendants ici, ce serait rejouer le drift
  // documenté du 2026-05-14 (« parcours récursif sur tous descendants —
  // non-négociable »), détecté par smoke manuel et corrigé le 2026-05-15.
  test("les descendants de l'en-tête restent modifiables (liberté de contenu)", async ({
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
        flags: descendants.map((d) => ({
          type: (d.get('type') as string | undefined) ?? 'unknown',
          removable: d.get('removable'),
          copyable: d.get('copyable'),
          editable: d.get('editable'),
          draggable: d.get('draggable'),
          selectable: d.get('selectable'),
        })),
      }
    })

    expect(
      childrenFlags.found,
      "l'en-tête doit contenir au moins un descendant pour que la couverture soit non-vide",
    ).toBeGreaterThanOrEqual(1)

    for (const [i, f] of childrenFlags.flags.entries()) {
      const label = `descendant[${i}] (${f.type})`
      // Négation exacte du deep-lock : ces flags valent tous `false` sur TOUS
      // les descendants dès que `applyDeepLockForInheritedShell` s'applique.
      expect(f.removable, `${label} doit rester removable=true`).toBe(true)
      expect(f.copyable, `${label} doit rester copyable=true`).toBe(true)
      // `draggable` n'est pas booléen partout — grapesjs-mjml y met un sélecteur
      // de cibles autorisées (`'[data-gjs-type="mj-column"], …'`) sur mj-text /
      // mj-column, et `true` sur un textnode. La seule valeur interdite est le
      // `false` exact que pose le deep-lock : asserter `!== false` couvre une
      // re-application PARTIELLE du verrou (draggable seul), qu'un contrôle sur
      // removable/copyable laisserait passer.
      expect(f.draggable, `${label} ne doit pas être figé (draggable=false)`).not.toBe(false)
    }

    // `selectable` est `false` par défaut sur les textnodes : l'invariant ne peut
    // pas être universel, mais au moins un descendant doit rester sélectionnable,
    // sinon plus rien dans l'en-tête n'est atteignable à la souris — c'est le
    // deep-lock déguisé.
    expect(
      childrenFlags.flags.some((f) => f.selectable === true),
      "au moins un descendant de l'en-tête doit rester selectable=true",
    ).toBe(true)

    // Et le texte de l'en-tête doit rester saisissable — l'affordance concrète
    // que la § Liberté de contenu garantit à ce niveau.
    expect(
      childrenFlags.flags.some((f) => f.type === 'mj-text' && f.editable === true),
      "l'en-tête doit exposer au moins un <mj-text> editable=true",
    ).toBe(true)
  })
})

// ============================================================================
// Niveau SYSTÈME — la coque y est HÉRITÉE : aucune cible de sauvegarde au
// niveau courant, donc `data-inherited="true"` et deep-lock intégral. C'est le
// seul niveau où l'invariant anti-silent-failure s'applique, et donc le seul
// endroit où il doit être asséré.
// ============================================================================
test.describe('@slow Story 26-4 — Email Shell deep-lock de la coque héritée (éditeur système)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  async function openSystemEditor(page: Page): Promise<void> {
    await page.goto(
      '/admin/settings?tab=email-template&subtab=emails-systeme-magic-link-login',
    )
    await page.getByTestId('system-open-editor-btn-magic_link_login').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)
  }

  for (const partKind of ['header', 'footer'] as const) {
    test(`la section ${partKind} héritée et TOUS ses descendants sont en lecture seule`, async ({
      page,
    }) => {
      await openSystemEditor(page)

      const snapshot = await page.evaluate((kind) => {
        interface Comp {
          get: (key: string) => unknown
          getAttributes: () => Record<string, string>
          components?: () => { models: Comp[] } | undefined
        }
        interface GrapesEditor {
          getWrapper(): { find(sel: string): Comp[] }
        }
        const win = window as unknown as { __grapesEditor?: GrapesEditor }
        const ed = win.__grapesEditor
        if (!ed) throw new Error('__grapesEditor non exposé sur window')
        const root = ed.getWrapper().find(`[data-part-kind="${kind}"]`)[0]
        if (!root) return null
        const read = (c: Comp) => ({
          type: (c.get('type') as string | undefined) ?? 'unknown',
          selectable: c.get('selectable'),
          editable: c.get('editable'),
          removable: c.get('removable'),
          draggable: c.get('draggable'),
          copyable: c.get('copyable'),
          hoverable: c.get('hoverable'),
        })
        const descendants: Comp[] = []
        const walk = (c: Comp): void => {
          for (const child of c.components?.()?.models ?? []) {
            descendants.push(child)
            walk(child)
          }
        }
        walk(root)
        return {
          inherited: root.getAttributes()['data-inherited'] ?? null,
          nodes: [read(root), ...descendants.map(read)],
        }
      }, partKind)

      expect(snapshot, `section ${partKind} introuvable dans le canvas système`).not.toBeNull()
      const { inherited, nodes } = snapshot!

      // Précondition du deep-lock : sans ce marqueur, `applyShellLocks` route
      // vers le verrou de racine seul et l'invariant ci-dessous ne tient plus.
      expect(inherited, `la section ${partKind} système doit être marquée héritée`).toBe('true')
      expect(
        nodes.length,
        `la section ${partKind} doit contenir au moins un descendant`,
      ).toBeGreaterThanOrEqual(2)

      for (const [i, f] of nodes.entries()) {
        const label = i === 0 ? `racine ${partKind} (${f.type})` : `descendant[${i - 1}] (${f.type})`
        expect(f.selectable, `${label} doit avoir selectable=false`).toBe(false)
        expect(f.editable, `${label} doit avoir editable=false`).toBe(false)
        expect(f.removable, `${label} doit avoir removable=false`).toBe(false)
        expect(f.draggable, `${label} doit avoir draggable=false`).toBe(false)
        expect(f.copyable, `${label} doit avoir copyable=false`).toBe(false)
        expect(f.hoverable, `${label} doit avoir hoverable=false`).toBe(false)
      }
    })
  }
})
