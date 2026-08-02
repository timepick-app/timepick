import { useState } from 'react'
import { toast } from 'sonner'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import { Mail, KeyRound, CheckCircle, RotateCcw, UserPlus, CalendarX2, ShieldCheck, ShieldOff, UserMinus, type LucideIcon } from 'lucide-react'
import { EmailInvitationTemplatePanel } from './EmailInvitationTemplatePanel'
import { EmailSystemTemplatePanel, SYSTEM_TEMPLATE_LABELS } from './EmailSystemTemplatePanel'
import { EmailReservationConfirmationPanel } from './EmailReservationConfirmationPanel'
import { Button } from '@/components/ui/button'
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
  useResetAllEmailTemplates,
  useEmailTemplate,
  usePatchEmailTemplate,
} from '@/hooks/useEmailTemplate'
import { useEditorContext } from '@/hooks/useEditorContext'
import { type EmailSubtabId } from './emailSubtabs.constants'
import {
  MjmlEditorOverlay,
  type MjmlEditorMode,
} from './email-editor/MjmlEditorOverlay'
import {
  INVITATION_VARIABLES,
  findMissingCriticalVariables,
} from '@/lib/email-template-constants'
import {
  SYSTEM_TEMPLATE_VARIABLES,
  type SystemTemplateKey,
} from '@/lib/email-system-template-constants'
import type {
  InvitationTemplate,
  SubjectPatch,
  SystemTemplate,
  TemplateKey,
} from '@/services/email-templates.service'

// Libellés locaux (non exportés) de la réinitialisation globale, utilisés
// uniquement dans ce composant.
const RESET_ALL_BUTTON_LABEL = "Réinitialiser tous les modèles d'emails"
const RESET_ALL_DIALOG_TITLE = "Réinitialiser tous les modèles d'emails ?"
const RESET_ALL_DIALOG_DESCRIPTION =
  "Le design partagé (en-tête, fond, marges) et le contenu des 8 modèles (invitation, connexion, confirmation, création de compte, annulation, désinscription, promotion administrateur, retour au rang de membre) reviendront à l'usine. Les événements et l'identité visuelle sont préservés. Cette action est immédiate et écrase le contenu courant."
const RESET_ALL_CONFIRM_LABEL = 'Réinitialiser'

const SUBTAB_ITEMS: { value: EmailSubtabId; label: string; icon: LucideIcon }[] = [
  { value: 'template-invitation', label: 'Invitation', icon: Mail },
  {
    value: 'emails-systeme-magic-link-login',
    label: 'Connexion',
    icon: KeyRound,
  },
  { value: 'emails-systeme-confirmation', label: 'Confirmation', icon: CheckCircle },
  { value: 'emails-systeme-account-created', label: 'Création de compte', icon: UserPlus },
  { value: 'emails-systeme-annulation', label: 'Annulation', icon: CalendarX2 },
  { value: 'emails-systeme-desinscription', label: 'Désinscription', icon: UserMinus },
  { value: 'emails-systeme-role-promu', label: 'Promotion admin', icon: ShieldCheck },
  { value: 'emails-systeme-role-retrograde', label: 'Retour membre', icon: ShieldOff },
]

/**
 * Cartographie EXPLICITE sous-onglet → méta-édition (mode + clé template).
 * Source unique de vérité : garantit que `mode` ↔ `templateKey` ↔ DTO de
 * `useEmailTemplate` sont toujours cohérents. Le narrowing par `as` dans le
 * rendu de l'overlay ci-dessous est donc sain par construction (cette table
 * est l'invariant).
 */
const SUBTAB_TO_TEMPLATE: Record<
  EmailSubtabId,
  { mode: MjmlEditorMode; templateKey: TemplateKey }
> = {
  'template-invitation': { mode: 'invitation', templateKey: 'invitation' },
  'emails-systeme-magic-link-login': { mode: 'system', templateKey: 'magic_link_login' },
  'emails-systeme-confirmation': { mode: 'system', templateKey: 'reservation_confirmation' },
  'emails-systeme-account-created': { mode: 'system', templateKey: 'account_created' },
  'emails-systeme-annulation': { mode: 'system', templateKey: 'cancellation_confirmation' },
  'emails-systeme-desinscription': { mode: 'system', templateKey: 'unregistration_confirmation' },
  'emails-systeme-role-promu': { mode: 'system', templateKey: 'role_promoted' },
  'emails-systeme-role-retrograde': { mode: 'system', templateKey: 'role_demoted' },
}

interface EmailSettingsSubtabsProps {
  activeSubtab: EmailSubtabId
  onSubtabChange: (next: EmailSubtabId) => void
}

export const EmailSettingsSubtabs = ({
  activeSubtab,
  onSubtabChange,
}: EmailSettingsSubtabsProps) => {
  const resetAll = useResetAllEmailTemplates()
  const [resetAllOpen, setResetAllOpen] = useState(false)

  // Conductor (2026-06-22) — cet unique composant possède désormais l'éditeur
  // GrapesJS pour les 8 modèles. `editingSubtab` désigne le modèle en cours
  // d'édition (null = fermé). Les panneaux (cartes « muettes ») demandent
  // l'ouverture via `onOpenEditor`.
  const [editingSubtab, setEditingSubtab] = useState<EmailSubtabId | null>(null)
  const editorOpen = editingSubtab !== null

  const editingMeta = editingSubtab ? SUBTAB_TO_TEMPLATE[editingSubtab] : null
  // Fallback 'invitation' (premier onglet) quand l'éditeur est fermé : les
  // hooks doivent être appelés inconditionnellement (React) et la requête est
  // dédupliquée par React Query avec celle du panneau invitation.
  const editingKey: TemplateKey = editingMeta?.templateKey ?? 'invitation'

  // Hooks appelés inconditionnellement (règles des hooks). React Query déduplique
  // les requêtes partagées avec les panneaux (même clé de cache), donc aucun
  // surcoût réseau : les panneaux ont déjà hydraté `editingKey` quand l'admin
  // clique sur « Personnaliser ».
  const { data: editingTemplate } = useEmailTemplate(editingKey)
  const patchMutation = usePatchEmailTemplate(editingKey)
  useEditorContext({
    ownerKind: 'template',
    ownerId: editingKey,
    templateKey: editingKey,
  })

  const handleCloseEditor = () => setEditingSubtab(null)

  // Réplique EXACTE de EmailInvitationTemplatePanel.handleSave : le gate FR55
  // (variables critiques) s'exécute AVANT la persistance, mais le warning
  // n'est émis qu'APRÈS un PATCH confirmé (anti silent-failure, audit toasts
  // 2026-06-07 / D1). mutateAsync propage la rejection → l'overlay surface
  // l'erreur, jamais de toast succès mensonger.
  const handleSaveInvitation = async (bodyMjml: string, subject?: SubjectPatch) => {
    const missing = findMissingCriticalVariables(bodyMjml)
    // Corps et objet dans la MÊME requête (A10). Le fragment objet est vide
    // quand rien n'a changé de ce côté — la colonne n'est alors pas touchée.
    await patchMutation.mutateAsync({ bodyMjml, ...subject })
    if (missing.length > 0) {
      const tokens = missing.map((n) => `{{${n}}}`).join(', ')
      toast.warning(
        `Le modèle enregistré ne contient plus : ${tokens}. Les emails risquent d'être inutilisables.`,
      )
    }
    toast.success("Modèle d'invitation enregistré")
    // L'éditeur reste ouvert après enregistrement (alignement avec les legs
    // header/brand qui ne le fermaient pas). Fermeture explicite via Annuler.
  }

  const editingSubtabLabel = editingSubtab
    ? SUBTAB_ITEMS.find((i) => i.value === editingSubtab)!.label
    : ''

  // Narrowing par mode : SUBTAB_TO_TEMPLATE garantit mode↔templateKey↔DTO,
  // donc ces `as` sont sains par construction (lus seulement sous le garde
  // `editorOpen && editingTemplate` du rendu ci-dessous).
  const invitationTpl = editingTemplate as InvitationTemplate
  const systemTpl = editingTemplate as SystemTemplate
  const systemKey = editingMeta?.templateKey as SystemTemplateKey

  const templateSwitcher = {
    options: SUBTAB_ITEMS.map((i) => ({
      value: i.value,
      label: i.label,
      icon: i.icon,
    })),
    value: editingSubtab ?? 'template-invitation',
    // Le wrapper de l'overlay intercepte `onRequestSwitch` pour dirty-guarder
    // (confirme les changements non sauvegardés avant de forwarder). On passe
    // le callback brut : le switch re-key l'overlay (remontage GrapesJS propre).
    onRequestSwitch: (next: string) => setEditingSubtab(next as EmailSubtabId),
  }

  return (
    <div>
      <h2 className="text-h3 font-semibold leading-none tracking-tight mb-4">Tous les modèles</h2>

      <Typography
        variant="body-sm"
        color="muted"
        className="mb-6"
        data-testid="email-common-header-identity-note"
      >
        <strong>
          L&apos;en-tête et l&apos;identité visuelle sont communs à tous les emails
        </strong>{' '}
        (invitations, liens de connexion, confirmations de
        réservation). Vous les modifiez dans l&apos;éditeur, via le bouton
        «&nbsp;Identité visuelle&nbsp;» et le bloc en-tête&nbsp;: tout changement
        s&apos;applique immédiatement à l&apos;ensemble de ces messages.{' '}
        <strong>
          Le corps et le pied, eux, sont propres à chaque modèle ci-dessous.
        </strong>
      </Typography>

      <div className="flex items-center gap-3 mb-6 max-sm:flex-col max-sm:[&>*]:w-full">
        <Button
          type="button"
          variant="outline-destructive"
          onClick={() => setResetAllOpen(true)}
          disabled={resetAll.isPending}
          data-testid="email-reset-all-btn"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          {RESET_ALL_BUTTON_LABEL}
        </Button>
        <Select value={activeSubtab} onValueChange={(v) => onSubtabChange(v as EmailSubtabId)}>
          <SelectTrigger className="w-[220px] text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUBTAB_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                <span className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" aria-hidden="true" />{item.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AlertDialog open={resetAllOpen} onOpenChange={setResetAllOpen}>
        <AlertDialogContent data-testid="email-reset-all-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{RESET_ALL_DIALOG_TITLE}</AlertDialogTitle>
            <AlertDialogDescription>{RESET_ALL_DIALOG_DESCRIPTION}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => resetAll.mutate()}
              data-testid="email-reset-all-confirm-action"
            >
              {RESET_ALL_CONFIRM_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs
        value={activeSubtab}
        onValueChange={(v) => onSubtabChange(v as EmailSubtabId)}
      >

        <TabsContent
          value="template-invitation"
          forceMount
          className={cn('mt-6', activeSubtab !== 'template-invitation' && 'hidden')}
        >
          <EmailInvitationTemplatePanel
            onOpenEditor={() => setEditingSubtab('template-invitation')}
          />
        </TabsContent>

        <TabsContent
          value="emails-systeme-magic-link-login"
          forceMount
          className={cn(
            'mt-6',
            activeSubtab !== 'emails-systeme-magic-link-login' && 'hidden',
          )}
        >
          <EmailSystemTemplatePanel
            templateKey="magic_link_login"
            onOpenEditor={() => setEditingSubtab('emails-systeme-magic-link-login')}
          />
        </TabsContent>

        <TabsContent
          value="emails-systeme-confirmation"
          forceMount
          className={cn(
            'mt-6',
            activeSubtab !== 'emails-systeme-confirmation' && 'hidden',
          )}
        >
          <EmailReservationConfirmationPanel
            onOpenEditor={() => setEditingSubtab('emails-systeme-confirmation')}
          />
        </TabsContent>

        <TabsContent
          value="emails-systeme-account-created"
          forceMount
          className={cn(
            'mt-6',
            activeSubtab !== 'emails-systeme-account-created' && 'hidden',
          )}
        >
          <EmailSystemTemplatePanel
            templateKey="account_created"
            onOpenEditor={() => setEditingSubtab('emails-systeme-account-created')}
          />
        </TabsContent>

        <TabsContent
          value="emails-systeme-annulation"
          forceMount
          className={cn(
            'mt-6',
            activeSubtab !== 'emails-systeme-annulation' && 'hidden',
          )}
        >
          <EmailSystemTemplatePanel
            templateKey="cancellation_confirmation"
            onOpenEditor={() => setEditingSubtab('emails-systeme-annulation')}
          />
        </TabsContent>

        <TabsContent
          value="emails-systeme-desinscription"
          forceMount
          className={cn(
            'mt-6',
            activeSubtab !== 'emails-systeme-desinscription' && 'hidden',
          )}
        >
          <EmailSystemTemplatePanel
            templateKey="unregistration_confirmation"
            onOpenEditor={() => setEditingSubtab('emails-systeme-desinscription')}
          />
        </TabsContent>

        <TabsContent
          value="emails-systeme-role-promu"
          forceMount
          className={cn(
            'mt-6',
            activeSubtab !== 'emails-systeme-role-promu' && 'hidden',
          )}
        >
          <EmailSystemTemplatePanel
            templateKey="role_promoted"
            onOpenEditor={() => setEditingSubtab('emails-systeme-role-promu')}
          />
        </TabsContent>

        <TabsContent
          value="emails-systeme-role-retrograde"
          forceMount
          className={cn(
            'mt-6',
            activeSubtab !== 'emails-systeme-role-retrograde' && 'hidden',
          )}
        >
          <EmailSystemTemplatePanel
            templateKey="role_demoted"
            onOpenEditor={() => setEditingSubtab('emails-systeme-role-retrograde')}
          />
        </TabsContent>
      </Tabs>

      {/* Conductor — l'unique <MjmlEditorOverlay> pour les 8 modèles.
          `key` = editingSubtab : le switch re-key l'overlay (init GrapesJS
          fraîche). Rendu uniquement quand un modèle est en édition ET ses
          données sont résolues. */}
      {editorOpen && editingMeta && editingTemplate && (
        editingMeta.mode === 'invitation' ? (
          <MjmlEditorOverlay
            key={editingSubtab}
            open
            templateKey={editingMeta.templateKey}
            title={editingSubtabLabel}
            ownerKind="template"
            ownerId={editingMeta.templateKey}
            onCancel={handleCloseEditor}
            templateSwitcher={templateSwitcher}
            initialBodyMjml={invitationTpl.bodyMjml}
            defaultBodyMjml={invitationTpl.defaultBodyMjml}
            variables={INVITATION_VARIABLES}
            subjectLine={{
              subject: invitationTpl.subject,
              fallbackSubject: invitationTpl.defaultSubject,
              level: 'template',
              variables: invitationTpl.subjectVariables,
            }}
            onSave={handleSaveInvitation}
          />
        ) : (
          <MjmlEditorOverlay
            key={editingSubtab}
            open
            mode="system"
            templateKey={editingMeta.templateKey}
            title={editingSubtabLabel}
            ownerKind="template"
            ownerId={editingMeta.templateKey}
            onCancel={handleCloseEditor}
            templateSwitcher={templateSwitcher}
            variables={SYSTEM_TEMPLATE_VARIABLES[systemKey]}
            systemIntroText={systemTpl.introText}
            systemSignatureText={systemTpl.signatureText}
            subjectLine={{
              subject: systemTpl.subject,
              fallbackSubject: systemTpl.defaultSubject,
              level: 'template',
              // Présents pour magic_link_login SEUL ; leur absence est ce qui
              // masque le sélecteur de variante sur les sept autres.
              subjectAdmin: systemTpl.subjectAdmin,
              fallbackSubjectAdmin: systemTpl.defaultSubjectAdmin,
              variables: systemTpl.subjectVariables,
            }}
            onSaveSystem={async (zones) => {
              await patchMutation.mutateAsync(zones)
              toast.success(
                `Modèle ${SYSTEM_TEMPLATE_LABELS[systemKey].displayName} enregistré`,
              )
            }}
          />
        )
      )}
    </div>
  )
}
