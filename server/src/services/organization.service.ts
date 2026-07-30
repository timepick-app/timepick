import { query } from '../db'

/**
 * Organization identity service — chantier A1 (façade d'instance).
 *
 * Reads/writes 4 `app_config` keys as a single wire shape:
 *   - organization_name        (text, '' = non configuré)
 *   - organization_logo        (text, absolute URL, '' = aucun logo)
 *   - organization_description (text, '' = non configuré)
 *   - homepage_mode            ('facade' | 'login', décision Q3 — seedée
 *                               'facade' par la migration 041)
 *
 * `homepageFacade` is derived, never stored as a boolean: `homepage_mode !==
 * 'login'` — so a missing/unexpected value defaults to the façade being
 * active (fail-open toward the new default, not the legacy behaviour).
 */

const ORGANIZATION_KEYS = [
  'organization_name',
  'organization_logo',
  'organization_description',
  'homepage_mode',
] as const

export interface OrganizationSettings {
  name: string
  logo: string
  description: string
  homepageFacade: boolean
}

/** Payload for `saveOrganizationSettings` — mirrors the PUT body contract. */
export interface OrganizationSettingsUpdate {
  name: string
  description?: string
  /** Omitted ⇒ `homepage_mode` is left untouched. */
  homepageFacade?: boolean
}

/**
 * Read all 4 organization keys in one query and shape them into the
 * contractual DTO. Missing rows fall back to their documented defaults.
 */
export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  const result = await query<{ key: string; value: string }>(
    `SELECT key, value FROM app_config WHERE key = ANY($1::text[])`,
    [ORGANIZATION_KEYS as unknown as string[]],
  )

  const map = new Map(result.rows.map((row) => [row.key, row.value]))

  return {
    name: map.get('organization_name') || '',
    logo: map.get('organization_logo') || '',
    description: map.get('organization_description') || '',
    homepageFacade: map.get('homepage_mode') !== 'login',
  }
}

/**
 * Upsert name/description (+ homepage_mode only when `homepageFacade` is
 * provided) via the standard `app_config` upsert pattern (see
 * `config.service.ts#updatePollingInterval`), then re-read the settings so
 * the return value always reflects the persisted state (including the
 * untouched `logo`).
 */
export async function saveOrganizationSettings(
  data: OrganizationSettingsUpdate,
): Promise<OrganizationSettings> {
  const keys = ['organization_name', 'organization_description']
  const values = [data.name, data.description ?? '']

  if (data.homepageFacade !== undefined) {
    keys.push('homepage_mode')
    values.push(data.homepageFacade ? 'facade' : 'login')
  }

  await query(
    `INSERT INTO app_config (key, value)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [keys, values],
  )

  return getOrganizationSettings()
}

/**
 * Écrit la nouvelle URL de logo et retourne l'ancienne, atomiquement
 * ('' efface le logo) : chaque URL est rendue à exactement un appelant, qui
 * la supprime, ou reste la valeur courante.
 *
 * Une seule instruction, donc atomique sans BEGIN/COMMIT ni `pool.connect()` ;
 * le verrou ne couvre qu'elle, donc le traitement d'image reste hors section
 * critique, côté appelant. Ne pas « simplifier » en CTE verrouillante +
 * sous-requête dans RETURNING : mesuré, retourne NULL même sans concurrence.
 */
export async function swapOrganizationLogo(nextUrl: string): Promise<string> {
  const result = await query<{ previous: string }>(
    `UPDATE app_config AS c
     SET value = $1, updated_at = NOW()
     FROM (SELECT key, value FROM app_config WHERE key = 'organization_logo' FOR UPDATE) AS prev
     WHERE c.key = prev.key
     RETURNING prev.value AS previous`,
    [nextUrl],
  )

  // Ligne seedée par la migration initiale, jamais supprimée : zéro ligne =
  // schéma rompu. Sans la garde, `rows[0].previous` lèverait un TypeError
  // opaque — même 500, message indiagnosticable.
  if (result.rows.length === 0) {
    throw new Error("app_config n'a pas de ligne 'organization_logo' — schéma incohérent")
  }

  return result.rows[0].previous
}
