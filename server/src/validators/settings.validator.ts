import { z } from 'zod'
import { getProviderMeta, HTTP_PROVIDER_IDS } from '../services/email-transport/descriptors'

/**
 * Schéma de validation pour la mise à jour des paramètres SMTP (PUT /settings/smtp)
 *
 * Champs requis : smtpHost, smtpPort, smtpSecure
 * Champs optionnels : smtpUser, smtpPassword, smtpFromName
 * smtpFromEmail : requis UNIQUEMENT si smtpHost est renseigné — voir
 * `checkSmtpFromEmailRequired` (superRefine ci-dessous, même stratégie que
 * `checkProviderCredentials` plus bas). Un hôte vide reste TOUJOURS accepté :
 * il signifie « effacer la configuration » (`deleteSmtpSettingsHandler`, cf.
 * commentaire "empty host triggers DELETE" dans `SmtpConfigPanel.tsx`) — ce
 * cas ne doit jamais être bloqué par cette règle.
 *
 * Le mot de passe peut être :
 * - Une valeur réelle (sera chiffrée avant stockage)
 * - Le sentinelle "****" (préserve l'ancien mot de passe)
 * - Vide "" (préserve l'ancien mot de passe)
 */
const smtpSettingsShape = z.object({
  smtpHost: z.string({
    error: () => "L'hôte SMTP doit être une chaîne de caractères"
  }).optional().default(''),

  smtpPort: z.number({
    error: (issue) => issue.input === undefined ? "Le port SMTP est requis" : "Le port SMTP doit être un nombre"
  })
    .int("Le port SMTP doit être un nombre entier")
    .min(1, "Le port SMTP doit être entre 1 et 65535")
    .max(65535, "Le port SMTP doit être entre 1 et 65535"),

  smtpSecure: z.boolean({
    error: (issue) => issue.input === undefined ? "Le paramètre de sécurité SMTP est requis" : "Le paramètre de sécurité doit être un booléen"
  }),

  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  smtpFromName: z.string().optional(),
  smtpFromEmail: z.string().email("L'email de l'expéditeur doit être une adresse email valide").optional().or(z.literal(''))
})

/** Refine partagé — `smtpFromEmail` requis UNIQUEMENT quand `smtpHost` est
 *  renseigné (délivrabilité), même exigence que le chemin HTTP
 *  (`checkProviderCredentials` ci-dessous). Un `smtpHost` vide reste
 *  TOUJOURS accepté (effacement, cf. doc ci-dessus) — d'où le test de garde
 *  sur smtpHost avant d'exiger smtpFromEmail. Nommée + appliquée via
 *  `.superRefine()` sur une forme dédiée (`smtpSettingsShape`), comme
 *  `checkProviderCredentials`/`emailApiProviderShape` plus bas — ne pas
 *  fusionner l'objet et le refine si ce schéma doit un jour être étendu via
 *  `.extend()` (qui doit précéder `.superRefine()`, cf. avertissement sur
 *  `smtpTestSchema`/`smtpSetupTestSchema` ci-dessous). */
function checkSmtpFromEmailRequired(data: z.infer<typeof smtpSettingsShape>, ctx: z.RefinementCtx): void {
  if (data.smtpHost.trim() && !data.smtpFromEmail) {
    ctx.addIssue({
      code: 'custom',
      path: ['smtpFromEmail'],
      message: "L'email de l'expéditeur est requis lorsqu'un serveur SMTP est configuré",
    })
  }
}

export const smtpSettingsSchema = smtpSettingsShape.superRefine(checkSmtpFromEmailRequired)

/**
 * Schéma de validation pour le test de connexion SMTP (POST /settings/smtp/test)
 *
 * Mêmes champs que smtpSettingsSchema, mais le sentinelle "****" est rejeté
 * car on ne peut pas tester une connexion avec le mot de passe masqué.
 *
 * `smtpFromEmail` reste OPTIONNEL ici (contrairement à smtpSettingsSchema) :
 * le transport ad-hoc de test (`sendSmtpTest`) retombe sur `recipient` comme
 * adresse d'expéditeur quand il est vide — repli sûr et local à ce test
 * (envoi à l'admin qui teste), sans rapport avec le risque de
 * `noreply@example.com` en production que ce chantier corrige (celui-ci ne
 * concerne que la PERSISTANCE de la config, via smtpSettingsSchema/PUT).
 */
export const smtpTestSchema = z.object({
  smtpHost: z.string({
    error: (issue) => issue.input === undefined ? "L'hôte SMTP est requis" : "L'hôte SMTP doit être une chaîne de caractères"
  }).min(1, "L'hôte SMTP ne peut pas être vide"),

  smtpPort: z.number({
    error: (issue) => issue.input === undefined ? "Le port SMTP est requis" : "Le port SMTP doit être un nombre"
  })
    .int("Le port SMTP doit être un nombre entier")
    .min(1, "Le port SMTP doit être entre 1 et 65535")
    .max(65535, "Le port SMTP doit être entre 1 et 65535"),

  smtpSecure: z.boolean({
    error: (issue) => issue.input === undefined ? "Le paramètre de sécurité SMTP est requis" : "Le paramètre de sécurité doit être un booléen"
  }),

  smtpUser: z.string().optional(),
  smtpPassword: z.string()
    .refine(val => val !== '****', {
      message: "Le mot de passe masqué ne peut pas être utilisé pour tester. Saisissez le vrai mot de passe."
    })
    .optional(),
  smtpFromName: z.string().optional(),
  smtpFromEmail: z.string().email("L'email de l'expéditeur doit être une adresse email valide").optional().or(z.literal(''))
})

/**
 * Schéma de validation pour le test SMTP depuis le wizard de setup (POST /setup/smtp/test)
 *
 * Étend smtpTestSchema avec le champ recipient. Le refine anti-'****' de smtpTestSchema
 * est surchargé ici : la sentinelle est autorisée, le contrôleur résout le vrai mot de passe depuis la DB.
 */
export const smtpSetupTestSchema = smtpTestSchema.extend({
  recipient: z.string().email('Email de test invalide'),
  smtpPassword: z.string().optional(),
})

/** Forme de base des credentials provider HTTP (contrat §5) — le refine
 *  data-driven (`checkProviderCredentials`, ci-dessous) est appliqué APRÈS
 *  extension par `emailApiProviderSetupTestSchema` : `.superRefine()`
 *  renvoie un wrapper sans `.extend()`, l'ordre est donc figé. */
const emailApiProviderShape = z.object({
  provider: z.string(),
  credentials: z.record(z.string(), z.string()).optional().default({}),
  smtpFromName: z.string().optional(),
  smtpFromEmail: z.string().email("L'email de l'expéditeur doit être une adresse email valide").optional().or(z.literal('')),
})

/** Refine partagé (contrat §5) — appliqué aux DEUX schémas ci-dessous (base
 *  + variante setup avec `recipient`) : `.superRefine()` retourne un wrapper
 *  qui n'a plus `.extend()`, donc le refine doit être appliqué APRÈS l'ajout
 *  de `recipient`, pas avant (sinon `emailApiProviderSetupTestSchema` ne
 *  pourrait pas étendre `emailApiProviderSettingsSchema`). */
function checkProviderCredentials(data: z.infer<typeof emailApiProviderShape>, ctx: z.RefinementCtx): void {
  const meta = getProviderMeta(data.provider)
  if (!meta) {
    ctx.addIssue({
      code: 'custom',
      path: ['provider'],
      message: `Fournisseur email non supporté (disponibles : smtp, ${HTTP_PROVIDER_IDS.join(', ')})`,
    })
    return
  }

  if (!data.smtpFromEmail) {
    ctx.addIssue({
      code: 'custom',
      path: ['smtpFromEmail'],
      message: "L'email de l'expéditeur est requis pour un fournisseur d'envoi par API",
    })
  }

  // Le "requis" par fournisseur (§5) N'EST PAS vérifié ici au sens strict :
  // un champ absent équivaut à une sentinelle vide ('' — cf. contrat §4.2,
  // "sentinelle valide ⇔ provider inchangé") dont la résolution est SCOPÉE
  // au provider stocké, une info que ce schéma (statique, sans accès DB) ne
  // possède pas. Le contrôleur (`resolveProviderCredentials`, cf.
  // `provider-credentials.ts`) fait le VRAI contrôle post-résolution : 400
  // (PUT) ou `{success:false}` (test) si un champ requis reste vide. Ce
  // refine ne valide que ce qui est purement statique : provider ∈
  // catalogue, smtpFromEmail requis, et les champs à `options` fournis.
  for (const field of meta.credentialFields) {
    if (!field.options) continue
    const value = data.credentials[field.key]
    // '****' n'est une sentinelle « préserver » QUE pour les champs secrets (résolue,
    // scopée au provider, par resolveProviderCredentials). Un champ à `options` est
    // non-secret (region) → '****' n'y est jamais une sentinelle et doit être validé
    // contre `options` comme toute autre valeur ('' reste couvert par missingLabels).
    if (value === undefined || value === '' || (field.secret && value === '****')) continue
    if (!field.options.some(o => o.value === value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['credentials', field.key],
        message: `${field.label} invalide (valeurs autorisées : ${field.options.map(o => o.value).join(', ')})`,
      })
    }
  }
}

/**
 * Chantier email-providers (B2) — providers email HTTP (transport API,
 * alternative au SMTP), validation DATA-DRIVEN pilotée par le catalogue de
 * descripteurs (contrat §5) : remplace le `z.enum(['resend'])` figé.
 *
 * - `provider` ∈ ids du catalogue (hors 'smtp').
 * - `credentials` : record de chaînes libre — le contrôle des champs
 *   REQUIS du fournisseur n'est PAS fait ici (schéma statique, sans accès
 *   DB) : `resolveProviderCredentials` (`provider-credentials.ts`) le fait
 *   APRÈS résolution des sentinelles scopée au provider stocké (contrat
 *   §4.2/§7.7) — 400 (PUT) ou `{success:false}` (test) si un champ requis
 *   reste vide après résolution.
 * - Champs à `options` (ex. région Scaleway) : valeur ∈ options si fournie
 *   et non-sentinelle.
 * - `smtpFromEmail` REQUIS pour tout provider HTTP (délivrabilité, §4.2/§7.6).
 */
export const emailApiProviderSettingsSchema = emailApiProviderShape.superRefine(checkProviderCredentials)

/**
 * Test provider API depuis le wizard de setup : + recipient.
 */
export const emailApiProviderSetupTestSchema = emailApiProviderShape
  .extend({ recipient: z.string().email('Email de test invalide') })
  .superRefine(checkProviderCredentials)
