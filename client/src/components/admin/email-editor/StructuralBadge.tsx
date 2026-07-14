import type { HTMLAttributes } from 'react'
import { Badge } from '@/components/ui/badge'

type StructuralBadgeLabel = 'En-tête' | 'Corps' | 'Pied'

interface StructuralBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  label: StructuralBadgeLabel
}

const LABEL_SLUG: Record<StructuralBadgeLabel, string> = {
  'En-tête': 'header',
  'Corps': 'body',
  'Pied': 'footer',
}

export const StructuralBadge = ({ label, ...rest }: StructuralBadgeProps) => {
  return (
    <Badge
      variant="default"
      size="sm"
      data-testid={`structural-badge-${LABEL_SLUG[label]}`}
      data-label={label}
      {...rest}
    >
      Élément structurel — modifiable, non supprimable
    </Badge>
  )
}
