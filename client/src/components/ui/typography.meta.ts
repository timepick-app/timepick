import type { ComponentMeta } from './_meta/types'

export const typographyMeta: ComponentMeta = {
  name: 'Typography',
  importPath: '@/components/ui/typography',
  summary:
    "Composant de typographie fluide. 10 variantes (h1-h6 + 4 corps), 3 couleurs, 4 graisses. Basé sur clamp() pour adaptation automatique entre 640px et 1536px de viewport.",
  variants: [
    {
      name: 'h1',
      description: 'Titre principal de page',
      whenToUse: "Titre unique d'une page entière (titre AdminLayout via pageTitle, \"Design System\"). Une seule occurrence par page — si tu en as besoin d'un second titre fort, descends à h2 plutôt que de répéter h1.",
      cssHint: '36px → 48px (--font-size-h1, bold 700)',
    },
    {
      name: 'h2',
      description: 'Titre de section',
      whenToUse: "Titre d'une section majeure dans une page déjà coiffée par un h1 (\"Statistiques\" sur le dashboard Admin, en-tête d'un panneau de paramètres). Préférer h2 plutôt que h1 dès qu'il y a déjà un titre de page au-dessus, pour préserver la hiérarchie sémantique et SEO.",
      cssHint: '24px → 30px (--font-size-h2, semibold 600)',
    },
    {
      name: 'h3',
      description: 'Sous-titre',
      whenToUse: "Titre d'une sous-section ou d'une carte (\"Créneaux\" dans SlotCalendar, \"Statistiques de l'événement\" dans EventFormPage, en-tête d'une liste d'utilisateurs). Souvent rendu avec `as=\"h2\"` quand la page n'a pas encore de h1 explicite — utiliser le `as` prop pour aligner la sémantique HTML.",
      cssHint: '20px → 24px (--font-size-h3)',
    },
    {
      name: 'h4',
      description: 'Titre tertiaire',
      whenToUse: "Titre d'un bloc imbriqué à l'intérieur d'une carte ou d'un panneau (en-tête d'un placeholder de sous-onglet email, titre d'un sous-formulaire). Utiliser h4 plutôt que h3 quand le contenu vit déjà à l'intérieur d'une section coiffée d'un h3.",
      cssHint: '18px → 20px (--font-size-h4)',
    },
    {
      name: 'h5',
      description: 'Petit titre',
      whenToUse: "Étiquette de bloc qui ne mérite pas un vrai titre de section mais doit ressortir typographiquement (groupe de champs dans un long formulaire, sous-rubrique d'un panneau de paramètres). Préférer h5 à h4 quand le bloc est court (1-2 lignes de contenu) et qu'un h4 paraîtrait trop massif.",
      cssHint: '16px → 18px (--font-size-h5)',
    },
    {
      name: 'h6',
      description: 'Titre minimal',
      whenToUse: "Mini-titre de cellule de documentation ou de carte d'exemple (libellés \"Import\", \"Variantes\", \"Avec icone\" sur la page Design System). Préférer h6 à h5 pour des étiquettes très courtes au-dessus d'un snippet de code ou d'un mini-aperçu.",
      cssHint: '14px → 16px (--font-size-h6)',
    },
    {
      name: 'body-lg',
      description: 'Corps de texte large',
      whenToUse: "Paragraphe d'introduction qui doit attirer le regard sans être un titre (chapeau d'une page publique d'événement, démonstration d'une couleur sur la page Design System). Préférer body-lg à h3 quand il s'agit de prose et non d'un titre, pour ne pas casser la hiérarchie de headings.",
      cssHint: '18px → 20px (--font-size-body-lg)',
    },
    {
      name: 'body',
      description: 'Corps de texte standard (par défaut)',
      whenToUse: "Paragraphe courant et message d'état lisible (\"Connexion en cours…\", description d'un wizard, contenu principal d'une carte). Choix par défaut — ne descends à body-sm que si l'espace est contraint ou si le texte est clairement secondaire.",
      cssHint: '16px fixe (--font-size-body)',
    },
    {
      name: 'body-sm',
      description: 'Corps de texte petit',
      whenToUse: "Texte secondaire à proximité d'un élément principal (description sous un titre de variante dans le Design System, légende d'un sous-onglet email, helper text sous un champ). Préférer body-sm à body quand le texte accompagne un élément sans devoir rivaliser avec lui visuellement.",
      cssHint: '14px fixe (--font-size-body-sm)',
    },
    {
      name: 'body-xs',
      description: 'Corps de texte minimal',
      whenToUse: "Métadonnée discrète, légende sous un exemple ou timestamp (\"default + icone\" sur la page Design System, horodatage de booking, mention RGPD). Préférer body-xs à body-sm quand l'information est purement contextuelle et ne doit pas concurrencer le contenu adjacent — réserver à des textes très courts.",
      cssHint: '12px fixe (--font-size-body-xs)',
    },
  ],
  sizes: [],
  guidelines: [
    {
      rule: "Toujours utiliser le composant Typography, jamais d'inline styles ou éléments HTML bruts pour le texte courant",
      correct: '<Typography variant="h1">Titre</Typography>',
      wrong: '<h1 style={{ fontSize: "48px" }}>Titre</h1>',
    },
  ],
  antiPatterns: [
    {
      title: 'Wrong clamp() formula',
      description:
        "Utiliser des multiplicateurs vw trop petits (ex: 0.1256vw au lieu de 2.0089vw). Le multiplicateur vw doit être entre 0.1 et 3 pour notre plage de viewport.",
    },
    {
      title: 'Missing utils.ts update',
      description:
        "Oublier d'ajouter les nouvelles classes font-size à customTwMerge dans utils.ts cause des conflits text-h1 / text-foreground (mauvais merge de classes).",
    },
    {
      title: 'Hardcoded pixel values',
      description:
        "Utiliser des inline styles avec des valeurs px au lieu du composant Typography ou des classes Tailwind dédiées.",
    },
    {
      title: 'Incomplete 5-file update',
      description:
        "Pour ajouter une nouvelle font-size, mettre à jour les 5 fichiers : index.css, tailwind.config.js, typography.tsx, utils.ts, DesignSystem.tsx.",
    },
  ],
  examples: [
    { label: 'Import', code: 'import { Typography } from "@/components/ui/typography"' },
    { label: 'Variante simple', code: '<Typography variant="h1">Titre principal</Typography>' },
    { label: 'Avec couleur', code: '<Typography variant="body" color="muted">Texte secondaire</Typography>' },
    { label: 'Override de poids', code: '<Typography variant="h1" weight="normal">Titre allégé</Typography>' },
    { label: 'Élément sémantique différent', code: '<Typography variant="h1" as="h2">Style h1, sémantique h2</Typography>' },
  ],
  extraAxes: [
    {
      name: 'color',
      description: 'Variantes de couleur disponibles',
      items: [
        {
          name: 'default',
          description: 'Texte principal (foreground)',
          whenToUse: "Choix par défaut pour tout contenu lisible primaire (titres, paragraphes courants, libellés de formulaire). Ne pas spécifier color=\"default\" explicitement quand c'est déjà le défaut — réserver l'override aux cas où tu veux annuler une couleur héritée d'un parent.",
        },
        {
          name: 'muted',
          description: 'Texte secondaire atténué',
          whenToUse: "Information secondaire qui doit rester lisible sans détourner l'attention (description sous un titre, message \"Connexion en cours…\", helper text, légende sous un exemple). Préférer muted à default dès que le texte est subordonné à un élément voisin — ne pas utiliser muted pour signaler une erreur ou une indisponibilité, c'est le rôle de destructive.",
        },
        {
          name: 'destructive',
          description: "Texte d'erreur ou d'avertissement",
          whenToUse: "Message d'erreur ou d'avertissement réel à proximité immédiate de la cause (validation de formulaire en échec, slot indisponible, échec de chargement). Réserver aux erreurs effectives — ne pas l'utiliser pour mettre en avant un texte simplement important, c'est le rôle de weight=\"semibold\" ou d'une variante plus haute.",
        },
      ],
    },
    {
      name: 'weight',
      description: 'Graisses de police (override possible)',
      items: [
        {
          name: 'normal',
          description: 'Régulier (400) — défaut pour les corps de texte',
          whenToUse: "Graisse par défaut pour body / body-sm / body-xs et pour alléger un titre quand l'écran reste calme (ex: `<Typography variant=\"h1\" weight=\"normal\">` sur une page d'accueil minimaliste). Ne pas l'utiliser comme override sur un h1-h2 contenu dans un dashboard chargé — l'allégement nuit à la hiérarchie.",
        },
        {
          name: 'medium',
          description: 'Medium (500) — défaut pour h5-h6',
          whenToUse: "Emphase douce pour un libellé de formulaire, un en-tête de colonne de tableau, ou un mini-titre dans une liste. Préférer medium à semibold quand l'élément doit ressortir sans dominer ses voisins — typique des libellés de Label adjacents à des Inputs.",
        },
        {
          name: 'semibold',
          description: 'Semi-bold (600) — défaut pour h3-h4',
          whenToUse: "Emphase franche pour un titre de carte, un libellé d'élément actif dans une liste (utilisateur sélectionné, slot mis en avant) ou pour renforcer un texte body qui doit être scanné rapidement. Préférer semibold à medium quand l'élément doit clairement attirer l'œil dans un contexte concurrentiel (multiples cartes, longue liste).",
        },
        {
          name: 'bold',
          description: 'Bold (700)',
          whenToUse: "Emphase forte sur un titre de section (h2) quand on veut dépasser le semibold, ou override explicite sur un h1 quand l'extrabold est trop lourd (ex: titre dans un contexte dense). À utiliser en override conscient — le défaut h2 est désormais semibold.",
        },
        {
          name: 'extrabold',
          description: 'Extra-bold (800) — défaut pour h1',
          whenToUse: "Réservé au titre principal de page (h1). Requiert la police Inter Variable pour être visuellement distinct du bold 700 — avec la pile system-ui, les deux poids peuvent se confondre. Ne pas appliquer sur du body ni sur des titres secondaires (h2+).",
        },
      ],
    },
  ],
}
