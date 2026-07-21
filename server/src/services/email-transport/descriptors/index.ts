/**
 * Chantier email-providers (B2) — catalogue des descripteurs de fournisseurs
 * HTTP (contrat §3.1/§3.2). Agrège les 5 fournisseurs (`brevo.ts`,
 * `mailjet.ts`, `scaleway.ts`, `sweego.ts`, `resend.ts`) derrière un
 * identifiant commun — ajouter un fournisseur = un nouveau fichier + une
 * entrée ci-dessous, ZÉRO nouveau chemin de code dans le moteur
 * (`http-transport.ts`, B1, inchangé) ni dans les consommateurs (factory
 * `createApiTransport`, validateur, contrôleurs, provisioning).
 *
 * Ordre du catalogue exposé (`GET …/email-providers`) : EU d'abord, `resend`
 * (US) en dernier (contrat §0/§3.1).
 */
import type { ProviderHttpSpec } from '../types'
import type { ProviderMeta } from './provider-meta'
import { brevoMeta, brevoSpec } from './brevo'
import { mailjetMeta, mailjetSpec } from './mailjet'
import { scalewayMeta, scalewaySpec } from './scaleway'
import { sweegoMeta, sweegoSpec } from './sweego'
import { resendMeta, resendSpec } from './resend'

export type { ProviderMeta, CredentialField, ProviderRegion } from './provider-meta'
export type { ProviderHttpSpec } from '../types'

interface Descriptor {
  meta: ProviderMeta
  spec: ProviderHttpSpec
}

// EU d'abord, resend (US) en dernier — ordre exposé tel quel par le catalogue.
const DESCRIPTORS: readonly Descriptor[] = [
  { meta: brevoMeta, spec: brevoSpec },
  { meta: mailjetMeta, spec: mailjetSpec },
  { meta: scalewayMeta, spec: scalewaySpec },
  { meta: sweegoMeta, spec: sweegoSpec },
  { meta: resendMeta, spec: resendSpec },
]

const META_BY_ID: Record<string, ProviderMeta> = Object.fromEntries(DESCRIPTORS.map(d => [d.meta.id, d.meta]))
const SPEC_BY_ID: Record<string, ProviderHttpSpec> = Object.fromEntries(DESCRIPTORS.map(d => [d.spec.id, d.spec]))

/** Catalogue exposé (`GET …/email-providers`, contrat §1/§3.1) — AUCUN
 *  secret, ordre EU-first/resend-last figé ci-dessus. */
export const PROVIDER_CATALOG: readonly ProviderMeta[] = DESCRIPTORS.map(d => d.meta)

/** Fournisseur email-providers HTTP connus (miroir de `EMAIL_PROVIDERS` côté
 *  DB, sans 'smtp') — source unique pour le message d'erreur du validateur. */
export const HTTP_PROVIDER_IDS: readonly string[] = DESCRIPTORS.map(d => d.meta.id)

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return META_BY_ID[id]
}

/** Serveur uniquement (peut contenir des fonctions) — moteur HTTP générique. */
export function getProviderSpec(id: string): ProviderHttpSpec | undefined {
  return SPEC_BY_ID[id]
}
