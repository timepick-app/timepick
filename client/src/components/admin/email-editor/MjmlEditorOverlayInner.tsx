import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Save, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LockedShellInfoPanel, type LockedShellPartKind } from './LockedShellInfoPanel'
import { StructuralBadge } from './StructuralBadge'
import { structuralBadgeWording } from './StructuralBadge.constants'
import { useToolbarTier } from './useToolbarTier'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useEmailBrandSettings } from '@/hooks/useEmailBrandSettings'
import { useEditorContext } from '@/hooks/useEditorContext'
import type { ResolvedShell } from '@/services/editor-context.service'
import { useUpsertShellPart } from '@/hooks/useUpsertShellPart'
import { useDeleteShellPart } from '@/hooks/useDeleteShellPart'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import { initEmailEditor, type EmailEditorWrapper } from './grapesConfig'
import {
  extractBodyFragment,
  extractShellSections,
  extractMjBodyAttrs,
  extractContentWrapperFromCanvas,
  isBodyMarkerIntact,
  isShellDirty,
  isShellMarkersIntact,
  mjBodyAttrsEqual,
  normalizeShellFragment,
  stripBodyMarkers,
  tagSectionWithPartKind,
  isShellBlockInherited,
  wrapBodyForEditing,
  HARDCODED_MJ_BODY_ATTRS_CANVAS,
  type BrandShellTokens,
  type ResolvedMjBodyAttrsForCanvas,
  type ResolvedShellForCanvas,
} from './bodyExtraction'
import { COMMON_SHELL_OWNER, routeShellLegAction } from './shellLegRouting'
import type { MjmlEditorMode, MjmlEditorOwnerKind, TemplateSwitcherProps } from './MjmlEditorOverlay'
import {
  EmailIdentityMenu,
  type BrandPreviewOverrides,
  type BrandSaveHandler,
} from './EmailIdentityMenu'
import { EmailTestSendMenu } from './EmailTestSendMenu'
import {
  composeSystemCanvasBody,
  extractSystemZones,
  type SystemZoneWrapperLike,
} from './systemCanvas'
import { SYSTEM_EDITABLE_ZONE_CLASSES } from './shellStructureLock'
import {
  findMissingSystemCriticalVariables,
  type SystemTemplateKey,
} from '@/lib/email-system-template-constants'
import {
  EmailSubjectLine,
  EMPTY_SUBJECT_STATE,
  type EmailSubjectState,
} from './EmailSubjectLine'
import type { SubjectVariable } from '@/lib/email-subject'
import type { SubjectPatch } from '@/services/email-templates.service'

/**
 * De quoi rendre la ligne Objet. Groupé en un seul objet plutôt qu'éparpillé
 * en cinq props : ces valeurs viennent toutes du même DTO et n'ont aucun sens
 * séparément. Prop absente ⇒ pas de ligne Objet (appelant qui n'en a pas).
 */
export interface EditorSubjectProps {
  /** Personnalisation persistée, ou `null`. Forme source. */
  subject: string | null
  /**
   * Valeur en vigueur sans personnalisation : objet d'usine au niveau modèle,
   * objet hérité du modèle au niveau événement.
   */
  fallbackSubject: string
  /** Décide du vocabulaire et du régime du popover (héritage vs édition directe). */
  level: 'template' | 'event'
  /** `magic_link_login` seul — la présence de `fallbackSubjectAdmin` est le prédicat. */
  subjectAdmin?: string | null
  fallbackSubjectAdmin?: string
  /** Liste publiée par le serveur (A3) — jamais reconstruite côté client. */
  variables: SubjectVariable[]
}

interface InnerProps {
  /** Template key — informational, not sent to API. Exposed as `data-template-key` for E2E selectors. */
  templateKey: string
  /** Body fragment from DB (invitation mode). Ignored in system mode (corps composé). */
  initialBodyMjml?: string
  /** Factory default body fragment — used by Reset (event editor). */
  defaultBodyMjml?: string
  variables: readonly string[]
  /** Invitation save : extrait le body fragment → onSave(bodyMjml, subject). */
  onSave?: (bodyMjml: string, subject?: SubjectPatch) => Promise<void>
  /** Reset au modèle par défaut. Le bouton ET le dialog ne sont rendus QUE si cette prop est fournie (rendu ⟺ opérabilité : pas de bouton no-op). Désactivé si !isCustom. Aujourd'hui câblé uniquement par l'éditeur d'événement. */
  onReset?: () => Promise<void>
  onDirtyChange: (dirty: boolean) => void
  onRequestCancel: () => void
  /** Nom lisible du modèle édité, affiché dans l'en-tête. */
  title?: string
  ownerKind?: MjmlEditorOwnerKind
  ownerId?: string
  /** L3a — mode d'édition (défaut `'invitation'`). */
  mode?: MjmlEditorMode
  /** True si l'owner a une personnalisation vs son parent (reset pertinent). Défaut true. */
  isCustom?: boolean
  /** L3a (système) — accroche courante. */
  systemIntroText?: string
  /** L3a (système) — signature courante. */
  systemSignatureText?: string
  /** L3a (système) — save : extraction des 2 zones → onSaveSystem({introText, signatureText}). */
  onSaveSystem?: (
    zones: { introText: string; signatureText: string } & SubjectPatch,
  ) => Promise<void>
  /** Sélecteur de modèle dans la barre d'outils (bascule sans fermer l'éditeur).
   *  Le wrapper dirty-guarde `onRequestSwitch` ; Inner ne fait que l'appeler. */
  templateSwitcher?: TemplateSwitcherProps
  /** Ligne Objet sous la barre d'outils. Absente ⇒ pas de ligne. */
  subjectLine?: EditorSubjectProps
}

function toCanvasShell(resolved: ResolvedShell | undefined): ResolvedShellForCanvas | undefined {
  if (!resolved) return undefined
  return {
    header: { contentMjml: resolved.header.contentMjml, origin: resolved.header.origin },
    footer: { contentMjml: resolved.footer.contentMjml, origin: resolved.footer.origin },
    // Plan 1 du 2026-05-22 — cascade fond <mj-body> (background-color, paddings).
    mjBody: resolved.mjBody.attrs,
    // Plan carte-éditable (2026-06-08) — carte content-wrapper résolue (forme stockage).
    contentWrapper: resolved.contentWrapper,
  }
}

function brandTokensFromSettings(settings: ReturnType<typeof useEmailBrandSettings>['data']): BrandShellTokens {
  if (!settings) {
    return {
      logoUrl: null,
      primaryColor: '#18181b',
      fontFamily: 'Inter, Arial, sans-serif',
      buttonBorderRadius: 4,
    }
  }
  return {
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
    fontFamily: settings.fontFamily,
    buttonBorderRadius: settings.buttonBorderRadius,
  }
}

function brandLegFailed(
  result: PromiseSettledResult<{ status: 'ok' | 'ko' | 'skip' }>,
): boolean {
  return (
    result.status === 'rejected' ||
    (result.status === 'fulfilled' && result.value.status === 'ko')
  )
}
// Plan carte-éditable — forme de stockage de la carte blanche par défaut
// (miroir du repli de `wrapBodyForEditing` quand pas de cascade
// content-wrapper). Sert d'ancre résolue quand `editorContext.contentWrapper`
// est null, pour que la carte blanche affichée ne compte pas comme « dirty ».
const CARD_DEFAULT_STORAGE = '<mj-section background-color="#ffffff"></mj-section>'

// Plan 1 du 2026-05-22 — sérialise les 3 attrs du <mj-body> en fragment MJML
// pour la PUT /api/admin/shell-parts (partKind 'mj-body'). Le résultat passe le
// validator serveur : exactement un `<mj-body>` racine sans enfants, whitelist
// background-color / padding-top / padding-bottom. Attributs échappés ; ordre
// fixe pour faciliter le diffing.
function serializeMjBodyContent(attrs: ResolvedMjBodyAttrsForCanvas): string {
  const escape = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<mj-body background-color="${escape(attrs.backgroundColor)}" padding-top="${escape(attrs.paddingTop)}" padding-bottom="${escape(attrs.paddingBottom)}"></mj-body>`
}

// Resolve les attrs <mj-body> depuis la cascade serveur (défauts hardcodés si
// la cascade est absente). Consommé par le routage du leg mj-body et par
// l'hydratation de l'ancre locale.
function resolveMjBodyAttrs(resolved: ResolvedShell | undefined): ResolvedMjBodyAttrsForCanvas {
  return {
    backgroundColor: resolved?.mjBody.attrs.backgroundColor ?? HARDCODED_MJ_BODY_ATTRS_CANVAS.backgroundColor,
    paddingTop: resolved?.mjBody.attrs.paddingTop ?? HARDCODED_MJ_BODY_ATTRS_CANVAS.paddingTop,
    paddingBottom: resolved?.mjBody.attrs.paddingBottom ?? HARDCODED_MJ_BODY_ATTRS_CANVAS.paddingBottom,
  }
}

// Review R-P13 — détection d'un rejet 404 (axios). Utilisé pour traiter un
// `DELETE shell-parts` event-missing comme un succès logique (parité serveur
// PUT) : un event supprimé en parallèle de l'édition est un cas de course
// attendu, rien à supprimer = succès idempotent.
function isNotFoundError(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false
  const response = (reason as { response?: { status?: number } }).response
  return response?.status === 404
}
export default function MjmlEditorOverlayInner({
  templateKey,
  initialBodyMjml = '',
  defaultBodyMjml = '',
  variables,
  onSave,
  onReset,
  onDirtyChange,
  onRequestCancel,
  title,
  ownerKind,
  ownerId,
  mode = 'invitation',
  isCustom = true,
  systemIntroText = '',
  systemSignatureText = '',
  onSaveSystem,
  templateSwitcher,
  subjectLine,
}: InnerProps) {
  const isSystem = mode === 'system'
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EmailEditorWrapper | null>(null)
  const initialBodyRef = useRef(initialBodyMjml)
  // L3a (système) — ancres dirty pour les 2 zones éditables. Avancées après
  // chaque save `onSaveSystem` réussi pour rendre `isDirty=false` cohérent.
  const initialIntroRef = useRef(systemIntroText)
  const initialSignatureRef = useRef(systemSignatureText)
  const isDirtyRef = useRef(false)
  // Plan shell-parts-persistance — ancres locales per-section. Quatre sources
  // de vérité distinctes pour le dirty tracker : body (flux legacy), header/
  // footer (cascade shell_parts), mj-body (attrs du <mj-body>), carte
  // (content-wrapper). Comparées à des résolus normalisés (sans css-class
  // locked-shell / data-locked-label / data-part-kind / data-inherited).
  // Avancées per-leg success par `handleSave` (anti-régression C1).
  const initialHeaderRef = useRef<string>('')
  const initialFooterRef = useRef<string>('')
  const initialMjBodyAttrsRef = useRef<ResolvedMjBodyAttrsForCanvas>({
    ...HARDCODED_MJ_BODY_ATTRS_CANVAS,
  })
  // Plan carte-éditable — ancre du leg content-wrapper (forme stockage
  // normalisée). Repli blanc (CARD_DEFAULT_STORAGE) quand pas de cascade.
  const initialContentWrapperRef = useRef<string>('')
  // Review R-P6 — protège contre les setState post-await sur composant démonté
  // (admin ferme l'overlay pendant Promise.allSettled). Hydraté par l'effet
  // d'init (true au mount, false au cleanup).
  const mountedRef = useRef(true)
  // Plan 3a — live preview de l'identité visuelle. <EmailIdentityMenu> pousse des
  // overrides (couleur, police, logo, arrondi) entre chaque édition et le Save ;
  // on les merge sur le brand serveur pour piloter le canvas sans persister.
  // Reset à null au Save success / fermeture sans Save → retour aux valeurs
  // serveur via l'effet de rebuild plus bas.
  const previewMountRef = useRef(true)
  const brandSaveHandlerRef = useRef<BrandSaveHandler | null>(null)
  const registerBrandSaveHandler = useCallback(
    (handler: BrandSaveHandler | null) => {
      brandSaveHandlerRef.current = handler
    },
    [],
  )

  const { data: brandSettings, isLoading: brandLoading, error: brandError } = useEmailBrandSettings()
  const {
    data: editorContext,
    isLoading: contextLoading,
    error: contextError,
    refetch: refetchEditorContext,
  } = useEditorContext({ ownerKind, ownerId, templateKey })
  // Story 26-2 / P8 — must mirror the `enabled` gate of `useEditorContext`,
  // otherwise the parent renders a loading spinner forever when templateKey
  // is missing but ownerKind/ownerId are provided (the hook stays idle).
  const editorContextSkipped = !ownerKind || !ownerId || !templateKey
  const queryClient = useQueryClient()
  // Hooks en mode raw (skipInvalidate) : pas d'invalidation onSuccess. L'orchestrateur
  // `handleSave` exécute UNE invalidation unique en fin de `Promise.allSettled` pour
  // éviter 1-4 refetches concurrents qui raceraient avec le recompute dirty.
  const upsertShellPart = useUpsertShellPart({ skipInvalidate: true })
  const deleteShellPart = useDeleteShellPart({ skipInvalidate: true })

  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [isDirty, setIsDirtyState] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [selectedLockedPart, setSelectedLockedPart] = useState<LockedShellPartKind | null>(null)
  // PUT « Personnaliser ce bloc » en cours. État dédié, PAS
  // `upsertShellPart.isPending` : l'instance de mutation est partagée avec
  // l'orchestrateur de save, son `isPending` serait aussi vrai pendant un
  // Enregistrer et désactiverait le bouton du panneau sans raison.
  const [customizing, setCustomizing] = useState(false)
  const [previewOverrides, setPreviewOverrides] = useState<BrandPreviewOverrides | null>(null)
  // Plan 4a — dirty de l'identité visuelle, combiné au dirty du corps dans la
  // disabled-rule du master Save (le menu gère son propre snapshot).
  const [identityDirty, setIdentityDirty] = useState(false)
  // 🔴 TROISIÈME ÉTAT DE MODIFICATION, sur le modèle de `identityDirty` — et
  // surtout PAS agrégé dans `setDirty`.
  //
  // `handleEditorUpdate` RECALCULE `isDirty` intégralement depuis le canevas à
  // chaque événement `update` de GrapesJS (et `handleSave` le recalcule aussi,
  // en fin d'enregistrement). Écrire l'objet dans cet état-là produirait une
  // PERTE SILENCIEUSE : modifier l'objet, toucher le canevas, annuler son
  // geste — le MJML redevient identique à la référence, `dirty` repasse à
  // `false`, la pastille s'éteint et la garde « Quitter sans enregistrer ? »
  // ne se déclenche plus. Un état séparé, combiné par `||` à ses points
  // d'usage, est le seul motif correct ; c'est déjà celui de `identityDirty`.
  const [subjectState, setSubjectState] = useState<EmailSubjectState>(EMPTY_SUBJECT_STATE)
  const subjectDirty = subjectState.dirty
  const subjectBlockReason = subjectState.blockReason

  const setDirty = useCallback(
    (dirty: boolean) => {
      isDirtyRef.current = dirty
      setIsDirtyState(dirty)
    },
    [],
  )

  // P1 (review) — propage le dirty COMBINÉ (corps/zones + identité visuelle +
  // objet) au parent (garde « Quitter sans enregistrer ? » + beforeunload). Ni
  // le dirty identité ni le dirty objet ne transitent par setDirty (réservé
  // corps/zones) ; sans ça une modif de marque ou d'objet seule serait perdue
  // sans confirmation.
  useEffect(() => {
    onDirtyChange(isDirty || identityDirty || subjectDirty)
  }, [isDirty, identityDirty, subjectDirty, onDirtyChange])

  const handleEditorUpdate = useCallback(() => {
    const wrapper = editorRef.current
    if (!wrapper) return
    // L3a (système) — dirty tracking par extraction des 2 zones éditables,
    // comparées aux ancres intro/signature. Le body figé n'est jamais dirty.
    if (isSystem) {
      let zones: { introText: string; signatureText: string }
      try {
        zones = extractSystemZones(
          wrapper.editor.getWrapper() as unknown as SystemZoneWrapperLike,
        )
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[MjmlEditorOverlay] system dirty tracker extract failed:', err)
        }
        return
      }
      const dirty =
        zones.introText !== initialIntroRef.current ||
        zones.signatureText !== initialSignatureRef.current
      if (dirty !== isDirtyRef.current) setDirty(dirty)
      return
    }
    // Invitation — dirty tracking multi-sections (body + header/footer + mj-body
    // + carte content-wrapper) via isShellDirty, complété par la carte. Le garde
    // isShellMarkersIntact rejette un canvas corrompu (non sauvegardable).
    const fullMjml = wrapper.getMjml()
    if (!isShellMarkersIntact(fullMjml)) {
      if (isDirtyRef.current) setDirty(false)
      return
    }
    let dirty: boolean
    try {
      if (editorContextSkipped) {
        // Legacy flow — pas de contexte shell-parts (overlay invoqué sans
        // owner) : dirty tracker body-only vs `initialBodyRef`.
        const currentBody = extractBodyFragment(fullMjml)
        dirty = currentBody.trim() !== initialBodyRef.current.trim()
      } else {
        const dirtyMap = isShellDirty(fullMjml, {
          initialBodyMjml: initialBodyRef.current,
          initialHeaderMjml: initialHeaderRef.current,
          initialFooterMjml: initialFooterRef.current,
          initialMjBodyAttrs: initialMjBodyAttrsRef.current,
        })
        const dCard =
          normalizeShellFragment(extractContentWrapperFromCanvas(fullMjml)) !==
          initialContentWrapperRef.current
        dirty = dirtyMap.header || dirtyMap.body || dirtyMap.footer || dirtyMap.mjBody || dCard
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[MjmlEditorOverlay] dirty tracker extract failed:', err)
      }
      if (isDirtyRef.current) setDirty(false)
      return
    }
    if (dirty !== isDirtyRef.current) {
      setDirty(dirty)
    }
  }, [editorContextSkipped, isSystem, setDirty])

  // Initialize the editor exactly once per overlay mount, on the first render
  // where brand settings AND (when applicable) editor context are loaded.
  // Depending on the boolean `editorReady` (instead of the resolved objects)
  // prevents a refetch (e.g. on window focus, which TanStack Query does by
  // default) from destroying the editor and silently discarding dirty edits.
  //
  // Contract: the overlay MUST be unmounted (`open=false` or hosting parent
  // re-mounts) when `ownerKind`/`ownerId` changes. Changing them while the
  // overlay stays mounted will NOT re-init the editor — `editorContext` is
  // intentionally not in the deps to preserve dirty edits across refetches.
  const brandReady = !!brandSettings
  const contextReady = editorContextSkipped || !!editorContext
  const editorReady = brandReady && contextReady
  useEffect(() => {
    if (!editorReady || !brandSettings || !containerRef.current) return
    const brand = brandTokensFromSettings(brandSettings)
    const canvasShell = toCanvasShell(editorContext)
    // L3a (système) — le corps est composé depuis les zones intro/signature ;
    // en invitation, on charge le body fragment persisted.
    const bodyForCanvas = isSystem
      ? composeSystemCanvasBody(templateKey as SystemTemplateKey, systemIntroText, systemSignatureText)
      : initialBodyMjml
    const fullMjml = wrapBodyForEditing(bodyForCanvas, brand, canvasShell, { ownerKind, isSystem })
    const wrapper = initEmailEditor(containerRef.current, fullMjml, {
      variables,
      brand,
      onEditorUpdate: handleEditorUpdate,
      onLockedShellSelection: (payload) =>
        setSelectedLockedPart(payload ? payload.partKind : null),
      // L3a — mode système : gèle le corps sauf les 2 zones intro/sig (CTA figé).
      constrainedEditableZoneClasses: isSystem ? SYSTEM_EDITABLE_ZONE_CLASSES : undefined,
    })
    editorRef.current = wrapper
    mountedRef.current = true
    // Body ancre normalisée (sans markers BODY:START/END) : extractBodyFragment
    // retourne le contenu ENTRE les marqueurs, la comparaison dirty doit être
    // symétrique — sinon dirty permanent sur un corps stocké AVEC markers
    // (forme d'usine). Les deux formes coexistent en base : aucun endpoint
    // d'écriture n'exige les marqueurs.
    initialBodyRef.current = stripBodyMarkers(bodyForCanvas)
    // L3a (système) — initialiser les ancres zones au mount.
    initialIntroRef.current = systemIntroText
    initialSignatureRef.current = systemSignatureText
    // Hydratation des ancres shell depuis le résolu cascade serveur (forme
    // normalisée, sans marqueurs éditeur css-class/data-*) pour comparer
    // apples-to-apples avec le canvas normalisé.
    initialHeaderRef.current = normalizeShellFragment(editorContext?.header.contentMjml ?? '')
    initialFooterRef.current = normalizeShellFragment(editorContext?.footer.contentMjml ?? '')
    initialMjBodyAttrsRef.current = resolveMjBodyAttrs(editorContext)
    initialContentWrapperRef.current = normalizeShellFragment(
      editorContext?.contentWrapper?.contentMjml ?? CARD_DEFAULT_STORAGE,
    )
    setDirty(false)
    return () => {
      mountedRef.current = false
      wrapper.destroy()
      editorRef.current = null
      // Reset the locked-shell panel state so a remount starts clean.
      setSelectedLockedPart(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorReady])

  // Live preview de la marque : à chaque changement d'overrides poussé par
  // <EmailIdentityMenu>, re-wrappe le corps courant du canvas avec le brand
  // effectif (serveur + overrides). On extrait puis re-wrappe → les édits en
  // cours sont préservés ; setMjmlSilently ne touche pas au dirty tracker. Le
  // run initial est ignoré (l'init a déjà wrappé avec le brand serveur).
  // P3 — système ET invitation : `setMjmlSilently` rejoue le même lock pass que
  // l'init (`applyShellLocks`), donc l'éditabilité reste inchangée. Le chemin
  // diffère seulement par l'extraction du corps : le système recompose depuis
  // les 2 zones COURANTES (intro/sig) via `composeSystemCanvasBody` — jamais
  // `extractBodyFragment` (forme invitation, marqueurs BODY) qui corromprait
  // les zones système verrouillées.
  useEffect(() => {
    if (previewMountRef.current) {
      previewMountRef.current = false
      return
    }
    const wrapper = editorRef.current
    if (!wrapper || !brandSettings) return
    const brand = brandTokensFromSettings(
      previewOverrides ? { ...brandSettings, ...previewOverrides } : brandSettings,
    )
    const canvasShell = toCanvasShell(editorContext)
    if (isSystem) {
      let zones: { introText: string; signatureText: string }
      try {
        zones = extractSystemZones(
          wrapper.editor.getWrapper() as unknown as SystemZoneWrapperLike,
        )
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[MjmlEditorOverlay] system live-preview extract failed:', err)
        }
        return
      }
      const bodyForCanvas = composeSystemCanvasBody(
        templateKey as SystemTemplateKey,
        zones.introText,
        zones.signatureText,
      )
      wrapper.setMjmlSilently(wrapBodyForEditing(bodyForCanvas, brand, canvasShell, { ownerKind, isSystem }))
      return
    }
    const fullMjml = wrapper.getMjml()
    if (!isBodyMarkerIntact(fullMjml)) return
    let currentBody: string
    try {
      currentBody = extractBodyFragment(fullMjml)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[MjmlEditorOverlay] live-preview extract failed:', err)
      }
      return
    }
    wrapper.setMjmlSilently(wrapBodyForEditing(currentBody, brand, canvasShell, { ownerKind, isSystem }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOverrides])

  // P4 — Reset the locked-shell panel if the editor context goes away
  // (refetch / invalidation between header/footer origin changes). Without
  // this, the overlay would briefly hide the panel then re-show it with
  // potentially different origin data the user never clicked for.
  useEffect(() => {
    if (!editorContext) setSelectedLockedPart(null)
  }, [editorContext])

  // Garde `beforeunload` tant qu'il reste quelque chose à enregistrer.
  //
  // 🔴 L'OUBLI DE `subjectDirty` ICI EST UNE PERTE DE TRAVAIL SILENCIEUSE :
  // modifier SEULEMENT l'objet, fermer l'onglet, et le navigateur ne demande
  // rien. Deux occurrences à tenir ensemble, la condition et le tableau de
  // dépendances — la seconde seule suffit à figer la garde sur un état périmé.
  useEffect(() => {
    if (!isDirty && !identityDirty && !subjectDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, identityDirty, subjectDirty])

  const handleSave = useCallback(async () => {
    const wrapper = editorRef.current
    if (!wrapper) return
    // Le bouton reste FOCALISABLE quand l'objet est invalide (`aria-disabled`,
    // pas `disabled`) : il peut donc être activé, et c'est ici qu'on l'arrête.
    // Le motif est affiché par la ligne Objet et rattaché au bouton par
    // `aria-describedby` — il nomme la condition, il ne constate pas.
    if (subjectBlockReason) return
    // L3a (système) — court-circuiter : extraire les 2 zones, gate FR55 (variables
    // critiques), puis onSaveSystem({introText, signatureText}). Pas de bodyMjml.
    if (isSystem) {
      let zones: { introText: string; signatureText: string }
      try {
        zones = extractSystemZones(
          wrapper.editor.getWrapper() as unknown as SystemZoneWrapperLike,
        )
      } catch (err) {
        if (import.meta.env.DEV) console.error('[MjmlEditorOverlay]', err)
        toast.error('Zones éditables introuvables — impossible de sauvegarder')
        return
      }
      const missing = findMissingSystemCriticalVariables(
        templateKey as SystemTemplateKey,
        zones.introText,
        zones.signatureText,
      )
      if (missing.length > 0) {
        const tokens = missing.map((n) => `{{${n}}}`).join(', ')
        toast.error(`Variables critiques manquantes : ${tokens}`)
        return
      }
      setSaving(true)
      const brandSaveSystem = brandSaveHandlerRef.current
      const zonesDirty = isDirtyRef.current
      // L'objet voyage dans la MÊME requête que les deux zones : il n'ouvre pas
      // de branche à lui dans le `Promise.allSettled`. Conséquence directe —
      // une modification d'objet SEULE doit quand même déclencher l'appel, d'où
      // le `|| subjectDirty`.
      const systemPayload = { ...zones, ...subjectState.payload }
      try {
        const [brandResult, systemResult] = await Promise.allSettled([
          brandSaveSystem ? brandSaveSystem() : Promise.resolve({ status: 'skip' as const }),
          zonesDirty || subjectDirty ? onSaveSystem?.(systemPayload) : undefined,
        ])
        if (brandLegFailed(brandResult)) {
          toast.error("L'identité visuelle n'a pas pu être enregistrée")
        }
        if (systemResult.status === 'rejected') throw systemResult.reason
        if (mountedRef.current) {
          if (zonesDirty) {
            initialIntroRef.current = zones.introText
            initialSignatureRef.current = zones.signatureText
          }
          setDirty(false)
        }
      } catch (err) {
        toast.error(
          userFacingErrorMessage(
            err,
            "L'enregistrement des zones éditables a échoué. Le texte modifié reste affiché, réessayez.",
          ),
        )
      } finally {
        if (mountedRef.current) setSaving(false)
      }
      return
    }
    // Invitation — orchestration multi-legs (body + header/footer/mj-body +
    // carte content-wrapper + brand) via Promise.allSettled. Legs shell-parts
    // routés PUT/DELETE/skip selon isShellDirty + allers-retours cascade.
    const fullMjml = wrapper.getMjml()
    // onSave requis (le host invitation le fournit toujours ; garde TS depuis
    // que la prop est optionnelle pour le mode système).
    if (!onSave) return

    // Legacy flow — pas de contexte shell-parts (overlay invoqué sans owner) :
    // route body-only. Extrait AVANT le garde isShellMarkersIntact car un canvas
    // sans cascade content-wrapper n'émet pas de <mj-wrapper> (le garde le
    // rejetterait à tort). extractBodyFragment n'a besoin que des marqueurs BODY
    // (toujours présents). Body SANS marqueurs (le conducteur PATCH stocke le
    // payload tel quel — invitationPatchSchema n'impose pas les marqueurs).
    if (editorContextSkipped) {
      let bodyOnly: string
      try {
        bodyOnly = extractBodyFragment(fullMjml)
      } catch (err) {
        if (import.meta.env.DEV) console.error('[MjmlEditorOverlay]', err)
        toast.error('Marqueurs de corps absents — impossible de sauvegarder')
        return
      }
      setSaving(true)
      try {
        await onSave(bodyOnly, subjectState.payload)
        if (!mountedRef.current) return
        initialBodyRef.current = bodyOnly
        setDirty(false)
      } catch (err) {
        if (mountedRef.current) {
          toast.error(
            userFacingErrorMessage(
              err,
              "Le corps du modèle n'a pas pu être enregistré. Le contenu reste affiché, réessayez.",
            ),
          )
        }
      } finally {
        if (mountedRef.current) setSaving(false)
      }
      return
    }

    // Garde anti-payload-corrompu : un canvas dont les marqueurs structurels
    // (mj-body, carte mj-wrapper, BODY:START/END) sont absents/dupliqués/désor-
    // donnés n'est pas sauvegardable (extractShellSections produirait des
    // fragments incohérents).
    if (!isShellMarkersIntact(fullMjml)) {
      toast.error('Structure du modèle corrompue — impossible de sauvegarder')
      return
    }

    // Extraction des sections canvas : body (entre marqueurs), header/footer
    // (déjà normalisés par extractShellSections), attrs mj-body, carte (forme
    // stockage brute + normalisée pour la comparaison).
    let canvasBody: string
    let canvasHeader: string
    let canvasFooter: string
    let canvasMjBodyAttrs: ResolvedMjBodyAttrsForCanvas
    let canvasCard: string
    let cardRaw: string
    try {
      canvasBody = extractBodyFragment(fullMjml)
      const sections = extractShellSections(fullMjml)
      canvasHeader = sections.header
      canvasFooter = sections.footer
      canvasMjBodyAttrs = extractMjBodyAttrs(fullMjml)
      cardRaw = extractContentWrapperFromCanvas(fullMjml)
      canvasCard = normalizeShellFragment(cardRaw)
    } catch (err) {
      if (import.meta.env.DEV) console.error('[MjmlEditorOverlay]', err)
      toast.error('Extraction des sections impossible — sauvegarde annulée')
      return
    }

    // Dirty per section vs ancres locales.
    const dirtyBody = canvasBody.trim() !== initialBodyRef.current.trim()
    const dirtyHeader = canvasHeader !== initialHeaderRef.current
    const dirtyFooter = canvasFooter !== initialFooterRef.current
    const dirtyMjBody = !mjBodyAttrsEqual(canvasMjBodyAttrs, initialMjBodyAttrsRef.current)
    const dirtyCard = canvasCard !== initialContentWrapperRef.current

    type Leg = 'body' | 'header' | 'footer' | 'mjBody' | 'contentWrapper' | 'brand'
    type Action = 'patch' | 'put' | 'delete' | 'skip'

    // Body : asymétrie vs editorContext (gel cascade body) — comparaison
    // exclusive à l'ancre locale `initialBodyRef`.
    //
    // L'OBJET EMPRUNTE CETTE MÊME BRANCHE, et c'est voulu : il part dans la
    // même requête que le corps plutôt que d'ouvrir une branche à lui. Une
    // modification d'objet SEULE doit donc router le corps en `patch`, sinon
    // l'objet ne partirait jamais. Le corps renvoyé est alors identique à
    // celui en base — écriture idempotente, pas une régression.
    const bodyRoute: Action = dirtyBody || subjectDirty ? 'patch' : 'skip'

    // Header/footer/mj-body : double comparaison (vs ancre pour le dirty, vs
    // résolu cascade pour décider PUT vs DELETE vs skip). Owner = ownerKind/
    // ownerId courant (= COMMON_SHELL_OWNER pour l'éditeur Invitation).
    const headerRoute: Action = routeShellLegAction({
      dirty: dirtyHeader,
      canvasMatchesCascade:
        canvasHeader === normalizeShellFragment(editorContext?.header.contentMjml ?? ''),
      origin: editorContext?.header.origin,
      ownerKind,
    })
    const footerRoute: Action = routeShellLegAction({
      dirty: dirtyFooter,
      canvasMatchesCascade:
        canvasFooter === normalizeShellFragment(editorContext?.footer.contentMjml ?? ''),
      origin: editorContext?.footer.origin,
      ownerKind,
    })
    const mjBodyRoute: Action = routeShellLegAction({
      dirty: dirtyMjBody,
      canvasMatchesCascade: mjBodyAttrsEqual(canvasMjBodyAttrs, resolveMjBodyAttrs(editorContext)),
      origin: editorContext?.mjBody.origin,
      ownerKind,
    })
    // Carte content-wrapper γ → toujours COMMON_SHELL_OWNER (template[invitation],
    // propriétaire commun inter-modèles), JAMAIS owner-spécifique.
    const cardRoute: Action = routeShellLegAction({
      dirty: dirtyCard,
      canvasMatchesCascade:
        canvasCard ===
        normalizeShellFragment(editorContext?.contentWrapper?.contentMjml ?? CARD_DEFAULT_STORAGE),
      origin: editorContext?.contentWrapper?.origin,
      ownerKind: COMMON_SHELL_OWNER.ownerKind,
    })

    // Brand leg — pas de routage cascade (soit dirty soit non). Délégué au
    // handler enregistré par <EmailIdentityMenu> (catch ses erreurs → {status}).
    const brandHandler = brandSaveHandlerRef.current
    const dirtyBrand = identityDirty && brandHandler !== null

    // Tout skip + rien dirty → avancer les ancres + reset dirty, rien à pousser
    // (aller-retour cascade vers un parent : dirty mais rien à matérialiser).
    if (
      bodyRoute === 'skip' &&
      headerRoute === 'skip' &&
      footerRoute === 'skip' &&
      mjBodyRoute === 'skip' &&
      cardRoute === 'skip' &&
      !dirtyBrand
    ) {
      if (dirtyHeader) initialHeaderRef.current = canvasHeader
      if (dirtyFooter) initialFooterRef.current = canvasFooter
      if (dirtyMjBody) initialMjBodyAttrsRef.current = canvasMjBodyAttrs
      if (dirtyCard) initialContentWrapperRef.current = canvasCard
      setDirty(false)
      return
    }

    // Annule les refetches editor-context en vol pour qu'ils ne reviennent pas
    // avec des données pré-mutation après le settled().
    await queryClient.cancelQueries({ queryKey: ['admin', 'editor-context'] })
    if (!mountedRef.current) return

    setSaving(true)
    try {
      const tasks: { leg: Leg; action: Action; promise: Promise<unknown> }[] = []

      // Body → host PATCH SANS marqueurs (le conducteur stocke le payload tel
      // quel ; le toast succès vient du conducteur via onSave).
      // L'OBJET PART DANS CETTE MÊME REQUÊTE (A10) : corps et objet
      // atterrissent ensemble ou pas du tout.
      if (bodyRoute === 'patch') {
        tasks.push({
          leg: 'body',
          action: 'patch',
          promise: onSave(canvasBody, subjectState.payload),
        })
      }
      // Header/footer → ownerKind/ownerId courant. Le serveur exige un
      // data-part-kind cohérent → tagSectionWithPartKind(section, partKind).
      if (headerRoute === 'put' && ownerKind && ownerId) {
        tasks.push({
          leg: 'header',
          action: 'put',
          promise: upsertShellPart.mutateAsync({
            ownerKind,
            ownerId,
            partKind: 'header',
            contentMjml: tagSectionWithPartKind(canvasHeader, 'header'),
          }),
        })
      } else if (headerRoute === 'delete' && ownerKind && ownerId) {
        tasks.push({
          leg: 'header',
          action: 'delete',
          promise: deleteShellPart.mutateAsync({ ownerKind, ownerId, partKind: 'header' }),
        })
      }
      if (footerRoute === 'put' && ownerKind && ownerId) {
        tasks.push({
          leg: 'footer',
          action: 'put',
          promise: upsertShellPart.mutateAsync({
            ownerKind,
            ownerId,
            partKind: 'footer',
            contentMjml: tagSectionWithPartKind(canvasFooter, 'footer'),
          }),
        })
      } else if (footerRoute === 'delete' && ownerKind && ownerId) {
        tasks.push({
          leg: 'footer',
          action: 'delete',
          promise: deleteShellPart.mutateAsync({ ownerKind, ownerId, partKind: 'footer' }),
        })
      }
      // mj-body → sérialisation des 3 attrs en <mj-body attrs></mj-body> racine
      // (validator serveur branche mj-body ; partKind 'mj-body').
      if (mjBodyRoute === 'put' && ownerKind && ownerId) {
        tasks.push({
          leg: 'mjBody',
          action: 'put',
          promise: upsertShellPart.mutateAsync({
            ownerKind,
            ownerId,
            partKind: 'mj-body',
            contentMjml: serializeMjBodyContent(canvasMjBodyAttrs),
          }),
        })
      } else if (mjBodyRoute === 'delete' && ownerKind && ownerId) {
        tasks.push({
          leg: 'mjBody',
          action: 'delete',
          promise: deleteShellPart.mutateAsync({ ownerKind, ownerId, partKind: 'mj-body' }),
        })
      }
      // Carte content-wrapper γ → COMMON_SHELL_OWNER (jamais owner-spécifique).
      // contentMjml = forme stockage brute d'extractContentWrapperFromCanvas
      // (whitelist attrs, sans data-part-kind).
      if (cardRoute === 'put') {
        tasks.push({
          leg: 'contentWrapper',
          action: 'put',
          promise: upsertShellPart.mutateAsync({
            ...COMMON_SHELL_OWNER,
            partKind: 'content-wrapper',
            contentMjml: cardRaw,
          }),
        })
      } else if (cardRoute === 'delete') {
        tasks.push({
          leg: 'contentWrapper',
          action: 'delete',
          promise: deleteShellPart.mutateAsync({
            ...COMMON_SHELL_OWNER,
            partKind: 'content-wrapper',
          }),
        })
      }
      // Brand leg — délégué au handler (catch ses erreurs, résout {status}).
      if (dirtyBrand && brandHandler) {
        tasks.push({ leg: 'brand', action: 'patch', promise: brandHandler() })
      }

      const results = await Promise.allSettled(tasks.map((t) => t.promise))

      // Agrégation per-leg + avancement des ancres au succès (anti-régression
      // C1). DELETE 404 (event disparu en parallèle) = succès idempotent.
      const legResults: Record<Leg, 'ok' | 'ko' | 'skip'> = {
        body: bodyRoute === 'skip' ? 'skip' : 'ko',
        header: headerRoute === 'skip' ? 'skip' : 'ko',
        footer: footerRoute === 'skip' ? 'skip' : 'ko',
        mjBody: mjBodyRoute === 'skip' ? 'skip' : 'ko',
        brand: dirtyBrand ? 'ko' : 'skip',
        contentWrapper: cardRoute === 'skip' ? 'skip' : 'ko',
      }

      results.forEach((result, idx) => {
        const { leg, action } = tasks[idx]
        // Brand — le handler catch ses erreurs et résout {status} (pas d'ancre
        // côté master ; le menu MAJ son snapshot interne sur succès).
        if (leg === 'brand') {
          if (result.status === 'fulfilled') {
            const value = result.value
            if (
              typeof value === 'object' &&
              value !== null &&
              'status' in value &&
              (value.status === 'ok' || value.status === 'ko' || value.status === 'skip')
            ) {
              legResults.brand = value.status
            } else if (import.meta.env.DEV) {
              console.warn('[MjmlEditorOverlay] brand handler returned unexpected shape:', value)
            }
          }
          return
        }
        const isDeleteGone =
          action === 'delete' &&
          result.status === 'rejected' &&
          isNotFoundError(result.reason)
        if (result.status !== 'fulfilled' && !isDeleteGone) return
        legResults[leg] = 'ok'
        // Avance l'ancre per-leg sur la valeur canvas (PUT) ou le résolu
        // cascade pré-mutation (DELETE — l'invalidation finale re-hydratera).
        if (leg === 'body') {
          initialBodyRef.current = canvasBody
        } else if (leg === 'header') {
          initialHeaderRef.current =
            action === 'delete'
              ? normalizeShellFragment(editorContext?.header.contentMjml ?? '')
              : canvasHeader
        } else if (leg === 'footer') {
          initialFooterRef.current =
            action === 'delete'
              ? normalizeShellFragment(editorContext?.footer.contentMjml ?? '')
              : canvasFooter
        } else if (leg === 'mjBody') {
          initialMjBodyAttrsRef.current =
            action === 'delete' ? resolveMjBodyAttrs(editorContext) : canvasMjBodyAttrs
        } else if (leg === 'contentWrapper') {
          initialContentWrapperRef.current =
            action === 'delete'
              ? normalizeShellFragment(
                  editorContext?.contentWrapper?.contentMjml ?? CARD_DEFAULT_STORAGE,
                )
              : canvasCard
        }
      })

      // Recompute dirty via ancres mises à jour — anti-régression C1.
      let recomputedDirty = false
      try {
        const recomputedFull = editorRef.current?.getMjml() ?? fullMjml
        if (isShellMarkersIntact(recomputedFull)) {
          const d = isShellDirty(recomputedFull, {
            initialBodyMjml: initialBodyRef.current,
            initialHeaderMjml: initialHeaderRef.current,
            initialFooterMjml: initialFooterRef.current,
            initialMjBodyAttrs: initialMjBodyAttrsRef.current,
          })
          const dCard =
            normalizeShellFragment(extractContentWrapperFromCanvas(recomputedFull)) !==
            initialContentWrapperRef.current
          recomputedDirty = d.header || d.body || d.footer || d.mjBody || dCard
        }
      } catch {
        recomputedDirty = isDirtyRef.current
      }
      if (mountedRef.current) setDirty(recomputedDirty)

      // Toasts simplifiés (décision Jensen) : le toast succès body vient du
      // conducteur via onSave. Body en échec → toast.error générique (le
      // conducteur ne toaste pas l'échec). Legs shell/brand en échec → toast
      // agrégé. Honnête, un seul message.
      const bodyRejection = results.find(
        (r, i) => tasks[i].leg === 'body' && r.status === 'rejected',
      ) as PromiseRejectedResult | undefined
      const shellBrandFailed =
        legResults.header === 'ko' ||
        legResults.footer === 'ko' ||
        legResults.mjBody === 'ko' ||
        legResults.contentWrapper === 'ko' ||
        legResults.brand === 'ko'
      if (bodyRejection) {
        toast.error(
          userFacingErrorMessage(
            bodyRejection.reason,
            "Le corps du message n'a pas pu être enregistré. Le contenu reste affiché, réessayez.",
          ),
        )
      } else if (shellBrandFailed) {
        toast.error("Certaines modifications n'ont pas pu être enregistrées")
      }

      // Invalidation unique (les hooks ont skipInvalidate:true) — un leg shell
      // OK ou brand OK rafraîchit le canvas editor-context.
      const anyShellOk =
        legResults.header === 'ok' ||
        legResults.footer === 'ok' ||
        legResults.mjBody === 'ok' ||
        legResults.contentWrapper === 'ok'
      const brandOk = legResults.brand === 'ok'
      if (anyShellOk || brandOk) {
        queryClient.invalidateQueries({ queryKey: ['admin', 'editor-context'] })
      }
      // Lot 3b — un leg shell modifie le DTO email-template (champ
      // `shellCustomized` qui pilote l'activation du bouton « Restaurer le
      // gabarit d'usine »). On rafraîchit ce DTO pour que le bouton reflète
      // immédiatement l'état usine / personnalisé.
      if (anyShellOk) {
        queryClient.invalidateQueries({ queryKey: ['settings', 'email-template'] })
      }
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err,
          "Une erreur inattendue a interrompu l'enregistrement. Le contenu reste affiché, mais vérifiez ce qui a été pris en compte avant de réessayer.",
        ),
      )
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }, [
    isSystem,
    onSave,
    onSaveSystem,
    setDirty,
    templateKey,
    ownerKind,
    ownerId,
    editorContext,
    editorContextSkipped,
    identityDirty,
    // `dirtyBrand` reste sur `identityDirty` SEUL, délibérément : l'objet ne
    // doit pas déclencher un enregistrement de la marque. Ce qui change ici,
    // c'est le routage du corps et la charge utile — d'où ces trois entrées.
    subjectDirty,
    subjectBlockReason,
    subjectState,
    upsertShellPart,
    deleteShellPart,
    queryClient,
  ])

  const handleResetConfirmed = useCallback(async () => {
    setShowResetConfirm(false)
    // onReset optionnel : si absent (ex. onglet système sans reset host), on
    // annule proprement plutôt que de crasher sur un appel undefined.
    if (!onReset) return
    setResetting(true)
    try {
      await onReset()
      // Le reset event a supprimé les shell_parts @ event côté serveur : recharge la
      // cascade pour que la coque re-résolue (template/brand) s'affiche, au lieu de la
      // coque event périmée capturée dans la closure.
      const refreshed = await refetchEditorContext()
      const freshContext = refreshed?.data ?? editorContext
      const wrapper = editorRef.current
      if (wrapper && brandSettings) {
        const brand = brandTokensFromSettings(brandSettings)
        const canvasShell = toCanvasShell(freshContext)
        const fullMjml = wrapBodyForEditing(defaultBodyMjml, brand, canvasShell, { ownerKind, isSystem })
        wrapper.setMjmlSilently(fullMjml)
      }
      initialBodyRef.current = defaultBodyMjml
      setDirty(false)
      // Accusé de réception émis EN DERNIER, une fois le canvas effectivement
      // restauré. Émis plus haut, un échec de `setMjmlSilently` (qui appelle
      // `editor.setComponents` sans filet) ferait cohabiter, pour un seul clic,
      // le toast de succès et le toast d'erreur du `catch`.
      if (refreshed.error) {
        // Le reset serveur a réussi (corps + coque supprimés) ; seul le
        // rafraîchissement de la cascade a échoué, donc le canvas montre encore
        // la coque event périmée. On informe sans masquer : l'admin rouvre
        // l'éditeur pour voir la coque re-héritée.
        toast.error(
          "Réinitialisation effectuée, mais l'aperçu n'a pas pu être actualisé. Rouvrez l'éditeur.",
        )
      } else {
        // Sans cette ligne, « Restaurer » ne produit aucun retour — le canvas se
        // contente de revenir au défaut. Le panel hôte est muet depuis la story
        // 26-3 (toast déplacé ici) et la ligne avait disparu dans le refactor
        // 5eebca2e du 2026-06-20 : l'éditeur est resté sans accusé de réception
        // pendant tout l'intervalle.
        // Wording au singulier « Événement » : `onReset` n'est câblé que par
        // `EventInvitationTemplatePanel` (cf. le commentaire de gate capability
        // sur le bouton) ; tout futur appelant hors événement devra l'adapter.
        toast.success('Événement réinitialisé au modèle.')
      }
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err,
          "La réinitialisation a échoué. Le modèle personnalisé n'a pas été modifié, réessayez.",
        ),
      )
    } finally {
      setResetting(false)
    }
  }, [brandSettings, defaultBodyMjml, editorContext, isSystem, onReset, ownerKind, refetchEditorContext, setDirty])

  // Crée la surcharge de coque au niveau événement — le geste que propose le
  // panneau d'héritage (« Personnaliser ce bloc »).
  //
  // Le PUT seul NE SUFFIT PAS. L'effet d'init du canvas dépend de
  // `[editorReady]` seul, délibérément (préserver les éditions en cours à
  // travers les refetches) : un refetch de contexte ne re-pousse donc jamais le
  // canvas. Sans le re-push ci-dessous, la surcharge serait bien créée en base
  // mais le bloc resterait verrouillé à l'écran jusqu'à réouverture de
  // l'éditeur — c'était le trou de la première version de ce bouton
  // (`5eebca2e^`), dont le `onSuccess` ne faisait que refermer le panneau.
  const handleCustomizeLockedPart = useCallback(async () => {
    const partKind = selectedLockedPart
    // La surcharge bloc par bloc n'existe qu'au niveau événement — cf. la
    // politique de personnalisation de la coque email, section « Portée du
    // panneau d'héritage ». Le bouton n'est rendu que sous ces conditions ; la
    // garde ferme le contrat côté handler.
    if (!partKind || ownerKind !== 'event' || !ownerId || !editorContext) return
    setCustomizing(true)
    try {
      // On PUT le résolu COURANT tel quel : la personnalisation matérialise ce
      // que l'admin voit déjà, elle ne change rien visuellement. Conséquence
      // voulue sur le dirty tracker — `normalizeShellFragment` strippe
      // `data-part-kind`, donc les ancres de coque restent valides et
      // « Enregistrer » ne doit PAS s'activer après ce clic.
      await upsertShellPart.mutateAsync({
        ownerKind,
        ownerId,
        partKind,
        contentMjml: tagSectionWithPartKind(
          editorContext[partKind].contentMjml,
          partKind,
        ),
      })
      // Instance `skipInvalidate: true` partagée avec l'orchestrateur de save :
      // le refetch est explicite, unique, et séquencé après le PUT — même
      // discipline que `handleResetConfirmed`, pas de course d'invalidation.
      const refreshed = await refetchEditorContext()
      const freshContext = refreshed?.data ?? editorContext
      const wrapper = editorRef.current
      let canvasRefreshed = false
      if (wrapper && brandSettings && !refreshed.error) {
        // Pattern du live-preview de la marque : extraire le corps courant puis
        // re-wrapper — les éditions en cours du corps sont PRÉSERVÉES (le reset,
        // lui, re-pousse `defaultBodyMjml` et les écrase). `setMjmlSilently`
        // rejoue `applyShellLocks` : c'est ce rejeu qui rend le bloc éditable,
        // `origin` valant désormais `'event'`.
        //
        // `getMjml()` est DANS le try : à ce point le PUT a déjà réussi, donc tout
        // échec en aval doit retomber sur le message honnête ci-dessous, jamais
        // sur « Erreur lors de la création de la surcharge » — qui ferait croire à
        // un échec alors que la surcharge existe en base.
        try {
          const fullMjml = wrapper.getMjml()
          if (isBodyMarkerIntact(fullMjml)) {
            const currentBody = extractBodyFragment(fullMjml)
            const brand = brandTokensFromSettings(
              previewOverrides ? { ...brandSettings, ...previewOverrides } : brandSettings,
            )
            const canvasShell = toCanvasShell(freshContext)
            wrapper.setMjmlSilently(
              wrapBodyForEditing(currentBody, brand, canvasShell, { ownerKind, isSystem }),
            )
            canvasRefreshed = true
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[MjmlEditorOverlay] customize re-push failed:', err)
          }
        }
      }
      // Review R-P6 — l'admin peut fermer l'overlay pendant l'attente réseau ;
      // les états et les toasts ne concernent plus personne. Même discipline que
      // `handleSave`, qui garde tous ses setState post-await.
      if (!mountedRef.current) return
      setSelectedLockedPart(null)
      // Accusé de réception émis EN DERNIER, une fois le canvas effectivement
      // re-poussé — même raison que `handleResetConfirmed` : émis plus haut, un
      // échec du re-push ferait cohabiter succès et erreur sur un seul clic.
      if (canvasRefreshed) {
        toast.success("Bloc personnalisé à ce niveau — vous pouvez désormais l'éditer.")
      } else {
        // La surcharge EXISTE en base ; seul l'affichage n'a pas suivi. Message
        // honnête plutôt qu'un succès muet sur un bloc resté verrouillé.
        toast.error(
          "Bloc personnalisé, mais l'éditeur n'a pas pu être actualisé. Rouvrez-le pour modifier ce bloc.",
        )
      }
    } catch (err) {
      if (mountedRef.current) {
        toast.error(
          userFacingErrorMessage(
            err,
            "La personnalisation de ce bloc a échoué. Le bloc n'a pas été modifié, réessayez.",
          ),
        )
      }
    } finally {
      if (mountedRef.current) setCustomizing(false)
    }
  }, [
    brandSettings,
    editorContext,
    isSystem,
    ownerId,
    ownerKind,
    previewOverrides,
    refetchEditorContext,
    selectedLockedPart,
    upsertShellPart,
  ])

  // Le titre affiché dans la barre d'outils. Au niveau événement c'est le NOM
  // DE L'ÉVÉNEMENT — du texte libre borné à 200 caractères par le formulaire,
  // donc une largeur que la barre ne peut pas prévoir.
  const headerTitle = title ?? "Éditeur d'email"

  // Le badge de verrou annonce-t-il un bloc HÉRITÉ ? Même prédicat que le
  // verrou du canvas et que la garde de montage du panneau d'héritage : sans
  // lui, le badge annonçait « modifiable » sur un bloc hérité, à l'écran EN MÊME
  // TEMPS que le panneau qui dit l'inverse.
  //
  // Remonté ici, au-dessus des retours anticipés, parce que la barre en a besoin
  // pour deux choses : le rendre, et savoir que son contenu a changé — les deux
  // variantes du badge ne font pas la même largeur.
  const badgeInherited =
    !!selectedLockedPart &&
    !!editorContext &&
    isShellBlockInherited(editorContext[selectedLockedPart].origin, {
      ownerKind,
      isSystem,
    })

  // Palier de la barre d'outils : le plus lisible qui TIENT, mesuré à chaque
  // changement de largeur ou de contenu. Aucun seuil en pixels — voir
  // `useToolbarTier`.
  //
  // La signature liste tout ce qui change le contenu de la barre SANS changer sa
  // largeur : l'observateur de taille est aveugle à ces changements-là, et une
  // mesure qui ne les reprend pas devient fausse au premier clic dans le canvas.
  const toolbarRef = useToolbarTier(
    [
      headerTitle,
      templateSwitcher?.value ?? '',
      selectedLockedPart ?? '',
      badgeInherited ? 'hérité' : 'modifiable',
      onReset ? 'reset' : '',
      saving ? 'enregistrement' : '',
      // 🔴 `subjectDirty` compte ici : une modification d'objet SEULE allume la
      // pastille du bouton Enregistrer, et l'observateur de taille ne voit pas
      // les changements de contenu. L'oublier fige la barre sur un palier
      // calculé pour une barre sans pastille.
      isDirty || identityDirty || subjectDirty ? 'pastille' : '',
    ].join('|'),
  )

  if (brandError) {
    return (
      <div
        className="flex h-full min-h-[60vh] items-center justify-center p-6 text-center"
        data-testid="mjml-editor-error"
      >
        <div>
          <p className="font-semibold">Impossible de charger l&apos;identité visuelle</p>
          <p className="text-sm text-muted-foreground mt-2">
            Réessayez plus tard ou contactez un administrateur.
          </p>
        </div>
      </div>
    )
  }

  if (contextError) {
    return (
      <div
        className="flex h-full min-h-[60vh] items-center justify-center p-6 text-center"
        data-testid="mjml-editor-context-error"
      >
        <div>
          <p className="font-semibold">Impossible de charger le contexte de l&apos;éditeur</p>
          <p className="text-sm text-muted-foreground mt-2">
            Réessayez plus tard ou contactez un administrateur.
          </p>
        </div>
      </div>
    )
  }

  if (brandLoading || !brandSettings) {
    return (
      <div
        className="flex h-full min-h-[60vh] items-center justify-center"
        data-testid="mjml-editor-brand-loading"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          <p className="text-sm">Chargement de l&apos;identité visuelle…</p>
        </div>
      </div>
    )
  }

  if (!editorContextSkipped && contextLoading) {
    return (
      <div
        className="flex h-full min-h-[60vh] items-center justify-center"
        data-testid="mjml-editor-context-loading"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
          <p className="text-sm">Chargement du contexte de l&apos;éditeur…</p>
        </div>
      </div>
    )
  }

  // Icône du modèle actuellement sélectionné, rendue à part dans le déclencheur
  // du sélecteur au palier icônes — voir le commentaire à son point d'usage.
  // `SelectValue` ne rend le contenu de l'option choisie qu'en bloc : impossible
  // d'en garder l'icône tout en masquant le texte sans la ressortir ici.
  const CurrentTemplateIcon = templateSwitcher?.options.find(
    (option) => option.value === templateSwitcher.value,
  )?.icon

  return (
    <div
      className="flex flex-col h-full"
      data-testid="mjml-editor-inner"
      data-template-key={templateKey}
    >
      {/* DS — dérogation D6 « Toolbar » (design system). Cette barre est une
          chrome d'éditeur fonctionnelle (dense, plein écran), hors règles R1–R3 :
          actions en `size="sm"`/`icon-sm`, `X` de fermeture à l'extrême droite,
          micro-copie (titre, libellé de verrou) en primitives texte = écarts
          DÉLIBÉRÉS, pas des régressions. Ne pas « normaliser » en h-9 / <Typography>
          sans revoir la densité de l'éditeur.

          AMENDEMENT 2026-08-01 — comportement responsive. La dérogation portait
          sur la DENSITÉ ; elle porte désormais aussi sur la façon dont cette barre
          se réduit, en deux étages qu'il ne faut pas confondre :
          1. QUATRE PALIERS, choisis par DÉGRADATION AU DÉBORDEMENT : la barre
             mesure ce dont elle a besoin et retient le palier le plus lisible qui
             TIENT. ENTIER : tout en toutes lettres. COURT : les libellés
             raccourcissent, le badge de verrou aussi. RESSERRÉ : le sélecteur de
             modèle perd sa valeur, son cadre et son chevron, les libellés restent.
             ICÔNES : icônes seules — TOUS les boutons, sans exception — et le
             titre resserre son plafond de mesure. Aucun seuil en pixels : un seuil
             unique ne peut pas servir six configurations dont le besoin va de 445
             à 1 266 px, et c'est exactement ce qui faisait disparaître des
             libellés avec 600 px de vide.
          2. `flex-wrap` EN PLANCHER, sous le palier icônes. C'est un filet de
             sécurité, PAS la réponse au manque de place : quand il joue, la barre
             a déjà cédé tout ce qu'elle pouvait céder. Il ne doit plus JAMAIS
             être atteint en usage — mesuré au pixel le 2026-08-01 : la barre la
             plus chargée tient sur une ligne jusqu'à 380 px, la plus légère
             jusqu'à 300. Ne pas le lire
             comme le comportement responsive de cette barre, ni le retirer. */}
      {/* LE PALIER EST MESURÉ, PAS SEUILLÉ. `useToolbarTier` essaie les quatre
          tenues du plus lisible au moins lisible, garde la première qui tient, et
          écrit le résultat en `data-toolbar-tier` — que les descendants lisent
          via `group-data-[toolbar-tier=…]/toolbar:`.

          CE QUI EST ÉTABLI SUR L'ABSENCE DE CLIGNOTEMENT, et ce qui ne l'est pas.
          Les rappels de `ResizeObserver` s'exécutent après la mise en page et
          AVANT la peinture, et la décision de premier montage est dans un
          `useLayoutEffect` : la tenue périmée n'est donc pas censée être peinte,
          et la passe de mesure ne l'est jamais (vérifié sur 641 trames
          échantillonnées). En revanche, un échantillonnage par
          `requestAnimationFrame` VOIT, à chaque franchissement de frontière, une
          trame dont la mise en page porte encore l'ancienne tenue : la barre y est
          à deux lignes et le canvas 44 px plus bas. Que cette mise en page soit
          peinte ou remplacée par la re-disposition qui suit le rappel n'a pas été
          mesuré — ne pas réécrire « aucun état intermédiaire n'est peint » comme
          un fait constaté. Le supprimer demanderait que la décision tienne dans la
          MÊME passe de mise en page, ce qu'aucun mécanisme CSS ne permet
          aujourd'hui : une requête de conteneur ne sait pas se comparer à une
          largeur mesurée publiée en propriété personnalisée.

          POURQUOI PLUS AUCUNE REQUÊTE DE CONTENEUR ICI. Elles marchaient, mais
          elles se déclenchent sur un nombre de pixels FIXE, et ce nombre était
          calé sur la barre la plus chargée du produit. Les cinq autres
          configurations subissaient le même seuil : la barre « Invitation »
          pouvait garder ses libellés entiers jusqu'à 850 px, elle les perdait à
          1 272 — 422 px trop tôt. Ce n'était pas un réglage à affiner. Ne pas
          réintroduire de variante `@[…]/toolbar:` sur cette barre : deux
          conventions côte à côte sont la dette qu'on vient de payer deux fois.

          CE QUI DÉCLENCHE UN RECALCUL : la largeur de la barre
          (`ResizeObserver`), et la signature de contenu passée au hook — titre,
          valeur du sélecteur, apparition et variante du badge, présence du bouton
          de réinitialisation, pastille d'état modifié, libellé de sauvegarde en
          cours. Changer de palier ne change pas la largeur de la barre (elle
          occupe toute la fenêtre) : l'observateur ne peut donc pas se réveiller
          lui-même. */}
      {/* `<div>` et non `<header>` : un `<header>` hors de
          `article/aside/main/nav/section` prend le rôle `banner` — un repère de
          niveau PAGE, censé être unique et global — alors que ceci est une barre
          d'outils dans une fenêtre modale. Relevé dans l'arbre d'accessibilité de
          Chrome (`dialog > banner`) le 2026-08-01. Ne pas y mettre
          `role="toolbar"` en échange : ce rôle engage le motif composite ARIA
          (navigation aux flèches, `tabindex` roulant) qui n'est pas implémenté
          ici — le poser sans le code serait une promesse fausse. */}
      <div
        ref={toolbarRef}
        className="group/toolbar flex flex-wrap items-center gap-3 data-[toolbar-tier=icones]:gap-2 border-b bg-zinc-50 px-4 py-2"
        data-testid="mjml-editor-toolbar"
      >
        {/* Le titre est le SEUL élément de cette barre qui cède, et il cède en
            permanence : c'est le seul dont la perte partielle reste
            compréhensible (on vient de choisir cet événement pour arriver ici),
            et le seul geste qui protège d'un nom à 200 caractères — contre
            lequel aucun seuil de largeur ne peut rien.

            LES TROIS CLASSES SONT SOLIDAIRES, mesuré le 2026-08-01 :
            — le PLAFOND DE LARGEUR est celui qui agit. Sous `flex-wrap`, le
              retour à la ligne est décidé AVANT la répartition des largeurs
              flexibles, sur la taille hypothétique de chaque item — laquelle vaut
              sa largeur de contenu. Un titre long ouvre donc une ligne à lui seul
              et s'y étale : `min-w-0` + troncature seuls ne changent RIEN au
              seuil de rupture (mesuré : 0 px de gain). Seul un plafond borne la
              taille hypothétique, donc le besoin de la barre.
            — `min-w-0` est nécessaire au plafond : en `white-space: nowrap`, la
              largeur min-content d'un texte vaut la chaîne entière, et un
              `min-width` l'emporte sur un `max-width` — sans lui le plafond est
              inopérant.
            — `truncate` rend la perte lisible par une ellipse.

            LE PLAFOND N'EST PLUS UNE CONSTANTE, ET C'EST UN CORRECTIF. Il vaut
            256 px (160 au palier icônes) PENDANT LA MESURE, où il borne la taille
            hypothétique ; en rendu il vaut ce plafond PLUS tout le mou que le
            palier retenu laisse dans la barre. `useToolbarTier` l'écrit dans
            `--tp-toolbar-title-max`, seul écrivain de cette propriété.

            Pourquoi : relevé à l'écran le 2026-08-01, un nom d'événement était
            amputé de 144 px pendant que 463 px restaient VIDES sur la même ligne.
            Un plafond permanent coupe du texte alors qu'il reste la place — le
            défaut d'origine de ce chantier, en miniature, sur la seule exception
            que le plan lui avait accordée. Le repli `16rem` de la déclaration
            couvre le rendu d'avant la première mesure ; il n'est jamais peint.

            La troncature ne survient donc plus que lorsque la place manque
            réellement, et elle recule continûment à mesure que la fenêtre
            s'élargit.

            `aria-hidden` sur un texte VISIBLE, ce qui demande une raison : ce
            titre est le troisième porteur de la même chaîne. Le `DialogTitle` en
            `sr-only` de l'enveloppe la donne déjà comme nom du dialogue ET comme
            titre de niveau 2 ; mesuré dans l'arbre de Chrome le 2026-08-01, un nom
            d'événement de 200 caractères était annoncé trois fois d'affilée, soit
            ~600 caractères avant le premier contrôle. Rien n'est perdu pour une
            aide technique — la chaîne reste exposée deux fois en amont.

            Le `title` est une infobulle de SOURIS, et rien d'autre : le `<p>`
            n'est pas focalisable, donc aucune restitution au clavier, et il n'y a
            pas de survol au doigt. Vérifié le 2026-08-01 avec une chaîne sonde :
            ce `title` n'apparaît nulle part dans l'arbre d'accessibilité. Ne pas
            écrire qu'il « restitue » le nom complet — il le restitue à la souris.
            Ce qui restitue vraiment le nom entier, c'est le `textContent`, que la
            troncature ne touche pas (elle est purement visuelle). */}
        <p
          className="min-w-0 max-w-[var(--tp-toolbar-title-max,16rem)] truncate text-base font-semibold"
          title={headerTitle}
          aria-hidden="true"
        >
          {headerTitle}
        </p>
        <EmailIdentityMenu
          ownerKind={ownerKind}
          onPreviewChange={setPreviewOverrides}
          onSaved={() => setPreviewOverrides(null)}
          onDirtyChange={setIdentityDirty}
          registerSaveHandler={registerBrandSaveHandler}
        />
        <EmailTestSendMenu
          templateKey={templateKey}
          ownerKind={ownerKind}
          ownerId={ownerId}
          disabled={isDirty || identityDirty || subjectDirty || saving || resetting}
        />
        {templateSwitcher && (
          <Select
            value={templateSwitcher.value}
            onValueChange={(v) => templateSwitcher.onRequestSwitch(v)}
          >
            {/* `aria-label` OBLIGATOIRE, ce n'est pas du confort : pour le rôle
                `combobox`, le nom accessible ne se calcule PAS depuis le contenu
                — le libellé affiché devient la VALEUR. Sans lui, l'arbre de
                Chrome expose `combobox value="Invitation"` sans nom du tout, et
                un lecteur d'écran annonce « Invitation, zone de liste » sans
                jamais dire de quoi il s'agit (WCAG 4.1.2, niveau A ; relevé par
                axe le 2026-08-01 sur les 8 surfaces qui portent ce sélecteur).
                Aucun risque côté « Label in Name » : ce déclencheur n'a pas de
                libellé visible propre, seulement une valeur. */}
            <SelectTrigger
              size="sm"
              className="w-auto group-data-[toolbar-tier=resserre]/toolbar:w-8 group-data-[toolbar-tier=resserre]/toolbar:justify-center group-data-[toolbar-tier=resserre]/toolbar:border-0 group-data-[toolbar-tier=resserre]/toolbar:bg-transparent group-data-[toolbar-tier=resserre]/toolbar:px-0 group-data-[toolbar-tier=resserre]/toolbar:text-foreground group-data-[toolbar-tier=resserre]/toolbar:shadow-none group-data-[toolbar-tier=resserre]/toolbar:[&>svg:last-child]:hidden group-data-[toolbar-tier=icones]/toolbar:w-8 group-data-[toolbar-tier=icones]/toolbar:justify-center group-data-[toolbar-tier=icones]/toolbar:border-0 group-data-[toolbar-tier=icones]/toolbar:bg-transparent group-data-[toolbar-tier=icones]/toolbar:px-0 group-data-[toolbar-tier=icones]/toolbar:text-foreground group-data-[toolbar-tier=icones]/toolbar:shadow-none group-data-[toolbar-tier=icones]/toolbar:[&>svg:last-child]:hidden"
              aria-label="Modèle d'e-mail"
              data-testid="mjml-editor-template-switcher"
            >
              {/* PALIERS RESSERRÉ ET ICÔNES — la valeur passe en `sr-only`, le
                  cadre et le chevron disparaissent, il ne reste que l'icône du
                  modèle courant : 204,5 → 32 px, le plus gros gain unitaire de la
                  barre après le groupe d'actions. C'est CE gain qui justifie le
                  palier `resserre` : il coupe en deux la marche vers les icônes,
                  qui abandonnait 434 px d'un coup sur la barre système.

                  Le geste n'est pas une économie opportuniste : sur cette barre,
                  la valeur du sélecteur est LE MÊME TEXTE que le titre affiché à
                  trois éléments de là (`editingSubtabLabel` alimente les deux).
                  Ce qui quitte le sélecteur reste donc lisible à l'écran. Et rien
                  n'est perdu pour une aide technique : `sr-only` garde la valeur
                  dans l'arbre d'accessibilité, là où `display: none` l'en
                  sortirait.

                  L'ICÔNE N'EST PAS DÉCORATIVE ICI, elle est ce qui empêche le
                  contrôle de devenir une boîte vide. Premier jet sans elle, jugé
                  sur la capture le 2026-08-01 : un cadre bordé ne contenant qu'un
                  chevron se lit comme un bouton cassé.

                  LE CADRE ET LE CHEVRON PARTENT AVEC LA VALEUR, décision de la
                  relecture d'écran : gardés, ils faisaient du sélecteur le seul
                  élément à surface et à bordure au milieu de carrés transparents
                  — deux fois la largeur de ses voisins pour le contenu le plus
                  dégradé. Le chevron y était en outre à 1,98:1 sur fond blanc
                  (`opacity-50` de la primitive), sous le seuil de 3:1 de
                  WCAG 1.4.11, à côté de voisins à 19:1 : le contrôle se lisait
                  comme DÉSACTIVÉ. `text-foreground` remplace le
                  `text-muted-foreground` de la primitive pour la même raison. Le
                  rôle `combobox` reste exposé par le balisage, il n'a pas besoin
                  du chevron pour être annoncé.

                  Pas de `title` en échange. Le nom de ce combobox vient de son
                  `aria-label` ; une infobulle portant la valeur retomberait en
                  description accessible et ferait annoncer deux fois la même
                  chaîne — le défaut corrigé sur « Fermer » le 2026-08-01.

                  PLUS DE `min-w-[10rem]` : ce plancher laissait 25,8 px vides
                  entre la valeur et le chevron sur la barre Invitation, soit un
                  champ visiblement à moitié rempli. */}
              {CurrentTemplateIcon && (
                <CurrentTemplateIcon
                  className="hidden h-4 w-4 shrink-0 group-data-[toolbar-tier=resserre]/toolbar:block group-data-[toolbar-tier=icones]/toolbar:block"
                  aria-hidden="true"
                />
              )}
              <span className="group-data-[toolbar-tier=resserre]/toolbar:sr-only group-data-[toolbar-tier=icones]/toolbar:sr-only">
                <SelectValue placeholder="Modèle" />
              </span>
            </SelectTrigger>
            <SelectContent>
              {templateSwitcher.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="flex items-center gap-2">
                    {option.icon && (
                      <option.icon className="h-4 w-4" aria-hidden="true" />
                    )}
                    {option.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* RÉGION LIVE MONTÉE EN PERMANENCE, et vide hors sélection.

            `role="status"` sert ici parce que le badge apparaît en réaction à une
            sélection faite à l'AUTRE bout de l'écran, dans le canvas : sans région
            live, son apparition est entièrement silencieuse pour une aide
            technique — le signal issu de l'incident du 2026-07-30 n'existait alors
            que pour les personnes voyantes (WCAG 4.1.3 Status Messages, niveau AA).
            `status` annonce sans déplacer le focus : la sélection reste dans le
            canvas.

            MAIS une région live insérée EN MÊME TEMPS que son contenu n'est pas
            annoncée par beaucoup de lecteurs d'écran — mécanisme documenté de
            longue date, et c'est ce que faisait la version précédente : le
            conteneur ET son texte arrivaient dans la même validation React. La
            région est donc montée en permanence et c'est son CONTENU qui varie.

            Elle porte aussi le signal là où le badge visuel n'existe pas : celui-ci
            est en `hidden md:flex`, donc absent sous 768 px de fenêtre, où
            sélectionner un bloc verrouillé ne produisait plus rien du tout sur les
            barres de modèle (le panneau d'héritage, lui, ne se rend qu'au niveau
            événement). Le signal VISUEL sous 768 px reste une décision produit
            ouverte ; le signal pour aide technique, lui, ne coûte rien et est rendu.

            `sr-only` la met en `position: absolute` : elle n'est donc PAS un item
            flex, ne contribue ni à la largeur de la barre ni à ses gouttières, et
            n'entre pas dans la mesure des paliers. */}
        <div
          className="sr-only"
          role="status"
          data-testid="mjml-editor-structural-badge-live"
        >
          {selectedLockedPart
            ? `${selectedLockedPart === 'header' ? 'En-tête' : 'Pied'} — ${
                structuralBadgeWording(badgeInherited).long
              }`
            : ''}
        </div>

        {selectedLockedPart && (
          // Badge rendu dans la BARRE D'OUTILS, alors que la politique de
          // personnalisation de la coque email le veut « au-dessus de chaque bloc
          // quand il est sélectionné ». Écart assumé et acté dans cette policy
          // (amendement 2026-07-31) : emplacement stable, jamais masqué, lié sans
          // ambiguïté à l'état de sélection courant.
          //
          // ⚠️ La justification qui figurait ici — « le chrome GrapesJS recouvre
          // les enfants absolus en haut du canvas » — est PÉRIMÉE : le panneau
          // d'héritage ci-dessous prouve depuis le 2026-07-30 qu'un `z-index`
          // suffit à régler cet empilement. Ce qui reste vrai est plus étroit :
          // au-dessus du bloc, ce badge entrerait en concurrence avec l'étiquette
          // de nom de composant de GrapesJS, qui vit dans le document HÔTE (donc
          // hors d'atteinte de tout z-index posé depuis l'iframe) et se rabat à
          // l'INTÉRIEUR du bloc le plus haut du canvas — collision systématique
          // sur l'en-tête, déjà payée une fois par la pastille de structure et son
          // `top: 24px`.
          //
          // `aria-hidden` : la région live ci-dessus porte déjà cette phrase. Sans
          // lui, elle serait exposée deux fois à l'arbre d'accessibilité.
          <div
            className="hidden md:flex items-center"
            aria-hidden="true"
            data-testid="mjml-editor-structural-badge-overlay"
          >
            <StructuralBadge
              label={selectedLockedPart === 'header' ? 'En-tête' : 'Pied'}
              // Prédicat calculé plus haut, parce que la barre en a aussi besoin
              // pour sa signature de contenu : les deux variantes du badge ne
              // font pas la même largeur.
              inherited={badgeInherited}
            />
          </div>
        )}

        {/* MOTIF DU BLOCAGE DE « ENREGISTRER » — règle R11 du système de design.

            R11 exige que le motif d'une action bloquée PRÉCÈDE le bouton dans
            l'ordre du DOM. La ligne Objet, elle, est SOUS la barre : elle ne
            peut donc pas porter la cible d'`aria-describedby`. Ce `<p>` la
            porte, ici, avant le groupe d'actions.

            IL EST `sr-only`, ET C'EST UN CHOIX MESURÉ, pas une économie.
            `useToolbarTier` mesure la barre en `width: max-content` puis lit sa
            largeur intrinsèque : TOUT descendant EN FLUX y contribue. Un motif
            visible, même borné en largeur, ferait donc changer la barre de
            palier au moment précis où l'administrateur lit une erreur — le
            borner rend sa contribution constante QUAND IL EST LÀ, pas entre
            présent et absent. `sr-only` le met en `position: absolute` : il
            sort du flux, ne devient pas un item flex, ne crée pas de gouttière,
            et sa contribution est nulle dans les deux états. Même argument que
            la région live du badge de structure, quelques lignes plus haut.

            LE SIGNAL VISUEL N'EST PAS PERDU pour autant, il est juste ailleurs
            — et plus près de la faute : la ligne Objet remplace son aperçu par
            ce même motif et passe son crayon en icône d'alerte. Le bouton, lui,
            porte la phrase en infobulle de souris.

            ÉCART AU PLAN (2026-08-01) : le plan demandait un `<p>` VISIBLE dans
            la barre, borné en largeur. Sa propre exigence — « contribution
            constante, présent ou absent » — est inatteignable ainsi. */}
        {subjectBlockReason && (
          <p id="mjml-editor-subject-block-reason" className="sr-only">
            {subjectBlockReason}
          </p>
        )}

        {/* `gap-1` au palier icônes : à ce palier la gouttière de premier niveau
            tombe elle aussi à 8 px, et le groupe d'actions cessait d'être un
            groupe — cinq glyphes en file homogène, la seule chose qui distinguait
            encore les actions étant le vide laissé par le `ml-auto`. Resserrer le
            groupe rétablit la lecture sans rien coûter en largeur. Les cibles
            restent séparées : 32 px de côté, 4 px entre elles, aucun
            chevauchement. */}
        <div className="ml-auto flex items-center gap-2 group-data-[toolbar-tier=icones]/toolbar:gap-1">
          {/* Gate capability : le reset n'apparaît que là où onReset est câblé. handleResetConfirmed hot-patch le canvas via wrapBodyForEditing(defaultBodyMjml, ..., { ownerKind, isSystem }) — tout futur appelant câblant onReset hors événement doit garantir des defaultBodyMjml/ownerKind cohérents. */}
          {onReset && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
              disabled={saving || resetting || !isCustom}
              // Le libellé RACCOURCIT puis se masque, il n'est jamais renommé : la
              // politique de personnalisation de la coque email légifère
              // l'unicité du reset et son périmètre, pas sa formulation. Trois
              // garde-fous — la boîte de confirmation garde la phrase complète,
              // donc rien de destructif n'arrive sans elle ; le libellé court
              // est seulement masqué visuellement, pas retiré, donc le nom
              // accessible du bouton ne devient jamais vide. Ce `title` restitue
              // la phrase complète sous le palier entier ; il ne remplace PAS un
              // `aria-label`, qui casserait « Label in Name » (WCAG 2.5.3) en
              // annonçant un nom que le libellé visible court ne contient pas.
              title="Revenir au modèle par défaut"
              className="group-data-[toolbar-tier=icones]/toolbar:w-8 group-data-[toolbar-tier=icones]/toolbar:px-0"
              data-testid="mjml-editor-reset-btn"
            >
              <RotateCcw
                className="mr-1 h-4 w-4 group-data-[toolbar-tier=icones]/toolbar:mr-0"
                aria-hidden="true"
              />
              {/* L'INTERDICTION DE L'ICÔNE SEULE SUR CE BOUTON EST LEVÉE
                  (décision du 2026-08-01). Elle reposait sur la lecture « annuler
                  ma dernière action » de la flèche circulaire, devant une action
                  qui efface TOUTE la personnalisation de l'événement. Deux faits
                  la désamorcent : ce bouton n'agit pas au clic — il ouvre une
                  confirmation qui porte la phrase entière — et le palier où il
                  perd son mot n'apparaît que dans une fenêtre que l'utilisateur a
                  lui-même réduite.

                  ⚠️ CORRECTION D'UNE AFFIRMATION FAUSSE qui figurait ici : « son
                  nom accessible reste “Réinitialiser” aux trois paliers ». Non.
                  Le nom vient du CONTENU et suit donc le libellé VISIBLE : Chrome
                  expose « Revenir au modèle par défaut » au palier entier, et
                  « Réinitialiser » aux trois autres (relevé dans l'arbre
                  d'accessibilité le 2026-08-01). C'est le comportement VOULU et
                  non un défaut — « Label in Name » (WCAG 2.5.3) exige que le nom
                  CONTIENNE le libellé visible, ce qui serait rompu par un
                  `aria-label` figé sur la forme courte pendant que l'écran affiche
                  la longue. Un nom invariant ne s'obtient donc qu'au prix d'une
                  non-conformité : on garde le nom variable. */}
              <span className="sr-only group-data-[toolbar-tier=court]/toolbar:not-sr-only group-data-[toolbar-tier=resserre]/toolbar:not-sr-only group-data-[toolbar-tier=entier]/toolbar:hidden">
                Réinitialiser
              </span>
              <span className="hidden group-data-[toolbar-tier=entier]/toolbar:inline">
                Revenir au modèle par défaut
              </span>
            </Button>
          )}

          {/* « ENREGISTRER » CÈDE COMME LES AUTRES au palier icônes, et cette
              décision en ANNULE une précédente (« garde son mot à tous les
              paliers », 2026-08-01, matinée). Les deux motifs invoqués alors ne
              tiennent pas à l'épreuve de l'écran : la pastille d'état modifié se
              pose aussi bien sur une icône (elle passe dans l'angle du bouton,
              voir la feuille de l'éditeur), et l'état « Enregistrement… » a déjà
              son sablier animé. Ce qui ne tient pas du tout, en revanche, c'est un
              bouton en toutes lettres au milieu de quatre icônes.

              EFFET DE BORD BIENVENU : le grossissement transitoire de
              « Enregistrer » vers « Enregistrement… » (+41 px) n'existe plus au
              palier icônes, donc il ne peut plus faire changer de palier en cours
              de sauvegarde.

              `relative` sert à la pastille d'angle, pas au bouton. */}
          {/* DEUX CAUSES D'INACTIVITÉ, DEUX TRAITEMENTS — dérogation R11
              « Repos, pas blocage » : c'est la cause ACTIVE qui se motive,
              jamais l'expression entière.

              — REPOS et indisponibilité opérationnelle (rien à enregistrer,
                enregistrement ou réinitialisation en cours) → vrai `disabled`,
                aucun motif dû. La primitive pose `disabled:pointer-events-none`,
                donc ce bouton-là ne reçoit ni survol ni infobulle : c'est
                cohérent, il n'a rien à expliquer.
              — INVALIDITÉ DE CONTENU (l'objet ne peut pas partir) →
                `aria-disabled` + `aria-describedby`, bouton toujours
                FOCALISABLE, et `handleSave` s'arrête en tête. Une aide
                technique atteint donc le bouton et entend pourquoi il n'agit
                pas ; la souris a l'infobulle.

              Cohérence des deux : quand un motif existe, `subjectDirty` est
              vrai, donc `disabled` est faux, donc le bouton est bien focalisable
              et `aria-disabled` fait son office. */}
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={(!isDirty && !identityDirty && !subjectDirty) || saving || resetting}
            aria-disabled={subjectBlockReason !== null}
            aria-describedby={subjectBlockReason ? 'mjml-editor-subject-block-reason' : undefined}
            title={subjectBlockReason ?? undefined}
            className="save-button relative group-data-[toolbar-tier=icones]/toolbar:w-8 group-data-[toolbar-tier=icones]/toolbar:px-0"
            data-dirty={isDirty || identityDirty || subjectDirty}
            data-testid="mjml-editor-save-btn"
          >
            {saving ? (
              <Loader2
                className="mr-1 h-4 w-4 animate-spin group-data-[toolbar-tier=icones]/toolbar:mr-0"
                aria-hidden="true"
              />
            ) : (
              <Save
                className="mr-1 h-4 w-4 group-data-[toolbar-tier=icones]/toolbar:mr-0"
                aria-hidden="true"
              />
            )}
            <span className="group-data-[toolbar-tier=icones]/toolbar:sr-only">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </span>
          </Button>

          {/* « FERMER » RENTRE DANS LE RANG. Il passait en icône dès le palier
              intermédiaire, seul de tous les boutons de la barre — une exception
              qui se lisait comme un accident. Il garde désormais son mot au palier
              court et ne cède qu'au palier icônes, avec les autres. Coût mesuré :
              65,6 px au palier court, sans conséquence puisque c'est la mesure qui
              décide.

              `w-8 px-0` plutôt que `size="icon-sm"` : le `size` est une prop, pas
              une classe, donc inconditionnel. Le résultat est le même carré
              32 × 32 que `icon-sm` (`sm` donne déjà `h-8`) — un bouton icône-seule
              doit être carré, un rectangle décale son centre optique.

              Cible tactile CALCULÉE : 32 × 32 px, mesurés (icône centrée au pixel,
              `gap-2` de 8 px avec le bouton voisin). Au-dessus du minimum WCAG
              2.5.8 (24 px) avec 33 % de marge ; en dessous des 44 px de 2.5.5
              (AAA). Ce qui écarte les 44 px, c'est la règle du système de design
              pour l'administration — la cible tactile de 44 px y est explicitement
              évacuée, l'admin étant pensée « desktop-first » — et RIEN D'AUTRE.
              En particulier, pas le type de pointeur : la première version de ce
              commentaire disait « sur une fenêtre de bureau réduite ou une
              tablette, au pointeur fin », ce qui est faux et a été relevé le
              2026-08-01. Le prédicat de capacité d'affichage de l'éditeur accepte
              un iPad mini (744 × 1133) et un iPad 10,9" (820 × 1180) — ses propres
              tests unitaires l'assèrent. À 744 px, la barre générale d'un modèle
              système, la plus chargée, est déjà au palier ICÔNES (elle y passe
              sous 844 px, mesuré) : ces cibles de 32 px apparaissent donc bel et
              bien au pointeur grossier. Les barres plus légères, elles, y sont
              encore au palier court — c'est le principe même de la dégradation au
              débordement, et non une incohérence. Deux autres imprécisions
              corrigées avec : ce
              prédicat lit une taille d'écran en pixels CSS (sensible au zoom), pas
              un écran « physique », et il a un repli ouvert — mesure absente ou
              absurde, il renvoie vrai et ne refuse rien. Ne pas réécrire
              « ne s'ouvre jamais ».

              MOTIF UNIQUE DES BOUTONS ICÔNE SEULE. Le libellé reste dans le DOM
              et n'est que MASQUÉ VISUELLEMENT (`sr-only` posé au seul palier
              icônes) ; il n'y a PAS d'`aria-label`. Le
              nom accessible vient donc du CONTENU à tous les paliers, et le
              `title` ajoute une description DIFFÉRENTE — « Fermer l'éditeur »
              contre « Fermer ». La version précédente combinait `aria-label` et
              `<span class="hidden">` : le nom et la description valaient la même
              chaîne, annoncée deux fois (« Fermer l'éditeur, bouton, Fermer
              l'éditeur », relevé dans l'arbre de Chrome le 2026-08-01). C'est ce
              motif que les trois autres boutons icône seule réutilisent, et il
              tient « Label in Name » (WCAG 2.5.3) : le libellé visible « Fermer »
              EST le nom accessible.

              `sr-only` sort l'élément du flux (`position: absolute`) : il ne
              contribue donc ni à la largeur du bouton ni à la gouttière `gap-2`
              de la primitive. Mesuré le 2026-08-01, pas supposé — le bouton reste
              à 32 × 32 au palier icônes et à 97,6 px au-dessus, inchangé.
              Même valeur de boîte que le bouton de fermeture du panneau
              d'héritage, dans ce même fichier. */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRequestCancel}
            disabled={saving || resetting}
            className="group-data-[toolbar-tier=icones]/toolbar:w-8 group-data-[toolbar-tier=icones]/toolbar:px-0"
            data-testid="mjml-editor-cancel-btn"
            title="Fermer l'éditeur"
          >
            {/* `!size-5` au palier icônes, et le `!` est nécessaire : la primitive
                `Button` impose `[&_svg]:size-4`, dont le sélecteur descendant
                l'emporte sur une classe posée à plat sur l'icône. Mesuré au
                2026-08-01 sur les pixels rendus : le tracé du X n'occupe que 60 %
                de sa zone de dessin (34,6 px² d'encre contre 72 à 97 pour ses
                voisins), donc au palier où les glyphes SONT la barre, la sortie
                était l'affordance la plus légère. Le centre optique, lui, était
                déjà juste : écart nul en x comme en y sur les quatre boutons. */}
            <X
              className="mr-1 h-4 w-4 group-data-[toolbar-tier=icones]/toolbar:mr-0 group-data-[toolbar-tier=icones]/toolbar:!size-5"
              aria-hidden="true"
            />
            <span className="group-data-[toolbar-tier=icones]/toolbar:sr-only">
              Fermer
            </span>
          </Button>
        </div>
      </div>

      {/* LA LIGNE OBJET — entre la barre d'outils et le canevas, jamais dans
          le canevas (tranché) ni dans la barre (elle y ferait basculer deux
          configurations sur six dès 1280 px, mesuré).

          Elle est un frère du conteneur de canevas, lequel est en
          `flex-1 min-h-0` : la place qu'elle prend est retirée du canevas par
          la mise en page, sans que rien n'ait à la calculer. Coût mesuré à
          1280 × 720 : 671 → 642 px de conteneur, soit −4,3 %.

          Sa hauteur est CONSTANTE par construction (cf. le composant) — c'est
          ce qui met hors de portée la famille de bugs de désynchronisation des
          poignées GrapesJS, déjà payée deux fois ici. */}
      {subjectLine && (
        <EmailSubjectLine
          subject={subjectLine.subject}
          fallbackSubject={subjectLine.fallbackSubject}
          level={subjectLine.level}
          subjectAdmin={subjectLine.subjectAdmin}
          fallbackSubjectAdmin={subjectLine.fallbackSubjectAdmin}
          variables={subjectLine.variables}
          onStateChange={setSubjectState}
        />
      )}

      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          className="h-full"
          data-testid="mjml-editor-canvas"
        />

        {selectedLockedPart &&
          editorContext &&
          // P12 — DEUX conditions, délibérément distinctes : ne pas les confondre.
          //
          // (a) Niveau événement UNIQUEMENT. Politique de la coque email,
          //     § « Portée du panneau d'héritage » : « Le panneau d'information
          //     sur le contenu hérité est **exclusif au niveau événement**. Au
          //     niveau template général […] le clic mène directement à l'édition
          //     canvas […] : le template général est une SOURCE dans la cascade,
          //     pas un niveau qui hérite. » Les éditeurs système passent
          //     `ownerKind='template'` : sans cette garde, leur coque étant
          //     toujours héritée, le panneau s'y monterait systématiquement.
          // (b) ET le bloc doit être effectivement hérité — même prédicat que le
          //     deep-lock du canvas, pour que « panneau affiché » et « bloc
          //     verrouillé » ne puissent pas diverger.
          //
          // `isShellBlockInherited` seul ne suffit PAS : il répond « ce bloc
          // a-t-il une cible de sauvegarde ici ? », vrai aussi en système, et non
          // « faut-il proposer une surcharge à ce niveau ? », qui est propre à
          // l'événement.
          ownerKind === 'event' &&
          isShellBlockInherited(editorContext[selectedLockedPart].origin, {
            ownerKind,
            isSystem,
          }) && (
            // `z-20` OBLIGATOIRE, mesuré dans l'éditeur réel le 2026-07-30 :
            // sans z-index, ce panneau est intégralement enterré et son bouton
            // ne reçoit aucun clic souris. GrapesJS empile son conteneur de
            // canvas (`.gjs-cv-canvas`, z-index 1) et son panneau latéral droit
            // (`.gjs-pn-views-container`, z-index 3) dans le MÊME contexte
            // d'empilement (`.gjs-editor` est en z-index auto) : un enfant
            // absolu en z-auto passe donc DERRIÈRE les deux — l'iframe couvrait
            // la moitié gauche du panneau, la barre latérale la moitié droite.
            // Même famille de piège que le badge structurel, contourné à
            // l'époque en le déplaçant dans la barre d'outils (cf. son
            // commentaire) ; ici on empile au-dessus.
            //
            // La valeur 20 n'est pas « n'importe quoi > 3 » : le même contexte
            // d'empilement contient aussi `.gjs-toolbar` et `.gjs-rte-toolbar`
            // (10), `.gjs-dropzone` (11) et surtout `.gjs-mdl-container` (100).
            // 20 passe au-dessus des quatre premiers et RESTE SOUS les modales —
            // ce qui est voulu : une modale doit couvrir ce panneau.
            //
            // Le décalage droit borne le panneau à la ZONE CANVAS au lieu de la
            // barre latérale : mesuré le 2026-07-30, l'ancrage `right-2`
            // recouvrait 184 des 192 px de `.gjs-pn-views-container` et
            // interceptait ses clics tant que le panneau restait ouvert.
            // `--gjs-left-width` est déclarée par GrapesJS sur `:root` (défaut
            // 15 %), donc héritée ici ; le repli couvre sa disparition.
            <div
              className="absolute top-2 right-[calc(var(--gjs-left-width,15%)+0.5rem)] z-20 w-80 max-w-[40vw] rounded-md border bg-white shadow-lg"
              data-testid="mjml-editor-locked-panel-overlay"
            >
              <div className="flex items-center justify-between border-b px-3 py-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  Bloc verrouillé
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  // `icon-sm` et non `sm` : un bouton icône-seule doit être carré
                  // (h-8 w-8) ; `sm` y ajoute `px-3` et produit un rectangle au
                  // centre optique décalé, forme donnée en contre-exemple par le
                  // système de design.
                  size="icon-sm"
                  onClick={() => setSelectedLockedPart(null)}
                  aria-label="Fermer le panneau d'héritage"
                  data-testid="mjml-editor-locked-panel-close-btn"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <LockedShellInfoPanel
                origin={editorContext[selectedLockedPart].origin}
                partKind={selectedLockedPart}
                onCustomize={handleCustomizeLockedPart}
                isCustomizing={customizing}
              />
            </div>
          )}
      </div>

      {onReset && (
        <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
          <AlertDialogContent data-testid="mjml-editor-reset-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Revenir au modèle par défaut&nbsp;?</AlertDialogTitle>
              <AlertDialogDescription>
                {/* Énumération CLOSE : elle ment dès qu'elle est incomplète.
                    L'objet y entre avec le reste. */}
                L&apos;événement reviendra au modèle par défaut. Les éditions non sauvegardées de l&apos;objet, du corps, de l&apos;en-tête et du pied seront perdues.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleResetConfirmed}>
                Restaurer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
