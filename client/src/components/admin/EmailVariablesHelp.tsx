import { cn } from '@/lib/utils'
import type { EmailVariableHelp } from '@/lib/email-template-constants'

/**
 * Section « Variables disponibles » réutilisée par les cartes d'email
 * (invitation + système). Rend une liste de définition `token → description`
 * alimentée par les constantes (`describeEmailVariables`), jamais par du texte
 * en dur dans le JSX appelant.
 *
 * Drawbridge 21/22/23 + part de 20 : chaque carte explique les variables
 * propres à son type d'email.
 */

export interface EmailVariablesHelpProps {
  variables: readonly EmailVariableHelp[]
  className?: string
  'data-testid'?: string
}

export const EmailVariablesHelp = ({
  variables,
  className,
  'data-testid': dataTestId = 'email-variables-help',
}: EmailVariablesHelpProps) => {
  if (variables.length === 0) return null

  return (
    <div className={cn('space-y-2', className)} data-testid={dataTestId}>
      <p className="text-sm font-medium">Variables disponibles</p>
      <dl className="space-y-1.5">
        {variables.map((variable) => (
          <div
            key={variable.name}
            className="flex flex-col gap-0.5 sm:flex-row sm:gap-2"
          >
            <dt className="shrink-0">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {`{{${variable.name}}}`}
              </code>
            </dt>
            <dd className="text-sm text-muted-foreground">
              {variable.description}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
