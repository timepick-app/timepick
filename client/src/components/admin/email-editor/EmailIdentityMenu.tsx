import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Palette, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileDropzone } from '@/components/ui/file-dropzone'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useEmailBrandSettings,
  usePatchEmailBrandSettings,
  useResetEmailBrandSettings,
} from '@/hooks/useEmailBrandSettings'
import type {
  EmailBrandSettings,
  EmailBrandSettingsPatch,
} from '@/services/email-brand-settings.service'
import {
  FONT_FAMILY_ALLOWLIST,
  HEX_COLOR_REGEX,
} from '@/lib/email-brand-constants'
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_HINT, IMAGE_UPLOAD_MAX_BYTES } from '@/lib/imageUpload'
import api from '@/services/api'
import type { MjmlEditorOwnerKind } from './MjmlEditorOverlay'
import {
  EMAIL_BRAND_FACTORY_DEFAULTS,
  RESET_IDENTITY_BUTTON_LABEL,
  RESET_IDENTITY_CONFIRM_LABEL,
  RESET_IDENTITY_DIALOG_DESCRIPTION,
  RESET_IDENTITY_DIALOG_TITLE,
  RESET_IDENTITY_DISABLED_TOOLTIP,
  FIELD_LABEL_BORDER_RADIUS,
  FIELD_LABEL_FONT_FAMILY,
  FIELD_LABEL_LOGO,
  FIELD_LABEL_PRIMARY_COLOR,
  FIELD_LABEL_BUTTON_TEXT_COLOR,
  HEX_COLOR_INVALID_LABEL,
  IDENTITY_MENU_BUTTON_LABEL,
  IDENTITY_MENU_BUTTON_LABEL_SHORT,
  IDENTITY_MENU_TITLE,
  LOGO_REMOVE_BUTTON_LABEL,
  LOGO_UPLOAD_ERROR_GENERIC,
  MAX_BUTTON_RADIUS,
  RADIUS_CLAMPED_TOOLTIP,
} from './EmailIdentityMenu.constants'

interface IdentityFormState {
  logoUrl: string | null
  primaryColor: string
  buttonTextColor: string
  fontFamily: string
  buttonBorderRadius: number
}

export type BrandPreviewOverrides = Partial<
  Pick<
    EmailBrandSettings,
    'logoUrl' | 'primaryColor' | 'buttonTextColor' | 'fontFamily' | 'buttonBorderRadius'
  >
>

type BrandSaveResult = { status: 'ok' | 'ko' | 'skip' }

export type BrandSaveHandler = () => Promise<BrandSaveResult>

function snapshotFromSettings(settings: EmailBrandSettings): IdentityFormState {
  return {
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
    buttonTextColor: settings.buttonTextColor,
    fontFamily: settings.fontFamily,
    buttonBorderRadius: settings.buttonBorderRadius,
  }
}

function clampRadius(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(MAX_BUTTON_RADIUS, Math.max(0, Math.trunc(value)))
}

function formEquals(a: IdentityFormState, b: IdentityFormState): boolean {
  return (
    a.logoUrl === b.logoUrl &&
    a.primaryColor === b.primaryColor &&
    a.buttonTextColor === b.buttonTextColor &&
    a.fontFamily === b.fontFamily &&
    a.buttonBorderRadius === b.buttonBorderRadius
  )
}

interface EmailIdentityMenuProps {
  ownerKind: MjmlEditorOwnerKind | undefined
  // Plan 3a — preview live. Le parent merge ces overrides sur `brandSettings`
  // pour piloter le canvas sans persister. `null` = pas d'override actif.
  onPreviewChange?: (overrides: BrandPreviewOverrides | null) => void
  // Plan 4a — appelé après le PATCH brand réussi orchestré par le parent.
  // Le parent en profite pour libérer l'override preview ; le refetch
  // react-query post-PATCH propagera les valeurs serveur au canvas.
  onSaved?: () => void
  // Plan 4a — expose l'état dirty de l'identité au parent pour qu'il combine
  // avec body/shell-parts dans la disabled-rule du bouton master.
  onDirtyChange?: (isDirty: boolean) => void
  // Plan 4a — enregistre un handler de save asynchrone que le parent invoque
  // depuis son `Promise.allSettled` master. Le menu calcule le patch en
  // interne (depuis son state form vs snapshot serveur), émet la mutation
  // brand silencieuse et met à jour son snapshot sur succès. Le parent ne
  // connaît pas le payload ; il agrège seulement le résultat.
  registerSaveHandler?: (handler: BrandSaveHandler | null) => void
}

export function EmailIdentityMenu(props: EmailIdentityMenuProps) {
  // Asymétrie cascade volontaire — les 4 champs brand-wide n'ont pas de sens
  // dans un éditeur d'événement (ils ne peuvent y être surchargés). Le guard
  // précède tout hook pour éviter la violation des Rules of Hooks quand le
  // composant est démonté/remonté à la transition d'ownerKind.
  if (props.ownerKind !== 'template') {
    return null
  }
  return <EmailIdentityMenuTemplate {...props} />
}

function EmailIdentityMenuTemplate({
  onPreviewChange,
  onSaved,
  onDirtyChange,
  registerSaveHandler,
}: EmailIdentityMenuProps) {
  const [open, setOpen] = useState(false)
  const { data: settings, isLoading } = useEmailBrandSettings()
  // Plan 4a — `mutateAsync` permet à `registerSaveHandler` d'attendre la
  // résolution serveur et de mettre à jour le snapshot atomiquement avant
  // que le parent ne consolide les résultats du `Promise.allSettled`.
  const { mutateAsync: patchBrandAsync, isPending: isPatching } =
    usePatchEmailBrandSettings({ silent: true })

  // L1/D2 — reset immédiat de l'identité visuelle (endpoint serveur existant
  // `POST /admin/settings/email-brand/reset`). Indépendant du master Save :
  // persiste tout de suite et re-synchronise le form local sur la DTO factory.
  const { mutateAsync: resetBrandAsync, isPending: isResetting } =
    useResetEmailBrandSettings()
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  // Plan 4a — state hissé au composant racine pour survivre au close-without-
  // save du popover. Auparavant logé dans `IdentityMenuForm` (démonté avec
  // PopoverContent à chaque fermeture), il fallait que l'admin garde le
  // popover ouvert jusqu'au clic Save pour ne pas perdre ses édits. Désormais
  // l'admin peut fermer le popover, ré-ouvrir, puis cliquer le master Save —
  // l'état dirty se propage au parent en continu via `onDirtyChange`.
  const [form, setForm] = useState<IdentityFormState | null>(null)
  const [primaryHexInvalid, setPrimaryHexInvalid] = useState(false)
  const [buttonTextHexInvalid, setButtonTextHexInvalid] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const snapshotRef = useRef<IdentityFormState | null>(null)

  // Plan 4a review P1 — `formRef` suit `form` à chaque render. Le handler
  // `registerSaveHandler` lit `formRef.current` à l'invocation (au lieu de
  // capturer `form` à la création), ce qui permet d'enregistrer un handler
  // stable une seule fois au mount sans risque de stale closure si Save
  // survient dans le même tick que la dernière frappe.
  const formRef = useRef<IdentityFormState | null>(null)
  formRef.current = form

  // Plan 4a review P4 — mountedRef local pour gater `setForm`/`onSaved` quand
  // le PATCH résout après que l'admin a fermé l'overlay (warning React +
  // leak de fermeture sinon).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Plan 4a review P1 — `onSavedRef` permet au handler stable de référencer
  // le dernier `onSaved` sans le mettre en deps du `useEffect`.
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  useEffect(() => {
    if (!settings || form !== null) return
    const next = snapshotFromSettings(settings)
    setForm(next)
    snapshotRef.current = next
  }, [settings, form])

  const isDirty = useMemo(() => {
    if (!form || !snapshotRef.current) return false
    return !formEquals(form, snapshotRef.current)
  }, [form])

  // L1/D2 — le reset agit sur l'identité **persistée**. Si le brand serveur est
  // déjà aux valeurs d'usine, le reset serait un no-op → bouton désactivé. On
  // compare `settings` (source de vérité react-query) aux defaults factory sur
  // les 5 champs exposés par le menu (logo, couleurs, police, arrondi).
  const isBrandFactory = useMemo(() => {
    if (!settings) return true
    return (
      settings.logoUrl === EMAIL_BRAND_FACTORY_DEFAULTS.logoUrl &&
      settings.primaryColor === EMAIL_BRAND_FACTORY_DEFAULTS.primaryColor &&
      settings.buttonTextColor === EMAIL_BRAND_FACTORY_DEFAULTS.buttonTextColor &&
      settings.fontFamily === EMAIL_BRAND_FACTORY_DEFAULTS.fontFamily &&
      settings.buttonBorderRadius === EMAIL_BRAND_FACTORY_DEFAULTS.buttonBorderRadius
    )
  }, [settings])

  // Plan 4a — propage l'état dirty au parent. Le hex invalide neutralise le
  // dirty côté parent : un patch incomplet ne doit jamais flow dans le
  // Promise.allSettled (cohérent avec l'ancien `disabled={!isDirty || hexInvalid}`
  // du bouton interne).
  //
  // Plan 4a review P5 — cleanup propage `false` au démontage pour libérer
  // l'état `identityDirty` côté parent (sinon master enabled à vide après
  // navigation entre templates).
  useEffect(() => {
    const hexInvalid = primaryHexInvalid || buttonTextHexInvalid
    onDirtyChange?.(isDirty && !hexInvalid)
    return () => {
      onDirtyChange?.(false)
    }
  }, [isDirty, primaryHexInvalid, buttonTextHexInvalid, onDirtyChange])

  // Plan 3a — propage le delta `form` vs snapshot serveur au parent pour
  // alimenter la preview canvas sans persister. Les champs invalides
  // (hex partiel, police hors allowlist) sont retirés du payload d'override.
  useEffect(() => {
    if (!onPreviewChange) return
    if (!form || !snapshotRef.current) return
    const snapshot = snapshotRef.current
    const overrides: BrandPreviewOverrides = {}
    if (form.logoUrl !== snapshot.logoUrl) {
      overrides.logoUrl = form.logoUrl
    }
    if (
      form.primaryColor !== snapshot.primaryColor &&
      HEX_COLOR_REGEX.test(form.primaryColor)
    ) {
      overrides.primaryColor = form.primaryColor
    }
    if (
      form.buttonTextColor !== snapshot.buttonTextColor &&
      HEX_COLOR_REGEX.test(form.buttonTextColor)
    ) {
      overrides.buttonTextColor = form.buttonTextColor
    }
    if (
      form.fontFamily !== snapshot.fontFamily &&
      (FONT_FAMILY_ALLOWLIST as readonly string[]).includes(form.fontFamily)
    ) {
      overrides.fontFamily = form.fontFamily
    }
    if (form.buttonBorderRadius !== snapshot.buttonBorderRadius) {
      overrides.buttonBorderRadius = clampRadius(form.buttonBorderRadius)
    }
    onPreviewChange(
      Object.keys(overrides).length === 0 ? null : overrides,
    )
  }, [form, onPreviewChange])

  // Plan 4a — enregistre le handler de save auprès du parent. Le handler
  // calcule le patch côté menu (state form vs snapshot), émet le PATCH
  // silent (déjà englobé par le toast unique du master), met à jour le
  // snapshot sur succès. Retourne 'skip' si rien à patcher (form non dirty
  // ou patch vide après filtrage des champs invalides).
  //
  // Plan 4a review P1 — handler stable enregistré une seule fois au mount.
  // Il lit `formRef.current` à l'invocation (pas le `form` capturé à la
  // création), ce qui évite la stale closure si Save survient dans le même
  // tick que la dernière frappe. Sans cela, le `useEffect` ré-enregistrait
  // un nouveau handler à chaque keystroke avec un risque de race entre
  // cleanup et inscription.
  //
  // Plan 4a review P4 — sur succès, gate `setForm`/`onSaved` derrière
  // `mountedRef` pour éviter warning React si l'admin a fermé l'overlay
  // pendant le PATCH.
  useEffect(() => {
    if (!registerSaveHandler) return
    const handler: BrandSaveHandler = async () => {
      const currentForm = formRef.current
      const snapshot = snapshotRef.current
      if (!currentForm || !snapshot) return { status: 'skip' }

      const patch: EmailBrandSettingsPatch = {}
      if (currentForm.logoUrl !== snapshot.logoUrl) {
        patch.logoUrl = currentForm.logoUrl
      }
      if (
        currentForm.primaryColor !== snapshot.primaryColor &&
        HEX_COLOR_REGEX.test(currentForm.primaryColor)
      ) {
        patch.primaryColor = currentForm.primaryColor
      }
      if (
        currentForm.buttonTextColor !== snapshot.buttonTextColor &&
        HEX_COLOR_REGEX.test(currentForm.buttonTextColor)
      ) {
        patch.buttonTextColor = currentForm.buttonTextColor
      }
      if (
        currentForm.fontFamily !== snapshot.fontFamily &&
        (FONT_FAMILY_ALLOWLIST as readonly string[]).includes(currentForm.fontFamily)
      ) {
        patch.fontFamily = currentForm.fontFamily
      }
      if (currentForm.buttonBorderRadius !== snapshot.buttonBorderRadius) {
        patch.buttonBorderRadius = clampRadius(currentForm.buttonBorderRadius)
      }

      if (Object.keys(patch).length === 0) return { status: 'skip' }

      try {
        const dto = await patchBrandAsync(patch)
        if (!mountedRef.current) return { status: 'ok' }
        // Le serveur peut normaliser des valeurs (ex. clamp radius côté
        // backend). On rafraîchit le snapshot avec la réponse pour que le
        // dirty passe à false et que `onDirtyChange` se propage.
        const next = snapshotFromSettings(dto)
        snapshotRef.current = next
        setForm(next)
        // Libère l'override preview côté parent ; le refetch react-query
        // post-PATCH (déclenché par `setQueryData` dans le hook silent)
        // propagera les valeurs serveur au canvas.
        onSavedRef.current?.()
        return { status: 'ok' }
      } catch {
        // Le hook `usePatchEmailBrandSettings({ silent: true })` ne toast pas
        // — le master du parent surfacera l'échec via son toast partiel.
        // L'override preview reste actif (le form reste dirty, snapshot non
        // MAJ) pour que l'admin puisse re-tenter le Save sans perdre sa
        // sélection visuelle dans le canvas.
        return { status: 'ko' }
      }
    }
    registerSaveHandler(handler)
    return () => registerSaveHandler(null)
  }, [patchBrandAsync, registerSaveHandler])

  const updateField = useCallback(
    <K extends keyof IdentityFormState>(
      key: K,
      value: IdentityFormState[K],
    ) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    },
    [],
  )

  const handlePrimaryColorChange = useCallback(
    (raw: string) => {
      updateField('primaryColor', raw)
      setPrimaryHexInvalid(raw !== '' && !HEX_COLOR_REGEX.test(raw))
    },
    [updateField],
  )

  const handleButtonTextColorChange = useCallback(
    (raw: string) => {
      updateField('buttonTextColor', raw)
      setButtonTextHexInvalid(raw !== '' && !HEX_COLOR_REGEX.test(raw))
    },
    [updateField],
  )

  // Taille et format sont déjà validés par FileDropzone : ne reste ici que
  // l'échec serveur.
  const handleLogoUpload = useCallback(
    async (file: File) => {
      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append('image', file)
        const { data } = await api.post<{ data: Array<{ src: string }> }>(
          '/admin/uploads/email-image',
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        )
        const src = data.data[0]?.src
        if (src) updateField('logoUrl', src)
      } catch {
        toast.error(LOGO_UPLOAD_ERROR_GENERIC)
      } finally {
        setIsUploading(false)
      }
    },
    [updateField],
  )

  const handleRemoveLogo = useCallback(() => {
    updateField('logoUrl', null)
  }, [updateField])

  // L1/D2 — reset immédiat. Sur succès on re-synchronise le form local et le
  // snapshot sur la DTO factory (le form n'est ré-hydraté par l'effet
  // d'hydratation que si `form === null`), puis on libère l'override preview
  // côté parent via `onSaved` pour que le canvas reparte du brand serveur.
  // L'échec est notifié par `onError` du hook ; on garde l'état courant.
  const handleResetConfirmed = useCallback(async () => {
    try {
      const dto = await resetBrandAsync()
      if (!mountedRef.current) return
      const next = snapshotFromSettings(dto)
      snapshotRef.current = next
      setForm(next)
      // Les valeurs factory sont des hex valides — on purge les flags d'erreur
      // hex pour ne pas laisser un message « Format invalide » / aria-invalid
      // fantôme si l'admin avait une saisie hex invalide avant de réinitialiser.
      setPrimaryHexInvalid(false)
      setButtonTextHexInvalid(false)
      onSavedRef.current?.()
    } catch {
      // toast surfacé par `onError` du hook useResetEmailBrandSettings
    }
  }, [resetBrandAsync])

  const isBusy = isPatching || isUploading || isResetting
  const radiusValue = form ? clampRadius(form.buttonBorderRadius) : 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* PALIERS DE LA BARRE D'OUTILS. Ce bouton est un descendant de la barre de
          l'éditeur, qui porte `group/toolbar` et publie son palier en
          `data-toolbar-tier` : les variantes `group-data-[toolbar-tier=…]/toolbar:`
          y résolvent sans plomberie. Le palier est MESURÉ par la barre, il n'y a
          plus aucun seuil en pixels — voir `useToolbarTier`.

          Ici : libellé entier au palier entier, raccourci aux paliers court et
          resserré, icône seule au palier icônes — le libellé n'est alors que
          MASQUÉ (`sr-only`), jamais retiré, pour que le nom accessible du bouton
          reste « Identité » au lieu de disparaître.

          PAS DE `title`, délibérément. Le nom accessible de ce bouton vient de
          son CONTENU ; une infobulle portant le même texte n'est pas consommée
          par le calcul du nom et retombe en description accessible, ce qui fait
          annoncer deux fois la même chaîne. C'est le défaut corrigé sur
          « Fermer » le 2026-08-01, et aucun texte d'infobulle ne resterait
          différent du nom à TOUS les paliers, puisque le nom suit le libellé
          visible. Ce qui est perdu à l'état raccourci l'est peu : « Identité »
          est un mot porteur, et le popover qui s'ouvre nomme sa propre section.

          Le commentaire est HORS de `PopoverTrigger` : `asChild` passe par
          `React.Children.only`, et on ne lui laisse pas d'ambiguïté sur son
          enfant unique. */}
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group-data-[toolbar-tier=icones]/toolbar:w-8 group-data-[toolbar-tier=icones]/toolbar:px-0"
          data-testid="email-identity-menu-trigger"
          aria-expanded={open}
        >
          <Palette
            className="mr-1 h-4 w-4 group-data-[toolbar-tier=icones]/toolbar:mr-0"
            aria-hidden="true"
          />
          <span className="sr-only group-data-[toolbar-tier=court]/toolbar:not-sr-only group-data-[toolbar-tier=resserre]/toolbar:not-sr-only group-data-[toolbar-tier=entier]/toolbar:hidden">
            {IDENTITY_MENU_BUTTON_LABEL_SHORT}
          </span>
          <span className="hidden group-data-[toolbar-tier=entier]/toolbar:inline">
            {IDENTITY_MENU_BUTTON_LABEL}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[360px]"
        data-testid="email-identity-menu-popover"
        // Sans preventDefault, Échap remonte au Radix Dialog parent
        // (MjmlEditorOverlay) et ferme l'éditeur entier. preventDefault
        // annule aussi le close automatique de Radix → on appelle setOpen
        // explicitement.
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          // L1/D2 — un dialog de confirmation (identité) ouvert : Échap ferme
          // ce dialog (couche au-dessus), pas le popover.
          if (resetConfirmOpen) return
          setOpen(false)
        }}
        onInteractOutside={(event) => {
          // L1/D2 — le AlertDialog de confirmation est porté hors du DOM du
          // popover ; sans ce garde, un clic dans le dialog fermerait le
          // popover et démonterait le bouton/snapshot en pleine action.
          if (resetConfirmOpen) event.preventDefault()
        }}
      >
        {isLoading || !form ? (
          <div className="space-y-3" data-testid="email-identity-menu-loading">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-9 animate-pulse rounded bg-muted" />
            <div className="h-9 animate-pulse rounded bg-muted" />
            <div className="h-9 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <div
            className="space-y-4"
            data-testid="email-identity-menu-form"
            aria-busy={isBusy}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{IDENTITY_MENU_TITLE}</h3>
            </div>

            <div className="space-y-2">
              <Label id="email-identity-menu-logo-label" className="text-xs font-medium">
                {FIELD_LABEL_LOGO}
              </Label>
              <FileDropzone
                testId="email-identity-menu-logo"
                aria-labelledby="email-identity-menu-logo-label"
                onFileSelected={handleLogoUpload}
                accept={IMAGE_UPLOAD_ACCEPT}
                maxSizeBytes={IMAGE_UPLOAD_MAX_BYTES}
                isUploading={isUploading}
                disabled={isBusy}
                hint={IMAGE_UPLOAD_HINT}
                preview={
                  form.logoUrl ? (
                    <img
                      src={form.logoUrl}
                      alt=""
                      className="h-12 w-auto rounded border object-contain"
                      data-testid="email-identity-menu-logo-preview"
                    />
                  ) : undefined
                }
              >
                {form.logoUrl && (
                  <Button
                    type="button"
                    variant="outline-destructive"
                    size="sm"
                    onClick={handleRemoveLogo}
                    disabled={isBusy}
                    data-testid="email-identity-menu-logo-remove"
                  >
                    <Trash2 aria-hidden="true" />
                    {LOGO_REMOVE_BUTTON_LABEL}
                  </Button>
                )}
              </FileDropzone>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="email-identity-menu-primary-color"
                className="text-xs font-medium"
              >
                {FIELD_LABEL_PRIMARY_COLOR}
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(event) => handlePrimaryColorChange(event.target.value)}
                  disabled={isBusy}
                  className="h-9 w-12 cursor-pointer rounded border-none p-0"
                  data-testid="email-identity-menu-primary-color-picker"
                  aria-label={FIELD_LABEL_PRIMARY_COLOR}
                />
                <Input
                  id="email-identity-menu-primary-color"
                  type="text"
                  value={form.primaryColor}
                  onChange={(event) => handlePrimaryColorChange(event.target.value)}
                  disabled={isBusy}
                  placeholder="#000000"
                  aria-invalid={primaryHexInvalid}
                  aria-describedby={primaryHexInvalid ? 'email-identity-menu-primary-color-error' : undefined}
                  data-testid="email-identity-menu-primary-color-input"
                  className="w-32"
                />
              </div>
              {primaryHexInvalid && (
                <p
                  id="email-identity-menu-primary-color-error"
                  className="text-xs text-destructive"
                  role="alert"
                  data-testid="email-identity-menu-primary-color-error"
                >
                  {HEX_COLOR_INVALID_LABEL}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="email-identity-menu-button-text-color"
                className="text-xs font-medium"
              >
                {FIELD_LABEL_BUTTON_TEXT_COLOR}
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.buttonTextColor}
                  onChange={(event) => handleButtonTextColorChange(event.target.value)}
                  disabled={isBusy}
                  className="h-9 w-12 cursor-pointer rounded border-none p-0"
                  data-testid="email-identity-menu-button-text-color-picker"
                  aria-label={FIELD_LABEL_BUTTON_TEXT_COLOR}
                />
                <Input
                  id="email-identity-menu-button-text-color"
                  type="text"
                  value={form.buttonTextColor}
                  onChange={(event) => handleButtonTextColorChange(event.target.value)}
                  disabled={isBusy}
                  placeholder="#ffffff"
                  aria-invalid={buttonTextHexInvalid}
                  aria-describedby={buttonTextHexInvalid ? 'email-identity-menu-button-text-color-error' : undefined}
                  data-testid="email-identity-menu-button-text-color-input"
                  className="w-32"
                />
              </div>
              {buttonTextHexInvalid && (
                <p
                  id="email-identity-menu-button-text-color-error"
                  className="text-xs text-destructive"
                  role="alert"
                  data-testid="email-identity-menu-button-text-color-error"
                >
                  {HEX_COLOR_INVALID_LABEL}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">{FIELD_LABEL_FONT_FAMILY}</Label>
              <Select
                value={form.fontFamily}
                onValueChange={(value) => updateField('fontFamily', value)}
                disabled={isBusy}
              >
                <SelectTrigger size="sm" data-testid="email-identity-menu-font-select">
                  <SelectValue placeholder="Sélectionner une police" />
                </SelectTrigger>
                <SelectContent>
                  {FONT_FAMILY_ALLOWLIST.map((font) => (
                    <SelectItem key={font} value={font}>
                      {font}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="email-identity-menu-radius"
                className="text-xs font-medium"
              >
                {FIELD_LABEL_BORDER_RADIUS}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email-identity-menu-radius"
                  name="brand-border-radius-px"
                  type="number"
                  min={0}
                  max={MAX_BUTTON_RADIUS}
                  step={1}
                  value={radiusValue}
                  onChange={(event) =>
                    updateField(
                      'buttonBorderRadius',
                      clampRadius(Number(event.target.value)),
                    )
                  }
                  disabled={isBusy}
                  className="w-20"
                  data-testid="email-identity-menu-radius-input"
                  title={RADIUS_CLAMPED_TOOLTIP}
                  // Opt-out universel des gestionnaires de mots de passe
                  // (Bitwarden détecte « id » dans le name/id comme un champ
                  // d'identifiant et superpose son icône).
                  autoComplete="off"
                  data-bwignore="true"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                />
                <span className="text-xs text-muted-foreground">px (max 32)</span>
              </div>
            </div>

            <div className="border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetConfirmOpen(true)}
                disabled={isBrandFactory || isBusy}
                title={isBrandFactory ? RESET_IDENTITY_DISABLED_TOOLTIP : undefined}
                data-testid="email-identity-reset-btn"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                {RESET_IDENTITY_BUTTON_LABEL}
              </Button>
            </div>

            <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
              <AlertDialogContent data-testid="email-identity-reset-confirm">
                <AlertDialogHeader>
                  <AlertDialogTitle>{RESET_IDENTITY_DIALOG_TITLE}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {RESET_IDENTITY_DIALOG_DESCRIPTION}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleResetConfirmed}
                    data-testid="email-identity-reset-confirm-action"
                  >
                    {RESET_IDENTITY_CONFIRM_LABEL}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

