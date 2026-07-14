import { Fragment } from 'react'
import {
  CtaButton,
  PocStatusBadge,
  PlacesLabel,
  Typography,
  compactTime,
  lineDate,
  formatSlotDuration,
  groupSlotsByStartDay,
  isDimmed,
  isMultiDaySlot,
  cn,
} from './pocShared'
import type { DirectionProps } from './pocShared'

/**
 * Direction C — Table / data-grid responsive.
 *
 * Desktop : vraie `<table>` sémantique (Date · Horaire · Statut · Places ·
 * Action) avec une sous-ligne description en `colSpan={5}` sous les colonnes.
 * Mobile : repli en fiches empilées (`<ul>`/`<li>`), pas de `<table>`.
 *
 * Les créneaux sont aplatis chronologiquement (regroupés par jour de début puis
 * concaténés) pour un balayage colonne par colonne homogène. La mise en page
 * bascule sur `mode` (le cadre mobile est contraint en largeur, les breakpoints
 * Tailwind `md:` — basés sur le viewport — ne se déclencheraient pas).
 */
export function DirectionC({ slots, mode, placesFormat }: DirectionProps) {
  const rows = groupSlotsByStartDay(slots).flatMap(([, day]) => day)

  // Mobile — fiches empilées, séparées par un filet (pas de chrome de carte).
  if (mode === 'mobile') {
    return (
      <ul>
        {rows.map((slot) => (
          <li
            key={slot.id}
            className={cn(
              'border-b border-border py-3 last:border-b-0',
              isDimmed(slot) && 'opacity-60',
            )}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {!isMultiDaySlot(slot.startTime, slot.endTime) && (
                <Typography as="span" variant="body-sm" color="muted">
                  {lineDate(slot)}
                </Typography>
              )}
              <Typography as="span" variant="body-sm" weight="semibold" className="tabular-nums">
                {compactTime(slot)}
              </Typography>
              <Typography as="span" variant="body-xs" color="muted">
                {formatSlotDuration(slot.startTime, slot.endTime)}
              </Typography>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <PocStatusBadge slot={slot} format={placesFormat} />
              <PlacesLabel slot={slot} format={placesFormat} />
            </div>

            {slot.description && (
              <Typography variant="body-sm" color="muted" className="mt-1.5 break-words">
                {slot.description}
              </Typography>
            )}

            <div className="mt-2 flex justify-end">
              <CtaButton slot={slot} mode={mode} />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  // Desktop — vraie table alignée en colonnes.
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          Créneaux de l'événement, triés par date, avec leur horaire, leur statut, le nombre de
          places restantes et l'action de réservation.
        </caption>
        <thead>
          <tr className="border-b border-border">
            {(['Date', 'Horaire', 'Statut', 'Places'] as const).map((label) => (
              <th key={label} scope="col" className="px-3 py-1.5 text-left align-bottom">
                <Typography
                  as="span"
                  variant="body-xs"
                  color="muted"
                  weight="medium"
                  className="uppercase tracking-wide"
                >
                  {label}
                </Typography>
              </th>
            ))}
            <th scope="col" className="px-3 py-1.5 text-right align-bottom">
              <Typography
                as="span"
                variant="body-xs"
                color="muted"
                weight="medium"
                className="uppercase tracking-wide"
              >
                Action
              </Typography>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((slot) => {
            const dimmed = isDimmed(slot)
            const hasDescription = Boolean(slot.description)
            return (
              <Fragment key={slot.id}>
                <tr
                  className={cn(dimmed && 'opacity-60', !hasDescription && 'border-b border-border')}
                >
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    <Typography as="span" variant="body-sm">
                      {lineDate(slot)}
                    </Typography>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    <Typography
                      as="div"
                      variant="body-sm"
                      weight="semibold"
                      className="tabular-nums"
                    >
                      {compactTime(slot)}
                    </Typography>
                    <Typography as="div" variant="body-xs" color="muted">
                      {formatSlotDuration(slot.startTime, slot.endTime)}
                    </Typography>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <PocStatusBadge slot={slot} format={placesFormat} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <PlacesLabel slot={slot} format={placesFormat} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                    <CtaButton slot={slot} mode={mode} />
                  </td>
                </tr>
                {hasDescription && (
                  <tr className={cn(dimmed && 'opacity-60', 'border-b border-border')}>
                    <td colSpan={5} className="px-3 pb-2 align-top">
                      <Typography variant="body-sm" color="muted" className="break-words">
                        {slot.description}
                      </Typography>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
