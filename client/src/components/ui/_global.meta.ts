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
      heading: "Canal d'un message d'erreur",
      body: [
        "**R7 — Le canal se choisit sur la DURÉE DE VIE de la condition, pas sur sa gravité.** Trois supports, non interchangeables : texte inline sous le champ (exception E1 ci-dessus), `<Banner variant=\"destructive\">`, `toast.error` (sonner). Deux questions tranchent, dans cet ordre — la première prime :",
        '',
        "1. **Le message désigne-t-il un champ précis de l'écran ?** Si oui → inline sous ce champ, TOUJOURS, quelle que soit l'origine de l'erreur (locale ou serveur). Une erreur serveur rattachable à un champ n'est pas une bannière : l'utilisateur doit voir quoi corriger, pas où chercher.",
        "2. Sinon, **la condition persiste-t-elle à l'écran tant qu'elle n'est pas levée ?** Si oui → bannière, placée près de sa cause, lisible pendant que l'utilisateur corrige. Si non (action ponctuelle rejouable telle quelle) → toast.",
        '',
        "**R8 — Un seul canal par échec.** Jamais un toast ET une bannière pour la même cause : l'utilisateur croit à deux problèmes distincts.",
        '',
        "**R9 — Annonce accessible, selon le canal.** `<Banner>` pose `role=\"alert\"` par défaut : ne pas le redéclarer, et **ne jamais lui ajouter `aria-live=\"polite\"`** — `role=\"alert\"` implique déjà `aria-live=\"assertive\"`, les deux sur le même nœud se contredisent. Le texte inline E1 exige `role=\"alert\"` explicitement, et n'est utile que s'il est rattaché au champ (`aria-describedby` côté champ + `id` côté message) — un `role=\"alert\"` seul est annoncé une fois puis perdu dès que l'utilisateur revient sur le champ. Le toast est déjà annoncé par sonner : ne rien ajouter.",
      ].join('\n'),
      examples: [
        {
          label: 'Champ invalide — inline, rattaché au champ (E1)',
          code: '<Input id="admin-email" aria-invalid={!!error} aria-describedby={error ? "admin-email-error" : undefined} />\n{error && <p id="admin-email-error" className="text-xs text-destructive" role="alert">{error}</p>}',
        },
        {
          label: 'Chargement échoué — bannière persistante',
          code: '<Banner variant="destructive">\n  <BannerDescription>Erreur de chargement de la configuration. Veuillez réessayer.</BannerDescription>\n</Banner>',
        },
        {
          label: 'Action ponctuelle échouée — toast',
          code: "toast.error(\"Échec de la suppression du créneau\")",
        },
        {
          label: 'Incorrect — bannière pour un résultat éphémère',
          code: '<Banner variant="destructive">\n  <BannerDescription>Créneau supprimé</BannerDescription>\n</Banner>',
        },
      ],
    },
    {
      heading: "État de l'action pendant qu'un formulaire est invalide",
      body: [
        "**R10 — L'action est désactivée, pas seulement commentée.** L'action primaire d'un formulaire porte `disabled` tant qu'une condition de validité **connue au rendu** n'est pas satisfaite. Valider au clic une condition déjà calculable avant le clic est non conforme : le bouton promet une action qu'il refusera. La règle porte sur les conditions connues, pas sur la complétude — un formulaire dont tout est facultatif (étape sautable, filtre vide) n'a aucune condition, donc rien à désactiver.",
        '',
        "**R10 bis — Hors périmètre : indisponibilité opérationnelle.** Une action désactivée parce qu'une requête est en cours (`isPending`, `isSaving`, chargement initial des données du formulaire) n'est pas soumise à R10–R11 : le libellé du bouton porte déjà l'information transitoire (« Enregistrement… », « Chargement… ») et la condition se résout d'elle-même, sans action de l'utilisateur, dès que la requête répond — ce n'est pas une condition de validité. R10 ne se contourne pas pour autant en omettant de calculer une condition par ailleurs connue : si l'échec d'un clic déclencherait un message R7 pour une condition déjà vraie avant ce clic, cette condition était connue au rendu et devait déjà porter `disabled`. Ce qui n'est légitimement tranché qu'après l'appel (refus serveur, conflit, quota) reste hors R10 et peut se valider au clic — cf. Button, anti-pattern « Valider au clic une condition calculable au rendu ».",
        '',
        "**R11 — Un blocage se justifie toujours, et le motif précède l'action.** Un contrôle bloqué affiche son motif — texte `text-xs text-muted-foreground` (R5) porteur d'un `id` — **placé avant lui dans l'ordre du DOM**, et le lui rattache par `aria-describedby`. L'ordre n'est pas cosmétique : `disabled` retire le contrôle du parcours de tabulation, donc personne n'atteint le bouton au clavier et sa description n'est jamais annoncée à ce moment-là. Ce qui porte l'information est le texte rencontré en lecture linéaire juste avant l'action ; `aria-describedby` l'expose en plus comme description du bouton dans l'arbre d'accessibilité (vérifié : `button \"Continuer\" description=\"…\" disabled`), mais ne doit jamais en être le seul véhicule. Quand le motif ne peut pas être posé à côté de l'action (barre d'outils dense, action icône-seule), utiliser `aria-disabled=\"true\"` en gardant le contrôle focusable et en refusant l'activation : la description redevient atteignable au focus. Corollaire de conception : un motif qui ne fait que constater le blocage sans nommer la condition précise à satisfaire (« Formulaire incomplet », « Continuer indisponible ») n'est pas conforme, même s'il tient en une phrase — R11 exige un motif actionnable, pas seulement bref. À l'inverse, une condition dont les causes sont multiples et distinctes (ex. erreurs ligne par ligne d'un import) reste légitime : le motif rattaché par `aria-describedby` peut résumer (« N lignes en erreur, voir le détail ci-dessous ») sans dupliquer chaque cause, à condition que le détail complet reste affiché et lisible avant l'action.",
        '',
        "**Conteneurs de footer.** `DialogFooter`, `AlertDialogFooter` et `SheetFooter` basculent en `flex-col-reverse` sous `sm` (R4) : un enfant placé avant le bouton dans l'ordre du DOM mais À L'INTÉRIEUR de l'un de ces conteneurs s'affiche pourtant APRÈS lui en mobile — l'inversion visuelle que R11 cherche justement à éviter. Le motif n'est donc jamais un enfant du conteneur d'actions : c'est un frère qui le précède intégralement, hors du `flex-col-reverse`, quelle que soit la disposition interne du conteneur (R1, D4…).",
        '',
        "**Priorité sur E1.** Quand le motif R11 reprend ou dérive d'un message déjà couvert par E1 (erreur de champ affichée par ailleurs), R11 prime pour CET affichage précis : le motif qui justifie le blocage du bouton reste en `text-muted-foreground` (R5), même si le même contenu apparaît en `text-destructive` sous le champ fautif via E1. Ce ne sont pas deux rendus concurrents du même message, mais deux messages à portée différente — l'un décrit le champ, l'autre explique le bouton — qui peuvent légitimement coexister à l'écran avec des styles différents.",
        '',
        "**R12 — Quand révéler.** Deux portées, deux politiques — ne jamais appliquer celle du champ au motif global :",
        '',
        "- **R12a (par champ).** Un motif rattaché à un champ précis n'apparaît que sur les champs déjà touchés : un formulaire vierge ne rougit pas.",
        "- **R12b (global).** Le motif qui justifie le blocage du bouton lui-même s'affiche dès qu'il existe, y compris sur un formulaire vierge et même si aucun champ n'a encore été touché. Conditionner son affichage à `touched` est une violation de R12b déguisée en application de R12a : un bouton grisé sans explication au premier rendu reste non conforme, quelle qu'en soit la justification invoquée.",
        '',
        "**Dérogation R11 — Repos, pas blocage.** Une expression `disabled` est une disjonction de causes, et chaque cause se juge séparément : c'est la cause ACTIVE qui doit être motivée, jamais l'expression entière. Trois régimes. Une indisponibilité opérationnelle ne se motive pas (R10 bis — le libellé du bouton porte déjà l'information). L'absence de modification depuis le dernier état persisté (`!isDirty`/`!hasUnsavedChanges`) ne se motive pas non plus : l'état inchangé des champs en est la preuve visible, « rien à faire » n'est pas « quelque chose à corriger », et R10 ne l'exige pas davantage — c'est une garde d'idempotence, pas une condition de validité. Toute invalidité de contenu, elle, reste pleinement soumise à R11 — motif affiché et rattaché, nommant CETTE cause — y compris mélangée aux deux autres dans la même expression : `disabled={!!error || isPending || !isDirty}` est conforme si et seulement si `error` porte son motif. Ce découpage par cause est ce qui rend le bouton lisible : grisé SANS motif se lit « rien à faire, ou en cours », grisé AVEC motif se lit « une erreur nommée », et l'utilisateur n'a jamais à deviner lequel des deux. Un motif qui fusionnerait les causes (« Formulaire non enregistrable ») les rendrait au contraire indistinguables et retomberait sous le corollaire de R11.",
        '',
        "Articulation avec R7 : **R7 dit où va le message, R10–R12 disent ce que devient l'action pendant ce temps.** Les deux se lisent ensemble — un message inline parfaitement conforme à R7 posé à côté d'un bouton resté actif reste non conforme.",
      ].join('\n'),
      examples: [
        {
          label: 'Action bloquée, motif affiché et rattaché (R10 + R11)',
          code: '<p id="submit-reason" className="text-xs text-muted-foreground">Testez la connexion pour continuer.</p>\n<Button type="submit" disabled={reason !== null} aria-describedby={reason ? "submit-reason" : undefined}>\n  Continuer\n</Button>',
        },
        {
          label: 'Motifs par champ révélés au fil de la saisie (R12a)',
          code: 'const visibleErrors = Object.fromEntries(\n  Object.entries(errors).filter(([field]) => touched[field]),\n)',
        },
        {
          label: 'Motif global jamais conditionné à `touched` (R12b)',
          code: '// Le motif du bouton s\'affiche dès qu\'il existe, formulaire vierge compris.\nconst reason = firstError ?? (isProven ? null : \'Testez la connexion pour continuer.\')',
        },
        {
          label: 'Incorrect — condition calculable au rendu, validée au clic',
          code: '<Button type="submit" onClick={() => {\n  if (!firstName.trim()) { setError(\'Le prénom est requis\'); return }\n  submit()\n}}>Devenir administrateur</Button>',
        },
        {
          label: 'Incorrect — bouton grisé sans motif affiché ni rattaché',
          code: '<Button type="submit" disabled={!isValid}>Enregistrer</Button>',
        },
        {
          label: 'Incorrect — motif constatant le blocage sans nommer la condition (R11)',
          code: '<p id="r">Formulaire incomplet.</p>\n<Button disabled aria-describedby="r">Enregistrer</Button>',
        },
        {
          label: 'Incorrect — motif enfant du footer, donc sous le bouton en mobile (R4)',
          code: '<DialogFooter>\n  <p id="r" className="text-xs text-muted-foreground">Renseignez un nom.</p>\n  <Button disabled aria-describedby="r">Enregistrer</Button>\n</DialogFooter>',
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
