import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import {
  SERVER_BASE,
  createTestEvent,
  deleteShellParts,
  deleteTestEvent,
  fetchAdminToken,
  seedShellPart,
  waitForGrapesEditorReady,
} from './helpers/email-editor'
import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'

/**
 * Plan 1 du 2026-05-22 — Personnalisation du `<mj-body>` racine via GrapesJS
 * natif.
 *
 * 3 chemins testés :
 *   A. Happy path template — l'admin sauvegarde des attrs mj-body sur le
 *      template invitation ; reopen → valeurs persistées + origin='template'.
 *   B. Cascade override event — l'admin pose un override mj-body sur un event ;
 *      le résolu remonte origin='event' au-dessus du template.
 *   C. Reset event → cascade reprend — DELETE de la row event ramène l'origin
 *      au template (parent dans la cascade).
 *
 * Tagged `@slow`. Run local :
 *   ALLOW_TEST_ROUTES=true npm run dev
 *   npx playwright test email-mj-body-customization --grep "@slow"
 *
 * Note : la spec utilise l'API GrapesJS programmatique (`__grapesEditor`)
 * pour modifier les attrs mj-body — cliquer sur le composant `<mj-body>` dans
 * le canvas + driver le Style Manager via Playwright est fragile (zone canvas
 * iframe + drag/drop builders). Le smoke runtime manuel (cf. spec
 * `## Verification > Manual checks`) couvre l'interaction UI complète.
 */

const RED_BG_ATTRS = {
  backgroundColor: '#ff0000',
  paddingTop: '30px',
  paddingBottom: '20px',
}

const GREEN_BG_ATTRS = {
  backgroundColor: '#00ff00',
  paddingTop: '40px',
  paddingBottom: '40px',
}

function serializeMjBodyMjml(attrs: {
  backgroundColor: string
  paddingTop: string
  paddingBottom: string
}): string {
  return `<mj-body background-color="${attrs.backgroundColor}" padding-top="${attrs.paddingTop}" padding-bottom="${attrs.paddingBottom}"></mj-body>`
}

interface MjBodyContextResponse {
  data: {
    mjBody: {
      attrs: { backgroundColor: string; paddingTop: string; paddingBottom: string }
      origin: 'event' | 'template' | 'brand' | 'hardcoded'
    }
  }
}

async function fetchMjBodyContext(
  request: APIRequestContext,
  token: string,
  ownerKind: 'event' | 'template',
  ownerId: string,
): Promise<MjBodyContextResponse['data']['mjBody']> {
  const res = await request.get(
    `${SERVER_BASE}/api/admin/editor-context?ownerKind=${ownerKind}&ownerId=${encodeURIComponent(
      ownerId,
    )}&templateKey=invitation`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok()) {
    throw new Error(`editor-context GET ${ownerKind}/${ownerId} HTTP ${res.status()}`)
  }
  const body = (await res.json()) as MjBodyContextResponse
  return body.data.mjBody
}

async function setCanvasMjBodyAttrs(
  page: Page,
  attrs: { backgroundColor: string; paddingTop: string; paddingBottom: string },
): Promise<void> {
  await page.evaluate((next) => {
    const ed = (window as unknown as {
      __grapesEditor?: {
        getWrapper: () => {
          findType: (type: string) => Array<{
            addAttributes: (a: Record<string, string>) => void
          }>
        }
        trigger: (event: string) => void
      }
    }).__grapesEditor
    if (!ed) throw new Error('__grapesEditor introuvable — DEV flag manquant ?')
    const mjBody = ed.getWrapper().findType('mj-body')[0]
    if (!mjBody) throw new Error('<mj-body> introuvable dans le canvas')
    mjBody.addAttributes({
      'background-color': next.backgroundColor,
      'padding-top': next.paddingTop,
      'padding-bottom': next.paddingBottom,
    })
    // Réveille le dirty tracker — l'event `update` n'est pas toujours fire par
    // `addAttributes` selon la version de grapesjs ; on force pour parité smoke.
    ed.trigger('update')
  }, attrs)
}

async function openTemplateEditor(page: Page): Promise<void> {
  await page.goto('/admin/settings?tab=email-template&subtab=template-invitation')
  // Testid réel du panel (`EmailInvitationTemplatePanel.tsx`). Voir la note
  // dans `email-identity-consolidation.spec.ts` : l'ancien testid n'a jamais
  // existé et son `.catch()` de repli ne matchait pas davantage.
  await page.getByTestId('invitation-open-editor-btn').click()
  await page.getByTestId('mjml-editor-inner').waitFor()
  await waitForGrapesEditorReady(page)
}

async function openEventEditor(page: Page, eventId: string): Promise<void> {
  await page.goto(`/admin/events/${eventId}/edit#template`)
  await page.getByTestId('event-invitation-open-editor-btn').click()
  await page.getByTestId('mjml-editor-inner').waitFor()
  await waitForGrapesEditorReady(page)
}

test.describe.configure({ timeout: 60_000 })
test.describe('@slow Plan 1 mj-body — personnalisation cascade', () => {
  let token: string
  let eventId: string

  test.beforeAll(async ({ request }) => {
    token = await fetchAdminToken(request)
    eventId = await createTestEvent(
      request,
      token,
      'E2E Plan 1 mj-body — cascade',
    )
  })

  test.afterAll(async ({ request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteShellParts(request, 'template', 'invitation')
    await deleteTestEvent(request, token, eventId)
  })

  test.beforeEach(async ({ page, request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteShellParts(request, 'template', 'invitation')
    await loginAsAdmin(page)
  })

  test.afterEach(async ({ request }) => {
    await deleteShellParts(request, 'event', eventId)
    await deleteShellParts(request, 'template', 'invitation')
  })

  test('A. happy path template — édition mj-body + save → row template + origin=template', async ({
    page,
    request,
  }) => {
    // État initial : cascade vide → hardcoded defaults.
    const initial = await fetchMjBodyContext(request, token, 'template', 'invitation')
    expect(initial.origin).toBe('hardcoded')
    // Ancre sur la SSOT `@timepick/shared` plutôt que sur un littéral : le
    // repli hardcodé valait `#ffffff` quand cette spec a été écrite, puis
    // `#fefefe` (3945e9b6) puis `#fafafa` (2d16d11a, 2026-06-28). Un littéral
    // ici ne teste que la date de dernière relecture du fichier.
    expect(initial.attrs).toEqual({
      backgroundColor: MJ_BODY_BACKGROUND_COLOR,
      paddingTop: '0',
      paddingBottom: '0',
    })

    await openTemplateEditor(page)

    // Mute les attrs mj-body via l'API GrapesJS, puis sauvegarde.
    await setCanvasMjBodyAttrs(page, RED_BG_ATTRS)

    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/admin/shell-parts/template/invitation/mj-body') &&
        r.request().method() === 'PUT',
    )

    const saveBtn = page.getByTestId('mjml-editor-save-btn')
    await expect(saveBtn).toBeEnabled({ timeout: 5000 })
    await saveBtn.click()

    const putResp = await putPromise
    expect(putResp.status()).toBe(200)

    // Vérifie le résolu côté API après save.
    await expect
      .poll(
        async () => (await fetchMjBodyContext(request, token, 'template', 'invitation')).origin,
        { timeout: 5000 },
      )
      .toBe('template')

    const after = await fetchMjBodyContext(request, token, 'template', 'invitation')
    expect(after.attrs).toEqual(RED_BG_ATTRS)
  })

  test('A.2 Plan 1.5 — Style Manager unique surface : 1 entrée background-color + canvas re-render', async ({
    page,
  }) => {
    await openTemplateEditor(page)

    // Sélectionne programmatiquement le mj-body pour faire monter le Style
    // Manager natif sur ses propriétés (le clic dans le canvas iframe est
    // trop fragile en E2E — cf. note d'en-tête du fichier).
    await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __grapesEditor?: {
            getWrapper: () => { findType: (t: string) => unknown[] }
            select: (m: unknown) => void
          }
        }
      ).__grapesEditor
      if (!ed) throw new Error('__grapesEditor introuvable — DEV flag manquant ?')
      const mjBody = ed.getWrapper().findType('mj-body')[0]
      if (!mjBody) throw new Error('<mj-body> introuvable dans le canvas')
      ed.select(mjBody)
    })

    // P4 — exactement 1 contrôle background-color exposé par le Style Manager
    // pour le mj-body sélectionné. La duplication observée au smoke 2026-05-23
    // (StyleManager doublon + traits redondants) est résolue par soustraction :
    // retrait des `stylable` + `traits` du `addType('mj-body', ...)`, le Style
    // Manager natif suffit (sector Decorations expose background-color).
    // P4 + AC #2 — exactement UNE entrée par propriété éditable (Plan 1.5).
    // `unstylable` est large (cf. MJ_BODY_UNSTYLABLE_LIST) ; ce comptage
    // garantit qu'aucune régression silencieuse ne réintroduit des doublons.
    const propCounts = await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __grapesEditor?: {
            StyleManager: {
              getProperty: (sector: string, id: string) => unknown
              getSectors: () => Array<{
                get: (k: string) => unknown
                getProperties?: () => Array<{ get: (k: string) => unknown }>
              }>
            }
          }
        }
      ).__grapesEditor
      if (!ed) return { bg: -1, paddingTop: -1, paddingBottom: -1 }
      const sectors = ed.StyleManager.getSectors()
      const counts = { bg: 0, paddingTop: 0, paddingBottom: 0 }
      for (const sector of sectors) {
        const visible = sector.get('visible') !== false
        if (!visible) continue
        const props = sector.getProperties?.() ?? []
        for (const p of props) {
          const property = p.get('property')
          const id = p.get('id')
          if (property === 'background-color' || id === 'background-color') counts.bg += 1
          if (property === 'padding-top') counts.paddingTop += 1
          if (property === 'padding-bottom') counts.paddingBottom += 1
        }
      }
      return counts
    })
    expect(propCounts.bg).toBe(1)
    expect(propCounts.paddingTop).toBe(1)
    expect(propCounts.paddingBottom).toBe(1)

    // Pipeline `setStyle → coreMjmlModel.handleStyleChange → set attributes
    // → coreMjmlView rerender` : simule l'effet d'une édition Style Manager
    // (le control color-picker met le style, pas l'attribut MJML).
    await page.evaluate((next) => {
      const ed = (
        window as unknown as {
          __grapesEditor?: {
            getWrapper: () => {
              findType: (t: string) => Array<{
                setStyle: (s: Record<string, string>) => void
              }>
            }
            trigger: (e: string) => void
          }
        }
      ).__grapesEditor
      if (!ed) throw new Error('__grapesEditor introuvable')
      const mjBody = ed.getWrapper().findType('mj-body')[0]
      if (!mjBody) throw new Error('<mj-body> introuvable')
      mjBody.setStyle({
        'background-color': next.backgroundColor,
        'padding-top': next.paddingTop,
        'padding-bottom': next.paddingBottom,
      })
      ed.trigger('update')
    }, RED_BG_ATTRS)

    // Le pipeline sync style→attr doit produire le `background-color="#ff0000"`
    // dans le MJML sérialisé (preuve que `setStyle` se reflète sur l'attribut).
    const mjml = await page.evaluate(() => {
      const ed = (
        window as unknown as {
          __grapesEditor?: { runCommand: (c: string) => unknown }
        }
      ).__grapesEditor
      return typeof ed?.runCommand === 'function' ? (ed.runCommand('mjml-code') as string) : ''
    })
    expect(mjml).toContain('background-color="#ff0000"')
    expect(mjml).toContain('padding-top="30px"')
    expect(mjml).toContain('padding-bottom="20px"')
  })

  test('B. cascade override event — l\'event remonte au-dessus du template', async ({
    request,
  }) => {
    // Seed template (parent dans la cascade).
    await seedShellPart(
      request,
      token,
      'template',
      'invitation',
      'mj-body',
      serializeMjBodyMjml(RED_BG_ATTRS),
    )

    // Avant override event : event hérite du template.
    const beforeOverride = await fetchMjBodyContext(request, token, 'event', eventId)
    expect(beforeOverride.origin).toBe('template')
    expect(beforeOverride.attrs).toEqual(RED_BG_ATTRS)

    // Seed override event.
    await seedShellPart(
      request,
      token,
      'event',
      eventId,
      'mj-body',
      serializeMjBodyMjml(GREEN_BG_ATTRS),
    )

    const afterOverride = await fetchMjBodyContext(request, token, 'event', eventId)
    expect(afterOverride.origin).toBe('event')
    expect(afterOverride.attrs).toEqual(GREEN_BG_ATTRS)

    // Le template reste vu comme tel quand l'event n'est pas dans le scope.
    const templateScoped = await fetchMjBodyContext(request, token, 'template', 'invitation')
    expect(templateScoped.origin).toBe('template')
    expect(templateScoped.attrs).toEqual(RED_BG_ATTRS)
  })

  test('C. reset event mj-body → cascade reprend (origin=template)', async ({
    page,
    request,
  }) => {
    // Seed template + event mj-body (cascade à 2 niveaux).
    await seedShellPart(
      request,
      token,
      'template',
      'invitation',
      'mj-body',
      serializeMjBodyMjml(RED_BG_ATTRS),
    )
    await seedShellPart(
      request,
      token,
      'event',
      eventId,
      'mj-body',
      serializeMjBodyMjml(GREEN_BG_ATTRS),
    )

    const before = await fetchMjBodyContext(request, token, 'event', eventId)
    expect(before.origin).toBe('event')

    await openEventEditor(page, eventId)

    const resetBtn = page.getByTestId('mjml-editor-reset-btn')
    await expect(resetBtn).toBeEnabled()

    // Le reset event est un appel atomique unique côté serveur
    // (`resetEventEmailTemplate` purge `events.invitation_mjml` ET toutes les
    // rows `shell_parts` de l'event dans la même transaction), plus une
    // orchestration client de DELETE par part. On assère l'appel réel, puis —
    // ci-dessous — son effet de cascade, qui est le vrai contrat.
    const resetPromise = page.waitForResponse(
      (r) =>
        r.url().includes(
          `/api/admin/events/${encodeURIComponent(eventId)}/email-template/reset`,
        ) && r.request().method() === 'POST',
    )

    await resetBtn.click()
    const confirmDialog = page.getByTestId('mjml-editor-reset-confirm')
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Restaurer', exact: true }).click()

    const resetResp = await resetPromise
    expect(resetResp.status()).toBe(200)

    // Cascade reprend : origin remonte au template.
    await expect
      .poll(
        async () => (await fetchMjBodyContext(request, token, 'event', eventId)).origin,
        { timeout: 5000 },
      )
      .toBe('template')

    const afterReset = await fetchMjBodyContext(request, token, 'event', eventId)
    expect(afterReset.attrs).toEqual(RED_BG_ATTRS)
  })
})
