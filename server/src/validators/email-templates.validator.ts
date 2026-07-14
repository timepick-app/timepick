import { z } from 'zod'
import { TEMPLATE_KEYS, type TemplateKey } from '../db/email-templates.db'
import { STRICT_EMAIL_REGEX } from '../services/emailValidator.service'

// --- Constants ---

export const MAX_BODY_MJML_BYTES = 65_536 // 64 KiB
export const MAX_TEXT_LENGTH = 4_096

// --- Path param validation ---

// slot_modification a un corps DYNAMIQUE (assemblé au runtime, sans marqueurs
// INTRO/SIG) et n'est pas éditable via cet éditeur. On l'exclut du schéma de
// param pour que get/patch/test-send le rejettent proprement en 400 (au lieu
// d'atteindre la projection et d'échouer en 500).
const EDITABLE_TEMPLATE_KEYS = TEMPLATE_KEYS.filter((k) => k !== 'slot_modification')

export const templateKeyParamSchema = z.enum(
  EDITABLE_TEMPLATE_KEYS as [TemplateKey, ...TemplateKey[]],
  {
    error: () => `templateKey doit être l'un de: ${EDITABLE_TEMPLATE_KEYS.join(', ')}`,
  },
)

// --- PATCH body schemas ---

export const invitationPatchSchema = z
  .object({
    bodyMjml: z
      .string({
        error: (issue) => issue.input === undefined ? 'bodyMjml est requis' : 'bodyMjml doit être une chaîne',
      })
      .min(1, 'bodyMjml ne peut pas être vide')
      .refine(
        (s) => Buffer.byteLength(s, 'utf8') <= MAX_BODY_MJML_BYTES,
        `bodyMjml ne peut pas dépasser ${MAX_BODY_MJML_BYTES} octets`,
      ),
  })
  .strict()

export const systemTemplatePatchSchema = z
  .object({
    introText: z
      .string({
        error: (issue) => issue.input === undefined ? 'introText est requis' : 'introText doit être une chaîne',
      })
      .min(1, 'introText ne peut pas être vide')
      .max(MAX_TEXT_LENGTH, `introText ne peut pas dépasser ${MAX_TEXT_LENGTH} caractères`),
    signatureText: z
      .string({
        error: (issue) => issue.input === undefined ? 'signatureText est requis' : 'signatureText doit être une chaîne',
      })
      .min(1, 'signatureText ne peut pas être vide')
      .max(MAX_TEXT_LENGTH, `signatureText ne peut pas dépasser ${MAX_TEXT_LENGTH} caractères`),
  })
  .strict()

// --- Runtime discriminator ---

export function pickPatchSchema(templateKey: TemplateKey) {
  return templateKey === 'invitation' ? invitationPatchSchema : systemTemplatePatchSchema
}

// --- Test-send body (Task 46) ---

export const testSendBodySchema = z
  .object({
    to: z
      .string({
        error: (issue) => issue.input === undefined ? 'to est requis' : 'to doit être une chaîne',
      })
      .trim()
      .regex(STRICT_EMAIL_REGEX, 'Adresse email invalide'),
  })
  .strict()
