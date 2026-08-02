/**
 * Taille d'écran de l'environnement de test.
 *
 * jsdom rapporte un écran de 0 × 0, valeur qu'aucun appareil réel ne produit :
 * tout code qui décide d'après la capacité de l'écran y classerait
 * l'environnement de test en « appareil incapable ». `setup.ts` pose donc un
 * écran de bureau par défaut, et le rétablit avant chaque test — un fichier qui
 * vise l'autre branche appelle `setTestScreen` sans avoir à nettoyer derrière
 * lui.
 */
export const DEFAULT_TEST_SCREEN = { width: 1920, height: 1080 } as const

/** `screen.width` / `screen.height` sont en lecture seule : on les redéfinit. */
export function setTestScreen(width: number, height: number): void {
  Object.defineProperty(window.screen, 'width', { value: width, configurable: true })
  Object.defineProperty(window.screen, 'height', { value: height, configurable: true })
}
