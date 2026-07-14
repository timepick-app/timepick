import type { ComponentMeta } from './_meta/types'

export const datePickerMeta: ComponentMeta = {
  name: 'DatePicker',
  importPath: '@/components/ui/date-picker',
  summary:
    'Sélecteur de date (modèle shadcn-admin) : `Button` outline + `Popover` + `Calendar` (react-day-picker v9). Contrôlé via `value: Date | null` + `onChange(date)`. Le déclencheur affiche la date formatée en français (`d MMMM yyyy`, locale fr) ou le `placeholder`. Bornes via `minDate`/`maxDate` (jours hors plage désactivés dans la grille). `captionLayout="dropdown"` active les sélecteurs mois/année. Remplace les `<input type="date">` natifs (cohérence visuelle, focus shadcn, navigation mois/année, locale fr). Pour une date + heure, utiliser `DateTimePicker` ; pour une heure seule, `TimePicker`.',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Composant CONTRÔLÉ : fournir `value` (`Date | null`) ET `onChange`. Convertir depuis/vers les chaînes de formulaire via les helpers `@/lib/datetime` (`parseLocalDate` / `formatLocalDate`)',
      correct:
        '<DatePicker value={parseLocalDate(form.date)} onChange={(d) => setForm({ ...form, date: formatLocalDate(d) })} />',
      wrong:
        '<DatePicker value={form.date} onChange={...} /> // form.date est une string : type incorrect, pas de rendu',
    },
    {
      rule: 'Pour contraindre la plage (ex. date de fin >= date de début, ouverture future), passer `minDate`/`maxDate` plutôt que de valider après coup',
      correct: '<DatePicker value={endDate} onChange={setEndDate} minDate={startDate ?? undefined} />',
      wrong: '<DatePicker value={endDate} onChange={setEndDate} /> // l\'utilisateur peut choisir une fin avant le début',
    },
    {
      rule: 'Associer un `<Label htmlFor="x">` au déclencheur via `id="x"` (a11y, comme un champ de formulaire)',
      correct: '<Label htmlFor="open-date">Date</Label>\n<DatePicker id="open-date" value={d} onChange={setD} />',
      wrong: '<span>Date</span>\n<DatePicker value={d} onChange={setD} /> // déclencheur orphelin pour les lecteurs d\'écran',
    },
  ],
  antiPatterns: [
    {
      title: 'Conserver un `<input type="date">` natif',
      description:
        'Un `<input type="date">` natif rend une UI dépendante du navigateur/OS, n\'expose pas le focus ring shadcn et offre une navigation mois/année pauvre. Utiliser `DatePicker` pour une date, `DateTimePicker` pour une date+heure.',
    },
    {
      title: 'Reconstruire un Popover + Calendar à la main',
      description:
        'Réassembler `Popover` + `Calendar` + `Button` dans une feature duplique la logique de formatage/ouverture/sélection et désynchronise le rendu si le DS évolue. Importer `DatePicker`.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { DatePicker } from "@/components/ui/date-picker"\nimport { parseLocalDate, formatLocalDate } from "@/lib/datetime"',
    },
    {
      label: 'Date de début/fin avec borne (SlotEditDialog)',
      code: `<div className="space-y-2">
  <Label htmlFor="edit-end-date">Date de fin *</Label>
  <DatePicker
    id="edit-end-date"
    value={parseLocalDate(endDate)}
    onChange={(d) => setEndDate(formatLocalDate(d))}
    minDate={parseLocalDate(date) ?? undefined}
    aria-invalid={endBeforeStart || undefined}
  />
</div>`,
    },
  ],
}
