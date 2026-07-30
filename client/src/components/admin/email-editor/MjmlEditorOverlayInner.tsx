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
import { extractErrorMessage } from '@/lib/extractErrorMessage'
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

interface InnerProps {
  /** Template key — informational, not sent to API. Exposed as `data-template-key` for E2E selectors. */
  templateKey: string
  /** Body fragment from DB (invitation mode). Ignored in system mode (corps composé). */
  initialBodyMjml?: string
  /** Factory default body fragment — used by Reset (event editor). */
  defaultBodyMjml?: string
  variables: readonly string[]
  /** Invitation save : extrait le body fragment → onSave(bodyMjml). */
  onSave?: (bodyMjml: string) => Promise<void>
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
  onSaveSystem?: (zones: { introText: string; signatureText: string }) => Promise<void>
  /** Sélecteur de modèle dans la barre d'outils (bascule sans fermer l'éditeur).
   *  Le wrapper dirty-guarde `onRequestSwitch` ; Inner ne fait que l'appeler. */
  templateSwitcher?: TemplateSwitcherProps
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
  const [previewOverrides, setPreviewOverrides] = useState<BrandPreviewOverrides | null>(null)
  // Plan 4a — dirty de l'identité visuelle, combiné au dirty du corps dans la
  // disabled-rule du master Save (le menu gère son propre snapshot).
  const [identityDirty, setIdentityDirty] = useState(false)

  const setDirty = useCallback(
    (dirty: boolean) => {
      isDirtyRef.current = dirty
      setIsDirtyState(dirty)
    },
    [],
  )

  // P1 (review) — propage le dirty COMBINÉ (corps/zones + identité visuelle) au
  // parent (garde « Quitter sans enregistrer ? » + beforeunload). Le dirty
  // identité ne transite plus par setDirty (réservé corps/zones) ; sans ça une
  // modif brand seule serait perdue sans confirmation.
  useEffect(() => {
    onDirtyChange(isDirty || identityDirty)
  }, [isDirty, identityDirty, onDirtyChange])

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
    // symétrique (sinon dirty permanent quand le serveur stocke le body AVEC
    // markers, cf. validator D-ext6 / events.invitation_mjml).
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

  // beforeunload guard while dirty.
  useEffect(() => {
    if (!isDirty && !identityDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, identityDirty])

  const handleSave = useCallback(async () => {
    const wrapper = editorRef.current
    if (!wrapper) return
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
      try {
        const [brandResult, systemResult] = await Promise.allSettled([
          brandSaveSystem ? brandSaveSystem() : Promise.resolve({ status: 'skip' as const }),
          zonesDirty ? onSaveSystem?.(zones) : undefined,
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
        toast.error(extractErrorMessage(err, 'Erreur lors de la sauvegarde'))
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
        await onSave(bodyOnly)
        if (!mountedRef.current) return
        initialBodyRef.current = bodyOnly
        setDirty(false)
      } catch (err) {
        if (mountedRef.current) {
          toast.error(extractErrorMessage(err, 'Erreur lors de la sauvegarde'))
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
    const bodyRoute: Action = dirtyBody ? 'patch' : 'skip'

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
      if (bodyRoute === 'patch') {
        tasks.push({ leg: 'body', action: 'patch', promise: onSave(canvasBody) })
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
        toast.error(extractErrorMessage(bodyRejection.reason, 'Erreur lors de la sauvegarde'))
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
      toast.error(extractErrorMessage(err, 'Erreur lors de la sauvegarde'))
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
      toast.error(extractErrorMessage(err, 'Erreur lors de la restauration'))
    } finally {
      setResetting(false)
    }
  }, [brandSettings, defaultBodyMjml, editorContext, isSystem, onReset, ownerKind, refetchEditorContext, setDirty])

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
          sans revoir la densité de l'éditeur. */}
      <header
        className="flex items-center gap-3 border-b bg-zinc-50 px-4 py-2"
        data-testid="mjml-editor-toolbar"
      >
        <p className="text-base font-semibold">{title ?? "Éditeur d&apos;email"}</p>
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
          disabled={isDirty || identityDirty || saving || resetting}
        />
        {templateSwitcher && (
          <Select
            value={templateSwitcher.value}
            onValueChange={(v) => templateSwitcher.onRequestSwitch(v)}
          >
            <SelectTrigger
              size="sm"
              className="w-auto min-w-[10rem]"
              data-testid="mjml-editor-template-switcher"
            >
              <SelectValue placeholder="Modèle" />
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

        {selectedLockedPart && (
          // Story 26-2 fix realigning to the email-shell customization policy — the
          // structural badge appears "au-dessus du bloc sélectionné". We
          // render it inside the editor header toolbar rather than
          // absolutely-positioned over the canvas iframe: the canvas
          // iframe has its own GrapesJS toolbar that
          // overlaps absolute children at the top, causing the badge to
          // disappear behind it. The toolbar position is fully visible,
          // fixed, and unambiguously tied to the current selection state.
          <div
            className="hidden md:flex items-center"
            data-testid="mjml-editor-structural-badge-overlay"
          >
            <StructuralBadge
              label={selectedLockedPart === 'header' ? 'En-tête' : 'Pied'}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Gate capability : le reset n'apparaît que là où onReset est câblé. handleResetConfirmed hot-patch le canvas via wrapBodyForEditing(defaultBodyMjml, ..., { ownerKind, isSystem }) — tout futur appelant câblant onReset hors événement doit garantir des defaultBodyMjml/ownerKind cohérents. */}
          {onReset && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowResetConfirm(true)}
              disabled={saving || resetting || !isCustom}
              data-testid="mjml-editor-reset-btn"
            >
              <RotateCcw className="h-4 w-4 mr-1" aria-hidden="true" />
              Revenir au modèle par défaut
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={(!isDirty && !identityDirty) || saving || resetting}
            className="save-button"
            data-dirty={isDirty || identityDirty}
            data-testid="mjml-editor-save-btn"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4 mr-1" aria-hidden="true" />
            )}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRequestCancel}
            disabled={saving || resetting}
            data-testid="mjml-editor-cancel-btn"
            aria-label="Fermer l'éditeur"
          >
            <X className="h-4 w-4 mr-1" aria-hidden="true" />
            Fermer
          </Button>
        </div>
      </header>

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
            <div
              className="absolute top-2 right-2 w-80 max-w-[40vw] rounded-md border bg-white shadow-lg"
              data-testid="mjml-editor-locked-panel-overlay"
            >
              <div className="flex items-center justify-between border-b px-3 py-1.5">
                <span className="text-xs font-semibold text-muted-foreground">
                  Bloc verrouillé
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
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
                L&apos;événement reviendra au modèle par défaut. Les éditions non sauvegardées du corps, de l&apos;en-tête et du pied seront perdues.
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
