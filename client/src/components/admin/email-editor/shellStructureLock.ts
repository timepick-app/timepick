/**
 * Helpers de verrou structurel consommés par `applyShellLocks` dans
 * `grapesConfig.ts`. Périmètre réduit post-suppression du controller
 * (`shellLockController.ts`) : seuls les helpers effectivement réutilisés
 * subsistent.
 *
 * - `CARD_LOCK_PROPS` / `applyCardLock` — verrouille la carte mj-wrapper
 *   (sélectionnable et stylable, figée structurellement).
 * - `DESCENDANT_LOCK_PROPS_FROZEN` / `applyShellDescendantLockFrozen` —
 *   gèle récursivement tous les descendants (`editable: false`) ; seules
 *   les 2 zones accroche/signature sont ensuite ré-ouvertes.
 * - `reEnableEditableZones` — ré-active `editable: true` sur les composants
 *   identifiés par css-class après gel contraint.
 * - `SYSTEM_EDITABLE_ZONE_CLASSES` — classes CSS des 2 zones éditables
 *   (réutilisées par `systemCanvas.ts` et `MjmlEditorOverlayInner.tsx`).
 */

// Plan carte-éditable (2026-06-08) — la carte (content-wrapper) est SÉLECTIONNABLE
// (pour éditer fond/cadre dans le Style Manager) mais figée structurellement.
// Classe DISTINCTE de locked-shell → hors comptage 3-sections du lock controller.
export const CARD_LOCKED_CLASS = 'locked-card'
export const CARD_LOCK_PROPS = {
  selectable: true,
  draggable: false,
  removable: false,
  copyable: false,
  toolbar: [],
} as const

// Propriétés exposées au Style Manager pour la carte (grapesjs-mjml filtre par
// `stylable` ET masque les propriétés hors-stylable). Sans ça, les contrôles
// fond/bordures/arrondi n'apparaîtraient pas sur le <mj-wrapper> sélectionné.
export const CARD_STYLABLE = [
  'background-color',
  'border-radius',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
] as const

// Bordures par côté exposées au Style Manager pour les sections en-tête / pied
// (mj-section), comme la carte. grapesjs-mjml filtre par `stylable` : sans cet
// ajout, les contrôles border-top/right/bottom/left (composites enregistrés
// dans Decorations par « Plan A3 » de grapesConfig) n'apparaissent pas sur une
// section sélectionnée. Régression Lot 2 : applyShellRootLock ne posait plus ce
// stylable que l'ancien applyShellSectionLock appendait.
export const SECTION_BORDER_STYLABLE = [
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
] as const

/**
 * L3a — variante « mode contraint » de `DESCENDANT_LOCK_PROPS` : identique
 * mais `editable: false`. Gèle le texte de tous les descendants du corps
 * système ; seules les 2 zones accroche/signature sont ré-ouvertes ensuite
 * via `reEnableEditableZones`.
 */
export const DESCENDANT_LOCK_PROPS_FROZEN = {
  selectable: true,
  editable: false,
  draggable: false,
  removable: false,
  copyable: false,
  droppable: false,
  toolbar: [],
} as const

/**
 * L3a — css-class identifiant les 2 zones de texte éditables des emails
 * système (accroche + signature). Source unique réutilisée par la composition
 * canvas (`systemCanvas.ts`), la ré-activation du lock contraint
 * (`reEnableEditableZones`) et le threading depuis l'overlay (`MjmlEditorOverlayInner`).
 */
export const SYSTEM_EDITABLE_ZONE_CLASSES = ['tp-edit-intro', 'tp-edit-sig'] as const

export interface LockableComponent {
  set: (props: Record<string, unknown>) => void
  get: (key: string) => unknown
  addAttributes?: (attrs: Record<string, string>) => void
  components?: () => { models: LockableComponent[] } | undefined
}

// Plan carte-éditable (2026-06-08) — verrouille la carte mj-wrapper : figée
// structurellement (non déplaçable/supprimable). `opts.editable` (défaut true)
// pilote l'affordance Style Manager :
//  • editable=true  (éditeur Invitation) : carte sélectionnable + stylable
//    (fond/bordures/arrondi) — miroir d'applyShellSectionLock.
//  • editable=false (mode système)        : carte NON sélectionnable + NON
//    stylable, miroir du Frame mj-body verrouillé. La branche système de
//    handleSave ne persiste que {introText, signatureText} (cf. la politique
//    de personnalisation de la coque email) ; laisser la carte stylable
//    serait une silent-failure (LOCK⟺SAVE).
// `toolbar` fresh array par appel (même raison que applyShellSectionLock).
export function applyCardLock(
  card: LockableComponent,
  opts: { editable?: boolean } = {},
): void {
  const editable = opts.editable ?? true
  // `name: 'Body'` — libellé Layer panel (la carte content-wrapper EST le corps
  // visuel). Évite le « Wrapper » générique de grapesjs-mjml. Cohérent avec
  // Frame (mj-body) / Header / Footer.
  if (editable) {
    card.set({ ...CARD_LOCK_PROPS, toolbar: [], stylable: [...CARD_STYLABLE], name: 'Body' })
    return
  }
  // Mode système — miroir du Frame mj-body verrouillé (selectable:false +
  // stylable:[]) : aucune édition fond/bordure ne serait persistée par la
  // branche système de handleSave (silent-failure, cf. la politique de personnalisation de la coque email).
  card.set({ ...CARD_LOCK_PROPS, selectable: false, toolbar: [], stylable: [], name: 'Body' })
}

/**
 * L3a — variante « mode contraint » de `applyShellDescendantLock` : gèle
 * récursivement tous les descendants avec `editable: false` (le reste des
 * flags est identique). Utilisée pour les emails système où seul le texte des
 * 2 zones accroche/signature est éditable — toutes les autres parties du corps
 * (CTA `mj-button`, marqueurs INTRO/SIG, colonnes) restent figées et donc non
 * éditables ET non supprimables. `reEnableEditableZones` ré-active ensuite
 * `editable: true` sur les 2 zones identifiées par css-class.
 */
export function applyShellDescendantLockFrozen(descendant: LockableComponent): void {
  descendant.set({ ...DESCENDANT_LOCK_PROPS_FROZEN, toolbar: [] })
  const children = descendant.components?.()?.models ?? []
  children.forEach(applyShellDescendantLockFrozen)
}

export interface ShellWrapperLike {
  find: (selector: string) => LockableComponent[]
}

/**
 * L3a — ré-active `editable: true` sur les composants identifiés par les
 * css-class fournies (zones de texte intro/sig), APRÈS le gel contraint des
 * descendants. Sélecteur attribut `[css-class~="…"]` au niveau MODÈLE (jamais
 * `.classe` — mémoire `feedback_grapesjs_find_css_class`). Retourne le nombre
 * de zones ré-activées pour permettre un fail-loud appelant si 0 (canvas
 * système dégénéré). `toolbar: []` fraîche par appel (cf. `applyShellSectionLock`).
 */
export function reEnableEditableZones(
  wrapper: ShellWrapperLike,
  classes: readonly string[],
): number {
  let count = 0
  for (const cls of classes) {
    const zones = wrapper.find(`[css-class~="${cls}"]`) ?? []
    for (const zone of zones) {
      zone.set({ ...DESCENDANT_LOCK_PROPS_FROZEN, editable: true, toolbar: [] })
      count += 1
    }
  }
  return count
}

/**
 * Plan 1.5 (2026-05-23 post-smoke v2) — Frame signal CSS class applied
 * directly on the mj-body DOM view element so the iframe stylesheet can
 * scope its outline + padding signal via `.tp-frame-signal` (the auto
 * `data-gjs-type="mj-body"` attribute observed empirically NOT to land on
 * the rendered element in grapesjs 0.22.15 + grapesjs-mjml 1.0.8, so any
 * selector relying on it produced zero match).
 */
const MJ_BODY_FRAME_SIGNAL_CLASS = 'tp-frame-signal'

/**
 * Plan 1.5 v5 (2026-05-23 post-smoke v4) — Stylable + Unstylable allowlists
 * scoped to the mj-body Frame.
 *
 * Critical insight from grapesjs source (`Property.__checkVisibility`
 * in `style_manager/model/Property.ts`) : the `stylable` filter matches
 * `property.getName()` which returns `this.get('property')` — i.e. the
 * CSS property NAME, NOT the property `id`. Empirical confirmation came
 * from the smoke v4 where padding controls registered with IDs
 * `mj-body-padding-top` etc. never appeared, despite being in `stylable`,
 * because `stylable.indexOf(property)` looked for the literal `padding-top`
 * (CSS name) and our IDs didn't match. All Dimension properties failed
 * visibility → sector `visible: false` (`StyleManager.__upPropsVis`
 * computes `props.some(p => p.isVisible())`) → sector hidden in the UI.
 *
 * Resolution :
 * - `stylable` lists CSS property names (3 supported).
 * - `unstylable` masks the plugin's composite `padding` parent and the
 *   other Dimension properties (margin, width, etc.) that would otherwise
 *   match no rule but still render. Without `unstylable`, the composite
 *   `padding` (which carries `getName() = 'padding'` and contains 4 sub
 *   children) wouldn't be in `stylable` → it'd be hidden anyway, BUT the
 *   sub children of the detached composite render as siblings in the UI,
 *   so we hard-block the parent to prevent the 4 sub-controls from
 *   surfacing if grapesjs' visibility cascade ever changes.
 *
 * The two custom standalone properties registered in `grapesConfig.ts`
 * keep unique IDs (`MJ_BODY_PADDING_TOP_PROPERTY_ID` / `_BOTTOM`) so
 * `editor.StyleManager.getProperty(sectorId, id)` can target them for
 * idempotency checks, while their CSS `property` matches the stylable
 * allowlist entry (`padding-top` / `padding-bottom`).
 */
export const MJ_BODY_PADDING_TOP_PROPERTY_ID = 'mj-body-padding-top'
export const MJ_BODY_PADDING_BOTTOM_PROPERTY_ID = 'mj-body-padding-bottom'

const MJ_BODY_STYLABLE_ALLOWLIST = [
  'background-color',
  'padding-top',
  'padding-bottom',
] as const

const MJ_BODY_UNSTYLABLE_LIST = [
  // Dimension sector (grapesjs-mjml/src/style.ts)
  'padding',
  'margin',
  'width',
  'height',
  'max-width',
  'min-height',
  'vertical-align',
  'icon-size',
  // Decorations sector — keeps only background-color exposed
  'container-background-color',
  'background-url',
  'background-repeat',
  'background-size',
  'border-radius',
  'border',
  'border-detached',
  // Typography sector — none relevant for mj-body, hide all
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'color',
  'line-height',
  'text-align',
  'align',
  'text-decoration',
  'font-style',
] as const

export interface MjBodyLockable extends LockableComponent {
  view?: { el?: HTMLElement | null }
  on?: (event: string, handler: () => void) => void
  off?: (event: string, handler: () => void) => void
}

/**
 * Plan 1.5 (2026-05-23 post-smoke v2) — explicit instance-level configuration
 * for the `mj-body` component. We don't rely on
 * `addType('mj-body', { extend, defaults }).defaults` — the plugin's
 * `Body.ts` registers its own defaults at editor init, and our extend never
 * propagates `name` or `stylable` to the component instance that
 * `setComponents(initialFullMjml)` produces. Setting on the instance after
 * `findType('mj-body')[0]` is the only reliable path (the wrapper
 * `set({name:'Document'})` validates this exact same approach).
 *
 * Each property below documents what surface it controls:
 * - `name: 'Frame'` — Layer panel label (post-smoke fix for P2 + P3).
 * - `stylable: MJ_BODY_STYLABLE_ALLOWLIST` — filters StyleManager Decorations
 *   sector to the 3 allowed properties, masking the plugin's duplicate
 *   `container-background-color` (post-smoke fix for P4).
 * - structural lock props — never draggable / removable / copyable / toolbar
 *   (P5 drag handle is masked by `injectLayerPanelLockCss` host CSS, since
 *   forcing `change:draggable` is timing-sensitive and unreliable).
 * - `view.el.classList.add('tp-frame-signal')` — anchors the iframe CSS
 *   outline + padding selector (post-smoke fix for P1).
 */
function ensureFrameSignalClass(mjBody: MjBodyLockable): void {
  const el = mjBody.view?.el
  if (el && !el.classList.contains(MJ_BODY_FRAME_SIGNAL_CLASS)) {
    el.classList.add(MJ_BODY_FRAME_SIGNAL_CLASS)
  }
}

/**
 * Plan 1.5 v6 (2026-05-23 post-smoke v5) — sync mj-body padding-top /
 * padding-bottom MJML attributes to inline `style` on the view element.
 *
 * Background : the MJML 4 spec for `<mj-body>` only recognizes
 * `background-color`, `width` and `css-class` as attributes — `padding-*`
 * is NOT supported natively. The Plan-1 cascade pipeline persists
 * `padding-top` / `padding-bottom` into the `shell_parts` database and
 * the resolver re-emits them in the compiled MJML, but the MJML browser
 * compiler ignores them silently → the canvas iframe shows no visual
 * change when the admin moves the Style Manager slider.
 *
 * Workaround : mirror the two attributes onto `view.el` inline style so
 * the canvas reflects the value immediately. The static plugin style
 * (`width: 100%; min-height: 100vh`) is set by Body.ts `renderStyle` and
 * concatenated onto whatever inline value already exists, so our
 * `setProperty(..., 'important')` survives re-renders.
 *
 * Empty attribute = reset to the CSS class default (12px Frame margin).
 * `'0'` / `'0px'` also defer to the CSS default so the Frame click zone
 * survives — the MJML attribute persists in the saved output, so the
 * exported email still gets `padding-top="0"`. Editor-only convenience.
 * Listener runs once at lock time + on every `change:attributes`.
 */
function syncMjBodyPaddingToView(mjBody: MjBodyLockable): void {
  const el = mjBody.view?.el
  if (!el) return
  const attrs = (mjBody.get('attributes') as Record<string, string> | undefined) ?? {}
  const top = attrs['padding-top']
  const bottom = attrs['padding-bottom']
  const isMeaningful = (v: string | undefined): v is string =>
    !!v && v !== '0' && v !== '0px'
  if (isMeaningful(top)) {
    el.style.setProperty('padding-top', top, 'important')
  } else {
    el.style.removeProperty('padding-top')
  }
  if (isMeaningful(bottom)) {
    el.style.setProperty('padding-bottom', bottom, 'important')
  } else {
    el.style.removeProperty('padding-bottom')
  }
}

const FRAME_REAPPLY_MARKER = '__tpFrameClassReapplyHandler'
const FRAME_FACTORY_BG = '__tpFrameFactoryBg'

interface MjBodyWithMarker extends MjBodyLockable {
  [FRAME_REAPPLY_MARKER]?: () => void
  [FRAME_FACTORY_BG]?: string
}

export function applyMjBodyLock(
  mjBody: MjBodyLockable,
  opts?: { editable?: boolean },
): void {
  // Lot 2 — mode système (opts?.editable === false) : le Frame (mj-body) est
  // VERROUILLÉ. Une édition du fond commun depuis un onglet système ne serait
  // jamais sauvée (silent-failure — il n'existe pas de leg de save pour la
  // coque en mode système, cf. invariant LOCK⟺SAVE). On pose donc un lock
  // complet : non sélectionnable, stylable vide, aucun toolbar/handler. On
  // n'attache NI le listener change:* NI le sync padding (Frame figé).
  if (opts?.editable === false) {
    mjBody.set({
      name: 'Frame',
      stylable: [],
      selectable: false,
      draggable: false,
      removable: false,
      copyable: false,
      highlightable: false,
      toolbar: [],
    })
    return
  }

  mjBody.set({
    name: 'Frame',
    stylable: [...MJ_BODY_STYLABLE_ALLOWLIST],
    unstylable: [...MJ_BODY_UNSTYLABLE_LIST],
    selectable: true,
    draggable: false,
    removable: false,
    copyable: false,
    highlightable: true,
    toolbar: [],
  })
  ensureFrameSignalClass(mjBody)
  syncMjBodyPaddingToView(mjBody)

  // #3 — capture la couleur d'usine du <mj-body> À CHAQUE applyMjBodyLock
  // (pas seulement au 1er) pour suivre les rebuilds (live-preview/switch)
  // qui changent la valeur résolue. Stockée sur l'instance (mut) et non dans
  // la closure du handler : le listener n'est attaché qu'une fois (marker
  // idempotent sur une même instance), une closure serait sinon figée sur la
  // 1re valeur. Le wrap a déjà injecté background-color sur <mj-body> avant
  // le lock, donc la valeur lue ici est déjà résolue.
  const target = mjBody as MjBodyWithMarker
  target[FRAME_FACTORY_BG] =
    (mjBody.get('attributes') as Record<string, string> | undefined)?.['background-color'] ?? ''

  // Plan 1.5 v3 — the Style Manager → MJML attribute sync (via
  // `coreMjmlModel.handleStyleChange`) re-renders the mj-body view on
  // every `change:attributes`. grapesjs' Backbone-style re-render
  // reconstructs the DOM and drops our manually-added `tp-frame-signal`
  // class → the outline + padding visual signal vanishes after the first
  // color-picker change (post-smoke v2 symptom P3.3 « padding saute »).
  // Listening to `change:attributes` and re-applying the class guarantees
  // the signal survives every re-render. Idempotent via the marker.
  //
  // Plan 1.5 v6 — the same listener now also calls
  // `syncMjBodyPaddingToView` so padding values reflect immediately in
  // the canvas iframe despite MJML not natively supporting padding on
  // `<mj-body>` (cf. helper doc).
  //
  // #3 — le handler restaure aussi la couleur d'usine quand l'admin clique
  // la croix (clear) du champ « Couleur de fond » du Frame : la croix vide
  // la background-color → on ré-applique la cascade d'usine plutôt qu'une
  // transparence muette. Garde anti-boucle : on ne ré-applique QUE si la
  // valeur courante est vide — après ré-application elle est non-vide, donc
  // le handler ne se redéclenche pas.
  if (!target[FRAME_REAPPLY_MARKER] && typeof mjBody.on === 'function') {
    const handler = (): void => {
      ensureFrameSignalClass(mjBody)
      syncMjBodyPaddingToView(mjBody)
      const current =
        (mjBody.get('attributes') as Record<string, string> | undefined)?.['background-color'] ??
        ''
      const factory = target[FRAME_FACTORY_BG] ?? ''
      if (!current && factory) {
        mjBody.addAttributes?.({ 'background-color': factory })
      }
    }
    mjBody.on('change:attributes', handler)
    mjBody.on('change:style', handler)
    target[FRAME_REAPPLY_MARKER] = handler
  }
}
