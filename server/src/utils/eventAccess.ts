/**
 * Vérifie si un événement est ouvert aux réservations (date d'ouverture atteinte).
 *
 * Centralisé ici (au lieu de dupliqué entre le contrôleur d'affichage et les
 * chemins d'écriture) pour que `canReserve` côté lecture et le garde-fou
 * serveur côté écriture (F-020 — `bookSlot`/`createReservation` doivent relire
 * `opens_at` avant d'insérer une réservation) restent la même règle.
 *
 * @param opensAt - Date d'ouverture ISO ou null (aucune restriction)
 * @returns true si ouvert (ou pas de restriction), false si dans le futur
 */
export function isEventOpen(opensAt: string | null | undefined): boolean {
  if (!opensAt) return true
  return new Date() >= new Date(opensAt)
}
