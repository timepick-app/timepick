import type { ComponentMeta } from './_meta/types'

export const dateTimePickerMeta: ComponentMeta = {
  name: 'DateTimePicker',
  importPath: '@/components/ui/date-time-picker',
  summary:
    'Variante combinée date + heure dans un SEUL popover (modèle shadcn officiel `date-picker-time`) : `Button` outline + `Popover` contenant `Calendar` puis, sous une bordure, un `TimePicker`. Contrôlé via `value: Date | null` + `onChange(date)`. Le déclencheur affiche `d MMMM yyyy à HH:mm` (locale fr). Changer la date préserve l\'heure et inversement. `minDate` désactive les jours antérieurs. Remplace les `<input type="datetime-local">` natifs (ex. date d\'ouverture des inscriptions `opensAt`). Pour une date seule, utiliser `DatePicker`.',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Contrôlé via `value` (`Date | null`) + `onChange`. Convertir depuis/vers la chaîne datetime-local du formulaire via `@/lib/datetime` (`parseLocalDateTime` / `formatLocalDateTime`) pour préserver la sérialisation ISO côté API',
      correct:
        '<DateTimePicker value={parseLocalDateTime(form.opensAt)} onChange={(d) => setForm({ ...form, opensAt: formatLocalDateTime(d) })} />',
      wrong:
        '<DateTimePicker value={form.opensAt} onChange={...} /> // form.opensAt est une string : type incorrect',
    },
    {
      rule: 'Empêcher une date passée avec `minDate={new Date()}` plutôt qu\'un `min` natif (le backend doit aussi valider)',
      correct: '<DateTimePicker value={d} onChange={setD} minDate={new Date()} />',
      wrong: '<DateTimePicker value={d} onChange={setD} /> // une date d\'ouverture dans le passé devient sélectionnable',
    },
  ],
  antiPatterns: [
    {
      title: 'Conserver un `<input type="datetime-local">` natif',
      description:
        'Le champ datetime-local natif rend une UI dépendante du navigateur/OS sans focus ring DS ni locale française. Utiliser `DateTimePicker` pour une date+heure (ex. `opensAt`).',
    },
    {
      title: 'Empiler un DatePicker et un champ heure séparés pour une même valeur datetime',
      description:
        'Pour une valeur date+heure unique (un instant), `DateTimePicker` regroupe les deux dans un seul popover et garantit la cohérence (changer la date n\'efface pas l\'heure). Réserver `DatePicker` + `TimePicker` séparés aux cas où date et heure sont des champs distincts (ex. créneau : date de début / heure de début).',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { DateTimePicker } from "@/components/ui/date-time-picker"\nimport { parseLocalDateTime, formatLocalDateTime } from "@/lib/datetime"',
    },
    {
      label: 'Date d\'ouverture des inscriptions (EventForm)',
      code: `<DateTimePicker
  id="opensAt"
  value={parseLocalDateTime(formData.opensAt)}
  onChange={(d) => handleChange('opensAt', formatLocalDateTime(d) || null)}
  minDate={new Date()}
  disabled={!isScheduled}
  aria-label="Date et heure d'ouverture des inscriptions"
/>`,
    },
  ],
}
