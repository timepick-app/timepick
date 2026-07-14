import type { ComponentMeta } from './_meta/types'

export const calendarMeta: ComponentMeta = {
  name: 'Calendar',
  importPath: '@/components/ui/calendar',
  summary:
    'Primitive BAS NIVEAU : wrapper TimePick autour de `react-day-picker` v9, porté en Tailwind 3 depuis le `calendar.tsx` shadcn/shadcn-admin (qui cible TW4). Locale `fr` + semaine lundi-first par défaut, jetons shadcn (`accent`, `primary`, `muted`, `ring`), focus shadcn, navigation v9 via le composant unique `Chevron` (orientation). Expose toutes les props `DayPicker` (`mode`, `selected`, `onSelect`, `disabled`, `captionLayout`, etc.). En pratique, préférer `DatePicker` / `DateTimePicker` côté features ; n\'utiliser `Calendar` directement que pour un besoin avancé (plages, sélection multiple, jours désactivés complexes).',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Côté features, préférer `DatePicker`/`DateTimePicker` ; utiliser `Calendar` nu seulement pour un mode non couvert (`range`, `multiple`)',
      correct: '<DatePicker value={d} onChange={setD} /> // cas standard date unique',
      wrong: '<Popover><Calendar mode="single" .../></Popover> // reconstruit DatePicker à la main',
    },
    {
      rule: 'Le mode `single` attend `selected: Date | undefined` (pas `null`) : convertir `value ?? undefined`',
      correct: '<Calendar mode="single" selected={value ?? undefined} onSelect={(d) => onChange(d ?? null)} />',
      wrong: '<Calendar mode="single" selected={null} /> // type incorrect en v9',
    },
  ],
  antiPatterns: [
    {
      title: 'Utiliser les anciennes clés `classNames` v8',
      description:
        'react-day-picker v9 a renommé les clés (`table`→`month_grid`, `head_cell`→`weekday`, `day_selected`→`selected`, `nav_button_next`→`button_next`, etc.) et remplacé `IconLeft`/`IconRight` par un unique composant `Chevron` à `orientation`. Toute personnalisation doit cibler les clés v9.',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Calendar } from "@/components/ui/calendar"',
    },
    {
      label: 'Sélection de date simple (préférer DatePicker en pratique)',
      code: `<Calendar
  mode="single"
  selected={value ?? undefined}
  onSelect={(d) => onChange(d ?? null)}
  captionLayout="dropdown"
/>`,
    },
  ],
}
