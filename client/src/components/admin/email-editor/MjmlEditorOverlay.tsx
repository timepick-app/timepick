import { lazy, Suspense, useState, useCallback, useRef } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
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
import { isDismissGuardedSurface, isDrawbridgePresent } from './dismissGuard'
import type { EditorSubjectProps } from './MjmlEditorOverlayInner'
import type { SubjectPatch } from '@/services/email-templates.service'
import './email-editor.css'

/**
 * Lazy-loaded inner component. The dynamic import becomes a separate Vite
 * chunk, so `grapesjs` + `grapesjs-mjml` (~700 kB) only download when an
 * admin actually opens the overlay.
 */
const MjmlEditorOverlayInner = lazy(() => import('./MjmlEditorOverlayInner'))

export type MjmlEditorOwnerKind = 'brand' | 'template' | 'event'

/**
 * L3a (D5/D6) — mode d'édition. `'invitation'` (défaut) = comportement complet
 * historique (corps éditable, shell-parts, identité visuelle). `'system'` =
 * mode contraint emails système : corps verrouillé sauf 2 zones texte, save
 * round-trip `{ introText, signatureText }` (zéro shell-parts, zéro bodyMjml).
 */
export type MjmlEditorMode = 'invitation' | 'system'
interface TemplateSwitcherOption {
  /** Stable id — the EmailSubtabId (e.g. "template-invitation"). */
  value: string
  /** Human label (e.g. "Invitation"). */
  label: string
  /** Optional leading icon. */
  icon?: LucideIcon
}

export interface TemplateSwitcherProps {
  options: TemplateSwitcherOption[]
  /** Currently selected value (the editing subtab id). */
  value: string
  /**
   * Request switching to `next`. The overlay WRAPPER intercepts this call to
   * dirty-guard: if unsaved changes exist, a confirm dialog opens first; only
   * on confirm (or when the editor is clean) does the wrapper forward `next`
   * to this callback. The host then swaps the edited template (which re-keys
   * and remounts the overlay with fresh data).
   */
  onRequestSwitch: (next: string) => void
}

export interface MjmlEditorOverlayProps {
  /** Whether the overlay is open. */
  open: boolean
  /** Template key for context (informational, not sent to API). */
  templateKey: string
  /** Nom lisible du modèle édité, affiché dans l'en-tête de l'éditeur et le titre lecteur d'écran. Défaut: « Éditeur d'email ». */
  title?: string
  /** Body fragment from DB (no shell) — loaded at editor open. Requis en
   * mode invitation ; ignoré en mode système (le corps est composé). */
  initialBodyMjml?: string
  /** Factory default body fragment — used by Reset (invitation). */
  defaultBodyMjml?: string
  /** Variable names for the palette (e.g. ['event_name', 'magic_link']). */
  variables: readonly string[]
  /** Called with extracted body fragment (+ le fragment objet) when the user clicks Save (invitation). */
  onSave?: (bodyMjml: string, subject?: SubjectPatch) => Promise<void>
  /** Called when the user confirms Reset to factory (invitation). Parent handles the API call. */
  onReset?: () => Promise<void>
  /** Called when the user closes the overlay (after dirty-check confirmation). */
  onCancel: () => void
  /** Owner kind for the editor context endpoint (Story 26-2). When provided
   * together with `ownerId`, the canvas substitutes the hardcoded header/footer
   * by the server-resolved fragments from `GET /api/admin/editor-context`. */
  ownerKind?: MjmlEditorOwnerKind
  /** Owner ID matching `ownerKind` (brand → 'brand', template → 'invitation',
   * event → event UUID). */
  ownerId?: string
  /** Indicates whether the current owner has a personalisation against its
   * parent (event with override, or general template diverging from the factory).
   * When false, the Reset button is rendered disabled — restoring a non-customised
   * owner is a no-op that would still pollute `updated_at`. */
  isCustom?: boolean
  /** L3a — mode d'édition (défaut `'invitation'`). */
  mode?: MjmlEditorMode
  /** L3a (système) — accroche courante. Requis si `mode==='system'`. */
  systemIntroText?: string
  /** L3a (système) — signature courante. Requis si `mode==='system'`. */
  systemSignatureText?: string
  /** L3a (système) — save : extraction des 2 zones (+ objet) → PATCH. */
  onSaveSystem?: (
    zones: { introText: string; signatureText: string } & SubjectPatch,
  ) => Promise<void>
  /** Sélecteur de modèle dans la barre d'outils (bascule sans fermer l'éditeur).
   *  Le wrapper intercepte `onRequestSwitch` pour dirty-guarder : si des
   *  modifications non sauvegardées existent, une confirmation s'ouvre d'abord. */
  templateSwitcher?: TemplateSwitcherProps
  /** Ligne Objet sous la barre d'outils. Absente ⇒ pas de ligne. */
  subjectLine?: EditorSubjectProps
}

function EditorSkeleton() {
  return (
    <div
      className="flex h-full min-h-[60vh] items-center justify-center"
      data-testid="mjml-editor-skeleton"
    >
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" />
        <p className="text-sm">Chargement de l&apos;éditeur…</p>
      </div>
    </div>
  )
}

export function MjmlEditorOverlay(props: MjmlEditorOverlayProps) {
  const { open, onCancel } = props
  const [isDirty, setIsDirty] = useState(false)
  // Action en attente de confirmation dirty-guard : fermeture de l'éditeur OU
  // bascule de modèle via le template-switcher. Une seule AlertDialog pilotée
  // par cet état discriminé évite de dupliquer les dialogues.
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'close' }
    | { kind: 'switch'; target: string }
    | null
  >(null)

  const handleRequestCancel = useCallback(() => {
    if (isDirty) {
      setPendingAction({ kind: 'close' })
      return
    }
    onCancel()
  }, [isDirty, onCancel])

  // Le wrapper intercepte la demande de bascule du sélecteur de modèle pour
  // dirty-guarder. Propre → on transmet tout de suite ; sale → confirmation.
  const requestSwitch = useCallback(
    (next: string) => {
      if (isDirty) {
        setPendingAction({ kind: 'switch', target: next })
        return
      }
      props.templateSwitcher?.onRequestSwitch(next)
    },
    [isDirty, props.templateSwitcher],
  )

  const handleConfirmDiscard = useCallback(() => {
    const action = pendingAction
    setPendingAction(null)
    setIsDirty(false)
    if (action?.kind === 'close') {
      onCancel()
    } else if (action?.kind === 'switch') {
      props.templateSwitcher?.onRequestSwitch(action.target)
    }
  }, [pendingAction, onCancel, props.templateSwitcher])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) handleRequestCancel()
    },
    [handleRequestCancel],
  )

  const guardDismiss = useCallback((e: Event) => {
    // Keep the editor open when the pointer/focus lands on a body-level surface
    // the admin must use while editing — the GrapesJS color picker or any
    // Drawbridge review surface (cf. dismissGuard.ts). Radix would otherwise
    // dismiss the Dialog on the first click into them.
    if (isDismissGuardedSurface(e.target)) e.preventDefault()
  }, [])

  // The Drawbridge dev extension's panel + body-level menus/comment box are
  // unusable over a modal Radix Dialog (it sets `body { pointer-events: none }`,
  // dismisses on outside click, and traps focus). When the extension is present
  // we relax the Dialog to non-modal so design review works; production (no
  // extension) keeps the modal.
  //
  // GELÉE le temps d'une ouverture : Radix rend l'overlay sous
  // `context.modal ? <Presence …/> : null`, donc une bascule en cours de vie le
  // détruit et le recrée EN FIN de `<body>` — au-dessus des fenêtres ouvertes
  // depuis, qu'il grise et dont il avale les clics (voile et fenêtre partagent
  // `z-50`, l'ordre d'arrivée arbitre). Un `useMemo` ne garantit rien : React
  // peut le réévaluer, et l'extension injecte son panneau de façon asynchrone.
  const drawbridgeRef = useRef<boolean | null>(null)
  if (!open) drawbridgeRef.current = null
  else drawbridgeRef.current ??= isDrawbridgePresent()
  const drawbridgePresent = drawbridgeRef.current === true

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange} modal={!drawbridgePresent}>
        <DialogContent
          className="timepick-email-editor max-w-full h-[100dvh] p-0 gap-0 flex flex-col overflow-hidden rounded-none border-0"
          data-testid="mjml-editor-overlay"
          data-mode={props.mode ?? 'invitation'}
          aria-describedby={undefined}
          onInteractOutside={guardDismiss}
          onPointerDownOutside={guardDismiss}
          onFocusOutside={guardDismiss}
        >
          <DialogTitle className="sr-only">{props.title ?? "Éditeur d'email"}</DialogTitle>
          <Suspense fallback={<EditorSkeleton />}>
            {open && (
              <MjmlEditorOverlayInner
                templateKey={props.templateKey}
                title={props.title}
                initialBodyMjml={props.initialBodyMjml}
                defaultBodyMjml={props.defaultBodyMjml}
                variables={props.variables}
                onSave={props.onSave}
                onReset={props.onReset}
                onDirtyChange={setIsDirty}
                onRequestCancel={handleRequestCancel}
                ownerKind={props.ownerKind}
                ownerId={props.ownerId}
                isCustom={props.isCustom}
                mode={props.mode}
                systemIntroText={props.systemIntroText}
                systemSignatureText={props.systemSignatureText}
                onSaveSystem={props.onSaveSystem}
                subjectLine={props.subjectLine}
                templateSwitcher={
                  props.templateSwitcher
                    ? {
                        options: props.templateSwitcher.options,
                        value: props.templateSwitcher.value,
                        onRequestSwitch: requestSwitch,
                      }
                    : undefined
                }
              />
            )}
          </Suspense>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open) setPendingAction(null) }}
      >
        <AlertDialogContent
          data-testid={
            pendingAction?.kind === 'switch'
              ? 'mjml-editor-switch-confirm'
              : 'mjml-editor-close-confirm'
          }
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === 'switch' ? (
                <>Changer de modèle sans enregistrer&nbsp;?</>
              ) : (
                <>Quitter sans enregistrer&nbsp;?</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === 'switch' ? (
                <>Des modifications non sauvegardées seront perdues. Changer de modèle&nbsp;?</>
              ) : (
                <>Des modifications non sauvegardées seront perdues. Continuer&nbsp;?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fermer</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDiscard}>
              Quitter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

