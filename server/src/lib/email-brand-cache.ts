/**
 * Module-scope cache for the `email_brand_settings` singleton.
 *
 * Singleton garanti par schéma (`PRIMARY KEY DEFAULT 1` + `CHECK (id = 1)`,
 * migration 006) et 2 chemins d'écriture runtime exhaustifs (PATCH + reset
 * via `email-brand-settings.controller.ts`) → invalidation explicite sans
 * TTL. Cf. Z4 dans deferred-work.md.
 *
 * **REQUIRES single-process deployment.** Le cache est local au worker Node :
 * un PATCH reçu par un worker n'invalide pas les autres. Audit du
 * 2026-05-28 a confirmé `node dist/index.js` sans clustering ; toute
 * bascule vers PM2 cluster, multi-container ou load balancer doit
 * remplacer ce cache par une invalidation pub/sub (Redis, LISTEN/NOTIFY,
 * etc.) — voir defer associé dans deferred-work.md.
 *
 * **Consommateur unique** = `editor-context.controller.ts`. Les autres
 * lecteurs de `email_brand_settings` (notamment `render-email.service.ts`)
 * continuent de lire la DB en direct par choix délibéré (lectures peu
 * fréquentes, pas de bénéfice perf significatif).
 *
 * **Hors-bande SQL.** Toute écriture directe SQL en runtime (script ad-hoc,
 * seed, REPL, migration en chaud) bypass l'invalidation et laisse le cache
 * stale jusqu'au redémarrage process ou jusqu'au prochain PATCH/reset.
 *
 * Usage tests : appeler `invalidateEmailBrandCache()` en `beforeEach`
 * pour isoler chaque run du cache module-scope partagé.
 */

import {
  getEmailBrandSettings,
  type EmailBrandSettings,
} from '../db/email-brand-settings.db'

let cached: EmailBrandSettings | null = null

export async function getEmailBrandSettingsCached(): Promise<EmailBrandSettings> {
  if (cached !== null) return cached
  const fresh = await getEmailBrandSettings()
  cached = fresh
  return fresh
}

export function invalidateEmailBrandCache(): void {
  cached = null
}

