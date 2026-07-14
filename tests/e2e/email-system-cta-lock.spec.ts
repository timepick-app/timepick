import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import { waitForGrapesEditorReady } from './helpers/email-editor'

/**
 * Story B2 — Spec 2 : verrou CTA (mj-button) en mode SYSTÈME `magic_link_login`.
 *
 * Faits runtime confirmés (lus via `window.__grapesEditor.getWrapper()`) :
 * - Le CTA (`mj-button`) : `editable=false`, `removable=false`, `draggable=false`,
 *   `toolbar.length=0` (figé, aucune interaction possible).
 * - Zones texte éditables : `[css-class~="tp-edit-intro"]` et
 *   `[css-class~="tp-edit-sig"]` → `editable=true`, `removable=false`.
 * - Layout shell : 2 sections `[css-class~="locked-shell"]` (en-tête + pied).
 *
 * Tagged `@slow` — run isolé :
 *   ALLOW_TEST_ROUTES=true npm run dev   # terminal séparé
 *   npx playwright test email-system-cta-lock --grep "@slow"
 */

test.describe.configure({ timeout: 60_000 })
test.describe('@slow Story B2 — Éditeur SYSTÈME : verrou CTA magic_link_login', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  async function openEditor(page: Page): Promise<void> {
    await page.goto(
      '/admin/settings?tab=email-template&subtab=emails-systeme-magic-link-login',
    )
    await page.getByTestId('system-open-editor-btn-magic_link_login').click()
    await page.getByTestId('mjml-editor-inner').waitFor()
    await waitForGrapesEditorReady(page)
  }

  test('le CTA (mj-button) est figé : editable/removable/draggable=false et toolbar vide', async ({
    page,
  }) => {
    await openEditor(page)

    const ctaFlags = await page.evaluate(() => {
      // GrapesNode couvre à la fois le wrapper racine et les composants enfants
      interface GrapesNode {
        get(key: string): unknown
        components?(): { models: GrapesNode[] } | undefined
      }
      interface GrapesEditor {
        getWrapper(): GrapesNode
      }
      const win = window as unknown as { __grapesEditor?: GrapesEditor }
      const ed = win.__grapesEditor
      if (!ed) throw new Error('__grapesEditor non exposé sur window')
      const wrapper = ed.getWrapper()

      // Recherche récursive du premier mj-button (CTA) en marchant l'arbre
      const findByType = (node: GrapesNode, type: string): GrapesNode | undefined => {
        if (node.get('type') === type) return node
        const children = node.components?.()?.models ?? []
        for (const child of children) {
          const found = findByType(child, type)
          if (found) return found
        }
        return undefined
      }

      const cta = findByType(wrapper, 'mj-button')
      if (!cta) return null
      const toolbar = cta.get('toolbar')
      return {
        editable: cta.get('editable'),
        removable: cta.get('removable'),
        draggable: cta.get('draggable'),
        toolbarLength: Array.isArray(toolbar) ? toolbar.length : null,
      }
    })

    expect(ctaFlags, "mj-button (CTA) doit être trouvé dans l'arbre").not.toBeNull()
    if (ctaFlags) {
      expect(ctaFlags.editable, 'CTA doit avoir editable=false').toBe(false)
      expect(ctaFlags.removable, 'CTA doit avoir removable=false').toBe(false)
      expect(ctaFlags.draggable, 'CTA doit avoir draggable=false').toBe(false)
      expect(ctaFlags.toolbarLength, 'CTA doit avoir toolbar vide').toBe(0)
    }
  })

  test('les zones texte système sont éditables mais non supprimables', async ({
    page,
  }) => {
    await openEditor(page)

    const zoneFlags = await page.evaluate(() => {
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
      const zones: Array<'tp-edit-intro' | 'tp-edit-sig'> = [
        'tp-edit-intro',
        'tp-edit-sig',
      ]
      return zones.map((cssClass) => {
        const comp = wrapper.find(`[css-class~="${cssClass}"]`)[0]
        if (!comp) return { cssClass, editable: null, removable: null }
        return {
          cssClass,
          editable: comp.get('editable'),
          removable: comp.get('removable'),
        }
      })
    })

    for (const z of zoneFlags) {
      expect(z.editable, `${z.cssClass} doit avoir editable=true`).toBe(true)
      expect(z.removable, `${z.cssClass} doit avoir removable=false`).toBe(false)
    }
  })

  test('le layout shell comporte 2 sections locked-shell (en-tête + pied)', async ({
    page,
  }) => {
    await openEditor(page)

    const lockedShellCount = await page.evaluate(() => {
      interface GrapesWrapper {
        find(sel: string): unknown[]
      }
      interface GrapesEditor {
        getWrapper(): GrapesWrapper
      }
      const win = window as unknown as { __grapesEditor?: GrapesEditor }
      const ed = win.__grapesEditor
      if (!ed) throw new Error('__grapesEditor non exposé sur window')
      return ed.getWrapper().find('[css-class~="locked-shell"]').length
    })

    expect(lockedShellCount).toBe(2)
  })
})
