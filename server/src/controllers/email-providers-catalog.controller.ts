import type { Request, Response } from 'express'
import { PROVIDER_CATALOG } from '../services/email-transport/descriptors'

/**
 * Chantier email-providers (B2) — catalogue des fournisseurs HTTP (contrat
 * §1/§3.1). Même handler monté sur `GET /api/admin/settings/email-providers`
 * (admin) ET `GET /api/setup/email-providers` (public gated) : réponse
 * byte-identique, source unique = les descripteurs (`descriptors/index.ts`).
 * AUCUN secret — `ProviderMeta[]`, ordre EU-first/resend-last.
 */
export const getEmailProvidersCatalogHandler = (_req: Request, res: Response): void => {
  res.json({ data: PROVIDER_CATALOG })
}
