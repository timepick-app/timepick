/**
 * L3b/L4 (2026-06-06) — décision de routage PUT/DELETE/skip d'un leg shell
 * (`header` / `footer` / `mj-body`), extraite en fonction PURE pour être
 * réutilisée par les chemins de `handleSave` sans dérive (invitation/event).
 *
 * IMPORTANT — périmètre de la coque commune. Les legs γ `header` et `mj-body`
 * (propriétaire commun `template[invitation]`, D8 — voir `COMMON_SHELL_OWNER`)
 * sont éditables UNIQUEMENT depuis l'onglet **Invitation**. Dans les éditeurs
 * **système**, la coque est VERROUILLÉE en lecture seule : on n'y sauve que
 * `introText` / `signatureText` (modèle Lot 1), jamais `header`/`mj-body`. Il
 * n'existe donc PAS de branche système redirigeant ces legs vers
 * `template[invitation]`.
 *
 * La décision de routage est IDENTIQUE pour les 3 parts ; seul l'**owner** du
 * leg diffère. Isoler la logique ici garantit qu'un futur ajustement (p.ex.
 * nouvelle règle d'aller-retour cascade) ne diverge pas entre chemins.
 */

/** Sous-ensemble des actions de leg shell (pas de `patch`, réservé au corps/brand). */
export type ShellLegAction = 'put' | 'delete' | 'skip'

/**
 * Décide l'action d'un leg shell à partir de son état dirty et de sa relation
 * à la cascade résolue :
 * - `!dirty` → `skip` (rien à pousser) ;
 * - `dirty` ET canvas ≠ cascade résolue → `put` (matérialiser la surcharge) ;
 * - `dirty` ET canvas === cascade résolue → `delete` si la surcharge vit au
 *   niveau courant (`origin === ownerKind`), sinon `skip` (aller-retour vers
 *   un parent de cascade : rien à matérialiser).
 *
 * Pour le leg édité au canvas, `origin === 'template'` ⟺ la surcharge vit à
 * `template[invitation]` (D8 interdit toute row `template[<systemKey>]`
 * header/mj-body), donc `origin === ownerKind` ('template') route bien un
 * DELETE-sur-match vers le propriétaire commun. NB : en système la coque est
 * verrouillée (lecture seule), ce leg n'est routé QUE depuis l'onglet Invitation.
 */
export function routeShellLegAction(args: {
  dirty: boolean
  /** canvas (normalisé) === résolu cascade (normalisé). */
  canvasMatchesCascade: boolean
  /** `editorContext[part].origin` — niveau qui possède la valeur résolue. */
  origin: string | undefined
  ownerKind: string | undefined
}): ShellLegAction {
  if (!args.dirty) return 'skip'
  if (!args.canvasMatchesCascade) return 'put'
  return args.origin === args.ownerKind ? 'delete' : 'skip'
}

/**
 * D8 — owner partagé des parts γ éditables au canvas (`header` + `mj-body`).
 * Le bloc `template[invitation]` est la source inter-modèles (promotion γ,
 * cf. la politique de structure verrouillée des emails, section « Promotion γ »). Cet owner n'est écrit QUE
 * depuis l'onglet **Invitation** ; dans les éditeurs système la coque est
 * verrouillée (lecture seule), aucun leg `header`/`mj-body` n'y est poussé.
 * On n'écrit JAMAIS de row `template[<systemKey>]` header/mj-body (sinon
 * surcharge fantôme par-template).
 */
export const COMMON_SHELL_OWNER = { ownerKind: 'template' as const, ownerId: 'invitation' as const }
