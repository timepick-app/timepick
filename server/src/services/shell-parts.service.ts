/**
 * Shell Parts service — CRUD over the shell_parts table (migration 009).
 *
 * Three owner conventions share the table (cf. migration header comment):
 *   owner_kind='event'    → owner_id = events.id (UUID)
 *   owner_kind='template' → owner_id = template_key string
 *   owner_kind='brand'    → owner_id = '1' (singleton)
 *
 * camelCase DTO boundary: maps snake_case SQL columns to camelCase wire keys.
 *
 * Cleanup helper (`deleteShellPartsForOwner`) accepts an optional PoolClient
 * so callers can participate in an externally-managed transaction (used by
 * event.service.ts:deleteEvent to atomically purge child rows alongside the
 * parent DELETE — see story 26.1 / AC2).
 */

import { MJ_BODY_BACKGROUND_COLOR } from '@timepick/shared'

import type { PoolClient } from 'pg'
import { query } from '../db'

// --- Types ---

export const OWNER_KINDS = ['brand', 'template', 'event'] as const
export type OwnerKind = (typeof OWNER_KINDS)[number]

// 'mj-body' (depuis Plan 1 du 2026-05-22) n'est pas une 4ᵉ section structurelle :
// c'est un slot qui stocke les attributs (background-color, padding-top, padding-bottom)
// du `<mj-body>` racine. Le contenu est un fragment `<mj-body … ></mj-body>` vide.
// Migration : `010_extend_shell_parts_mj_body.sql` étend la CHECK constraint
// `shell_parts_part_kind_check` en miroir.
//
// 'content-wrapper' (Plan 5b defer-A L2, 2026-05-25) n'est pas non plus une
// section structurelle : c'est un slot qui stocke les attributs (background-color,
// padding*, border-radius) d'un wrapper transversal hors-bloc appliqué autour
// du contenu du corps au render. Promu en cascade γ depuis le gabarit
// d'invitation (cf. shell-resolver.service.ts:138). Migration :
// `011_extend_shell_parts_content_wrapper.sql`. L2 est un enabler data-layer :
// le render-email et l'UI éditeur consomment la valeur résolue en L3.
export const PART_KINDS = ['header', 'body', 'footer', 'mj-body', 'content-wrapper'] as const
export type PartKind = (typeof PART_KINDS)[number]

// Valeur factory COURANTE de la row brand content-wrapper. Semée à l'origine
// en #f9f9f9 par migration 012, puis migrée à #ffffff par migration 017
// (carte commune blanche, plan 2026-06-08 — voir migration 017 pour le détail).
// Single source of truth :
//   - migration 017 (SQL hardcodé, ne peut importer TS — sa valeur cible
//     #ffffff doit rester en synchro byte-exact avec cette constante).
//   - rollback 012 (importe cette constante : supprime la row factory COURANTE).
//   - rollback 017 (importe cette constante comme valeur post-migration #ffffff).
//   - tests `email-html-output.test.ts` + `email-visual-baselines.test.ts`
//     (importent cette constante pour le `beforeAll` factory).
// L'exposition publique de cette valeur n'introduit pas de couplage applicatif
// nouveau : le serveur ne lit jamais cette constante à runtime (la cascade γ
// passe par le resolver depuis la DB) ; elle existe uniquement pour assurer
// la cohérence write-side entre migration / rollback / tests.
export const BRAND_FACTORY_CONTENT_WRAPPER_MJML =
  '<mj-section background-color="#ffffff"></mj-section>'

// ----------------------------------------------------------------------------
// Coque commune « carte » — valeurs factory des 3 parts γ portées par l'owner
// commun `template[invitation]` (cf. COMMON_SHELL_OWNER, shellLegRouting.ts).
// Semées par migration 018 (2026-06-08). Carte blanche à fine bordure noire +
// coins arrondis, posée sur un fond de page gris clair. Via promotion γ ces
// rows servent de défaut inter-modèles (header / content-wrapper / mj-body)
// pour TOUS les emails transactionnels.
//
// Single source of truth (le SQL ne peut pas importer le TS au runtime du
// runner ; garder byte-exact dans LES DEUX endroits) :
//   - migration 018 (INSERT ... ON CONFLICT DO NOTHING — littéraux SQL).
//   - rollback 018 (DELETE conditionnel par match exact factory).
//   - tests `email-html-output.test.ts` + `email-visual-baselines.test.ts`
//     (seed `beforeAll` pour un état shell_parts déterministe).
export const INVITATION_FACTORY_HEADER_MJML =
  '<mj-section background-color="#ffffff" padding="20px" border-radius="10px 10px 0px 0px" border-right="1px solid #e5e7eb" border-left="1px solid #e5e7eb" border-top="1px solid #e5e7eb" border-bottom="1px solid #e5e7eb" padding-top="10px" padding-bottom="10px" data-part-kind="header"><mj-column><mj-text color="#000000" font-size="22px" font-weight="bold" align="center">TimePick</mj-text></mj-column></mj-section>'

export const INVITATION_FACTORY_CONTENT_WRAPPER_MJML =
  '<mj-section background-color="#ffffff" border-radius="0px 0px 10px 10px" border-right="1px solid #e5e7eb" border-bottom="1px solid #e5e7eb" border-left="1px solid #e5e7eb"></mj-section>'

export const INVITATION_FACTORY_MJBODY_MJML =
  `<mj-body background-color="${MJ_BODY_BACKGROUND_COLOR}" padding-top="30px" padding-bottom="30px"></mj-body>`

export interface ShellPart {
  id: string
  ownerKind: OwnerKind
  ownerId: string
  partKind: PartKind
  contentMjml: string
  createdAt: Date
  updatedAt: Date
}

export interface UpsertShellPartInput {
  ownerKind: OwnerKind
  ownerId: string
  partKind: PartKind
  contentMjml: string
}

// --- Internal row type (snake_case from pg) ---

type RawRow = {
  id: string
  owner_kind: OwnerKind
  owner_id: string
  part_kind: PartKind
  content_mjml: string
  created_at: Date
  updated_at: Date
}

function rowToDto(row: RawRow): ShellPart {
  return {
    id: row.id,
    ownerKind: row.owner_kind,
    ownerId: row.owner_id,
    partKind: row.part_kind,
    contentMjml: row.content_mjml,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const SELECT_COLS = 'id, owner_kind, owner_id, part_kind, content_mjml, created_at, updated_at'

// --- Public API ---

export async function getShellParts(ownerKind: OwnerKind, ownerId: string): Promise<ShellPart[]> {
  const { rows } = await query<RawRow>(
    `SELECT ${SELECT_COLS} FROM shell_parts WHERE owner_kind = $1 AND owner_id = $2 ORDER BY part_kind`,
    [ownerKind, ownerId],
  )
  return rows.map(rowToDto)
}

export async function upsertShellPart(input: UpsertShellPartInput): Promise<ShellPart> {
  const { rows } = await query<RawRow>(
    `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_kind, owner_id, part_kind)
     DO UPDATE SET content_mjml = EXCLUDED.content_mjml, updated_at = NOW()
     RETURNING ${SELECT_COLS}`,
    [input.ownerKind, input.ownerId, input.partKind, input.contentMjml],
  )
  return rowToDto(rows[0])
}

/**
 * Deletes a single shell_parts row for (owner_kind, owner_id, part_kind).
 * Idempotent at the SQL level: missing row → rowCount=0 → returns `false`.
 * Used by the orchestrated save in the editor when an admin restores a
 * section to its inherited cascade value (DELETE relâche la surcharge).
 */
export async function deleteShellPart(input: {
  ownerKind: OwnerKind
  ownerId: string
  partKind: PartKind
}): Promise<boolean> {
  const result = await query(
    `DELETE FROM shell_parts WHERE owner_kind = $1 AND owner_id = $2 AND part_kind = $3`,
    [input.ownerKind, input.ownerId, input.partKind],
  )
  return (result.rowCount ?? 0) > 0
}

/**
 * Deletes every shell_parts row belonging to a given owner. Idempotent
 * (returns 0 when no rows exist for that owner). Accepts an optional
 * PoolClient so the caller can run this inside an externally-managed
 * transaction (e.g. event.service.ts:deleteEvent uses withTransaction
 * to delete shell_parts + events in a single atomic step — AC2).
 */
export async function deleteShellPartsForOwner(
  ownerKind: OwnerKind,
  ownerId: string,
  client?: PoolClient,
): Promise<number> {
  const sql = 'DELETE FROM shell_parts WHERE owner_kind = $1 AND owner_id = $2'
  const params = [ownerKind, ownerId]
  const result = client ? await client.query(sql, params) : await query(sql, params)
  return result.rowCount ?? 0
}

// Les 3 parts γ de la coque commune « carte » portées par l'owner partagé
// template[invitation] (cf. COMMON_SHELL_OWNER + promotion γ). Modèle d'usine
// semé par migration 018. Réutilisé par le reset global pour RESTAURER ces rows
// à leur valeur d'usine (et non les supprimer — sinon la cascade retombe sur le
// fallback hardcodé = ancien header noir, cf. régression 2026-06-08).
const FACTORY_COMMON_SHELL: ReadonlyArray<{ partKind: PartKind; contentMjml: string }> = [
  { partKind: 'header', contentMjml: INVITATION_FACTORY_HEADER_MJML },
  { partKind: 'content-wrapper', contentMjml: INVITATION_FACTORY_CONTENT_WRAPPER_MJML },
  { partKind: 'mj-body', contentMjml: INVITATION_FACTORY_MJBODY_MJML },
]

/**
 * Upsert des 3 rows de la coque commune « carte » @ template[invitation]
 * (header / content-wrapper / mj-body) à leur valeur d'usine — INSERT ... ON
 * CONFLICT DO UPDATE qui écrase toute customatisation admin. Chemin d'écriture
 * usine UNIQUE, utilisé par le reset global (resetSharedShellToFactory) : il
 * réinjecte les mêmes constantes sans duplication de la boucle SQL.
 * S'exécute sur le client transactionnel fourni par l'appelant.
 */
export async function upsertFactoryCommonShell(client: PoolClient): Promise<void> {
  for (const { partKind, contentMjml } of FACTORY_COMMON_SHELL) {
    await client.query(
      `INSERT INTO shell_parts (owner_kind, owner_id, part_kind, content_mjml)
       VALUES ('template', 'invitation', $1, $2)
       ON CONFLICT (owner_kind, owner_id, part_kind)
       DO UPDATE SET content_mjml = EXCLUDED.content_mjml, updated_at = NOW()`,
      [partKind, contentMjml],
    )
  }
}

/**
 * Réinitialise le design partagé (owner_kind='template') au modèle d'usine, sur
 * le client transactionnel fourni. Utilisé par le reset global des modèles.
 *
 *   1. RESTAURE les 3 rows de la coque commune carte @ template[invitation]
 *      (header / content-wrapper / mj-body) à leur valeur d'usine (UPSERT —
 *      écrase toute customisation admin) via upsertFactoryCommonShell. C'est ce
 *      qui manquait : un simple DELETE faisait retomber la cascade sur le
 *      fallback hardcodé (header noir).
 *   2. SUPPRIME toute AUTRE row template-owned (footers par modèle, surcharges
 *      sur d'autres template keys) — celles-ci n'ont pas de valeur d'usine et
 *      reviennent donc au fallback hardcodé / cascade.
 *
 * N'affecte JAMAIS 'brand' ni 'event'. Retourne le nombre de rows SUPPRIMÉES
 * (hors upserts d'usine), si bien qu'un second reset consécutif retourne 0.
 */
export async function resetSharedShellToFactory(client: PoolClient): Promise<number> {
  await upsertFactoryCommonShell(client)
  const result = await client.query(
    `DELETE FROM shell_parts
       WHERE owner_kind = 'template'
         AND NOT (owner_id = 'invitation' AND part_kind IN ('header', 'content-wrapper', 'mj-body'))`,
  )
  return result.rowCount ?? 0
}

/**
 * Indique si la COQUE de l'invitation (pied + coque commune « carte ») diffère
 * de l'état d'usine — pilote l'activation du bouton « Restaurer le gabarit
 * d'usine » côté client (lot 3b). Ne couvre PAS le corps (body_mjml), dont la
 * comparaison à l'usine est calculée côté client via defaultBodyMjml déjà présent
 * dans le DTO.
 *
 * Compare les rows BRUTES stockées en shell_parts (jamais la valeur résolue
 * cascade) byte-exactement avec les constantes d'usine FACTORY_COMMON_SHELL.
 * true si : (a) une row footer @ template[invitation] existe (l'usine n'en a
 * pas), OU (b) une des 3 parts de la coque commune est absente ou son
 * content_mjml ≠ la constante d'usine correspondante. Sinon false (état usine).
 */
export async function isInvitationShellCustomized(): Promise<boolean> {
  const parts = await getShellParts('template', 'invitation')
  // (a) footer présent = déviation d'usine (l'usine ne porte que les 3 parts γ).
  if (parts.some((p) => p.partKind === 'footer')) return true
  // (b) toute part γ absente ou dont le contenu diffère byte-exact = déviation.
  const byKind = new Map(parts.map((p) => [p.partKind, p.contentMjml]))
  for (const { partKind, contentMjml } of FACTORY_COMMON_SHELL) {
    if (byKind.get(partKind) !== contentMjml) return true
  }
  return false
}

/**
 * Test/dev seed helper — alias of `upsertShellPart`. Provided so integration
 * tests read naturally (`await seedShellPart(...)` vs `await upsertShellPart(...)`)
 * and so future seed scripts can grow extra debug semantics without touching
 * the production write path.
 */
export async function seedShellPart(input: UpsertShellPartInput): Promise<ShellPart> {
  return upsertShellPart(input)
}
