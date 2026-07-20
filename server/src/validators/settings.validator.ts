import { z } from 'zod'

/**
 * Schéma de validation pour la mise à jour des paramètres SMTP (PUT /settings/smtp)
 *
 * Champs requis : smtpHost, smtpPort, smtpSecure
 * Champs optionnels : smtpUser, smtpPassword, smtpFromName, smtpFromEmail
 *
 * Le mot de passe peut être :
 * - Une valeur réelle (sera chiffrée avant stockage)
 * - Le sentinelle "****" (préserve l'ancien mot de passe)
 * - Vide "" (préserve l'ancien mot de passe)
 */
export const smtpSettingsSchema = z.object({
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

/**
 * Schéma de validation pour le test de connexion SMTP (POST /settings/smtp/test)
 *
 * Mêmes champs que smtpSettingsSchema, mais le sentinelle "****" est rejeté
 * car on ne peut pas tester une connexion avec le mot de passe masqué.
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

/**
 * Chantier C — providers email HTTP (transport API, alternative au SMTP).
 *
 * Dispatch contrôleur : `body.provider` absent ou 'smtp' → schémas SMTP
 * ci-dessus (chemin historique intact) ; 'resend' → schémas ci-dessous.
 * 'brevo' est réservé (type DB + client conçus pour l'accueillir) mais REFUSÉ
 * ici tant que son transport n'est pas implémenté — jamais de config
 * enregistrable sans transport derrière.
 *
 * Sentinelle '****' pour la clé API : à la sauvegarde comme au test, '' et
 * '****' signifient « utiliser la clé stockée » (résolue côté serveur). Le test
 * valide donc la clé RÉELLEMENT stockée — contrairement au test SMTP qui ne
 * teste qu'un mot de passe saisi à la main.
 */
export const emailApiProviderSettingsSchema = z.object({
  provider: z.enum(['resend'], {
    error: () => "Provider email non supporté (disponibles : smtp, resend)"
  }),

  // '' ou '****' → préserve la clé stockée (sentinelle, cf. smtp_password)
  emailApiKey: z.string().optional(),

  smtpFromName: z.string().optional(),
  smtpFromEmail: z.string().email("L'email de l'expéditeur doit être une adresse email valide").optional().or(z.literal(''))
})

/**
 * Test provider API depuis le wizard de setup : + recipient.
 */
export const emailApiProviderSetupTestSchema = emailApiProviderSettingsSchema.extend({
  recipient: z.string().email('Email de test invalide'),
})
