import type { ComponentMeta } from './_meta/types'

export const bannerMeta: ComponentMeta = {
  name: 'Banner',
  importPath: '@/components/ui/banner',
  summary:
    "Bannière contextuelle inline. Socle Alert shadcn v4 (grille compacte) + 5 variants sémantiques + axe de densité. Plus compacte que l'ancien Alert v0 : titre 14px (vs 16px) et padding vertical 12px (vs 16px).",
  variants: [
    {
      name: 'default',
      description: 'Information neutre',
      whenToUse:
        "Message factuel sans charge sémantique. Si l'état est positif, alertant ou en échec, préférer success/warning/destructive.",
    },
    {
      name: 'info',
      description: 'Information contextuelle mise en avant',
      whenToUse:
        "Contexte utile à signaler sans urgence (héritage de template, état consultatif, rappel). Bleu — préférer à default quand on veut attirer le regard.",
    },
    {
      name: 'warning',
      description: 'Attention requise sans blocage',
      whenToUse:
        "État dégradé ou risque à venir qui ne bloque pas (service email dégradé, session bientôt expirée, capacité limitée). Ambre.",
    },
    {
      name: 'success',
      description: 'Action réussie / confirmation',
      whenToUse:
        "Feedback positif acquis (lien renvoyé, enregistrement confirmé). Vert. Réserver aux résultats confirmés.",
    },
    {
      name: 'destructive',
      description: 'Erreur / état critique',
      whenToUse:
        "Échec ou perte de service à signaler de façon assertive (erreur de connexion, session expirée, indisponibilité). À coupler avec role=\"alert\" (défaut).",
    },
  ],
  sizes: [],
  extraAxes: [
    {
      name: 'density',
      description: "Compacité verticale de la bannière. Orthogonale au variant de couleur.",
      items: [
        {
          name: 'default',
          description: 'py-3, 14px',
          whenToUse: "Cas général (page login, panneaux, contenus avec de l'espace).",
          cssHint: 'px-4 py-3 text-sm',
        },
        {
          name: 'compact',
          description: 'py-2, 12px',
          whenToUse: "Zones denses où l'on empile plusieurs bannières (dashboard « À traiter », listes admin).",
          cssHint: 'px-3 py-2 text-xs',
        },
      ],
    },
  ],
  guidelines: [
    {
      rule: 'Utiliser Banner plutôt qu\'un <div> coloré fait main',
      correct: '<Banner variant="warning"><Icon /><BannerDescription>Service dégradé</BannerDescription></Banner>',
      wrong: '<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">Service dégradé</div>',
    },
    {
      rule: 'role="alert" (défaut) pour les erreurs, role="status" pour le feedback non-bloquant',
      correct: '<Banner variant="success" role="status">Lien renvoyé</Banner>',
      wrong: '<Banner variant="success">Lien renvoyé</Banner>',
    },
    {
      rule: 'Placer l\'icône en premier enfant (la grille gère son alignement)',
      correct: '<Banner variant="info"><Info /><BannerTitle>…</BannerTitle></Banner>',
      wrong: '<Banner variant="info"><BannerTitle><Info /> …</BannerTitle></Banner>',
    },
  ],
  antiPatterns: [
    {
      title: 'Bannière pour une notification transitoire',
      description: "Pour un feedback éphémère (succès d'action), utiliser un toast (sonner), pas une Banner inline persistante.",
    },
  ],
  examples: [
    { label: 'Import', code: 'import { Banner, BannerTitle, BannerDescription } from "@/components/ui/banner"' },
    { label: 'Avertissement', code: '<Banner variant="warning"><AlertTriangle /><BannerDescription>Service email dégradé.</BannerDescription></Banner>' },
    { label: 'Avec titre', code: '<Banner variant="info"><Info /><BannerTitle>Session bientôt expirée</BannerTitle><BannerDescription>Expire dans 5 min.</BannerDescription></Banner>' },
    { label: 'Densité compacte', code: '<Banner variant="warning" density="compact"><AlertTriangle /><BannerDescription>…</BannerDescription></Banner>' },
  ],
}
