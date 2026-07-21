import type { EmailProvider } from '../../db/email-provider.db'
import { createHttpTransport, type HttpTransport } from './http-transport'
import { getProviderSpec } from './descriptors'

/**
 * Chantier email-providers (B2) — factory data-driven (contrat §3.2/§4) :
 * lookup du descripteur par `provider` → délègue au moteur générique (B1,
 * `createHttpTransport`). Ajouter un fournisseur = un descripteur dans
 * `descriptors/`, ZÉRO changement ici.
 */
export function createApiTransport(provider: Exclude<EmailProvider, 'smtp'>, credentials: Record<string, string>): HttpTransport {
  const spec = getProviderSpec(provider)
  if (!spec) {
    throw new Error(`Descripteur introuvable pour le fournisseur '${provider}'`)
  }
  return createHttpTransport(spec, credentials)
}
