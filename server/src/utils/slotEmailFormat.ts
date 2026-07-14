import { format, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * Pré-format SERVEUR des variables `slot_date` / `slot_time` des e-mails de
 * réservation et d'annulation (Story 1.5, créneaux multi-jours).
 *
 * Pourquoi un helper serveur dédié : `formatSlotRange` / `isMultiDaySlot`
 * vivent dans `client/src/lib/utils.ts` et sont inaccessibles côté serveur.
 * Le moteur d'interpolation `substituteVariables` ne supporte pas les blocs
 * conditionnels → c'est le caller qui pré-formate. On centralise ici la logique
 * partagée par les 3 callers (confirmation + annulation utilisateur, renvoi
 * d'annulation admin) pour éviter une triple copie inline.
 *
 * Décision D-1 (revue Story 1.4) : les e-mails affichent la PLAGE DE DATES
 * (« du … au … »), jamais un décompte « N jours ». `formatSlotDuration` (client)
 * compte les jours *calendaires* (quirk : nuit 23h→01h = « 2 jours ») — on
 * évite de propager ce quirk dans les e-mails.
 */

/**
 * Indique si un créneau s'étend sur plusieurs jours calendaires LOCAUX.
 *
 * Miroir serveur de `isMultiDaySlot` (client) : compare via `isSameDay`, qui
 * raisonne en jours calendaires locaux (TZ du process, DST-safe). Les `Date`
 * proviennent de `timestamptz` (déjà converties en heure locale serveur), comme
 * pour l'affichage mono-jour actuel — aucune conversion UTC introduite (FR12).
 */
export function isMultiDaySlotServer(start: Date, end: Date): boolean {
  return !isSameDay(start, end)
}

/**
 * Variable `slot_date` de l'e-mail.
 * - Mono-jour : `dd/MM/yyyy` (strictement inchangé — FR12).
 * - Multi-jours : `du dd/MM/yyyy au dd/MM/yyyy` (plage complète — FR11).
 */
export function formatSlotEmailDate(start: Date, end: Date): string {
  if (isMultiDaySlotServer(start, end)) {
    return `du ${format(start, 'dd/MM/yyyy', { locale: fr })} au ${format(end, 'dd/MM/yyyy', { locale: fr })}`
  }
  return format(start, 'dd/MM/yyyy', { locale: fr })
}

/**
 * Variable `slot_time` de l'e-mail : `HHhmm → HHhmm`, identique en mono et en
 * multi-jours. La plage de dates portée par `slot_date` lève l'ambiguïté.
 * Notation « h » française + séparateur flèche (convention du design system
 * pour les plages horaires).
 */
export function formatSlotEmailTime(start: Date, end: Date): string {
  return `${format(start, "HH'h'mm", { locale: fr })} → ${format(end, "HH'h'mm", { locale: fr })}`
}
