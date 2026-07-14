import type { SVGProps } from 'react'

/**
 * Tracé du check-circle plein (Heroicons solid `check-circle`) — source UNIQUE
 * de l'icône « réservé / confirmé » du produit. Réutilisé par :
 *  - le composant React {@link CheckCircleSolid} (encart de confirmation du
 *    popover calendrier, fenêtre de détail d'un créneau) ;
 *  - la chaîne HTML du badge calendrier (FullCalendar `eventContent`), qui
 *    assemble son propre `<svg>` autour de ce tracé
 *    (cf. `CalendarView.renderEventContent`).
 *
 * Évite la divergence d'icônes « réservé » qui existait entre `SlotDetailDialog`,
 * le popover du calendrier et le badge du calendrier.
 */
export const CHECK_CIRCLE_SOLID_PATH =
  'M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z'

/**
 * Icône check-circle pleine. La couleur du disque suit `currentColor` (`fill`),
 * le ✓ étant découpé en transparence (laisse apparaître le fond sous-jacent).
 */
export function CheckCircleSolid(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path fillRule="evenodd" d={CHECK_CIRCLE_SOLID_PATH} clipRule="evenodd" />
    </svg>
  )
}
