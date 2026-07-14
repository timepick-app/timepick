import type { GlobalConventions } from './_meta/types'

export const globalConventions: GlobalConventions = {
  title: 'Conventions transverses',
  intro:
    "Règles applicables à TOUS les composants. En cas de doute, elles priment sur les exemples des fiches individuelles.",
  sections: [
    {
      heading: 'Alignement des groupes de boutons & position du CTA',
      body: [
        "**R1 — Alignement.** Toute barre d'actions — **une seule action comme plusieurs** (footer `Dialog`/`Sheet`/`Card`/`AlertDialog`, barre d'actions de page/section/formulaire) — s'aligne à DROITE : `flex flex-wrap justify-end gap-2` ; les boutons s'étirent sur mobile (`max-sm:[&>button]:flex-1`). Le blanc reste à gauche. **Un CTA solitaire ne fait pas exception : sa position par défaut est à droite**, sauf dérogation D1 (contexte étroit → `w-full`) ou D2 (état vide/onboarding → `justify-center`).",
        '',
        "**R2 — Position du CTA.** Le CTA principal (variant rempli `default`/`destructive`) est toujours le **dernier enfant DOM** → position la plus à droite en lecture LTR. Les actions secondaires (`outline`/`ghost`/`link`, Annuler, Réinitialiser, bascules) le précèdent, par priorité croissante.",
        '',
        "**R3 — Hiérarchie (triptyque).** La priorité s'encode par trois signaux conjoints : variant rempli vs outline, position à droite, et hauteur **uniforme h-9**. Jamais via la taille (`size=\"sm\"` interdit sur un bouton de footer apparié).",
        '',
        "**R4 — Mobile.** Les footers passent en `flex-col-reverse sm:flex-row sm:justify-end` (le primaire remonte en tête de pile) et les boutons s'étirent (`max-sm:[&>button]:flex-1`). L'ordre DOM (et donc le focus) reste inchangé.",
      ].join('\n'),
      examples: [
        {
          label: 'Footer conforme (secondaire → primaire en dernier)',
          code: '<DialogFooter>\n  <Button variant="outline" onClick={onClose}>Annuler</Button>\n  <Button type="submit">Enregistrer</Button>\n</DialogFooter>',
        },
        {
          label: 'CardFooter (pas de justify-end par défaut — le rendre explicite)',
          code: '<CardFooter className="justify-end gap-2">\n  <Button variant="outline">Annuler</Button>\n  <Button>Enregistrer</Button>\n</CardFooter>',
        },
      ],
    },
    {
      heading: 'Dérogations (liste fermée)',
      body: [
        "Seuls ces cas échappent à l'alignement à droite + CTA en dernier. Tout autre écart est non-conforme.",
        '',
        "- **D1 — Action unique en contexte étroit** (popover, carte étroite, formulaire d'authentification) : `w-full`.",
        '- **D2 — Action unique en état vide / onboarding** : `justify-center`.',
        "- **D3 — Destructif + constructif dans le même groupe** : ancrer le destructif à gauche via `mr-auto` (ou `justify-between`), le groupe constructif à droite. Ne jamais coller le destructif au CTA.",
        "- **D4 — Navigation wizard** : `justify-between` (Précédent à gauche / Suivant-Terminer à droite).",
        '- **D5 — En-tête de page** (titre/stats + CTA) : outer `justify-between` (titre/stats à gauche, groupe de boutons à droite) ; le groupe de boutons interne suit R1 (`flex flex-wrap justify-end gap-2` + `max-sm:[&>button]:flex-1`).',
        "- **D6 — Toolbar et actions inline de ligne de table** : hors règle (layout fonctionnel ; `size=\"sm\"`/`icon-sm` ; bouton de fermeture `X` et menu kebab à l'extrême droite par convention).",
      ].join('\n'),
      examples: [
        {
          label: 'D3 — action destructive isolée à gauche',
          code: '<div className="flex justify-end gap-2">\n  <Button variant="outline-destructive" className="mr-auto">Supprimer</Button>\n  <Button variant="outline">Annuler</Button>\n  <Button type="submit">Enregistrer</Button>\n</div>',
        },
        {
          label: 'D5 — En-tête de page (outer justify-between + inner R1)',
          code: '<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">\n  <div>{/* titre, badge, stats */}</div>\n  <div className="flex flex-wrap justify-end gap-2 max-sm:[&>button]:flex-1">\n    <Button variant="outline">Export CSV</Button>\n    <Button>Nouveau membre</Button>\n  </div>\n</div>',
        },
      ],
    },
    {
      heading: 'Textes d\'aide sous les champs de formulaire',
      body: [
        "**R5 — Couleur uniforme.** Tout texte d'aide attaché à un champ (compteur de caractères, instruction contextuelle, avertissement non-bloquant) utilise `text-xs text-muted-foreground`. Pas de couleur sémantique (amber, red…) sur ces textes, quelle que soit la condition qui les affiche.",
        '',
        "**Exception (liste fermée) — E1.** Un texte sous champ peut adopter `text-xs text-destructive` + `role=\"alert\"` uniquement s'il signale une **erreur de validation bloquante** (format invalide, contrainte violée empêchant la soumission). Les avertissements non-bloquants, les compteurs et les états informatifs restent en `text-muted-foreground`.",
      ].join('\n'),
      examples: [
        {
          label: 'Aide neutre (toujours visible)',
          code: '<p className="text-xs text-muted-foreground">100/500 caractères</p>',
        },
        {
          label: 'Avertissement non-bloquant sous champ',
          code: '<p className="text-xs text-muted-foreground">Aucun invité sélectionné pour cet événement</p>',
        },
        {
          label: 'Erreur de validation bloquante (E1)',
          code: '<p className="text-xs text-destructive" role="alert">Format de téléphone invalide</p>',
        },
      ],
    },
    {
      heading: 'Contenu des labels de champ',
      body: [
        "**R6 — Texte pur.** Le contenu d'un `<Label>` est du texte pur. Pas d'emoji, pas de `<span>` décoratif, pas d'image. Si une icône apporte une réelle valeur sémantique (différencier visuellement deux champs de même nature dans un même bloc), utiliser un composant Lucide `aria-hidden=\"true\"` avec `className=\"h-4 w-4\"` directement comme enfant du `<Label>`, avec `className=\"flex items-center gap-2\"` sur le label.",
      ].join('\n'),
      examples: [
        {
          label: 'Label textuel — cas général',
          code: '<Label htmlFor="user-ttl">Connexion Membre</Label>',
        },
        {
          label: 'Label avec icône Lucide — si différenciation sémantique nécessaire',
          code: '<Label htmlFor="user-ttl" className="flex items-center gap-2">\n  <User className="h-4 w-4" aria-hidden="true" />\n  Connexion Membre\n</Label>',
        },
        {
          label: 'Incorrect — emoji dans un span décoratif',
          code: '<Label htmlFor="user-ttl">\n  <span className="flex items-center gap-2">\n    <span className="text-base">👤</span>\n    <span>Connexion Membre</span>\n  </span>\n</Label>',
        },
      ],
    },
  ],
}
