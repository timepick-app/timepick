import { Check, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Typography } from '@/components/ui/typography'
import { Banner, BannerDescription } from '@/components/ui/banner'

type SetupStepKey = 'smtp' | 'admin' | 'sent'

interface Props {
  current: SetupStepKey
}

const STEPS: { key: 'smtp' | 'admin'; label: string; description: string }[] = [
  {
    key: 'smtp',
    label: 'Serveur SMTP',
    description:
      'Ce serveur achemine tous les emails de TimePick — liens de connexion, invitations, confirmations et notifications, pour tous les comptes. Sans lui, personne ne peut se connecter ni être prévenu.',
  },
  {
    key: 'admin',
    label: 'Administrateur',
    description:
      'Créez le premier compte administrateur. Son lien de connexion étant envoyé par email, la configuration SMTP doit être faite au préalable.',
  },
]

/**
 * Stepper de l'assistant d'installation : pastilles numérotées + connecteur.
 * États tokenisés DS (fait / actif / à venir). Labels masqués sous le seuil sm.
 */
export function SetupStepper({ current }: Props) {
  const activeIndex = current === 'smtp' ? 0 : 1

  return (
    <div className="mb-6">
      <nav aria-label="Étapes d'installation">
        <ol className="flex items-center gap-3">
          {STEPS.map((step, index) => {
            const isDone = index < activeIndex
            const isActive = index === activeIndex
            const isLast = index === STEPS.length - 1
            return (
              <li
                key={step.key}
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
                    {step.label}
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
        <BannerDescription>{STEPS[activeIndex].description}</BannerDescription>
      </Banner>
    </div>
  )
}
