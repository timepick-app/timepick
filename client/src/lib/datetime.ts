/**
 * Helpers de conversion entre `Date` (utilisé par les primitives DS
 * `DatePicker` / `DateTimePicker`) et les chaînes locales naïves manipulées par
 * les formulaires (`YYYY-MM-DDTHH:mm` pour datetime-local, `YYYY-MM-DD` pour
 * date). Centralise la logique qui vivait dupliquée dans `EventForm`,
 * `EventDetailsTab`, `OpeningDateInput` et `SlotEditDialog`.
 *
 * IMPORTANT (fuseau horaire) : ces helpers travaillent en heure **locale**.
 * - `new Date('YYYY-MM-DDTHH:mm')` (sans suffixe Z) est interprété en LOCAL.
 * - `new Date('YYYY-MM-DD')` serait interprété en UTC (piège) → on construit donc
 *   les dates « date seule » à partir des composants via `new Date(y, m-1, d)`.
 */

const pad = (n: number): string => String(n).padStart(2, '0')

/** Parse une chaîne datetime-local (`YYYY-MM-DDTHH:mm`) en `Date` locale. */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Formate une `Date` en chaîne datetime-local locale (`YYYY-MM-DDTHH:mm`). */
export function formatLocalDateTime(date: Date | null | undefined): string {
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Parse une chaîne date (`YYYY-MM-DD`) en `Date` locale à minuit. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

/**
 * Formate une `Date` en chaîne date locale (`YYYY-MM-DD`).
 *
 * @public — pendant symétrique de `parseLocalDate` (consommé par SlotEditDialog)
 * et helper canonique du `onChange` de `<DatePicker>` documenté dans
 * `date-picker.meta.ts`. Pas encore de callsite date-only, mais c'est une API
 * publique intentionnelle de la lib, pas un export mort (silence knip).
 */
export function formatLocalDate(date: Date | null | undefined): string {
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
