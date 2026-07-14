import {
  CtaButton,
  PocStatusBadge,
  PlacesLabel,
  Typography,
  compactTime,
  dayLabel,
  formatSlotDuration,
  groupSlotsByStartDay,
  isDimmed,
  cn,
} from './pocShared'
import type { DirectionProps } from './pocShared'

/**
 * Direction D — TIMELINE VERTICALE (documentée, écartée).
 *
 * Un rail vertical (la bordure-gauche du conteneur) traverse toute la liste. Chaque
 * jour pose son libellé + un nœud plein sur le rail UNE SEULE FOIS ; chaque créneau
 * accroche ensuite son propre nœud creux. Moins dense que A/B/C — conservée pour
 * l'arbitrage visuel.
 *
 * Le layout est branché sur `mode` (le cadre mobile est contraint en largeur, donc
 * les breakpoints `md:` ne se déclencheraient pas) :
 *  - mobile  : pile verticale, le badge sur sa propre ligne (l'heure multi-jours est longue) ;
 *  - desktop : badge poussé à droite de l'heure (justify-between), gouttière de rail plus large.
 */
export function DirectionD({ slots, mode, placesFormat }: DirectionProps) {
  const groups = groupSlotsByStartDay(slots)
  const isMobile = mode === 'mobile'
  const pad = isMobile ? 'pl-6' : 'pl-8'

  return (
    <div className="ml-2 border-l-2 border-border">
      {groups.map(([dateKey, daySlots], groupIndex) => (
        <div key={dateKey} className={cn(groupIndex > 0 && 'mt-6')}>
          {/* Repère de jour — posé une seule fois, sur le rail */}
          <div className={cn('relative pb-1.5', pad)}>
            <span
              aria-hidden="true"
              className="absolute left-0 top-1.5 h-2 w-2 -translate-x-1/2 rounded-full bg-primary ring-2 ring-background"
            />
            <Typography variant="body-sm" weight="semibold">
              {dayLabel(dateKey)}
            </Typography>
          </div>

          {/* Créneaux du jour */}
          <ul>
            {daySlots.map((slot) => (
              <li
                key={slot.id}
                className={cn(
                  'relative border-b border-border py-3 last:border-b-0',
                  pad,
                  isDimmed(slot) && 'opacity-60',
                )}
              >
                {/* Nœud creux du créneau, accroché au rail */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-primary bg-background"
                />

                {isMobile ? (
                  /* MOBILE — pile verticale : heure · durée / badge / description / places + CTA */
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Typography as="span" variant="body" weight="semibold" className="tabular-nums">
                        {compactTime(slot)}
                      </Typography>
                      <Typography as="span" variant="body-sm" color="muted">
                        · {formatSlotDuration(slot.startTime, slot.endTime)}
                      </Typography>
                    </div>

                    <div>
                      <PocStatusBadge slot={slot} format={placesFormat} />
                    </div>

                    {slot.description && (
                      <Typography variant="body-sm" color="muted" className="break-words">
                        {slot.description}
                      </Typography>
                    )}

                    <div className="flex items-center gap-3">
                      <PlacesLabel slot={slot} format={placesFormat} />
                      <div className="ml-auto shrink-0">
                        <CtaButton slot={slot} mode={mode} />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* DESKTOP — heure à gauche / badge à droite, puis description, puis places + CTA */
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <Typography as="span" variant="body" weight="semibold" className="tabular-nums">
                          {compactTime(slot)}
                        </Typography>
                        <Typography as="span" variant="body-sm" color="muted">
                          · {formatSlotDuration(slot.startTime, slot.endTime)}
                        </Typography>
                      </div>
                      <div className="shrink-0">
                        <PocStatusBadge slot={slot} format={placesFormat} />
                      </div>
                    </div>

                    {slot.description && (
                      <Typography variant="body-sm" color="muted" className="break-words">
                        {slot.description}
                      </Typography>
                    )}

                    <div className="flex items-center gap-3">
                      <PlacesLabel slot={slot} format={placesFormat} />
                      <div className="ml-auto shrink-0">
                        <CtaButton slot={slot} mode={mode} />
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
