/**
 * Chantier email-providers (B2) — `ProviderMeta`/`CredentialField` (contrat
 * §3.1) : couche de données pures PARTAGÉE (exposée via le catalogue
 * `GET …/email-providers`), consommée par le client (chantier A) et la doc
 * (chantier C). Séparée de `ProviderHttpSpec` (`../types.ts`, §3.2) qui elle
 * contient des fonctions et reste serveur-only.
 */

export type ProviderRegion = 'eu' | 'us'

export interface CredentialField {
  /** 'apiKey' | 'secretKey' | 'projectId' | 'region' | … */
  key: string
  /** Libellé FR affiché ('Clé API', 'Clé secrète', 'ID de projet', 'Région'). */
  label: string
  /** true → champ masqué + sentinelle '****' + chiffré en DB. */
  secret: boolean
  /** ex. 're_…', 'xkeysib-…' — indicatif, jamais bloquant. */
  placeholder?: string
  /** Aide courte optionnelle. */
  help?: string
  /** Défaut true. */
  required?: boolean
  /** Valeur CONTRAINTE (ex. région Scaleway) : rendu <select> côté client +
   *  validation serveur contre cette liste. Absent = texte libre. */
  options?: { value: string; label: string }[]
}

export interface ProviderMeta {
  /** 'brevo' | 'mailjet' | 'scaleway' | 'sweego' | 'resend'. */
  id: string
  /** 'Brevo', 'Mailjet', … (affichage neutre — aucun nom de marque au 1er
   *  niveau, cf. contrat §0 ; ce libellé n'apparaît que dans le sous-menu). */
  label: string
  /** 'eu' pour les 4 fournisseurs EU, 'us' pour resend. */
  region: ProviderRegion
  /** ex. '≈ 300 emails/jour (gratuit)' — informatif, snapshot juillet 2026. */
  freeTierNote: string
  /** Lien doc officielle fournisseur (génération de la clé API). */
  docsUrl?: string
  credentialFields: CredentialField[]
}
