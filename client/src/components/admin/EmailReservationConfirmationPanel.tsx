import { EmailSystemTemplatePanel } from './EmailSystemTemplatePanel'

export interface EmailReservationConfirmationPanelProps {
  onOpenEditor: () => void
}

/**
 * Wrapper « muet » autour du template système `reservation_confirmation`.
 * Conductor (2026-06-22) — se contente de forwarder `onOpenEditor` au panneau
 * système sous-jacent. L'<MjmlEditorOverlay> est désormais propriété exclusive
 * du conductor (EmailSettingsSubtabs).
 */
export const EmailReservationConfirmationPanel = ({
  onOpenEditor,
}: EmailReservationConfirmationPanelProps) => (
  <div data-testid="email-reservation-confirmation-panel">
    <EmailSystemTemplatePanel
      templateKey="reservation_confirmation"
      onOpenEditor={onOpenEditor}
    />
  </div>
)
