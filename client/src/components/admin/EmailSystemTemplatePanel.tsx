import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { useEmailTemplate } from '@/hooks/useEmailTemplate'
import { EmailVariablesHelp } from './EmailVariablesHelp'
import {
  SYSTEM_TEMPLATE_VARIABLE_HELP,
  type SystemTemplateKey,
} from '@/lib/email-system-template-constants'

/**
 * E2.S5 / L3a — carte « muette » d'un template d'email système
 * (`magic_link_login`, `reservation_confirmation`, `account_created`,
 * `cancellation_confirmation`, `role_promoted`, `role_demoted`).
 *
 * Conductor (2026-06-22) — ce panneau ne porte plus l'éditeur GrapesJS : il
 * est devenu une carte d'aperçu (titre/description, variables disponibles,
 * skeleton, bannière d'erreur). Le bouton « Personnaliser avec l'éditeur »
 * demande au conductor (EmailSettingsSubtabs) d'ouvrir l'unique
 * <MjmlEditorOverlay>, qui édite désormais les 8 modèles sans fermeture. Le
 * PATCH, le contexte éditeur et le gate FR55 vivent dans le conductor ; ce
 * panneau ne garde que `useEmailTemplate(templateKey)` pour l'affichage
 * (loading/erreur). PRD reference: prd.md:861-885 / D-ext1..D-ext6.
 */

export interface EmailSystemTemplatePanelProps {
  templateKey: SystemTemplateKey
  /** Demande au conductor d'ouvrir l'éditeur sur ce template. */
  onOpenEditor: () => void
}

/**
 * Libellés FR (displayName + description) de chaque template système. Source
 * unique partagée avec le conductor (titre de carte ici, libellé du toast de
 * succès à l'enregistrement là-bas).
 */
export const SYSTEM_TEMPLATE_LABELS: Record<
  SystemTemplateKey,
  { displayName: string; description: string }
> = {
  magic_link_login: {
    displayName: 'Connexion',
    description: "Email envoyé à l'utilisateur lors d'une demande de connexion.",
  },
  reservation_confirmation: {
    displayName: 'Confirmation de réservation',
    description:
      "Email envoyé à l'utilisateur après chaque réservation de créneau.",
  },
  account_created: {
    displayName: 'Création de compte',
    description: "Email de bienvenue envoyé à la création d'un profil membre.",
  },
  cancellation_confirmation: {
    displayName: 'Annulation de créneau',
    description: 'Email envoyé au membre quand son créneau de participation est annulé.',
  },
  role_promoted: {
    displayName: 'Promotion administrateur',
    description: "Email envoyé au membre lorsqu'il est promu administrateur.",
  },
  role_demoted: {
    displayName: 'Retour au rang de membre',
    description: "Email envoyé à l'administrateur lorsqu'il revient au rang de membre.",
  },
  unregistration_confirmation: {
    displayName: 'Désinscription de créneau',
    description: "Email envoyé au membre lorsqu'il se désinscrit lui-même d'un créneau.",
  },
}

export const EmailSystemTemplatePanel = ({
  templateKey,
  onOpenEditor,
}: EmailSystemTemplatePanelProps) => {
  const labels = SYSTEM_TEMPLATE_LABELS[templateKey]

  const { isLoading, error } = useEmailTemplate(templateKey)
  const hasError = !!error

  return (
    <Card data-testid={`email-system-template-panel-${templateKey}`}>
      <CardHeader>
        <CardTitle className="text-base">{labels.displayName}</CardTitle>
        <p className="text-sm text-muted-foreground">{labels.description}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasError && (
          <Banner
            variant="destructive"
            data-testid={`system-template-load-error-${templateKey}`}
          >
            <AlertCircle aria-hidden="true" />
            <BannerDescription>
              Erreur de chargement de l&apos;aperçu. Veuillez réessayer.
            </BannerDescription>
          </Banner>
        )}

        {isLoading && !hasError && (
          <div
            className="animate-pulse space-y-4"
            data-testid={`system-template-loading-skeleton-${templateKey}`}
          >
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 w-1/3 bg-muted rounded" />
          </div>
        )}

        {!hasError && (
          <EmailVariablesHelp
            variables={SYSTEM_TEMPLATE_VARIABLE_HELP[templateKey]}
            data-testid={`system-template-variables-${templateKey}`}
          />
        )}

        {!isLoading && !hasError && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              onClick={onOpenEditor}
              disabled={isLoading}
              data-testid={`system-open-editor-btn-${templateKey}`}
            >
              Personnaliser avec l&apos;éditeur
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
