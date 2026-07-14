import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/useAuth'
import { extractErrorMessage } from '@/lib/extractErrorMessage'
import { testSendEmailTemplate } from '@/services/email-templates.service'
import { testSendEventEmailTemplate } from '@/services/event-email-templates.service'
import type { MjmlEditorOwnerKind } from './MjmlEditorOverlay'

// Mirror du STRICT_EMAIL_REGEX serveur (cf. emailValidator.service.ts). Gardé
// local plutôt que partagé via un package pour ne pas coupler client/serveur ;
// mettre à jour les deux ensemble si la spec change.
const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

interface EmailTestSendMenuProps {
  /** Clé du template courant (informationnelle pour l'endpoint système). */
  templateKey: string
  ownerKind?: MjmlEditorOwnerKind
  /** Pour ownerKind === 'event' : l'UUID de l'événement. */
  ownerId?: string
  /** Désactivé quand l'éditeur est dirty (D1) : on teste l'état persisté. */
  disabled?: boolean
}

/**
 * Task 46 — bouton de toolbar (à droite de « Identité visuelle ») ouvrant un
 * popover pour envoyer le template courant, rendu avec des données de
 * démonstration, à une adresse pré-remplie avec l'email admin (modifiable).
 */
export function EmailTestSendMenu({
  templateKey,
  ownerKind,
  ownerId,
  disabled,
}: EmailTestSendMenuProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(user?.email ?? '')

  const sendMutation = useMutation<void, unknown, string>({
    mutationFn: (to) =>
      ownerKind === 'event' && ownerId
        ? testSendEventEmailTemplate(ownerId, to)
        : testSendEmailTemplate(templateKey, to),
    onSuccess: () => {
      toast.success(`Email de test envoyé à ${email.trim()}.`)
      setOpen(false)
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err, "Échec de l'envoi de l'email de test."))
    },
  })

  const trimmed = email.trim()
  const emailValid = STRICT_EMAIL_REGEX.test(trimmed)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          title={
            disabled
              ? "Enregistrez vos modifications avant d'envoyer un test."
              : undefined
          }
          data-testid="email-test-send-trigger"
          aria-expanded={open}
        >
          <Send className="h-4 w-4 mr-1" aria-hidden="true" />
          Envoyer un test
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[320px] z-50"
        data-testid="email-test-send-popover"
        // Comme EmailIdentityMenu : sans preventDefault, Échap remonte au Dialog
        // parent (MjmlEditorOverlay) et ferme l'éditeur entier.
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          setOpen(false)
        }}
      >
        <form
          className="space-y-3"
          data-testid="email-test-send-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!emailValid || sendMutation.isPending) return
            sendMutation.mutate(trimmed)
          }}
        >
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Envoyer un email de test</h3>
            <p className="text-xs text-muted-foreground">
              Le modèle actuel est envoyé avec des données de démonstration (les
              liens ne sont pas fonctionnels).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-test-send-input" className="text-xs font-medium">
              Adresse de destination
            </Label>
            <Input
              id="email-test-send-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@exemple.fr"
              data-testid="email-test-send-input"
              aria-invalid={trimmed.length > 0 && !emailValid}
            />
            {trimmed.length > 0 && !emailValid && (
              <p className="text-xs text-destructive" data-testid="email-test-send-error">
                Adresse email invalide
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!emailValid || sendMutation.isPending}
            data-testid="email-test-send-submit"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4 mr-1" aria-hidden="true" />
            )}
            {sendMutation.isPending ? 'Envoi\u2026' : 'Envoyer le test'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

