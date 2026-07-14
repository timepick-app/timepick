import type { HTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface OnboardingStepCardProps extends HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon
  title: string
  description?: string
  state: 'todo' | 'active' | 'done'
  recap?: string
  action?: ReactNode
  compact?: boolean
  eyebrow: string
}

/** Carte d'une étape du guide d'onboarding. Bleu info si à faire/active, grisée si faite. */
export function OnboardingStepCard({
  icon: Icon,
  title,
  description,
  state,
  recap,
  action,
  compact = false,
  eyebrow,
  className,
  ...rest
}: OnboardingStepCardProps) {
  const isDone = state === 'done'

  return (
    <Card
      className={cn(
        isDone ? 'bg-muted text-muted-foreground' : 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950 dark:text-blue-100',
        className,
      )}
      {...rest}
    >
      <CardContent className={cn('space-y-2 text-center', compact ? 'p-3' : 'p-4')}>
        <Icon className={cn('mx-auto block h-6 w-6', !isDone && 'text-blue-600 dark:text-blue-300')} />
        {!compact && (
          <p className={cn('text-xs font-medium', isDone ? 'text-muted-foreground' : 'text-blue-700 dark:text-blue-300')}>{eyebrow}</p>
        )}
        <p className="text-sm font-semibold">{title}</p>
        {!compact && description != null && (
          <p className="text-xs">{description}</p>
        )}
        {isDone && recap != null && (
          <p className="text-xs opacity-80">{recap}</p>
        )}
        {action != null && (
          <div className="mt-2 flex flex-col gap-2">
            {action}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
