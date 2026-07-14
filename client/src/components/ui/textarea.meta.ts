import type { ComponentMeta } from './_meta/types'

export const textareaMeta: ComponentMeta = {
  name: 'Textarea',
  importPath: '@/components/ui/textarea',
  summary:
    "Champ de saisie multi-lignes basé sur un wrapper `forwardRef` minimaliste autour d'un `<textarea>` natif. Aucune variante cva : le style (hauteur min `min-h-[80px]`, bordure `border-input`, focus ring) est fixé par les classes `cn()` internes. Forward toutes les props natives `<textarea>` (`value`, `onChange`, `rows`, `maxLength`, `placeholder`, `disabled`, `id`, `aria-*`, etc.). À utiliser pour les contenus longs : description d'événement, template d'invitation, message de notification — partout où `<Input>` (mono-ligne) est insuffisant.",
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: "Toujours associer un `<Label htmlFor=\"...\">` à chaque `<Textarea id=\"...\">` (a11y, click-to-focus, lecteurs d'écran)",
      correct:
        '<Label htmlFor="event-description">Description</Label>\n<Textarea id="event-description" value={...} onChange={...} />',
      wrong:
        '<span className="text-sm font-medium">Description</span>\n<Textarea value={...} onChange={...} />',
    },
    {
      rule: "Ajuster `rows` (ou `className=\"min-h-[N]\"`) selon le volume de contenu attendu — ne pas se contenter du `min-h-[80px]` par défaut pour un template long",
      correct:
        '<Textarea id="invitation-template" rows={10} value={template} onChange={...} />',
      wrong:
        '<Textarea id="invitation-template" value={veryLongTemplate} onChange={...} /> // 80px : 2-3 lignes visibles',
    },
    {
      rule: "Pour un champ contrôlé, fournir simultanément `value` et `onChange` (sinon React émet un warning et le textarea devient en lecture seule)",
      correct:
        '<Textarea id="event-description" value={formData.description} onChange={(e) => handleFieldChange(\'description\', e.target.value)} />',
      wrong:
        '<Textarea id="event-description" value={formData.description} /> // pas de onChange : textarea figé',
    },
    {
      rule: "Préférer `<Textarea>` à un `<textarea>` natif stylé manuellement, même pour un champ unique hors formulaire",
      correct: '<Textarea placeholder="Vos commentaires..." rows={4} />',
      wrong:
        '<textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-field ..." />',
    },
  ],
  antiPatterns: [
    {
      title: "Recopier les classes Tailwind de `Textarea` dans un `<textarea>` natif",
      description:
        "Reproduire `flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-field ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] ...` à la main désynchronise le rendu si le design system évolue (la prochaine refonte du focus ring ne propagera pas). Toujours importer `<Textarea>` depuis `@/components/ui/textarea`.",
    },
    {
      title: "Utiliser `<Input>` pour un contenu multi-lignes",
      description:
        "`<Input>` est un `<input type=\"text\">` qui tronque visuellement les retours à la ligne et ne permet pas de redimensionner verticalement. Pour toute description, template, ou message libre où l'utilisateur peut écrire plusieurs phrases, basculer sur `<Textarea>` avec un `rows` adapté.",
    },
    {
      title: "Omettre `maxLength` quand le backend impose une limite",
      description:
        "Si la colonne SQL est `VARCHAR(500)` ou si la validation backend rejette > 2000 caractères, ne pas exposer ce contrat côté client = mauvaise UX (saisie acceptée puis erreur opaque à la soumission). Ajouter `maxLength={500}` + idéalement un compteur visible (`{value.length} / 500`) au-dessus ou sous le textarea.",
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Textarea } from "@/components/ui/textarea"\nimport { Label } from "@/components/ui/label"',
    },
    {
      label: "Description d'événement (formulaire admin)",
      code: `<div className="space-y-2">
  <Label htmlFor="event-description">Description</Label>
  <Textarea
    id="event-description"
    rows={4}
    placeholder="Ex: Tournoi annuel ouvert à tous les membres..."
    value={formData.description}
    onChange={(e) => handleFieldChange('description', e.target.value)}
    disabled={isSubmitting}
  />
</div>`,
    },
    {
      label: "Template d'invitation avec compteur de caractères",
      code: `<div className="space-y-2">
  <Label htmlFor="invitation-template">Template du message</Label>
  <Textarea
    id="invitation-template"
    rows={10}
    maxLength={2000}
    value={template}
    onChange={(e) => setTemplate(e.target.value)}
  />
  <p className="text-xs text-muted-foreground text-right">
    {template.length} / 2000 caractères
  </p>
</div>`,
    },
    {
      label: 'Champ commentaire libre (modal de feedback)',
      code: `<Textarea
  placeholder="Vos remarques..."
  rows={3}
  value={comment}
  onChange={(e) => setComment(e.target.value)}
/>`,
    },
  ],
}
