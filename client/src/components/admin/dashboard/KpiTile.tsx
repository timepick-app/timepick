import type { HTMLAttributes, ReactNode } from 'react'
import { Info } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'

export interface KpiTileProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  value: ReactNode
  hint?: ReactNode
  tooltip?: ReactNode
}

/** Tuile KPI générique : valeur en avant, libellé puis indice optionnel, dans une carte neutre. */
export function KpiTile({ label, value, hint, tooltip, className, ...rest }: KpiTileProps) {
  return (
    <Card className={cn('h-full', className)} {...rest}>
      <CardContent className="space-y-1 p-4">
        <Typography variant="h3" as="p" weight="semibold">{value}</Typography>
        <div className="flex items-center gap-1">
          <Typography variant="body-sm" color="muted">{label}</Typography>
          {tooltip != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Plus d'informations" className="inline-flex text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {hint != null && hint !== '' && (
          <Typography variant="body-xs" color="muted">{hint}</Typography>
        )}
      </CardContent>
    </Card>
  )
}
