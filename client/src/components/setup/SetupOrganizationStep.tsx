import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { FileDropzone } from '@/components/ui/file-dropzone'
import { Button } from '@/components/ui/button'
import {
  saveSetupOrganization,
  uploadSetupOrganizationLogo,
  deleteSetupOrganizationLogo,
} from '@/services/setup.service'
import {
  ORGANIZATION_DESCRIPTION_MAX_LENGTH,
  ORGANIZATION_NAME_MAX_LENGTH,
} from '@/services/organization.service'
import { IMAGE_UPLOAD_ACCEPT, IMAGE_UPLOAD_HINT, IMAGE_UPLOAD_MAX_BYTES } from '@/lib/imageUpload'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import { isRichTextEmpty, isSameRichText } from '@/lib/richText'

/**
 * Ce que l'utilisateur a à l'écran. Le logo y est déjà une vérité serveur : il
 * est persisté dès son dépôt, donc l'URL vient toujours d'une réponse.
 */
export interface SetupOrganizationDraft {
  name: string
  description: string
  logo: string
}

/**
 * Dernier état réellement enregistré, référence de comparaison pour n'écrire
 * que ce qui a changé. Le logo n'en fait pas partie : « Continuer » n'y touche
 * jamais.
 */
export interface SetupOrganizationSaved {
  name: string
  description: string
}

/**
 * Forme canonique de l'identité : celle qui part au serveur ET celle à laquelle
 * on compare. **Une seule fonction pour les deux côtés** — hydrater la référence
 * sans passer par ici désynchronise la comparaison « rien n'a changé » et fait
 * repartir une écriture inutile (typiquement une description stockée `<p></p>`,
 * que l'éditeur rend comme vide).
 */
export const toSavedOrganization = (value: {
  name: string
  description: string
}): SetupOrganizationSaved => ({
  name: value.name.trim(),
  description: isRichTextEmpty(value.description) ? '' : value.description,
})

interface Props {
  onDone: () => void
  /** Étape précédente, quand il en existe une (calculé par SetupWizard depuis
   *  la liste des étapes). Absent sur la première étape du flux. */
  onBack?: () => void
  /** Brouillon détenu par SetupWizard, pour survivre au démontage de l'étape. */
  draft: SetupOrganizationDraft
  onDraftChange: (patch: Partial<SetupOrganizationDraft>) => void
  /** `null` tant que la lecture serveur n'a pas abouti. */
  saved: SetupOrganizationSaved | null
  onSaved: (saved: SetupOrganizationSaved) => void
  /** Hydratation en cours : les champs restent désactivés, sinon une saisie
   *  précoce serait écrasée à l'arrivée des données. */
  isLoading: boolean
  /** La lecture de l'identité enregistrée a échoué : on ne sait pas ce qu'il y a
   *  en base, donc la saisie reste verrouillée et « Continuer » n'écrit rien —
   *  écrire un formulaire vide effacerait une identité jamais affichée. */
  loadFailed: boolean
  onRetryLoad: () => void
}

/**
 * Étape (facultative) du wizard d'installation : nom, logo et description de
 * l'organisation, affichés publiquement sur la façade d'accueil.
 *
 * **Un seul bouton d'avancement, « Continuer », et c'est le seul qui écrit.** Il
 * enregistre ce qui est à l'écran sans condition : une description sans nom
 * comprise, un champ vidé compris (donc effacé). L'étape n'a plus aucun état
 * invalide — rien à désactiver, aucun motif à afficher. Le nom n'est pas ce qui
 * rend l'identité enregistrable, c'est ce qui la rend visible : sans nom, la
 * façade d'accueil retombe sur la page de connexion.
 *
 * Trois garde-fous tiennent au fait que le wizard détient le brouillon ET la
 * référence « dernier état enregistré » :
 * - reculer n'écrit rien, mais la saisie est encore à l'écran au retour ;
 * - « Continuer » n'écrit que si l'écran diffère de ce qui est enregistré (sur
 *   la forme canonique produite par `toSavedOrganization`), donc un aller-retour
 *   suivi d'un clic ne peut plus réécrire une photo périmée par-dessus une
 *   sauvegarde réussie ;
 * - si la lecture de l'identité enregistrée a échoué (`loadFailed`), on ne sait
 *   pas ce qu'il y a en base : la saisie reste verrouillée et « Continuer »
 *   avance sans rien écrire. Sans ça, un formulaire vide effacerait une identité
 *   que l'utilisateur n'a jamais eue sous les yeux.
 *
 * Seule exception au modèle : le logo est persisté dès son téléversement (son
 * aperçu l'impose) et sa suppression est immédiate — reculer ne les annule pas.
 * C'est écrit à l'écran plutôt que contourné.
 *
 * La description est du HTML riche (même contrat que la description
 * d'événement : `RichTextEditor` → allowlist `p/br/strong/em/a`, rendu par
 * `RichTextContent` sur la façade).
 */
export function SetupOrganizationStep({
  onDone,
  onBack,
  draft,
  onDraftChange,
  saved,
  onSaved,
  isLoading,
  loadFailed,
  onRetryLoad,
}: Props) {
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isDeletingLogo, setIsDeletingLogo] = useState(false)

  // La taille et le format sont déjà validés par FileDropzone : ne reste ici
  // que l'échec serveur.
  const handleLogoUpload = async (file: File) => {
    setIsUploadingLogo(true)
    try {
      const result = await uploadSetupOrganizationLogo(file)
      onDraftChange({ logo: result.logo })
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err,
          "L'envoi du logo a échoué. Le logo n'a pas été modifié, réessayez.",
        ),
      )
    } finally {
      setIsUploadingLogo(false)
    }
  }

  const handleRemoveLogo = async () => {
    setIsDeletingLogo(true)
    try {
      await deleteSetupOrganizationLogo()
      onDraftChange({ logo: '' })
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err,
          "La suppression du logo a échoué. Le logo n'a pas été supprimé, réessayez.",
        ),
      )
    } finally {
      setIsDeletingLogo(false)
    }
  }

  const handleContinue = async () => {
    // **On n'écrit jamais sans référence.** `saved` à `null` ne veut pas dire
    // « rien en base », il veut dire « on ne sait pas » (lecture en cours ou en
    // échec). Écrire à l'aveugle effacerait une identité que l'utilisateur n'a
    // jamais eue sous les yeux — c'est l'inverse de I2.
    if (!saved) {
      onDone()
      return
    }
    const payload = toSavedOrganization(draft)
    // Comparaison sur forme canonique : une description seedée en texte brut
    // (antérieure à l'éditeur riche) est affichée normalisée, donc Tiptap la
    // remonte en HTML dès l'hydratation. Comparer les chaînes brutes faisait
    // repartir une écriture alors que rien n'avait changé à l'écran.
    if (payload.name === saved.name && isSameRichText(payload.description, saved.description)) {
      onDone()
      return
    }
    setIsSaving(true)
    try {
      await saveSetupOrganization(payload)
      onSaved(payload)
      onDone()
    } catch (err) {
      toast.error(
        userFacingErrorMessage(
          err,
          "L'enregistrement de l'organisation a échoué. Vos modifications sont toujours à l'écran, réessayez.",
        ),
      )
    } finally {
      setIsSaving(false)
    }
  }

  // Saisie verrouillée tant qu'on ne connaît pas l'état enregistré (chargement
  // ou échec de lecture) : c'est ce verrou qui empêche une hydratation tardive
  // d'écraser une saisie en cours.
  const isInputDisabled = isLoading || loadFailed || isSaving
  const isBusy = isInputDisabled || isUploadingLogo || isDeletingLogo
  // « Continuer » reste utilisable sur échec de lecture : l'étape est
  // facultative, elle ne doit pas devenir un cul-de-sac.
  const isContinueDisabled = isLoading || isSaving || isUploadingLogo || isDeletingLogo

  return (
    <div className="space-y-6">
      {loadFailed && (
        <div
          className="space-y-2 rounded-md border border-dashed p-3"
          role="status"
          data-testid="org-load-error"
        >
          <p className="text-xs text-muted-foreground">
            Impossible de lire l&apos;identité déjà enregistrée. Par précaution, la saisie est
            désactivée et « Continuer » ne modifiera rien : passer cette étape ne risque donc
            d&apos;effacer aucune valeur existante.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetryLoad}
            data-testid="org-load-retry-btn"
          >
            Réessayer
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="org-name">Nom de l'organisation</Label>
        <Input
          id="org-name"
          value={draft.name}
          onChange={(e) => onDraftChange({ name: e.target.value })}
          placeholder="Nom de votre organisation"
          disabled={isInputDisabled}
          maxLength={ORGANIZATION_NAME_MAX_LENGTH}
          data-testid="org-name-input"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="org-description" id="org-description-label">
          Description
        </Label>
        <RichTextEditor
          id="org-description"
          aria-labelledby="org-description-label"
          value={draft.description}
          onChange={(value) => onDraftChange({ description: value })}
          placeholder="Quelques mots sur votre organisation, affichés aux visiteurs"
          disabled={isInputDisabled}
          maxLength={ORGANIZATION_DESCRIPTION_MAX_LENGTH}
        />
      </div>

      <div className="space-y-2">
        <Label id="org-logo-label">Logo</Label>
        <FileDropzone
          testId="org-logo"
          aria-labelledby="org-logo-label"
          onFileSelected={handleLogoUpload}
          accept={IMAGE_UPLOAD_ACCEPT}
          maxSizeBytes={IMAGE_UPLOAD_MAX_BYTES}
          isUploading={isUploadingLogo}
          disabled={isBusy}
          hint={IMAGE_UPLOAD_HINT}
          preview={
            draft.logo ? (
              <img
                src={draft.logo}
                alt=""
                className="h-12 w-auto rounded border object-contain"
                data-testid="org-logo-preview"
              />
            ) : undefined
          }
        >
          {draft.logo && (
            <Button
              type="button"
              variant="outline-destructive"
              size="sm"
              onClick={handleRemoveLogo}
              disabled={isBusy}
              data-testid="org-logo-remove-btn"
            >
              <Trash2 aria-hidden="true" />
              Supprimer
            </Button>
          )}
        </FileDropzone>
      </div>

      {/* Le logo est la seule exception au « rien n'est écrit avant le clic » :
          son aperçu impose l'écriture immédiate, et reculer ne l'annule pas.
          Dit ici plutôt que caché. */}
      <p className="text-xs text-muted-foreground" data-testid="org-editable-later-hint">
        Le logo est enregistré dès son dépôt ; vous pourrez le remplacer ou le supprimer à tout
        moment.
      </p>

      {/* Navigation — un seul bouton d'avancement, aucun état invalide, donc
          aucun motif à réserver au-dessus des actions. */}
      <div className="flex flex-col-reverse gap-2 pt-4 border-t sm:flex-row sm:items-center sm:justify-between max-sm:[&>*]:flex-1">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center max-sm:[&>button]:flex-1">
          {onBack && (
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isBusy}
              data-testid="org-back-btn"
            >
              Précédent
            </Button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center max-sm:[&>button]:flex-1">
          <Button
            type="button"
            onClick={handleContinue}
            disabled={isContinueDisabled}
            data-testid="org-continue-btn"
          >
            {isSaving ? 'Sauvegarde...' : 'Continuer'}
          </Button>
        </div>
      </div>
    </div>
  )
}
