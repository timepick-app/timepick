import { cn } from '@/lib/utils'
import { normalizeStoredDescription, isRichTextEmpty } from '@/lib/richText'

interface RichTextContentProps {
  html?: string | null
  className?: string
}

/**
 * RichTextContent — rendu en lecture seule d'une description riche.
 *
 * Ne fait JAMAIS confiance au HTML stocké : chaque rendu repasse par
 * `normalizeStoredDescription` qui sanitise via DOMPurify (allowlist
 * p/br/strong/em/a uniquement) ET convertit les anciennes descriptions
 * en texte brut (avec `\n`) en HTML valide avec sauts de ligne.
 */
export function RichTextContent({ html, className }: RichTextContentProps) {
  if (isRichTextEmpty(html)) return null

  const __html = normalizeStoredDescription(html)

  return (
    <div
      className={cn(
        'text-sm text-muted-foreground [&_strong]:font-semibold [&_em]:italic [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:break-words [&_p]:m-0',
        className,
      )}
      dangerouslySetInnerHTML={{ __html }}
    />
  )
}
