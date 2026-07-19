import { Check, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Typography } from '@/components/ui/typography'
import { Banner, BannerDescription } from '@/components/ui/banner'
import type { EmailTransportSource } from '@/services/encryption-key.service'

export type SetupStepKey = 'key' | 'smtp' | 'admin' | 'sent'

interface Props {
  current: SetupStepKey
  steps: ('key' | 'smtp' | 'admin')[]
  /** A1 : signal `emailDeliverable` — l'étape SMTP reste visible mais devient
   *  non bloquante ; seule la copie contextuelle en tient compte ici (le
   *  caractère « sautable » proprement dit vit dans SetupSmtpStep). */
  smtpSkippable?: boolean
  /** Source du transport détecté ('db' | 'env' | 'fallback') — précise le
   *  message de l'étape SMTP sautable ; null si inconnue. */
  smtpTransportSource?: EmailTransportSource | null
}

const STEP_META: Record<'key' | 'smtp' | 'admin', { label: string; description: string }> = {
  key: {
    label: 'Clé de chiffrement',
    description:
      'Une clé de chiffrement a été générée pour protéger vos secrets (mot de passe SMTP). Notez son empreinte ; une sauvegarde complète est disponible dans votre profil après connexion.',
  },
  smtp: {
    label: 'Serveur SMTP',
    description:
      'Ce serveur achemine tous les emails de TimePick — liens de connexion, invitations, confirmations et notifications, pour tous les comptes. Sans lui, personne ne peut se connecter ni être prévenu.',
  },
  admin: {
    label: 'Administrateur',
    description:
      'Créez le premier compte administrateur. Son lien de connexion étant envoyé par email, la configuration SMTP doit être faite au préalable.',
  },
}

// Copie alternative quand le serveur a détecté qu'il peut déjà délivrer des
// emails (`emailDeliverable=true`) : l'étape SMTP devient sautable, donc les
// descriptions par défaut ci-dessus (qui la présentent comme un préalable
// obligatoire) seraient fausses. Le message est décliné selon la source réelle
// du transport (`emailTransportSource`) — sauter « parce que c'est déjà
// configuré » n'est pas sauter « parce qu'un intercepteur de dev capture
// tout » — et reste court : la phrase de motivation du flux requis n'a plus
// lieu d'être, et l'action est déjà portée par le bouton « Passer cette étape ».
const SKIPPABLE_SMTP_BY_SOURCE: Record<EmailTransportSource, string> = {
  db: 'Une configuration SMTP est déjà enregistrée et répond — champs pré-remplis ci-dessous.',
  env: 'Un serveur SMTP défini par l\'environnement du serveur répond ; une configuration saisie ici le remplacera.',
  fallback: 'Un serveur SMTP local répond sur 127.0.0.1:1025 (typiquement Mailpit) : en développement, les emails y sont capturés au lieu d\'être réellement envoyés.',
}
// Repli si la source manque (ne devrait pas arriver quand l'étape est sautable).
const SKIPPABLE_SMTP_GENERIC = 'Un serveur d\'envoi a déjà été détecté : cette étape est facultative.'
const SKIPPABLE_ADMIN =
  'Créez le premier compte administrateur. Son lien de connexion lui sera envoyé par email — l\'envoi est déjà opérationnel, aucune configuration SMTP supplémentaire n\'est requise.'

function getStepMeta(
  key: 'key' | 'smtp' | 'admin',
  smtpSkippable: boolean,
  smtpTransportSource: EmailTransportSource | null,
) {
  if (!smtpSkippable || key === 'key') return STEP_META[key]
  if (key === 'admin') return { ...STEP_META.admin, description: SKIPPABLE_ADMIN }
  const description =
    (smtpTransportSource && SKIPPABLE_SMTP_BY_SOURCE[smtpTransportSource]) || SKIPPABLE_SMTP_GENERIC
  return { ...STEP_META.smtp, description }
}

/**
 * Stepper de l'assistant d'installation : pastilles numérotées + connecteur.
 * États tokenisés DS (fait / actif / à venir). Labels masqués sous le seuil sm.
 * Le nombre d'étapes est dynamique (2 ou 3) selon la présence de l'étape 'key'.
 */
export function SetupStepper({ current, steps, smtpSkippable = false, smtpTransportSource = null }: Props) {
  const activeKey = current === 'sent' ? 'admin' : current
  const activeIndex = Math.max(steps.indexOf(activeKey), 0)

  return (
    <div className="mb-6">
      <nav aria-label="Étapes d'installation">
        <ol className="flex items-center gap-3">
          {steps.map((key, index) => {
            const meta = getStepMeta(key, smtpSkippable, smtpTransportSource)
            const isDone = index < activeIndex
            const isActive = index === activeIndex
            const isLast = index === steps.length - 1
            return (
              <li
                key={key}
                className={cn('flex items-center gap-2.5', !isLast && 'flex-1')}
              >
                <span
                  className="flex items-center gap-2.5"
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                      isDone && 'bg-primary text-primary-foreground',
                      isActive && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                      !isDone && !isActive && 'border-2 border-muted bg-background text-muted-foreground',
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
                  </span>
                  <Typography
                    variant="body-sm"
                    className={cn(
                      'hidden font-medium sm:inline',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {meta.label}
                  </Typography>
                </span>
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={cn('h-px flex-1 transition-colors', isDone ? 'bg-primary' : 'bg-border')}
                  />
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <Banner variant="default" role="status" density="compact" className="mt-3">
        <Info aria-hidden="true" />
        <BannerDescription>{getStepMeta(steps[activeIndex], smtpSkippable, smtpTransportSource).description}</BannerDescription>
      </Banner>
    </div>
  )
}
