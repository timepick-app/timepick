import api, { type ApiResponse } from './api'

/**
 * Client-side mirror of `server/src/services/shell-parts.service.ts:22-36`.
 * Duplicated rather than shared because TimePick has no client/server shared
 * package today; drift is detected by integration smoke (Story 26-2d AC7
 * scenarios A-E) and by tsc on the controller envelope shape. (Story 26-2d
 * AC1; mirror pattern from `editor-context.service.ts` Story 26-1.)
 *
 * `createdAt` / `updatedAt` are serialized as ISO strings over the wire
 * (Express JSON), so they are typed as `string` here — the server `Date`
 * round-trip is intentionally lossy and rebuilt on demand by consumers.
 */
type OwnerKind = 'brand' | 'template' | 'event'

// Plan 1 du 2026-05-22 — `'mj-body'` n'est pas une 4ᵉ section structurelle :
// c'est un slot qui stocke les attributs (background-color, padding-top,
// padding-bottom) du `<mj-body>` racine. Miroir du serveur (`PART_KINDS`).
type PartKind = 'header' | 'body' | 'footer' | 'mj-body' | 'content-wrapper'

export interface ShellPart {
  id: string
  ownerKind: OwnerKind
  ownerId: string
  partKind: PartKind
  contentMjml: string
  createdAt: string
  updatedAt: string
}

export interface UpsertShellPartParams {
  ownerKind: OwnerKind
  ownerId: string
  partKind: PartKind
  contentMjml: string
}

/**
 * Consumer of `PUT /api/admin/shell-parts/:ownerKind/:ownerId/:partKind`
 * (Story 26-2c). Idempotent upsert: a repeat call with the same path is
 * resolved last-write-wins by the server's `INSERT … ON CONFLICT DO UPDATE`.
 *
 * `encodeURIComponent` is defensive: `ownerId` is currently a lowercase UUID
 * (event), a static templateKey (template), or `'1'` (brand singleton), but
 * templateKey evolution is unpredictable — encoding avoids silently breaking
 * Express path routing if a future templateKey carries a `/` or similar.
 */
export const upsertShellPart = async (
  params: UpsertShellPartParams,
): Promise<ShellPart> => {
  const { ownerKind, ownerId, partKind, contentMjml } = params
  const { data } = await api.put<ApiResponse<ShellPart>>(
    `/admin/shell-parts/${encodeURIComponent(ownerKind)}/${encodeURIComponent(ownerId)}/${encodeURIComponent(partKind)}`,
    { contentMjml },
  )
  return data.data
}

export interface DeleteShellPartParams {
  ownerKind: OwnerKind
  ownerId: string
  partKind: PartKind
}

export const deleteShellPart = async (
  params: DeleteShellPartParams,
): Promise<void> => {
  const { ownerKind, ownerId, partKind } = params
  await api.delete(
    `/admin/shell-parts/${encodeURIComponent(ownerKind)}/${encodeURIComponent(ownerId)}/${encodeURIComponent(partKind)}`,
  )
}
