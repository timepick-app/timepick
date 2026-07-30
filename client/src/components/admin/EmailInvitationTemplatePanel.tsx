import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { EmailVariablesHelp } from './EmailVariablesHelp'
import { EmailCompatibilityWarningCard } from './email-editor/EmailCompatibilityWarningCard'
import { useEmailTemplate } from '@/hooks/useEmailTemplate'
import { useEditorContext } from '@/hooks/useEditorContext'
import { INVITATION_VARIABLE_HELP } from '@/lib/email-template-constants'

/**
 * E2.S4 — carte « muette » du template d'invitation par défaut.
 *
 * Conductor (2026-06-22) — ce panneau ne porte plus l'éditeur GrapesJS : carte
 * d'aperçu uniquement (variables indispensables, avertissement de
 * compatibilité, skeleton, bannière d'erreur). Le bouton « Personnaliser avec
 * l'éditeur » demande au conductor (EmailSettingsSubtabs) d'ouvrir l'unique
 * <MjmlEditorOverlay>, qui édite désormais les 8 modèles sans fermeture. Le
 * PATCH et le gate FR55 (variables critiques) vivent dans le conductor ; ce
 * panneau garde `useEmailTemplate('invitation')` + `useEditorContext` pour
 * l'affichage de l'avertissement de compatibilité (EmailCompatibilityWarningCard).
 * PRD reference: prd.md:839-859 / D-ext1..D-ext6.
 */

export interface EmailInvitationTemplatePanelProps {
  /** Demande au conductor d'ouvrir l'éditeur sur le template d'invitation. */
  onOpenEditor: () => void
}

export const EmailInvitationTemplatePanel = ({
  onOpenEditor,
}: EmailInvitationTemplatePanelProps) => {
  const { isLoading, error } = useEmailTemplate('invitation')
  const { data: editorContext } = useEditorContext({
    ownerKind: 'template',
    ownerId: 'invitation',
    templateKey: 'invitation',
  })
  const compatSources = {
    header: editorContext?.header?.contentMjml,
    body: editorContext?.body?.contentMjml,
    footer: editorContext?.footer?.contentMjml,
  }

  const hasError = !!error

  return (
    <Card data-testid="email-invitation-template-panel">
      <CardHeader>
        <CardTitle className="text-base">Modèle d&apos;invitation par défaut</CardTitle>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            Ce modèle définit le contenu des emails d&apos;invitation envoyés aux
            participants. Si un événement n&apos;a pas de modèle personnalisé,
            c&apos;est celui-ci qui s&apos;applique — vous pouvez en créer un dans
            chaque événement pour n&apos;en modifier que les invitations.
          </p>
          <p>
            Le corps contient des variables indispensables, insérées automatiquement&nbsp;:
            modifiez librement le design sans les supprimer.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasError && (
          <Banner variant="destructive" data-testid="invitation-load-error">
            <AlertCircle aria-hidden="true" />
            <BannerDescription>
              Erreur de chargement de l&apos;aperçu. Veuillez réessayer.
            </BannerDescription>
          </Banner>
        )}

        {isLoading && !hasError && (
          <div
            className="animate-pulse space-y-4"
            data-testid="invitation-loading-skeleton"
          >
            <div className="h-10 bg-muted rounded" />
            <div className="h-[480px] bg-muted rounded" />
            <div className="h-10 w-1/3 bg-muted rounded" />
          </div>
        )}

        {!isLoading && !hasError && (
          <>
            <EmailVariablesHelp
              variables={INVITATION_VARIABLE_HELP}
              data-testid="invitation-template-variables"
            />
            <EmailCompatibilityWarningCard
              sources={compatSources}
              scopeKey="template:invitation"
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="button"
                onClick={onOpenEditor}
                disabled={isLoading}
                data-testid="invitation-open-editor-btn"
              >
                Personnaliser avec l&apos;éditeur
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
