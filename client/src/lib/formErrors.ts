/**
 * Filtre les motifs d'erreur sur les champs déjà touchés — on ne rougit pas un
 * champ vierge (R12a du design system). Le motif GLOBAL qui justifie le blocage
 * du bouton, lui, ne passe jamais par ce filtre (R12b).
 *
 * Les champs d'un fournisseur email HTTP sont un cas particulier qui vaut
 * d'être nommé : `validateProviderCredentials` clé leurs erreurs
 * `credentials.<champ>` alors que le formulaire ne suit qu'une seule clé
 * `credentials`. Sans ce repli, AUCUNE erreur de credential ne passerait le
 * filtre et tout le bloc HTTP perdrait ses motifs par champ ainsi que son
 * `aria-invalid`.
 */
export function visibleFieldErrors(
  errors: Record<string, string>,
  touched: Record<string, boolean>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors).filter(([field]) =>
      touched[field.startsWith('credentials.') ? 'credentials' : field]),
  )
}
