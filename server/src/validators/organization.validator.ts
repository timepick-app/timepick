import { z } from 'zod'
import { sanitizeRichText } from '../utils/sanitize-rich-text'

/**
 * Validation schema for PUT /api/admin/settings/organization (+ the
 * `/api/setup/organization` mirror). Follows `config.validator.ts`'s style
 * (custom `error` messages, French copy) — `formatApiError` (defined there)
 * is reused as-is by the controller for the 400/500 response split.
 *
 * `name` accepte la chaîne vide : le nom n'est pas ce qui rend l'identité
 * enregistrable, c'est ce qui la rend visible. Sans nom, la façade publique
 * ne montre rien aux visiteurs (elle retombe sur `/login`), mais la
 * description et le logo restent enregistrés normalement — d'où l'absence
 * de `.min(1)` ici : seule la CLÉ `name` est requise (absente ⇒ 400), sa
 * valeur peut être vide.
 *
 * `homepageFacade` is intentionally left optional with NO `.default()`:
 * "absent ⇒ homepage_mode stays unchanged" is a service-layer concern
 * (`organization.service.ts#saveOrganizationSettings`), not something this
 * schema can express — a default here would make "unset" indistinguishable
 * from "explicitly false".
 */

const MAX_NAME_LENGTH = 200
// La description est du HTML riche (même contrat que la description
// d'événement). Le compteur client borne le texte VISIBLE à 1000 caractères
// (`ORGANIZATION_DESCRIPTION_MAX_LENGTH`) ; la marge x5 absorbe le balisage
// `<strong>` / `<a href="…">` produit par l'éditeur.
const MAX_DESCRIPTION_LENGTH = 5000

export const organizationSettingsSchema = z.object({
  name: z
    .string({
      error: (issue) => (issue.input === undefined ? "Le nom de l'organisation est requis" : "Le nom de l'organisation doit être une chaîne de caractères"),
    })
    .trim()
    .max(MAX_NAME_LENGTH, `Le nom ne peut pas dépasser ${MAX_NAME_LENGTH} caractères`),

  description: z
    .string({
      error: () => 'La description doit être une chaîne de caractères',
    })
    .max(MAX_DESCRIPTION_LENGTH, `La description ne peut pas dépasser ${MAX_DESCRIPTION_LENGTH} caractères`)
    // Défense en profondeur : le client sanitise déjà avant envoi, le serveur
    // revalide à l'écriture (allowlist p/br/strong/em/a, liens http(s)).
    .transform(sanitizeRichText)
    .optional()
    .default(''),

  homepageFacade: z
    .boolean({
      error: () => 'homepageFacade doit être un booléen',
    })
    .optional(),
})
