/**
 * Capacité d'écran exigée par l'éditeur d'e-mails.
 *
 * L'éditeur repose sur du glisser-déposer que le moteur GrapesJS ne sait pas
 * rendre au doigt, et sa mise en page réclame une place que certains appareils
 * n'ont pas. Sur un appareil qui ne pourra JAMAIS l'afficher, l'entrée est
 * retirée plutôt qu'offerte puis trahie — c'est la règle « si une action n'est
 * pas permise dans le contexte courant, elle est retirée de l'interface, jamais
 * affichée puis neutralisée » de la politique de personnalisation de la coque
 * e-mail.
 *
 * ⚠️ Le critère porte sur la capacité de l'ÉCRAN, jamais sur la largeur de la
 * FENÊTRE — et ce n'est pas une nuance de style. Une fenêtre se redimensionne
 * pendant une session : brancher le refus dessus rendrait le prédicat variable
 * en cours d'édition, et démonterait l'éditeur AVEC sa confirmation « Quitter
 * sans enregistrer ? », qui vit dans le même composant. Il n'existe ni
 * brouillon, ni enregistrement automatique : le travail en cours disparaîtrait
 * sans un mot. La capacité d'un écran, elle, ne change pas — ni au
 * redimensionnement, ni à la rotation (voir la formule ci-dessous). Un test
 * verrouille cet invariant.
 */

/**
 * Seuil unique — source de vérité, jamais recopiée.
 *
 * Dérivé du besoin réel mesuré, sans marge de confort : la bande d'onglets de
 * la colonne latérale réclame 140 points incompressibles, un corps d'e-mail
 * standard en fait 600, soit 740 arrondis à 800 pour les marges du canevas ; en
 * hauteur, 600 points d'écran laissent environ 400 points de canevas une fois
 * retirés le cadre du navigateur et la barre d'outils.
 *
 * Toute marge ajoutée ici se paierait en refus injustifiés : la valeur d'écran
 * est exprimée dans la même unité que la mise en page, donc un utilisateur
 * zoomé à 200 % est mesuré à la moitié — mais l'éditeur lui coûte aussi la
 * moitié. Un seuil calé sur le besoin reste juste à tout niveau de zoom ; une
 * marge, non.
 */
export const EDITOR_MIN_SCREEN = { width: 800, height: 600 } as const

/** Ce que le prédicat lit d'un écran. Rien d'autre n'entre dans la décision. */
interface ScreenSize {
  readonly width?: number | null
  readonly height?: number | null
}

/**
 * Vrai si l'écran peut afficher l'éditeur dans sa MEILLEURE orientation.
 *
 * On compare le grand côté à la largeur requise et le petit côté à la hauteur
 * requise : la formule est donc insensible à l'orientation, y compris sur iOS
 * Safari qui ne permute pas ces valeurs à la rotation. Les deux dimensions sont
 * exigées — un critère sur la seule largeur laisserait passer les téléphones
 * récents, dont le grand côté atteint 852 à 932 points.
 *
 * Repli ouvert : mesure absente, nulle ou absurde → on ne refuse rien. Les
 * navigateurs durcis contre le pistage falsifient cette valeur, toujours vers
 * le bas ; le seul risque acceptable est de laisser entrer quelqu'un à tort.
 *
 * Le résultat ne change pas pendant une session : l'appeler au rendu suffit,
 * inutile de l'abonner à quoi que ce soit.
 */
export function canDeviceDisplayEmailEditor(
  size: ScreenSize = window.screen,
): boolean {
  const { width, height } = size

  if (!(typeof width === 'number' && width > 0)) return true
  if (!(typeof height === 'number' && height > 0)) return true

  return (
    Math.max(width, height) >= EDITOR_MIN_SCREEN.width &&
    Math.min(width, height) >= EDITOR_MIN_SCREEN.height
  )
}
