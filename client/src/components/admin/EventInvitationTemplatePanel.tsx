/**
 * E3.S3 / Story 24-3 — host for the "Template" tab of the event form.
 *
 * Structured as a flat surface (page-level `h2` + content) aligned with the
 * sibling event-form tabs (Invités, Créneaux, Stats) — NOT a Card. The
 * inheritance status (`template.isCustom`) is surfaced as a compact Badge in
 * the title row, same convention as the events-table column (FR59), so a
 * factual status does not borrow the visual weight of a Banner (reserved for
 * active risks: Outlook incompatibilities, load/preview errors).
 *
 * `<MjmlEditorOverlay>` is reused unchanged (24-0/AC4 / D2 closed status-quo).
 *
 * PRD reference: prd.md:1003-1046 (FR56-FR60).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Banner, BannerDescription } from '@/components/ui/banner'
import { Skeleton } from '@/components/ui/skeleton'
import { Typography } from '@/components/ui/typography'
import { MjmlEditorOverlay } from './email-editor/MjmlEditorOverlay'
import { EmailCompatibilityWarningCard } from './email-editor/EmailCompatibilityWarningCard'
import {
  useEventEmailTemplate,
  useEventEmailTemplatePreview,
  usePatchEventEmailTemplate,
  useResetEventEmailTemplate,
} from '@/hooks/useEventEmailTemplate'
import { useEditorContext } from '@/hooks/useEditorContext'
import { useEventDetails } from '@/hooks/useEvents'
import {
  INVITATION_VARIABLES,
  findMissingCriticalVariables,
} from '@/lib/email-template-constants'

interface Props {
  eventId: string
}

export const EventInvitationTemplatePanel = ({ eventId }: Props) => {
  const {
    data: template,
    isLoading: isTemplateLoading,
    error: templateError,
    refetch: refetchTemplate,
  } = useEventEmailTemplate(eventId)
  const {
    data: preview,
    isLoading: isPreviewLoading,
    error: previewError,
    refetch: refetchPreview,
  } = useEventEmailTemplatePreview(eventId)
  const patchMutation = usePatchEventEmailTemplate(eventId)
  const resetMutation = useResetEventEmailTemplate(eventId)
  const { data: event } = useEventDetails(eventId)
  const { data: editorContext } = useEditorContext({
    ownerKind: 'event',
    ownerId: eventId,
    templateKey: 'invitation',
  })
  const compatSources = {
    header: editorContext?.header?.contentMjml,
    body: editorContext?.body?.contentMjml,
    footer: editorContext?.footer?.contentMjml,
  }

  const [editorOpen, setEditorOpen] = useState(false)

  const isMutating = patchMutation.isPending || resetMutation.isPending
  const isLoading = isTemplateLoading || isPreviewLoading
  const isCtaDisabled = isMutating
  const hasTemplateError = !!templateError
  const hasPreviewError = !!previewError && !hasTemplateError
  const templateReady = !!template && !isTemplateLoading && !hasTemplateError

  const handleSave = async (bodyMjml: string) => {
    const missing = findMissingCriticalVariables(bodyMjml)
    await patchMutation.mutateAsync({ bodyMjml })
    // Warning émis seulement après persistance confirmée : si le PATCH rejette,
    // mutateAsync propage et l'overlay surface l'erreur — on n'affirme jamais un
    // enregistrement qui n'a pas eu lieu (audit toasts 2026-06-07, D1).
    if (missing.length > 0) {
      const tokens = missing.map((n) => `{{${n}}}`).join(', ')
      toast.warning(
        `Le template enregistré ne contient plus : ${tokens}. Les emails risquent d'être inutilisables.`,
      )
    }
    toast.success("Template d'invitation sauvegardé pour cet événement")
    // L'éditeur reste ouvert après enregistrement (alignement avec les legs
    // header/brand qui ne le fermaient pas). Fermeture explicite via Annuler.
  }

  const handleReset = async () => {
    // L'overlay (handleResetConfirmed) est le SEUL responsable du toast d'erreur du
    // reset (et du refetch). On propage l'erreur d'origine telle quelle : pas de toast
    // ni de sentinelle ici, sinon double toast + jeton « reset-failed » non-actionnable.
    await resetMutation.mutateAsync()
  }

  return (
    <div data-testid="event-invitation-template-panel" className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Typography variant="h3" as="h2">Template d&apos;invitation</Typography>
          {template && (
            <Badge
              variant={template.isCustom ? 'info' : 'default'}
              data-testid="event-invitation-inheritance-badge"
              aria-label={template.isCustom ? 'Template personnalisé' : 'Template par défaut'}
            >
              {template.isCustom ? 'Personnalisé' : 'Défaut'}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Aperçu et personnalisation de l&apos;email envoyé aux participants.
        </p>
      </div>

      {hasTemplateError && (
        <Banner
          variant="destructive"
          role="alert"
          data-testid="event-invitation-load-error"
        >
          <AlertCircle />
          <BannerDescription>
            Impossible de charger le template d&apos;invitation.
          </BannerDescription>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="col-start-2 mt-1 w-fit"
            onClick={() => refetchTemplate()}
          >
            Réessayer
          </Button>
        </Banner>
      )}

      {hasPreviewError && (
        <Banner variant="warning" role="status" data-testid="event-invitation-preview-error">
          <AlertCircle />
          <BannerDescription>
            L&apos;aperçu n&apos;a pas pu être généré — vous pouvez tout de même
            utiliser l&apos;éditeur.
          </BannerDescription>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="col-start-2 mt-1 w-fit"
            onClick={() => refetchPreview()}
          >
            Réessayer
          </Button>
        </Banner>
      )}

      {isLoading && !hasTemplateError && !hasPreviewError && (
        <div
          className="animate-pulse space-y-4"
          data-testid="event-invitation-loading-skeleton"
          role="status"
          aria-label="Chargement du template d'invitation…"
        >
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[min(70vh,640px)]" />
          <Skeleton className="h-10 w-1/3" />
        </div>
      )}

      {templateReady && preview && (
        <>
          <EmailCompatibilityWarningCard
            sources={compatSources}
            scopeKey={`event:${eventId}`}
          />
          {!editorOpen && (
            <iframe
              srcDoc={preview.html}
              sandbox=""
              title="Aperçu email invitation pour cet événement"
              data-testid="event-invitation-preview-iframe"
              className="block w-full h-[min(70vh,640px)] rounded-md border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-0"
            />
          )}
        </>
      )}

      {templateReady && !isPreviewLoading && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            onClick={() => setEditorOpen(true)}
            disabled={isCtaDisabled}
            data-testid="event-invitation-open-editor-btn"
          >
            Personnaliser avec l&apos;éditeur
          </Button>
        </div>
      )}

      {editorOpen && template && (
        <MjmlEditorOverlay
          open={editorOpen}
          templateKey="invitation"
          initialBodyMjml={template.bodyMjml}
          defaultBodyMjml={template.defaultBodyMjml}
          variables={INVITATION_VARIABLES}
          onSave={handleSave}
          onReset={handleReset}
          onCancel={() => setEditorOpen(false)}
          ownerKind="event"
          ownerId={eventId}
          isCustom={template.isCustom}
          title={event?.name ?? 'Invitation'}
        />
      )}
    </div>
  )
}
