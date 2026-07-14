/**
 * Compose un nom d'affichage à partir d'un prénom et d'un nom.
 *
 * Retourne « Prénom Nom » quand les deux sont présents, « Prénom » seul pour
 * un mononyme (`lastName` null/vide), et chaîne vide si rien n'est fourni — la
 * valeur de repli (« - », « Sans nom »…) reste à la charge de l'appelant.
 *
 * Ne rend JAMAIS le texte littéral « undefined »/« null » ni d'espace de fin
 * parasite. Accepte des entrées nullable car le type central `User` expose
 * `firstName`/`lastName` comme optionnels.
 */
export function formatFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  const first = (firstName ?? '').trim()
  const last = (lastName ?? '').trim()
  return first && last ? `${first} ${last}` : first || last
}
