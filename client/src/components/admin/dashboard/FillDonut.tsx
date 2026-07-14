import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Typography } from '@/components/ui/typography'

export interface FillDonutProps extends HTMLAttributes<HTMLDivElement> {
  filled: number
  vacant: number
}

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Anneau de répartition rempli / vacant (SVG maison, sans dépendance). */
export function FillDonut({ filled, vacant, className, ...rest }: FillDonutProps) {
  const total = filled + vacant
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0
  const dash = (pct / 100) * CIRCUMFERENCE

  return (
    <div className={cn('flex flex-col items-center gap-3', className)} {...rest}>
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle
            cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10"
            className="stroke-muted"
          />
          {total > 0 && (
            <circle
              cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
              className="stroke-primary"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Typography variant="h3" as="p" weight="semibold">{`${pct} %`}</Typography>
        </div>
      </div>
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
          {`Remplis (${filled})`}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-muted" aria-hidden="true" />
          {`Vacants (${vacant})`}
        </span>
      </div>
    </div>
  )
}
