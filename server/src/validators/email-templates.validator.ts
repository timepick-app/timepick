import { z } from 'zod'
import { TEMPLATE_KEYS, type TemplateKey } from '../db/email-templates.db'
import { STRICT_EMAIL_REGEX } from '../services/emailValidator.service'
import {
  MAX_SUBJECT_LENGTH,
  findUnsupportedSubjectTokens,
  normalizeSubject,
} from '../lib/email-subject'

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

// --- Objet ---

/**
 * Champ « objet », dépendant du modèle : la liste des jetons admissibles n'est
 * pas la même d'un modèle à l'autre (une variable qu'un modèle ne fournit pas
 * s'interpolerait en vide). D'où une FABRIQUE plutôt qu'un schéma constant.
 *
 * Ordre des contrôles, et il compte : on nettoie D'ABORD (un objet est une
 * ligne), puis on juge le résultat nettoyé. Une chaîne de trois espaces est
 * vide, pas « longue de trois », et une longueur mesurée avant nettoyage
 * refuserait un objet qui tient une fois rabattu.
 *
 * Le jeton inconnu ou interdit est un REFUS, pas un avertissement : le moteur
 * le laisserait littéralement dans l'objet, accolades comprises, jusque dans la
 * boîte du destinataire. Le message le nomme, sinon il n'est pas actionnable.
 */
function subjectSchema(templateKey: TemplateKey) {
  return z
    .string({
      error: (issue) =>
        issue.input === undefined ? 'subject est requis' : 'subject doit être une chaîne',
    })
    .transform(normalizeSubject)
    .refine((s) => s.length > 0, "L'objet ne peut pas être vide")
    // `abort` : sans lui, Zod poursuit la chaîne et le balayage des jetons
    // (quadratique en nombre de jetons distincts) tournerait quand même sur un
    // objet hors plafond, jusqu'à 100 Ko — la limite de corps d'`express.json`.
    .refine((s) => s.length <= MAX_SUBJECT_LENGTH, {
      error: `L'objet ne peut pas dépasser ${MAX_SUBJECT_LENGTH} caractères`,
      abort: true,
    })
    .superRefine((s, ctx) => {
      const unsupported = findUnsupportedSubjectTokens(s, templateKey)
      if (unsupported.length === 0) return
      ctx.addIssue({
        code: 'custom',
        message:
          unsupported.length === 1
            ? `La variable ${unsupported[0]} n'est pas autorisée dans l'objet de ce modèle.`
            : `Ces variables ne sont pas autorisées dans l'objet de ce modèle : ${unsupported.join(', ')}.`,
      })
    })
}

/**
 * `null` efface la personnalisation (retour à l'objet d'usine) ; absent = ne
 * touche pas à l'objet. Les deux sont nécessaires : le PATCH porte aussi le
 * corps, et un enregistrement qui ne change que le corps ne doit pas réécrire
 * l'objet.
 */
export function optionalSubjectSchema(templateKey: TemplateKey) {
  return subjectSchema(templateKey).nullable().optional()
}

// --- PATCH body schemas ---

const bodyMjmlSchema = z
  .string({
    error: (issue) => issue.input === undefined ? 'bodyMjml est requis' : 'bodyMjml doit être une chaîne',
  })
  .min(1, 'bodyMjml ne peut pas être vide')
  .refine(
    (s) => Buffer.byteLength(s, 'utf8') <= MAX_BODY_MJML_BYTES,
    `bodyMjml ne peut pas dépasser ${MAX_BODY_MJML_BYTES} octets`,
  )

export const invitationPatchSchema = z
  .object({
    bodyMjml: bodyMjmlSchema,
    subject: optionalSubjectSchema('invitation'),
  })
  .strict()

const systemTextSchema = (field: 'introText' | 'signatureText') =>
  z
    .string({
      error: (issue) => issue.input === undefined ? `${field} est requis` : `${field} doit être une chaîne`,
    })
    .min(1, `${field} ne peut pas être vide`)
    .max(MAX_TEXT_LENGTH, `${field} ne peut pas dépasser ${MAX_TEXT_LENGTH} caractères`)

export const systemTemplatePatchSchema = z
  .object({
    introText: systemTextSchema('introText'),
    signatureText: systemTextSchema('signatureText'),
  })
  .strict()

// --- Runtime discriminator ---

/**
 * Le schéma de PATCH dépend du modèle sur DEUX axes, pas un :
 * — la forme du corps (invitation = MJML brut, système = deux zones) ;
 * — les jetons admissibles dans l'objet, propres à chaque modèle.
 * `magic_link_login` ajoute un troisième champ, `subjectAdmin` : c'est le seul
 * modèle à deux objets. Les autres clés système restent `.strict()` sans lui,
 * pour qu'une charge qui le porterait par erreur soit refusée plutôt
 * qu'ignorée.
 */
export function pickPatchSchema(templateKey: TemplateKey) {
  if (templateKey === 'invitation') return invitationPatchSchema
  if (templateKey === 'magic_link_login') {
    return systemTemplatePatchSchema.extend({
      subject: optionalSubjectSchema('magic_link_login'),
      subjectAdmin: optionalSubjectSchema('magic_link_login'),
    })
  }
  return systemTemplatePatchSchema.extend({
    subject: optionalSubjectSchema(templateKey),
  })
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
