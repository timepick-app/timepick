import type { ComponentMeta } from './_meta/types'

export const bookingsPeaksChartMeta: ComponentMeta = {
  name: 'BookingsPeaksChart',
  importPath: '@/components/admin/dashboard/BookingsPeaksChart',
  summary:
    'Graphe d\'analyse des « pics d\'inscription » d\'un événement (tableau de bord admin). Met en évidence la distribution temporelle des réservations à échelle variable (mois → 10 min), façon CoinMarketCap : zone principale à barres/aire + bandeau navigateur (brush) avec zoom/déplacement par le temps. Consomme des horodatages bruts (BookingTimestamps via useBookingTimestamps) et fait tout le bucketing/échelles côté client (lib/peaks, pur et testé). Briques réutilisables : navigateur temporel à molettes (Pointer Events), infobulle compacte, barres hachurées + contour DS.',
  variants: [],
  sizes: [],
  extraAxes: [
    {
      name: 'Vue (mode de lecture)',
      description:
        'Bascule de lecture des inscriptions, mono-sélection (FilterPills). « Par période » par défaut.',
      items: [
        { name: 'Par période', description: 'Inscriptions par tranche de temps (BarChart hachuré).', whenToUse: 'Repérer QUAND surviennent les pics (lecture par défaut).' },
        { name: 'Total', description: 'Cumul global montant (AreaChart), axe Y plafonné à la capacité totale.', whenToUse: 'Suivre la progression vers le complet (« X / capacité réservations »).' },
      ],
    },
    {
      name: 'Preset (échelle de fenêtre)',
      description:
        'Fenêtre temporelle observée, calée sur le calendrier et positionnée sur le pic. Mono-sélection ; « Auto » par défaut (cadrage initial sur l\'activité).',
      items: [
        { name: 'Auto', description: 'Cadrage automatique sur la période d\'activité (défaut).' },
        { name: 'Tout', description: 'Tout l\'extent : publication (opens_at) → dernier créneau.' },
        { name: 'Mois / Semaine / Jour / Heure', description: 'Fenêtre calendaire centrée sur le pic, granularité adaptée à l\'échelle.' },
      ],
    },
  ],
  guidelines: [
    {
      rule: 'Alimenter avec des horodatages bruts (useBookingTimestamps), pas une série pré-agrégée — le bucketing est client (lib/peaks).',
      correct: '<BookingsPeaksChart data={useBookingTimestamps(eventId).data} />',
      wrong: '<BookingsPeaksChart data={sériePréAgrégéeParJour} />',
    },
    {
      rule: 'Laisser le composant gérer le re-cadrage Auto au changement d\'événement (ancré sur l\'identité) — ne pas forcer un remount.',
      correct: '<BookingsPeaksChart data={raw} />',
      wrong: '<BookingsPeaksChart key={eventId} data={raw} />',
    },
    {
      rule: 'Passer le sélecteur d\'événement via la prop eventSelector (rendu dans l\'en-tête, gardé visible même en erreur).',
      correct: '<BookingsPeaksChart data={raw} eventSelector={<BookingsEventSelect … />} />',
      wrong: 'Rendre le sélecteur séparément au-dessus du graphe (il disparaît alors en cas d\'erreur de chargement).',
    },
  ],
  antiPatterns: [
    {
      title: 'Détourner le graphe pour la capacité/remplissage',
      description: 'Pour un ratio ponctuel « X réservations sur Y places », utiliser FillDonut. BookingsPeaksChart montre la DISTRIBUTION temporelle des inscriptions, pas un taux de remplissage instantané.',
    },
    {
      title: 'Réimplémenter le bucketing ou les échelles',
      description: 'Toute la logique d\'échelles (extent, fenêtre par défaut, presets calendaires, granularité adaptative, formatage FR) vit dans lib/peaks (pure, testée). Ne pas la dupliquer dans le composant ou l\'appelant.',
    },
  ],
  examples: [
    { label: 'Import', code: 'import { BookingsPeaksChart } from "@/components/admin/dashboard/BookingsPeaksChart"' },
    { label: 'Usage dashboard (avec sélecteur d\'événement)', code: '<BookingsPeaksChart data={raw} isLoading={rawLoading} eventSelector={<BookingsEventSelect … />} />' },
    { label: 'États gérés en interne', code: '// isLoading → squelette ; data vide → message ; hoquet réseau → dernière courbe conservée (keepPreviousData)' },
  ],
}
