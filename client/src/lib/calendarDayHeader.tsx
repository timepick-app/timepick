import type { DayHeaderContentArg } from '@fullcalendar/core'

/**
 * Rendu personnalisé des en-têtes de jour pour la vue Semaine (timeGridWeek) —
 * partagé par les deux calendriers (admin SlotCalendar + public CalendarView)
 * afin que le marqueur « aujourd'hui » reste IDENTIQUE à la vue Mois.
 *
 * - Supprime le mois (« mar. 23/06 » → « mar. 23 ») : tâche Drawbridge #19.
 * - Sépare le libellé du jour (« mar. ») et le numéro (« 23 ») dans deux spans ;
 *   le numéro porte `.tp-week-daynum`, ciblé en CSS pour la pastille rouge
 *   (règle groupée avec la pastille de la vue Mois dans index.css).
 * - Toute autre vue (Mois/Année/Jour) garde le rendu par défaut (`arg.text`).
 */
export function renderWeekDayHeader(arg: DayHeaderContentArg) {
  if (arg.view.type !== 'timeGridWeek') return arg.text
  const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(arg.date)
  const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' }).format(arg.date)
  return (
    <span className="tp-week-dayheader">
      <span className="tp-week-weekday">{weekday}</span>
      <span className="tp-week-daynum">{day}</span>
    </span>
  )
}
