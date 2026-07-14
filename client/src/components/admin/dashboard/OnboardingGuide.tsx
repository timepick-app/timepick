import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, CalendarPlus, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { OnboardingStepCard } from './OnboardingStepCard'
import { CreateEventSheet } from '@/components/admin/events/CreateEventSheet'
import { computeOnboardingState } from '@/lib/onboarding'

interface OnboardingGuideProps {
  memberCount: number
  eventCount: number
  invitationsSent: number
  density: 'full' | 'compact'
  /** Id de l'événement vers lequel diriger le CTA ③ (onglet « Invités »). Repli liste si absent. */
  inviteEventId?: string
}

interface StepConfig {
  icon: LucideIcon
  title: string
  description: string
}

const STEP_CONFIG: Record<string, StepConfig> = {
  members: {
    icon: Users,
    title: 'Ajoutez vos membres',
    description: 'Importez ou ajoutez les personnes que vous inviterez à vos événements.',
  },
  event: {
    icon: CalendarPlus,
    title: 'Créez un événement',
    description: 'Proposez des créneaux que vos membres pourront réserver.',
  },
  invites: {
    icon: Send,
    title: 'Invitez et suivez',
    description: 'Envoyez vos invitations et suivez les réservations.',
  },
}

/** Guide d'onboarding : 3 cartes d'étapes calculées depuis computeOnboardingState. */
export function OnboardingGuide({ memberCount, eventCount, invitationsSent, density, inviteEventId }: OnboardingGuideProps) {
  const navigate = useNavigate()
  const [eventSheetOpen, setEventSheetOpen] = useState(false)
  const steps = computeOnboardingState({ memberCount, eventCount, invitationsSent })
  const compact = density === 'compact'
  // CTA accordés à la surface info-bleu des cartes (cf. OnboardingStepCard).
  const primaryCtaClass = 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500'

  return (
    <section className="space-y-3" aria-labelledby="dashboard-onboarding-heading">
      <Typography id="dashboard-onboarding-heading" variant="h2">
        {compact ? 'Mise en route' : 'Pour commencer'}
      </Typography>
      <div className={compact ? 'grid gap-3 sm:grid-cols-3' : 'grid gap-4 sm:grid-cols-3'}>
        {steps.map((step, index) => {
          const config = STEP_CONFIG[step.key]
          const recap = { members: `${memberCount} membres ajoutés`, event: `${eventCount} événements créés`, invites: `${invitationsSent} invitations envoyées` }[step.key]
          let action: ReactNode | undefined

          if (step.key === 'members' && step.state !== 'done') {
            action = (
              <>
                <Button variant="default" className={primaryCtaClass} onClick={() => navigate('/admin/users')}>
                  Ajouter des membres
                </Button>
                <Button
                  variant="ghost"
                  className="text-blue-700 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-300 dark:hover:bg-blue-900/50 dark:hover:text-blue-100"
                  onClick={() => navigate('/admin/users')}
                >
                  Importer un CSV
                </Button>
              </>
            )
          } else if (step.key === 'event' && step.state !== 'done') {
            action = (
              <Button variant="default" className={primaryCtaClass} onClick={() => setEventSheetOpen(true)}>
                Créer un événement
              </Button>
            )
          } else if (step.key === 'invites' && step.state === 'active') {
            // ③ actionnable dès qu'un événement existe : deep-link vers l'onglet « Invités »
            // (#users) du 1er événement à traiter ; repli sur la liste si aucun id résolu.
            const target = inviteEventId
              ? `/admin/events/${inviteEventId}/edit#users`
              : '/admin/events'
            action = (
              <Button variant="default" className={primaryCtaClass} onClick={() => navigate(target)}>
                Inviter mes membres
              </Button>
            )
          }

          return (
            <OnboardingStepCard
              key={step.key}
              icon={config.icon}
              title={config.title}
              description={config.description}
              state={step.state}
              recap={recap}
              action={action}
              compact={compact}
              eyebrow={`Étape ${index + 1}`}
            />
          )
        })}
      </div>
      <CreateEventSheet open={eventSheetOpen} onOpenChange={setEventSheetOpen} />
    </section>
  )
}
