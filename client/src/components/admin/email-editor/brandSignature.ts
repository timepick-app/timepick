/**
 * Plan 5a defer-A — décision de rebuild canvas sur changement de signature brand,
 * en fonction de l'état dirty.
 *
 * Deux familles de champs brand pilotent le rebuild :
 *  - preview : champs purement visuels (couleur primaire, police, arrondi des
 *    boutons) appliqués côté client par `wrapBodyForEditing`. Le dirty tracker
 *    est brand-agnostique (le brand est strippé avant comparaison), donc les
 *    appliquer même canvas dirty ne perd aucun édit et ne réinitialise pas le
 *    dirty state. Ils sont sourçables depuis le canvas live.
 *  - structural : champs serveur-interpolés ou structurels (logo, couleur de
 *    fond du `<mj-body>`, header/footer résolus) dont l'application correcte
 *    dépend du contexte éditeur serveur. Les appliquer sur un canvas dirty
 *    exigerait un sourcing editor-context qui écraserait les éditions non
 *    sauvegardées → à différer jusqu'au prochain état propre.
 *
 * Décisions :
 *  - 'skip'         : rien à appliquer maintenant (aucun changement, ou seul un
 *                     changement structurel survient pendant que le canvas est
 *                     dirty → différé).
 *  - 'preview-dirty': canvas dirty + un changement preview → rebuild sourcé du
 *                     canvas live, sans re-base d'ancres ni reset dirty. Un
 *                     éventuel changement structurel co-pendant reste différé.
 *  - 'full'         : canvas propre → rebuild complet sourcé editor-context, avec
 *                     re-base des ancres et reset dirty (comportement historique).
 */
export type BrandRebuildDecision = 'skip' | 'preview-dirty' | 'full'

export function decideBrandRebuild(
  prevPreview: string,
  prevStructural: string,
  nextPreview: string,
  nextStructural: string,
  isDirty: boolean,
): BrandRebuildDecision {
  const previewChanged = prevPreview !== nextPreview
  const structuralChanged = prevStructural !== nextStructural
  if (!previewChanged && !structuralChanged) return 'skip'
  if (isDirty) {
    // On applique le preview dès qu'il change, même si un changement structurel
    // est co-pendant (ce dernier sera rejoué une fois le canvas propre). Un
    // changement purement structurel pendant dirty est différé.
    return previewChanged ? 'preview-dirty' : 'skip'
  }
  return 'full'
}
