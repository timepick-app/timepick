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
import type { DirectionProps, Slot } from './pocShared'

/**
 * Direction B — Liste plate auto-portante (la « lean » de Jensen).
 *
 * AUCUN en-tête de jour, AUCUNE gouttière : chaque rangée porte sa propre date
 * compacte. Anti-redondance — la date n'est rappelée que pour les mono-jours, les
 * multi-jours étant DÉJÀ datés par `compactTime`. Les créneaux sont aplatis
 * (regroupés par jour de début puis concaténés) en un seul `<ul>` chronologique,
 * séparés par un simple filet `border-b` (pas de chrome de carte).
 *
 * La mise en page bascule sur `mode` (le cadre mobile est contraint en largeur,
 * les breakpoints Tailwind `md:` — basés sur le viewport — ne se déclencheraient
 * pas).
 */
export function DirectionB({ slots, mode, placesFormat }: DirectionProps) {
  const rows = groupSlotsByStartDay(slots).flatMap(([, day]) => day)

  // Mobile — rangée empilée : date+heure ↔ badge (justify-between), durée,
  // description complète, puis places ↔ CTA. `border-t` sur le <ul> ferme le haut.
  if (mode === 'mobile') {
    return (
      <ul className="border-t border-border" data-poc-direction="B">
        {rows.map((slot) => (
          <li
            key={slot.id}
            className={cn(
              'flex flex-col gap-1.5 border-b border-border py-3',
              isDimmed(slot) && 'opacity-60',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <Typography as="span" variant="body" weight="semibold" className="tabular-nums">
                {composedDateTime(slot)}
              </Typography>
              <span className="shrink-0">
                <PocStatusBadge slot={slot} format={placesFormat} />
              </span>
            </div>

            <Typography variant="body-sm" color="muted">
              {formatSlotDuration(slot.startTime, slot.endTime)}
            </Typography>

            {slot.description && (
              <Typography variant="body-sm" color="muted" className="break-words">
                {slot.description}
              </Typography>
            )}

            <div className="flex items-center gap-3">
              <PlacesLabel slot={slot} format={placesFormat} />
              <div className="ml-auto">
                <CtaButton slot={slot} mode="mobile" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  // Desktop — rangée en flux : date+heure+durée à gauche, badge+places+CTA
  // alignés à droite, description pleine largeur en 2e ligne.
  return (
    <ul className="border-t border-border" data-poc-direction="B">
      {rows.map((slot) => (
        <li
          key={slot.id}
          className={cn(
            'flex flex-col gap-1 border-b border-border py-3',
            isDimmed(slot) && 'opacity-60',
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Typography as="span" variant="body" weight="semibold" className="tabular-nums">
                {composedDateTime(slot)}
              </Typography>
              <Typography as="span" variant="body-sm" color="muted">
                {`· ${formatSlotDuration(slot.startTime, slot.endTime)}`}
              </Typography>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <PocStatusBadge slot={slot} format={placesFormat} />
              <PlacesLabel slot={slot} format={placesFormat} />
              <CtaButton slot={slot} mode="desktop" />
            </div>
          </div>

          {slot.description && (
            <Typography variant="body-sm" color="muted" className="break-words">
              {slot.description}
            </Typography>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Date+heure auto-portante d'une rangée (anti-redondance) :
 *  - multi-jours → `compactTime` SEUL (déjà daté, ex. « 20 juin 23h00 → 21 juin 05h00 ») ;
 *  - mono-jour   → « 28 juin · 09h00 → 10h00 » (date courte + horaire).
 */
function composedDateTime(slot: Slot): string {
  return isMultiDaySlot(slot.startTime, slot.endTime)
    ? compactTime(slot)
    : `${lineDate(slot)} · ${compactTime(slot)}`
}
