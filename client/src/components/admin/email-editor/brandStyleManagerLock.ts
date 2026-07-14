/**
 * Brand Style Manager Lock — masque les contrôles de style brand-owned
 * qui ne se persistent PAS dans le Style Manager de l'éditeur GrapesJS.
 *
 * Contexte : `bodyExtraction.ts` injecte des attributs de marque sur chaque
 * `<mj-button>` et `<mj-text>` à l'ouverture (`applyBrandButtonAttrs`,
 * `applyBrandFontFamily`), puis les strippe à la sauvegarde
 * (`stripBrandButtonAttrs`, `stripBrandFontFamily` via `BRAND_BUTTON_ATTR_RE`).
 * Toute édition de ces propriétés dans le Style Manager est silencieusement
 * jetée au save → le contrôle est malhonnête pour l'utilisateur.
 *
 * Solution : retirer ces propriétés de l'allowlist `stylable` de chaque
 * instance de composant ciblé, afin que le Style Manager ne les expose pas.
 *
 * Approche : on utilise la réécriture de `stylable` (et non `unstylable`)
 * car grapesjs-mjml définit un tableau `stylable` explicite par type de
 * composant. Retirer les entrées interdites de ce tableau est déterministe —
 * la propriété n'est simplement pas dans l'allowlist. L'approche `unstylable`
 * a été envisagée mais écartée : bien qu'elle fonctionne pour les propriétés
 * simples, son comportement sur les propriétés composites comme `border-radius`
 * (qui pilote 4 sous-propriétés de coins) est ambigu dans grapesjs 0.22.x —
 * le composite peut rester visible même si ses sous-props sont filtrées.
 * Trimmer `stylable` évite ce risque entièrement.
 */

// ---------------------------------------------------------------------------
// Denylists — propriétés à retirer de l'allowlist `stylable`
// ---------------------------------------------------------------------------

/**
 * Props à masquer sur `mj-button`.
 *
 * - `background-color` : injectée via `brand.primaryColor` par
 *   `applyBrandButtonAttrs` (bodyExtraction.ts), strippée au save.
 * - `border-radius` (+ 4 coins) : injecté via `brand.buttonBorderRadius`,
 *   strippé au save par `BRAND_BUTTON_ATTR_RE`.
 * - `font-family` : injecté via `brand.fontFamily` par `applyBrandFontFamily`,
 *   strippé au save.
 * - `color` : codé en dur `"#ffffff"` dans `applyBrandButtonAttrs`
 *   (ligne ~336 de bodyExtraction.ts), non configurable, strippé au save.
 *
 * IMPORTANT : `container-background-color` est EXCLU — c'est le fond de la
 * cellule, per-composant, persisté légitimement.
 */
export const BRAND_LOCKED_BUTTON_STYLE_PROPS: readonly string[] = [
  'background-color',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'font-family',
  'color',
]

/**
 * Props à masquer sur `mj-text`.
 *
 * - `font-family` : injecté via `brand.fontFamily` par `applyBrandFontFamily`,
 *   strippé au save.
 */
export const BRAND_LOCKED_TEXT_STYLE_PROPS: readonly string[] = ['font-family']

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Record component type → denylist. Central lookup for the walker. */
const BRAND_LOCKED_BY_TYPE: Record<string, readonly string[]> = {
  'mj-button': BRAND_LOCKED_BUTTON_STYLE_PROPS,
  'mj-text': BRAND_LOCKED_TEXT_STYLE_PROPS,
}

/**
 * Retire les entrées interdites du tableau `stylable` d'un composant.
 * Idempotent : un second appel ne modifie rien (les entrées sont déjà absentes).
 */
function trimStylable(
  comp: BrandLockableComponent,
  denylist: readonly string[],
): void {
  const current = comp.get('stylable')
  // Si `stylable` est true (tout autorisé) ou absent, on ne peut pas trimmer
  // un tableau. En pratique, grapesjs-mjml définit toujours un tableau explicite.
  if (!Array.isArray(current)) return

  const denySet = new Set(denylist)
  const trimmed = current.filter((p: string) => !denySet.has(p))

  // Éviter un set inutile si rien n'a changé (cas re-appel).
  if (trimmed.length === current.length) return

  comp.set({ stylable: trimmed })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Interface minimale d'un composant GrapesJS pour le brand lock.
 * Calqué sur `LockableComponent` de `shellStructureLock.ts`.
 */
export interface BrandLockableComponent {
  get: (key: string) => unknown
  set: (props: Record<string, unknown>) => void
}

/** Interface minimale d'un éditeur GrapesJS pour le brand lock. */
export interface BrandLockableEditor {
  getWrapper: () => BrandLockableTree | null | undefined
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
}

export interface BrandLockableTree {
  forEachChild: (fn: (comp: BrandLockableComponent & { get: (key: string) => unknown }) => void) => void
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applique le verrou brand-owned sur le Style Manager :
 * - Parcourt l'arbre de composants et retire les props interdites du
 *   `stylable` de chaque instance `mj-button` / `mj-text`.
 * - Enregistre un listener `component:add` pour couvrir les composants
 *   ajoutés ultérieurement via la palette de blocs.
 *
 * Idempotent : un second appel ne duplique pas les entrées déjà retirées.
 *
 * @param editor L'instance Editor GrapesJS.
 * @returns Un handle avec `uninstall()` pour détacher le listener.
 */
export interface BrandStyleLockHandle {
  uninstall: () => void
}

export function applyBrandStyleManagerLock(editor: BrandLockableEditor): BrandStyleLockHandle {
  // --- 1. Walk existing tree (couvre le chargement initial + setMjmlSilently) ---
  walkAndLock(editor)

  // --- 2. Listener pour les composants ajoutés après le load ---
  // `component:add` fire pour chaque composant créé par `setComponents`
  // ET pour ceux ajoutés via la palette de blocs. On filtre par type.
  let active = true
  const onComponentAdd = (...args: unknown[]): void => {
    if (!active) return
    const comp = args[0] as BrandLockableComponent | undefined
    if (!comp) return
    const type = comp.get('type') as string | undefined
    if (!type) return
    const denylist = BRAND_LOCKED_BY_TYPE[type]
    if (denylist) {
      trimStylable(comp, denylist)
    }
  }

  editor.on('component:add', onComponentAdd)

  return {
    uninstall: () => {
      active = false
      // Détache réellement le listener — l'Editor grapesjs expose `off`.
      // Le flag `active` reste un garde-fou contre un re-fire concurrent.
      editor.off('component:add', onComponentAdd)
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parcourt l'arbre et applique le lock sur toutes les instances ciblées.
 * Utilise `forEachChild` (récursif) pour couvrir l'arbre complet, y compris
 * les composants imbriqués dans des colonnes/sections.
 */
function walkAndLock(editor: BrandLockableEditor): void {
  const wrapper = editor.getWrapper()
  if (!wrapper) return

  // Itérer tous les composants et filtrer par type.
  // On n'utilise pas `wrapper.find()` car le sélecteur par type n'est
  // pas garanti par l'interface minimale. `forEachChild` parcourt tout
  // l'arbre récursivement.
  wrapper.forEachChild((comp) => {
    const type = comp.get('type') as string | undefined
    if (!type) return
    const denylist = BRAND_LOCKED_BY_TYPE[type]
    if (denylist) {
      trimStylable(comp as BrandLockableComponent, denylist)
    }
  })
}
