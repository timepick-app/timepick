import type { APIRequestContext, Page } from '@playwright/test'
import { TEST_ADMIN } from './auth'

/**
 * Helpers partagés par les specs Playwright `@slow` qui exercent
 * `<MjmlEditorOverlay>` (Story 26-4 — Email Shell invariants).
 *
 * Tirés verbatim de `tests/e2e/email-editor-overlay.spec.ts` et
 * `tests/e2e/email-reset-partial-failure-26-3.spec.ts` (story 26-4 / T1,
 * DRY ≥ 2 confirmé). Les 2 specs antérieures conservent volontairement
 * leur copie locale — drift hors-scope, à porter dans une story dédiée
 * si jamais.
 *
 * Prérequis serveur : `ALLOW_TEST_ROUTES=true` (les helpers `/api/test/*`
 * sont gardés derrière ce flag dans `server/src/app.ts`).
 */

export const SERVER_BASE = 'http://localhost:3000'

export type OwnerKind = 'brand' | 'template' | 'event'
// Plan 1 du 2026-05-22 — `'mj-body'` ajouté pour couvrir le slot d'attributs
// du <mj-body> racine (background-color + padding-top/bottom). Miroir des
// types côté server/client.
export type PartKind = 'header' | 'body' | 'footer' | 'mj-body'

/** Récupère un JWT admin via `/api/test/login` (création idempotente du user). */
export async function fetchAdminToken(request: APIRequestContext): Promise<string> {
  await request
    .post(`${SERVER_BASE}/api/test/users`, {
      data: {
        email: TEST_ADMIN.email,
        full_name: TEST_ADMIN.fullName,
        role: TEST_ADMIN.role,
      },
    })
    .catch(() => undefined)
  const login = await request.post(`${SERVER_BASE}/api/test/login`, {
    data: { email: TEST_ADMIN.email },
  })
  if (!login.ok()) {
    throw new Error(`Test login failed: HTTP ${login.status()}`)
  }
  const { token } = (await login.json()) as { token: string }
  return token
}

/** Crée un événement de test via l'API admin et retourne son UUID. */
export async function createTestEvent(
  request: APIRequestContext,
  token: string,
  name: string,
): Promise<string> {
  const res = await request.post(`${SERVER_BASE}/api/admin/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  })
  if (!res.ok()) {
    throw new Error(`Cannot create test event "${name}": HTTP ${res.status()}`)
  }
  const body = (await res.json()) as { data: { id: string } }
  return body.data.id
}

/** Supprime un événement de test (cleanup `afterAll`). */
export async function deleteTestEvent(
  request: APIRequestContext,
  token: string,
  eventId: string,
): Promise<void> {
  const res = await request.delete(`${SERVER_BASE}/api/admin/events/${eventId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok()) {
    throw new Error(`Cannot delete test event ${eventId}: HTTP ${res.status()}`)
  }
}

/**
 * Pose une surcharge `shell_parts` au niveau template ou event.
 *
 * Pattern verbatim `email-reset-partial-failure-26-3.spec.ts:63-77` —
 * `PUT /api/admin/shell-parts/:ownerKind/:ownerId/:partKind` est idempotent
 * (upsert ON CONFLICT) côté serveur depuis la story 26-2c.
 */
export async function seedShellPart(
  request: APIRequestContext,
  token: string,
  ownerKind: Exclude<OwnerKind, 'brand'>,
  ownerId: string,
  partKind: PartKind,
  contentMjml: string,
): Promise<void> {
  const res = await request.put(
    `${SERVER_BASE}/api/admin/shell-parts/${ownerKind}/${encodeURIComponent(ownerId)}/${partKind}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: { contentMjml },
    },
  )
  if (!res.ok()) {
    throw new Error(
      `Cannot seed ${ownerKind}/${ownerId}/${partKind}: HTTP ${res.status()}`,
    )
  }
}

/** Cleanup test-only : efface toutes les surcharges `shell_parts` d'un owner. */
export async function deleteShellParts(
  request: APIRequestContext,
  ownerKind: OwnerKind,
  ownerId: string,
): Promise<void> {
  const res = await request.delete(
    `${SERVER_BASE}/api/test/shell-parts/${ownerKind}/${encodeURIComponent(ownerId)}`,
  )
  if (!res.ok()) {
    throw new Error(
      `Cannot cleanup shell-parts ${ownerKind}/${ownerId}: HTTP ${res.status()} (ALLOW_TEST_ROUTES manquant ?)`,
    )
  }
}

/**
 * Cleanup ciblé d'UNE surcharge, via l'API admin (`DELETE
 * /api/admin/shell-parts/:ownerKind/:ownerId/:partKind`, 204 idempotent).
 *
 * À préférer à `deleteShellParts` dès que l'owner peut porter des rows qui ne
 * viennent pas du test : au niveau `brand`, la migration 012 pose la row
 * factory `content-wrapper` qui active la cascade γ de la carte. Un cleanup
 * owner-wide l'efface définitivement, et tous les canevas ouverts ensuite —
 * dans ce run comme dans les suivants — perdent leur `locked-card`.
 */
export async function deleteShellPart(
  request: APIRequestContext,
  token: string,
  ownerKind: OwnerKind,
  ownerId: string,
  partKind: PartKind,
): Promise<void> {
  const res = await request.delete(
    `${SERVER_BASE}/api/admin/shell-parts/${ownerKind}/${encodeURIComponent(ownerId)}/${partKind}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok()) {
    throw new Error(
      `Cannot delete shell-part ${ownerKind}/${ownerId}/${partKind}: HTTP ${res.status()}`,
    )
  }
}

/**
 * Attend que GrapesJS soit prêt — i.e. que les 2 sections `locked-shell`
 * (en-tête + pied de page) soient présentes dans le wrapper, ainsi que
 * `window.__grapesEditor` exposé.
 *
 * Le sélecteur `[css-class~="locked-shell"]` est le seul fiable —
 * `find('.locked-shell')` (classe CSS) matche 0 dans grapesjs-mjml@1.0.8, seul
 * le sélecteur attribut fonctionne. Layout réel : 2 locked-shell (header +
 * footer) + 1 locked-card (mj-wrapper content-wrapper, plan carte-éditable).
 */
export async function waitForGrapesEditorReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const ed = (window as unknown as { __grapesEditor?: unknown })
        .__grapesEditor as
        | { getWrapper: () => { find: (sel: string) => unknown[] } }
        | undefined
      if (!ed) return false
      return ed.getWrapper().find('[css-class~="locked-shell"]').length >= 2
    },
    { timeout: 20000 },
  )
}
