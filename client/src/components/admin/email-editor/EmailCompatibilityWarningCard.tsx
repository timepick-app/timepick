import * as React from 'react'
import { X } from 'lucide-react'
import { Banner, BannerDescription, BannerTitle } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  detectOutlookIncompatibilities,
  type EmailCompatIssue,
  type EmailCompatSource,
  type EmailCompatSources,
} from '@/lib/emailCompatibility'

const STORAGE_PREFIX = 'EmailCompat:'

const SOURCE_LABELS: Record<EmailCompatSource, string> = {
  header: 'entête',
  body: 'corps',
  footer: 'pied',
}

const formatSources = (sources: EmailCompatSource[]): string =>
  sources.map((s) => SOURCE_LABELS[s]).join(', ')

const hashIssues = (issues: EmailCompatIssue[]): string =>
  issues
    .map((issue) => `${issue.id}:${[...issue.sources].sort().join(',')}`)
    .slice()
    .sort()
    .join('|')

const readDismissed = (storageKey: string): boolean => {
  try {
    return window.localStorage.getItem(storageKey) === '1'
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[EmailCompat] localStorage read failed', err)
    }
    return false
  }
}

const writeDismissed = (storageKey: string): void => {
  try {
    window.localStorage.setItem(storageKey, '1')
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[EmailCompat] localStorage write failed', err)
    }
  }
}

const purgeScopeKeys = (scopePrefix: string): void => {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(scopePrefix)) {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      window.localStorage.removeItem(key)
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[EmailCompat] localStorage purge failed', err)
    }
  }
}

interface EmailCompatibilityWarningCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  sources: EmailCompatSources
  /**
   * Identifiant de contexte (ex. `template:invitation`, `event:<id>`). Scope
   * la clé localStorage du dismiss afin qu'un dismiss sur un événement
   * n'affecte pas un autre événement ni le template général.
   */
  scopeKey: string
}

export const EmailCompatibilityWarningCard = React.forwardRef<
  HTMLDivElement,
  EmailCompatibilityWarningCardProps
>(({ sources, scopeKey, className, ...rest }, ref) => {
  const issues = React.useMemo(
    () => detectOutlookIncompatibilities(sources),
    [sources],
  )
  const storageKey = React.useMemo(
    () => `${STORAGE_PREFIX}${scopeKey}:${hashIssues(issues)}`,
    [issues, scopeKey],
  )

  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    if (issues.length === 0) {
      // Purge basée sur le préfixe scopé : robuste aux remounts du panel
      // (la mutation post-save peut faire passer le panel en loading et
      // remonter la card, ce qui invaliderait une référence locale).
      purgeScopeKeys(`${STORAGE_PREFIX}${scopeKey}:`)
      setDismissed(false)
      return
    }
    setDismissed(readDismissed(storageKey))
  }, [storageKey, scopeKey, issues.length])

  const handleDismiss = (): void => {
    writeDismissed(storageKey)
    setDismissed(true)
  }

  if (issues.length === 0 || dismissed) return null

  return (
    <Banner
      ref={ref}
      variant="warning"
      className={cn('relative pr-12', className)}
      data-testid="email-compatibility-warning-card"
      {...rest}
      role="status"
    >
      <BannerTitle>Compatibilité Outlook</BannerTitle>
      <BannerDescription>
        <ul className="list-disc pl-5 space-y-1">
          {issues.map((issue) => (
            <li key={issue.id}>
              {issue.message}{' '}
              <span className="font-medium">
                Détecté dans&nbsp;: {formatSources(issue.sources)}.
              </span>
            </li>
          ))}
        </ul>
      </BannerDescription>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2 text-current"
        onClick={handleDismiss}
        aria-label="Masquer l'avertissement de compatibilité Outlook"
        data-testid="email-compatibility-dismiss-btn"
      >
        <X className="h-4 w-4" />
      </Button>
    </Banner>
  )
})
EmailCompatibilityWarningCard.displayName = 'EmailCompatibilityWarningCard'
