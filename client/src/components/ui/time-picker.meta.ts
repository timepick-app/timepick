import type { ComponentMeta } from './_meta/types'

export const timePickerMeta: ComponentMeta = {
  name: 'TimePicker',
  importPath: '@/components/ui/time-picker',
  summary:
    "Sélecteur d'heure DS : `Button` outline + `Popover` contenant deux COLONNES défilantes (heures 00-23 / minutes 00-59) de boutons stylés DS (jetons shadcn, focus ring). Reproduit l'UX « molette » d'un sélecteur d'heure, mais en vrai composant DS sans déléguer l'UI au navigateur (un `<input type=\"time\">` aurait rendu le sélecteur natif de l'OS). Contrôlé via `value` (chaîne `HH:mm`) + `onChange(value)`. Le tier compact `size=\"sm\"` (h-8) aligne le déclencheur sur une barre d'outils dense. Les colonnes sont exposées via `TimeColumns` (sans popover), intégrées inline par `DateTimePicker` sous le calendrier.",
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: "Contrôlé via `value` (chaîne `HH:mm`) + `onChange(value)` — l'`onChange` renvoie directement la chaîne (pas un événement)",
      correct: '<TimePicker value={startTime} onChange={setStartTime} aria-label="Heure de début" />',
      wrong: '<TimePicker value={startTime} onChange={(e) => setStartTime(e.target.value)} /> // onChange reçoit déjà la chaîne',
    },
    {
      rule: "Fournir un `aria-label` décrivant le champ (porté par le déclencheur) ; le déclencheur affiche la valeur ou le `placeholder` (par défaut « Choisir une heure », cohérent avec DatePicker/DateTimePicker)",
      correct: '<TimePicker value={t} onChange={setT} aria-label="Heure de fin" />',
      wrong: '<TimePicker value={t} onChange={setT} /> // déclencheur sans nom accessible',
    },
  ],
  antiPatterns: [
    {
      title: 'Utiliser un `<input type="time">` natif',
      description:
        "Un `<input type=\"time\">` délègue son sélecteur au navigateur/OS (colonnes natives non stylées), ce qui casse l'alignement DS. Utiliser `TimePicker` (popover à colonnes défilantes stylées DS).",
    },
    {
      title: 'Reconstruire le popover + colonnes à la main',
      description:
        "Réassembler `Popover` + colonnes défilantes dans une feature duplique la logique de sélection/scroll. Importer `TimePicker`, ou `TimeColumns` pour un usage inline (ex. dans un autre popover).",
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { TimePicker } from "@/components/ui/time-picker"',
    },
    {
      label: 'Heure de créneau (SlotEditDialog)',
      code: `<div className="space-y-2">
  <Label htmlFor="edit-startTime">Heure de début *</Label>
  <TimePicker id="edit-startTime" value={startTime} onChange={setStartTime} required aria-label="Heure de début" />
</div>`,
    },
  ],
}
