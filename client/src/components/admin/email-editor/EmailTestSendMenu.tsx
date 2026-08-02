import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/useAuth'
import { userFacingErrorMessage } from '@/lib/userFacingErrorMessage'
import { testSendEmailTemplate } from '@/services/email-templates.service'
import { testSendEventEmailTemplate } from '@/services/event-email-templates.service'
import type { MjmlEditorOwnerKind } from './MjmlEditorOverlay'

// Mirror du STRICT_EMAIL_REGEX serveur (cf. emailValidator.service.ts). Gardé
// local plutôt que partagé via un package pour ne pas coupler client/serveur ;
// mettre à jour les deux ensemble si la spec change.
const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

/**
 * Raison de l'inactivité, portée à la fois par le bouton (description
 * accessible) et par son enveloppe (la seule qui puisse l'AFFICHER, le bouton
 * désactivé ne recevant pas le survol). Une seule chaîne pour les deux, sinon
 * elles divergeront.
 */
const TEST_SEND_DISABLED_REASON =
  "Enregistrez vos modifications avant d'envoyer un test."

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
      toast.error(
        userFacingErrorMessage(err, "L'envoi de l'e-mail de test a échoué. Rien n'a été envoyé, réessayez."),
      )
    },
  })

  const trimmed = email.trim()
  const emailValid = STRICT_EMAIL_REGEX.test(trimmed)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* PALIERS DE LA BARRE D'OUTILS — même motif que `EmailIdentityMenu`, même
          barre porteuse du `group/toolbar` et de son `data-toolbar-tier`, palier
          MESURÉ et non seuillé (voir `useToolbarTier`). Libellé entier au palier
          entier, « Tester » aux paliers court et resserré, icône seule au palier
          icônes — le libellé n'est alors que MASQUÉ (`sr-only`), jamais retiré.

          « Tester » et non « Test » : ses trois voisins de barre sont des
          impératifs (« Réinitialiser », « Enregistrer », « Fermer ») et un nom
          isolé au milieu d'eux se lit comme une étiquette, pas comme une action.

          L'INFOBULLE DE L'ÉTAT DÉSACTIVÉ EST PORTÉE DEUX FOIS, et c'est
          nécessaire. Elle ne nomme pas l'action : elle explique pourquoi le bouton
          est inactif.
          — Sur le BOUTON, elle devient la description accessible, seul moyen pour
            une aide technique d'apprendre la raison de l'inactivité.
          — Sur l'enveloppe, elle est la seule à pouvoir S'AFFICHER : la primitive
            `Button` pose `disabled:pointer-events-none`, donc le bouton désactivé
            ne reçoit aucun survol et le navigateur n'ouvre jamais SON infobulle
            (mesuré le 2026-08-01). L'enveloppe, elle, reçoit le survol.
          Au palier icônes le bouton n'est plus qu'un glyphe pâle : sans cette
          infobulle, l'inactivité devient une devinette. À l'état actif les deux
          valent `undefined`, donc aucune description ne double le nom accessible.

          L'enveloppe est un `inline-flex` : elle est un item de la barre à la
          place du bouton, sans rien changer à la géométrie mesurée. */}
      <span
        className="inline-flex"
        title={disabled ? TEST_SEND_DISABLED_REASON : undefined}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            title={disabled ? TEST_SEND_DISABLED_REASON : undefined}
            className="group-data-[toolbar-tier=icones]/toolbar:w-8 group-data-[toolbar-tier=icones]/toolbar:px-0"
            data-testid="email-test-send-trigger"
            aria-expanded={open}
          >
            <Send
              className="mr-1 h-4 w-4 group-data-[toolbar-tier=icones]/toolbar:mr-0"
              aria-hidden="true"
            />
            <span className="sr-only group-data-[toolbar-tier=court]/toolbar:not-sr-only group-data-[toolbar-tier=resserre]/toolbar:not-sr-only group-data-[toolbar-tier=entier]/toolbar:hidden">
              Tester
            </span>
            <span className="hidden group-data-[toolbar-tier=entier]/toolbar:inline">
              Envoyer un test
            </span>
          </Button>
        </PopoverTrigger>
      </span>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[320px]"
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

