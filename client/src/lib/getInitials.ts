/**
 * Initiales d'une pastille avatar : premier caractère du prénom + premier
 * caractère du nom, en majuscules (décision verrouillée 2 de l'Epic « Refonte
 * du profil membre »).
 *
 * Le premier caractère est pris sur le champ BRUT, sans découpe par segment :
 * « Jean-Pierre » → « J » (et non « JP »). Un mononyme (`lastName` null/vide)
 * rend une seule initiale ; si prénom ET nom sont vides → repli « ? ».
 *
 * Uppercasing natif JS, donc correct pour les accents (« é » → « É »). Accepte
 * un `lastName` nullable car le type central `User` l'expose comme optionnel.
 */
export function getInitials(
  firstName: string,
  lastName: string | null | undefined
): string {
  const first = firstName.trimStart()[0]?.toUpperCase() ?? ''
  const last = (lastName ?? '').trimStart()[0]?.toUpperCase() ?? ''
  return first + last || '?'
}
