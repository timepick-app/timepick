/**
 * Détection d'incompatibilités Outlook dans la cascade MJML d'une invitation.
 *
 * Helper pur, sans dépendance externe. Conçu pour être étendu (autres règles :
 * box-shadow, gradient, flex, etc.). Chaque règle produit au plus une entrée
 * (`id` unique) dans le tableau retourné, même si plusieurs occurrences sont
 * détectées dans la cascade — c'est un signal préventif, pas un linter.
 *
 * L'API accepte les 3 sources (header / body / footer) séparément afin de
 * remonter la provenance de chaque incompatibilité jusqu'à l'UI : un border-
 * radius hérité du header ne doit pas être confondu avec un border-radius
 * introduit dans le corps éditable.
 */

export type EmailCompatSource = 'header' | 'body' | 'footer'

export type EmailCompatIssue = {
  id: string
  message: string
  severity: 'warning'
  sources: EmailCompatSource[]
}

export type EmailCompatSources = Partial<
  Record<EmailCompatSource, string | null | undefined>
>

const BORDER_RADIUS_RE = /border-radius\s*[:=]\s*["']?([^"';>]+)["']?/gi

const BORDER_RADIUS_MESSAGE =
  "Les coins arrondis (border-radius) ne s'afficheront pas sur Outlook pour Windows. " +
  "L'aperçu sera correct sur Outlook macOS, Outlook.com, iOS et Android."

const SOURCE_ORDER: EmailCompatSource[] = ['header', 'body', 'footer']

const hasPositiveToken = (rawValue: string): boolean => {
  const tokens = rawValue.trim().split(/\s+/)
  return tokens.some((token) => {
    const numeric = parseFloat(token)
    return Number.isFinite(numeric) && numeric > 0
  })
}

const hasBorderRadius = (mjml: string): boolean => {
  // matchAll() crée un itérateur frais à chaque appel — pas d'état partagé
  // via lastIndex comme avec RegExp.exec() en mode /g.
  for (const match of mjml.matchAll(BORDER_RADIUS_RE)) {
    if (hasPositiveToken(match[1])) return true
  }
  return false
}

export const detectOutlookIncompatibilities = (
  sources: EmailCompatSources,
): EmailCompatIssue[] => {
  const borderRadiusSources: EmailCompatSource[] = []
  for (const source of SOURCE_ORDER) {
    const content = sources[source]
    if (content && hasBorderRadius(content)) {
      borderRadiusSources.push(source)
    }
  }

  const issues: EmailCompatIssue[] = []
  if (borderRadiusSources.length > 0) {
    issues.push({
      id: 'border-radius',
      message: BORDER_RADIUS_MESSAGE,
      severity: 'warning',
      sources: borderRadiusSources,
    })
  }

  return issues
}
