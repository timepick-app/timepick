import grapesjs, { type Editor } from 'grapesjs'
import grapesJSMJML from 'grapesjs-mjml'
import 'grapesjs/dist/css/grapes.min.css'
import { toast } from 'sonner'
import { registerVariableBlocks } from './variableBlock'
import { GRAPESJS_FR_MESSAGES, FR_BLOCK_LABELS } from './grapesjsFrOverrides'
import type { BrandShellTokens } from './bodyExtraction'
import {
  applyCardLock,
  applyMjBodyLock,
  applyShellDescendantLockFrozen,
  reEnableEditableZones,
  CARD_LOCKED_CLASS,
  SECTION_BORDER_STYLABLE,
  MJ_BODY_PADDING_TOP_PROPERTY_ID,
  MJ_BODY_PADDING_BOTTOM_PROPERTY_ID,
  type LockableComponent as ShellLockable,
  type ShellWrapperLike,
} from './shellStructureLock'
import {
  injectLayerPanelLockCss,
  injectLockedShellSignalCss,
  LOCKED_SHELL_LABEL_CSS,
} from './lockedShellSignalCss'

const ALLOWED_BLOCK_IDS = new Set(['mj-image', 'mj-text', 'mj-button', 'mj-divider', 'mj-spacer'])

/**
 * Structural-only flags applied on the `.locked-shell` root in ALL cases.
 * Implements the email-shell customization policy's fixed-structure rule ("3 blocs immuables, aucun
 * ajout ni suppression") and its locked-structure-indicators rule ("Supprimer,
 * Déplacer, Dupliquer absentes de la barre d'outils des 3 blocs racines").
 * `selectable`, `editable`, `hoverable` stay at their default `true` so the
 * admin can still adjust authorized root-level styles (background, padding).
 */
const SHELL_ROOT_LOCKED_FLAGS = {
  removable: false,
  copyable: false,
  draggable: false,
} as const

/**
 * Full lock flags applied on the `.locked-shell` root AND every descendant
 * when the block is inherited from a higher level of the cascade. Implements
 * the email-shell customization policy ("aucune modification ne peut être saisie
 * sur un élément qui ne sera pas sauvegardé"): inherited content has no
 * persistence target at the current editing level until an override is
 * created explicitly (Story 26-3).
 */
const INHERITED_DEEP_LOCKED_FLAGS = {
  selectable: false,
  editable: false,
  removable: false,
  copyable: false,
  draggable: false,
  hoverable: false,
} as const

interface LockableComponent {
  set: (flags: Record<string, unknown>) => void
  components: () => { forEach: (cb: (child: LockableComponent) => void) => void }
}

/**
 * Locks the `.locked-shell` root structurally: removable/copyable/draggable
 * become false AND the floating toolbar is emptied (`toolbar: []`, fresh array
 * per call). The flags alone are NOT enough — grapesjs caches the default
 * toolbar at component creation (before this lock pass), so move / clone /
 * delete / select-parent persist unless the toolbar is explicitly reset
 * (régression Lot 2 ; l'ancien applyShellSectionLock / commit 5f63baa2 le posait).
 *
 * No recursion: descendants (`<mj-text>`, `<mj-image>`, etc.) keep their
 * default behaviour and remain editable, in line with the email-shell
 * customization policy ("liberté totale du contenu : logo, couleurs, bordures,
 * polices, textes multiples").
 */
export function applyShellRootLock(component: LockableComponent): void {
  component.set({ ...SHELL_ROOT_LOCKED_FLAGS, toolbar: [] })
}

/**
 * Locks the `.locked-shell` root AND every descendant so no selection / edit /
 * removal / copy / drag / hover surfaces an editor on an inherited block.
 *
 * Used only when a block's `origin` differs from the current editing scope
 * (`data-inherited="true"` posted by `addInheritedAttr()` in bodyExtraction.ts).
 * A click on any node inside such a block is intercepted by the
 * `component:select:before` handler and routed to the `LockedShellInfoPanel`
 * via `onLockedShellSelection({ partKind })`.
 */
export function applyDeepLockForInheritedShell(component: LockableComponent): void {
  component.set(INHERITED_DEEP_LOCKED_FLAGS)
  component.components().forEach(applyDeepLockForInheritedShell)
}

function curatePalette(editor: Editor): void {
  editor.BlockManager.getAll()
    .models.slice()
    .forEach((b) => {
      const id = String(b.id)
      if (!ALLOWED_BLOCK_IDS.has(id) && !id.startsWith('var-')) {
        editor.BlockManager.remove(id)
      }
    })
}

function applyFrenchBlockLabels(editor: Editor): void {
  Object.entries(FR_BLOCK_LABELS).forEach(([id, label]) => {
    editor.BlockManager.get(id)?.set('label', label)
  })
}

export interface EmailEditorWrapper {
  editor: Editor
  setMjmlSilently: (mjml: string) => void
  destroy: () => void
  getMjml: () => string
}

interface LockedShellSelectionPayload {
  partKind: 'header' | 'footer'
}

export interface EditorInitOptions {
  variables: readonly string[]
  brand: BrandShellTokens
  /** Called when GrapesJS emits the `update` event AFTER initialization. */
  onEditorUpdate?: () => void
  /** Story 26-2 / AC3 + AC4 — invoked when the user clicks any descendant of
   * a locked-shell root (root + descendants are non-selectable, but
   * `component:select:before` still fires). The host (MjmlEditorOverlayInner)
   * uses the partKind to mount the LockedShellInfoPanel for the matching
   * resolved block (header or footer). Receives `null` when the user clicks
   * a non-locked component, so the host can dismiss any open panel. */
  onLockedShellSelection?: (payload: LockedShellSelectionPayload | null) => void
  /**
   * L3a — classes css des 2 zones de texte éditables (accroche/signature).
   * Présent ⇒ mode système contraint : le corps est gelé sauf ces zones (CTA
   * figé). Absent ⇒ invitation (corps libre, RTE inline + dépôt de blocs).
   */
  constrainedEditableZoneClasses?: readonly string[]
}

export function initEmailEditor(
  container: HTMLElement,
  initialFullMjml: string,
  opts: EditorInitOptions,
): EmailEditorWrapper {
  const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(
    /\/+$/,
    '',
  )
  const uploadUrl = `${apiBaseUrl}/admin/uploads/email-image`

  // F5 carry-over: read the token via a Proxy-backed getter so each upload
  // picks up the current `auth_token` instead of a snapshot frozen at editor
  // init. Survives re-login mid-session without re-init.
  const liveAuthHeaders = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'Authorization') {
          const token = localStorage.getItem('auth_token') ?? ''
          return token ? `Bearer ${token}` : undefined
        }
        return undefined
      },
      ownKeys() {
        return ['Authorization']
      },
      getOwnPropertyDescriptor() {
        return { enumerable: true, configurable: true }
      },
    },
  ) as Record<string, string>

  let editor: Editor
  try {
    editor = grapesjs.init({
      container,
      height: '100%',
      noticeOnUnload: false,
      storageManager: false,
      fromElement: false,
      i18n: { locale: 'fr', messages: { fr: GRAPESJS_FR_MESSAGES } },
      // Étiquette permanente « En-tête » / « Corps » / « Pied ». La règle vit
      // dans `lockedShellSignalCss.ts` avec l'autre signal de canvas (drift
      // guard commun) ; elle est passée en `frameStyle` — et non injectée comme
      // l'autre — parce qu'elle doit exister dès le premier rendu de l'iframe,
      // avant toute passe de verrou.
      canvas: { frameStyle: LOCKED_SHELL_LABEL_CSS },
      // F26 carry-over: wrap the plugin to pass options inline. We can't use
      // GrapesJS' `pluginsOpts` map because the function reference can't be a
      // stable object key. `useCustomTheme: false` disables the plugin's
      // hardcoded color theme so our scoped CSS variables apply cleanly.
      plugins: [(ed) => grapesJSMJML(ed, { useCustomTheme: false })],
      assetManager: {
        upload: uploadUrl,
        uploadName: 'image',
        autoAdd: true,
        headers: liveAuthHeaders,
        // GrapesJS' default `credentials: 'include'` triggers a CORS rejection
        // here: the server's cors() middleware echoes Access-Control-Allow-Origin: *,
        // which the browser refuses to accept on credentialed requests. We
        // authenticate via the Bearer token in `headers.Authorization`, not
        // cookies, so omit credentials entirely.
        credentials: 'omit',
        // Default `multiUpload: true` would append `multiUploadSuffix` ('[]')
        // to uploadName → field 'image[]'. Our server uses multer.single('image')
        // and would reject with MulterError "Unexpected field" → 400. We only
        // support single-file upload so disable the suffix.
        multiUpload: false,
      },
    })
  } catch (err) {
    // F47 carry-over: fail loud rather than white-screening React.
    console.error('[MjmlEditorOverlay] grapesjs.init failed:', err)
    toast.error("Initialisation de l'éditeur impossible")
    throw err
  }

  // Expose l'instance pour les smokes Playwright (`__grapesEditor`), dev/test
  // uniquement (strippé en build prod via `import.meta.env.DEV`). Les specs e2e
  // `@slow` (email-shell-locked-structure…) lisent les flags GrapesJS du verrou
  // via ce handle. Nettoyé au `destroy()`.
  if (import.meta.env.DEV) {
    ;(window as unknown as { __grapesEditor?: Editor }).__grapesEditor = editor
  }

  let isInitialized = false

  /**
   * Passe de verrouillage shell sur le canvas courant. Sélecteur ATTRIBUT
   * `[css-class~="locked-shell"]` : le `.locked-shell` (classe CSS) NE MATCHE PAS
   * dans grapesjs-mjml.
   *
   * - En-tête / pied (`locked-shell`) : `data-inherited="true"` → deep lock
   *   (lecture seule, root + descendants), sinon root lock structurel seul.
   * - Carte content-wrapper (`locked-card`) : figée structurellement, stylable.
   * - Mode système contraint (`opts.constrainedEditableZoneClasses`) : le corps
   *   (descendants de la carte, ou enfants nus de <mj-body> hors shell) est gelé
   *   récursivement PUIS les 2 zones intro/sig sont ré-ouvertes → CTA figé,
   *   accroche/signature éditables.
   *
   * Idempotent. Appelée depuis `on('load')` et `setMjmlSilently()` (à threader
   * aux DEUX sites, sinon un re-set re-déverrouillerait tout).
   */
  function applyShellLocks(): void {
    const wrapper = editor.getWrapper()
    if (!wrapper) {
      console.error(
        '[grapesConfig] applyShellLocks: editor.getWrapper() introuvable — verrou shell NON appliqué',
      )
      return
    }
    const attrsOf = (c: unknown): Record<string, string> =>
      (c as { getAttributes?: () => Record<string, string> }).getAttributes?.() ?? {}
    const modelsOf = (c: unknown): unknown[] =>
      c == null
        ? []
        : (c as { components?: () => { models?: unknown[] } }).components?.()?.models ?? []

    // (1) En-tête / pied (sections locked-shell).
    const lockedShells = wrapper.find('[css-class~="locked-shell"]') ?? []
    if (lockedShells.length < 2) {
      // Fail-loud : un canvas sain a TOUJOURS 2 sections locked-shell (en-tête +
      // pied). 0/<2 = verrou structurel inactif — re-régression du bug B2 (un
      // sélecteur qui cesse de matcher). console.error volontairement utilisé en
      console.error(
        `[grapesConfig] applyShellLocks: ${lockedShells.length} section(s) locked-shell (attendu ≥ 2) — verrou en-tête/pied INACTIF`,
      )
    }
    lockedShells.forEach((comp) => {
      if (attrsOf(comp)['data-inherited'] === 'true') {
        applyDeepLockForInheritedShell(comp as unknown as LockableComponent)
        return
      }
      applyShellRootLock(comp as unknown as LockableComponent)
      // Régression Lot 2 — applyShellRootLock ne pose ni `stylable` ni `name`
      // (contrairement à l'ancien applyShellSectionLock). On ré-expose les
      // bordures par côté au Style Manager (composites « Plan A3 » de Decorations)
      // et on nomme la section dans le Layer panel (Header / Footer) au lieu du
      // « Section » générique × 3.
      const section = comp as unknown as {
        get?: (k: string) => unknown
        set: (o: Record<string, unknown>) => void
      }
      const currentStylable = (section.get?.('stylable') as string[] | undefined) ?? []
      const partKind = attrsOf(comp)['data-part-kind']
      const layerName =
        partKind === 'header' ? 'Header' : partKind === 'footer' ? 'Footer' : undefined
      section.set({
        stylable: Array.from(new Set([...currentStylable, ...SECTION_BORDER_STYLABLE])),
        ...(layerName ? { name: layerName } : {}),
      })
    })

    // (2) Carte content-wrapper (mj-wrapper) : figée structurellement. Par
    // défaut (éditeur Invitation) elle est sélectionnable + stylable ; en mode
    // système elle est VERROUILLÉE (non sélectionnable + non stylable), miroir du
    // Frame mj-body : la branche système de handleSave ne persiste que
    // {introText, signatureText} (cf. la politique de personnalisation de la coque email), laisser la carte
    // stylable serait une silent-failure (invariant LOCK⟺SAVE). isSystemConstrained
    // est hissé ici car réutilisé au bloc (2b) mj-body ci-dessous.
    const isSystemConstrained = !!(
      opts.constrainedEditableZoneClasses && opts.constrainedEditableZoneClasses.length
    )
    const cards = wrapper.find(`[css-class~="${CARD_LOCKED_CLASS}"]`) ?? []
    cards.forEach((card) =>
      applyCardLock(card as unknown as ShellLockable, { editable: !isSystemConstrained }),
    )

    // (2b) mj-body Frame : verrou structurel + name 'Frame' + sync padding
    // + classe .tp-frame-signal. Même pattern findType qu'au bloc (3) ci-dessous.
    // Idempotent via le marqueur FRAME_REAPPLY_MARKER (ré-applique le lock et la
    // classe signal sur chaque rebuild émis par setMjmlSilently).
    //
    // Lot 2 — le Frame (mj-body) est éditable/stylable ⟺ éditeur Invitation.
    // `constrainedEditableZoneClasses` présent ⟺ mode système ⟺ Frame VERROUILLÉ
    // (sinon une édition du fond commun depuis un onglet système ne serait pas
    // sauvée — silent-failure, invariant LOCK⟺SAVE).
    const mjBody = (wrapper as { findType?: (t: string) => unknown[] }).findType?.('mj-body')?.[0]
    if (mjBody)
      applyMjBodyLock(mjBody as Parameters<typeof applyMjBodyLock>[0], {
        editable: !isSystemConstrained,
      })

    // (signal CSS 🔒/✏️) — injecté dans l'iframe canvas. Idempotent (marqueur
    // data-tp-locked-shell-signal) : survit aux rebuilds via setMjmlSilently.
    injectLockedShellSignalCss(editor)

    // (3) Mode système contraint : gel du corps sauf les 2 zones intro/sig.
    const zoneClasses = opts.constrainedEditableZoneClasses
    if (zoneClasses && zoneClasses.length > 0) {
      const contentRoots = cards.length
        ? cards.flatMap(modelsOf)
        : modelsOf(
            (wrapper as { findType?: (t: string) => unknown[] }).findType?.('mj-body')?.[0],
          ).filter((c) => !/\blocked-shell\b/.test(attrsOf(c)['css-class'] ?? ''))
      contentRoots.forEach((c) =>
        applyShellDescendantLockFrozen(c as unknown as ShellLockable),
      )
      const reopened = reEnableEditableZones(
        wrapper as unknown as ShellWrapperLike,
        zoneClasses,
      )
      if (reopened < zoneClasses.length) {
        // Fail-loud : corps système gelé puis (pas assez de) zones ré-ouvertes →
        // canvas dégénéré, admin verrouillé hors des zones éditables (intro/sig).
        console.error(
          `[grapesConfig] applyShellLocks: ${reopened}/${zoneClasses.length} zone(s) éditable(s) ré-ouverte(s) — corps système (partiellement) verrouillé`,
        )
      }
    }
  }

  editor.on('load', () => {
    // F7 carry-over: load initial MJML inside the load handler so lock-pass
    // and curate run on a fully-initialized editor.

    // Plan 1.5 v4 — adds standalone padding-top / padding-bottom controls to
    // the `Dimension` sector (sémantiquement correct : cohérence UX avec
    // les autres composants pour qui le padding est dans Dimension via le
    // composite).
    // Custom IDs (`mj-body-padding-top` / `-bottom`) ne servent qu'aux checks
    // d'idempotence. La visibilité GrapesJS se calcule sur le NOM CSS
    // (`padding-top`/`-bottom`), PAS sur l'ID — nom partagé par toute
    // section/colonne/image/bouton dont le `stylable` autorise ces côtés, donc
    // ces standalones doublonneraient le composite `padding`. Le prédicat
    // `isVisible` ci-dessous les restreint au seul Frame (`mj-body`), où le
    // composite est masqué (`unstylable`) et où ils sont l'unique contrôle de
    // marge haute/basse.
    //
    // Lookup par `name` (et non par ID littéral) car le plugin
    // grapesjs-mjml/style.ts ajoute les sectors via `sectors.add([{ name,
    // ... }])` SANS `id` explicite → Backbone leur assigne des CIDs
    // auto-générés ('sector-1', 'sector-2', etc.). `getSector('Dimension')`
    // ne match donc PAS le nom littéral et retourne undefined silencieusement.
    type SectorRef = {
      get: (key: string) => unknown
      getId?: () => string
      getProperties?: () => Array<{ getId: () => string }>
    }
    const sectors = editor.StyleManager.getSectors() as unknown as Iterable<SectorRef>
    let dimensionSectorId: string | undefined
    let dimensionSector: SectorRef | undefined
    for (const s of sectors) {
      if (s.get('name') === 'Dimension') {
        dimensionSector = s
        dimensionSectorId = s.getId?.() ?? (s.get('id') as string | undefined)
        break
      }
    }
    if (dimensionSector && dimensionSectorId) {
      const existing = dimensionSector.getProperties?.() ?? []
      const hasTop = existing.some((p) => p.getId() === MJ_BODY_PADDING_TOP_PROPERTY_ID)
      const hasBottom = existing.some((p) => p.getId() === MJ_BODY_PADDING_BOTTOM_PROPERTY_ID)
      if (!hasTop) {
        editor.StyleManager.addProperty(dimensionSectorId, {
          id: MJ_BODY_PADDING_TOP_PROPERTY_ID,
          property: 'padding-top',
          type: 'integer',
          units: ['px'],
          default: '0',
          min: 0,
          max: 200,
          name: 'Marge haute',
          isVisible: ({ component }) => component?.is('mj-body') ?? false,
        })
      }
      if (!hasBottom) {
        editor.StyleManager.addProperty(dimensionSectorId, {
          id: MJ_BODY_PADDING_BOTTOM_PROPERTY_ID,
          property: 'padding-bottom',
          type: 'integer',
          units: ['px'],
          default: '0',
          min: 0,
          max: 200,
          name: 'Marge basse',
          isVisible: ({ component }) => component?.is('mj-body') ?? false,
        })
      }
    } else if (import.meta.env.DEV) {
      console.warn(
        '[grapesConfig] Dimension sector not found — mj-body padding controls not registered.',
      )
    }

    // Plan A3 (2026-06-08) — Bordures granulaires : retire le composite
    // `border` uniforme (qui émet `border="..."`, refusé par le validateur
    // shell → crash en-tête) et le remplace par 4 composites par côté. Lookup
    // du sector par `name` (les sectors plugin n'ont pas d'`id` littéral, cf.
    // bloc Dimension ci-dessus).
    let decorationsSectorId: string | undefined
    let decorationsSector: SectorRef | undefined
    for (const s of editor.StyleManager.getSectors() as unknown as Iterable<SectorRef>) {
      if (s.get('name') === 'Decorations') {
        decorationsSector = s
        decorationsSectorId = s.getId?.() ?? (s.get('id') as string | undefined)
        break
      }
    }
    if (decorationsSector && decorationsSectorId) {
      // Retire le composite uniforme `border` (id par défaut = 'border').
      const uniform = decorationsSector
        .getProperties?.()
        ?.find((p) => p.getId() === 'border')
      if (uniform) editor.StyleManager.removeProperty(decorationsSectorId, 'border')

      const STYLE_OPTIONS = [
        { id: 'none' },
        { id: 'solid' },
        { id: 'dashed' },
        { id: 'dotted' },
        { id: 'double' },
      ]
      const sides: Array<{ side: 'top' | 'right' | 'bottom' | 'left'; label: string }> = [
        { side: 'top', label: 'Bordure haute' },
        { side: 'right', label: 'Bordure droite' },
        { side: 'bottom', label: 'Bordure basse' },
        { side: 'left', label: 'Bordure gauche' },
      ]
      for (const { side, label } of sides) {
        const prop = `border-${side}`
        const exists = decorationsSector.getProperties?.()?.some((p) => p.getId() === prop)
        if (exists) continue
        editor.StyleManager.addProperty(decorationsSectorId, {
          id: prop,
          property: prop,
          name: label,
          type: 'composite',
          // Frame (mj-body) exclu : pas de bordures sur fond de page — symétrique du isVisible padding.
          isVisible: ({ component }: { component?: { is?: (t: string) => boolean } | null }) =>
            component != null && !component.is?.('mj-body'),
          properties: [
            {
              id: `${prop}-width`,
              property: `border-${side}-width`,
              name: 'Largeur',
              type: 'integer',
              units: ['px'],
              default: '1',
              min: 0,
              max: 20,
            },
            {
              id: `${prop}-style`,
              property: `border-${side}-style`,
              name: 'Style',
              type: 'select',
              default: 'solid',
              options: STYLE_OPTIONS,
            },
            {
              id: `${prop}-color`,
              property: `border-${side}-color`,
              name: 'Couleur',
              type: 'color',
              default: '#e5e7eb',
            },
          ],
        })
      }
    } else if (import.meta.env.DEV) {
      console.warn('[grapesConfig] Decorations sector not found — per-side border controls not registered.')
    }

    editor.setComponents(initialFullMjml)
    applyShellLocks()

    // Plan 1.5 (2026-05-23 post-smoke v2) — HOST CSS qui masque les drag
    // handles dans le Layer panel (`.gjs-layer-move`). Tous les composants
    // du shell sont `draggable: false` ; aucune handle légitime à exposer.
    injectLayerPanelLockCss()

    curatePalette(editor)
    registerVariableBlocks(editor, opts.variables)
    applyFrenchBlockLabels(editor)
    editor.on('block:add', () => curatePalette(editor))

    queueMicrotask(() => {
      isInitialized = true
    })
  })

  editor.on('asset:upload:error', (err: unknown) => {
    // console.error is intentionally used in production here for client-side debugging;
    // matches the unwrapped pattern used at the init-failure path above.
    console.error('[MjmlEditorOverlay] asset upload error:', err)
    const status =
      (err as { responseCode?: number; status?: number })?.responseCode ??
      (err as { status?: number })?.status ??
      0
    const message =
      status === 401
        ? 'Session expirée — reconnectez-vous'
        : status === 403
          ? 'Accès refusé (administrateur requis)'
          : status === 413
            ? 'Image trop volumineuse (max 5 Mo)'
            : status === 415
              ? 'Format non supporté (PNG, JPEG ou WebP uniquement)'
              : status === 429
                ? 'Trop de requêtes — réessayez dans une minute'
                : 'Téléversement échoué'
    toast.error(message)
  })

  // No debounced auto-save — D-ext2 mandates explicit Save. The `update`
  // event is forwarded only after init so the parent can track dirty state.
  editor.on('update', () => {
    if (!isInitialized) return
    opts.onEditorUpdate?.()
  })

  // Story 26-2 / AC3 + AC4 — `selectable=false` blocks the native selection
  // path before it fires `component:selected`. The `component:select:before`
  // event still fires and lets us route the click to the host so it can
  // mount the LockedShellInfoPanel for the corresponding partKind. Clicks
  // outside a locked-shell signal `null` to dismiss any open panel (P4).
  //
  // SÉPARATEUR : `:` avant `before`, jamais `-`. GrapesJS n'émet que
  // `component:select:before` (`ComponentsEvents.selectBefore`) ; un
  // `component:select-before` s'enregistre sans erreur et ne se déclenche
  // JAMAIS — le panneau d'héritage devient silencieusement inatteignable.
  // Le refactor 5eebca2e (2026-06-20) a introduit exactement cette faute.
  // Aucun test mocké ne peut l'attraper (`initEmailEditor` y est stubé) :
  // le garde est `email-shell-parts-26-2d.spec.ts`, qui frappe l'éditeur réel.
  editor.on('component:select:before', (model: unknown) => {
    if (!opts.onLockedShellSelection) return
    const comp = model as
      | { closest?: (sel: string) => { getAttributes?: () => Record<string, string> } | null }
      | undefined
    const lockedShellAncestor = comp?.closest?.('[css-class~="locked-shell"]')
    if (!lockedShellAncestor) {
      opts.onLockedShellSelection(null)
      return
    }
    const attrs = lockedShellAncestor.getAttributes?.() ?? {}
    const partKind = attrs['data-part-kind']
    if (partKind === 'header' || partKind === 'footer') {
      opts.onLockedShellSelection({ partKind })
    } else {
      // Locked-shell ancestor without recognizable data-part-kind — dismiss
      // any open panel to avoid stale state.
      opts.onLockedShellSelection(null)
    }
  })

  function setMjmlSilently(mjml: string): void {
    isInitialized = false
    editor.setComponents(mjml)
    // Re-applique la passe de verrou : setComponents reconstruit l'arbre de
    // composants, les verrous précédents sont perdus. Sans ça un reset ou un
    // live-preview système (handleSave/preview → setMjmlSilently) rendrait le
    // canvas déverrouillé.
    applyShellLocks()
    queueMicrotask(() => {
      isInitialized = true
    })
  }

  function getMjml(): string {
    const result = editor.runCommand('mjml-code') as unknown
    return typeof result === 'string' ? result : ''
  }

  return {
    editor,
    setMjmlSilently,
    destroy: () => {
      if (import.meta.env.DEV) {
        delete (window as unknown as { __grapesEditor?: Editor }).__grapesEditor
      }
      editor.destroy()
    },
    getMjml,
  }
}
