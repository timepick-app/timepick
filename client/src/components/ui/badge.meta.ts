import type { ComponentMeta } from './_meta/types'

export const badgeMeta: ComponentMeta = {
  name: 'Badge',
  importPath: '@/components/ui/badge',
  summary: 'Indicateur de statut compact. 7 variantes pour couvrir les états (succès, erreur, attention, brouillon, info, neutre, destructif).',
  variants: [
    {
      name: 'default',
      description: 'Statut neutre / générique',
      whenToUse: 'Information factuelle ou état sans charge sémantique (compteur "12 / 30", statut de chargement "Vérification…", "Non configuré"). À utiliser quand l\'état n\'est ni positif, ni négatif, ni alertant — si tu hésites entre default et success, c\'est probablement default.',
    },
    {
      name: 'success',
      description: 'Action réussie / disponible',
      whenToUse: 'État positif acquis ou opérationnel (slot disponible, événement publié, SMTP opérationnel, paiement validé). Réserver success aux résultats et aux disponibilités confirmés — pour un simple compteur neutre, préférer default.',
    },
    {
      name: 'warning',
      description: 'Attention requise / capacité limitée',
      whenToUse: 'État qui requiert l\'attention sans bloquer l\'utilisateur (capacité presque atteinte, configuration incomplète, expiration proche). À placer avant l\'erreur dans la chronologie d\'un problème — ne pas utiliser warning pour un état déjà en échec, c\'est le rôle de error ou destructive.',
    },
    {
      name: 'error',
      description: 'Erreur / complet',
      whenToUse: 'État négatif final qui bloque ou clôt une possibilité (slot complet, échec de validation, quota atteint). Pour signaler la perte d\'un service ou une indisponibilité technique forte (SMTP non joignable, accès révoqué), préférer destructive — error reste sur le terrain métier.',
    },
    {
      name: 'draft',
      description: 'Brouillon / non publié',
      whenToUse: 'Ressource en cours de préparation, non encore visible des utilisateurs finaux (événement brouillon, template non publié). Spécifique au workflow draft/published — ne pas détourner draft pour signaler un état "en attente" générique, utiliser default ou warning selon la gravité.',
    },
    {
      name: 'info',
      description: 'Information contextuelle',
      whenToUse: 'Information neutre à mettre en avant pour faciliter la lecture (étiquette "Nouveau", catégorie, métadonnée). Privilégier info à default quand le badge sert à attirer le regard sur une caractéristique plutôt qu\'à reporter un statut.',
    },
    {
      name: 'destructive',
      description: 'Action destructrice / danger',
      whenToUse: 'État critique signalant une perte de service ou un risque immédiat (SMTP non joignable, aucun code d\'accès configuré, accès révoqué). Préférer destructive à error quand la situation expose un risque sécurité ou opérationnel, et non un simple résultat négatif côté métier.',
    },
  ],
  sizes: [
    { name: 'sm', description: 'Taille par défaut, compacte', cssHint: 'px-2 py-0.5 text-xs' },
    { name: 'md', description: 'Plus grand, pour mise en avant', cssHint: 'px-2.5 py-0.5 text-sm' },
  ],
  extraAxes: [
    {
      name: 'appearance',
      description:
        "Intensité du fond. « soft » (fond clair + bordure) aligne le badge sur la palette du composant Banner — pour les chips de statut peu intrusifs.",
      items: [
        { name: 'solid', description: 'Fond plein (défaut)', whenToUse: 'Indicateur de statut standard (tableaux, en-têtes).' },
        { name: 'soft', description: 'Fond clair + bordure', whenToUse: "Chips de statut contextuels (ex. StatusBanner : ouverture des inscriptions, créneaux complets)." },
      ],
    },
  ],
  guidelines: [
    {
      rule: 'Utiliser le composant Badge pour les indicateurs de statut',
      correct: '<Badge variant="info">Nouveau</Badge>',
      wrong: '<span className="bg-blue-100 text-blue-800 px-2 py-0.5 text-xs rounded-full">Nouveau</span>',
    },
    {
      rule: 'Utiliser les tailles sm/md prédéfinies, pas d\'overrides manuels',
      correct: '<Badge size="sm">Standard</Badge>',
      wrong: '<Badge className="px-3 py-1 text-sm">Custom</Badge>',
    },
    {
      rule: 'Utiliser la prop icon pour les badges avec icônes',
      correct: '<Badge icon={<Icon />}>Avec icône</Badge>',
      wrong: '<Badge><Icon /> Avec icône</Badge>',
    },
  ],
  antiPatterns: [],
  examples: [
    { label: 'Import', code: 'import { Badge } from "@/components/ui/badge"' },
    { label: 'Variante simple', code: '<Badge variant="success">Disponible</Badge>' },
    { label: 'Avec icône', code: '<Badge variant="success" icon={<CheckIcon />}>Disponible</Badge>' },
    { label: 'Taille md', code: '<Badge variant="info" size="md">Grande étiquette</Badge>' },
    { label: 'Chip de statut (soft + point)', code: '<Badge appearance="soft" variant="success" icon={<span className="size-1.5 rounded-full bg-current" />}>Publié</Badge>' },
  ],
}
