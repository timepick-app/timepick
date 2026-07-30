import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Banner, BannerDescription } from '@/components/ui/banner'
import {
  useOrganizationSettings,
  useUpdateOrganizationSettings,
  useUploadOrganizationLogo,
  useDeleteOrganizationLogo,
} from '@/hooks/useOrganizationSettings'
import {
  ORGANIZATION_DESCRIPTION_MAX_LENGTH,
  ORGANIZATION_NAME_MAX_LENGTH,
  type OrganizationSettings,
} from '@/services/organization.service'
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_HINT, IMAGE_UPLOAD_MAX_BYTES } from '@/lib/imageUpload'
import { isRichTextEmpty, isSameRichText } from '@/lib/richText'

const EMPTY_FORM_VALUES: FormValues = {
  name: '',
  description: '',
  homepageFacade: true,
}

interface FormValues {
  name: string
  description: string
  homepageFacade: boolean
}

const toFormValues = (settings: OrganizationSettings): FormValues => ({
  name: settings.name,
  description: settings.description,
  homepageFacade: settings.homepageFacade,
})

// La description est comparée sur sa forme canonique : l'éditeur et la base
// portent deux écritures du même contenu (`<p></p>` vs `''`, texte brut legacy
// vs HTML de Tiptap). Les comparer littéralement rendait la garde de resync
// ci-dessous définitivement inopérante dès que l'une des deux apparaissait.
const formValuesEqual = (a: FormValues, b: FormValues): boolean =>
     a.name === b.name
  && isSameRichText(a.description, b.description)
  && a.homepageFacade === b.homepageFacade

/**
 * OrganizationConfigPanel — panel admin pour configurer l'identité de
 * l'organisation (nom, description, logo) et le mode de la page d'accueil
 * publique (façade vs redirection directe vers la connexion).
 *
 * Conventions suivies (cf. PollingConfigPanel / SmtpConfigPanel) :
 * - React Query pour le chargement + les mutations (pas de useState+useEffect
 *   pour la synchro réseau).
 * - Resync « hors-effet » avec garde anti-écrasement : une saisie en cours
 *   n'est jamais écrasée par un refetch d'arrière-plan.
 * - Le logo part immédiatement à la sélection du fichier ; nom/description/
 *   toggle passent par le bouton Enregistrer.
 *
 * @example
 * <OrganizationConfigPanel />
 */
export const OrganizationConfigPanel = () => {
  const { data: settings, isLoading, error } = useOrganizationSettings()
  const { mutate: saveSettings, isPending: isSaving } = useUpdateOrganizationSettings()
  const { mutate: uploadLogo, isPending: isUploading } = useUploadOrganizationLogo()
  const { mutate: removeLogo, isPending: isDeletingLogo } = useDeleteOrganizationLogo()

  const [formValues, setFormValues] = useState<FormValues>(EMPTY_FORM_VALUES)
  const [syncedSettings, setSyncedSettings] = useState<OrganizationSettings | undefined>(undefined)

  // Resync hors-effet : aligne le formulaire sur les réglages fetchés dès que
  // leur référence change (montage + après mutation), sans re-rendu en cascade.
  // Garde anti-écrasement : `refetchOnWindowFocus` peut ramener un refetch
  // d'arrière-plan au retour d'onglet ; si un autre admin a modifié la config
  // entre-temps, la référence change et une saisie en cours ne doit PAS être
  // écrasée. On adopte SSI le formulaire est vierge (jamais synchronisé, ou
  // identique au dernier instantané adopté), ou si le serveur confirme déjà
  // ce que le formulaire affiche (cas : c'est notre propre sauvegarde qui revient).
  if (settings && settings !== syncedSettings) {
    if (
      syncedSettings === undefined ||
      formValuesEqual(formValues, toFormValues(syncedSettings)) ||
      formValuesEqual(formValues, toFormValues(settings))
    ) {
      setSyncedSettings(settings)
      setFormValues(toFormValues(settings))
    }
  }

  const handleNameChange = (value: string) =>
    setFormValues((prev) => ({ ...prev, name: value }))

  const handleDescriptionChange = (value: string) =>
    setFormValues((prev) => ({ ...prev, description: value }))

  const handleFacadeToggle = (checked: boolean) =>
    setFormValues((prev) => ({ ...prev, homepageFacade: checked }))

  const trimmedName = formValues.name.trim()

  const handleSave = () => {
    // Normalise le nom local sur la valeur envoyée : le serveur persiste le
    // nom trimé, et la garde de resync n'adopte la réponse que si le
    // formulaire correspond déjà à ce que le serveur renvoie.
    setFormValues((prev) => ({ ...prev, name: trimmedName }))
    saveSettings({
      name: trimmedName,
      // `<p></p>` (éditeur vidé) doit repartir en chaîne vide : c'est la
      // convention « non configuré » du contrat organisation.
      description: isRichTextEmpty(formValues.description) ? '' : formValues.description,
      homepageFacade: formValues.homepageFacade,
    })
  }

  const isBusy = isLoading || isSaving || isUploading || isDeletingLogo

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center justify-between">
          <span>Organisation</span>
          {isLoading && (
            <span className="text-sm font-normal text-muted-foreground">
              Chargement...
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Banner variant="destructive">
            <BannerDescription>
              Erreur de chargement des paramètres de l'organisation. Veuillez réessayer.
            </BannerDescription>
          </Banner>
        )}

        <p className="text-sm text-muted-foreground">
          Identité de l'organisation affichée sur la page d'accueil publique.
        </p>

        <div className="space-y-4">
          {/* Nom */}
          <div className="space-y-2">
            <Label htmlFor="organization-name">Nom de l'organisation</Label>
            <Input
              id="organization-name"
              value={formValues.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Nom de votre organisation"
              disabled={isLoading || isSaving}
              maxLength={ORGANIZATION_NAME_MAX_LENGTH}
              aria-describedby="organization-name-help"
              data-testid="organization-name-input"
            />
            <p id="organization-name-help" className="text-xs text-muted-foreground">
              Sans nom, l'organisation n'est pas affichée aux visiteurs : la page d'accueil
              publique retombe sur la connexion.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="organization-description" id="organization-description-label">
              Description
            </Label>
            <RichTextEditor
              id="organization-description"
              aria-labelledby="organization-description-label"
              value={formValues.description}
              onChange={handleDescriptionChange}
              placeholder="Courte description de votre organisation"
              disabled={isLoading || isSaving}
              maxLength={ORGANIZATION_DESCRIPTION_MAX_LENGTH}
            />
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <Label id="organization-logo-label">Logo de l'organisation</Label>
            <FileDropzone
              testId="organization-logo"
              aria-labelledby="organization-logo-label"
              onFileSelected={uploadLogo}
              accept={IMAGE_UPLOAD_ACCEPT}
              maxSizeBytes={IMAGE_UPLOAD_MAX_BYTES}
              isUploading={isUploading}
              disabled={isBusy}
              hint={IMAGE_UPLOAD_HINT}
              preview={
                settings?.logo ? (
                  <img
                    src={settings.logo}
                    alt=""
                    className="h-12 w-auto rounded border object-contain"
                    data-testid="organization-logo-preview"
                  />
                ) : undefined
              }
            >
              {settings?.logo && (
                <Button
                  type="button"
                  variant="outline-destructive"
                  size="sm"
                  onClick={() => removeLogo()}
                  disabled={isBusy}
                  data-testid="organization-logo-remove-button"
                >
                  <Trash2 aria-hidden="true" />
                  {isDeletingLogo ? 'Suppression...' : 'Supprimer le logo'}
                </Button>
              )}
            </FileDropzone>
          </div>

          <div className="h-px bg-border" />

          {/* Toggle page d'accueil publique */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="organization-homepage-facade">Page d'accueil publique</Label>
              <Switch
                id="organization-homepage-facade"
                checked={formValues.homepageFacade}
                onCheckedChange={handleFacadeToggle}
                disabled={isLoading || isSaving}
                aria-describedby="organization-homepage-facade-help"
                data-testid="organization-homepage-facade-toggle"
              />
            </div>
            <p id="organization-homepage-facade-help" className="text-xs text-muted-foreground">
              {formValues.homepageFacade
                ? "Activé : les visiteurs non connectés voient l'identité de l'organisation sur la page d'accueil."
                : 'Désactivé : les visiteurs non connectés sont redirigés directement vers la connexion.'}
            </p>
          </div>

          {/* Bouton d'action */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t max-sm:[&>button]:flex-1">
            <Button
              onClick={handleSave}
              disabled={isLoading || isSaving}
              className="min-w-[120px]"
              data-testid="organization-save-button"
            >
              {isSaving ? 'Sauvegarde...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
