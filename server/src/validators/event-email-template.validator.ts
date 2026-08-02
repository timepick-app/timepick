import { z } from 'zod'
import { MAX_BODY_MJML_BYTES, optionalSubjectSchema } from './email-templates.validator'

// --- Path param validation ---

export const eventIdParamSchema = z
  .string({
    error: (issue) => issue.input === undefined ? 'eventId est requis' : 'eventId doit être une chaîne',
  })
  .uuid({ message: 'eventId doit être un UUID valide' })

// --- PATCH body schema ---
//
// Volontairement IDENTIQUE à `invitationPatchSchema` (modèles généraux).
//
// Ne pas y réintroduire d'exigence sur les marqueurs `<!-- BODY:START -->` /
// `<!-- BODY:END -->` : ce sont des bornes de découpage CÔTÉ CLIENT, pas un
// contrat de charge utile. L'extraction du corps dans l'éditeur renvoie le
// contenu ENTRE les marqueurs, donc sans eux — une telle exigence rend
// l'enregistrement par événement structurellement impossible (elle l'a été de
// 2026-05-02 au 2026-07-31). Les marqueurs n'ont par ailleurs aucun effet
// serveur : le corps est lu, inséré dans la coque et stocké tel quel.
export const patchEventEmailTemplateSchema = z
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
    // Un événement ne surcharge que l'invitation : mêmes jetons admissibles
    // que le modèle général. `null` = revenir à l'héritage.
    subject: optionalSubjectSchema('invitation'),
  })
  .strict()
