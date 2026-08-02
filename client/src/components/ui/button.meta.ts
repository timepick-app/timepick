import type { ComponentMeta } from './_meta/types'

export const buttonMeta: ComponentMeta = {
  name: 'Button',
  importPath: '@/components/ui/button',
  summary: 'Bouton d\'action principal de l\'application. 10 variantes pour couvrir tous les types d\'actions.',
  variants: [
    {
      name: 'default',
      description: 'Action principale — publier, confirmer, créer',
      whenToUse: 'Action principale d\'un écran ou d\'un dialog, généralement unique par contexte (publier un événement, confirmer une opération, créer une ressource). Si tu hésites entre default et secondary, c\'est probablement default.',
    },
    {
      name: 'outline',
      description: 'Action secondaire — annuler, retour, filtrer',
      whenToUse: 'Action secondaire qui accompagne une action principale (Annuler dans un dialog, Retour, Filtrer). Privilégier outline plutôt que secondary pour les paires Confirmer/Annuler — c\'est le pattern dominant du codebase.',
    },
    {
      name: 'destructive',
      description: 'Action dangereuse — supprimer, révoquer',
      whenToUse: 'Confirmation d\'une action irréversible et fortement destructrice (suppression définitive d\'un événement, révocation d\'accès, reset de configuration). Toujours combiner avec un AlertDialog de confirmation — ne jamais déclencher l\'action au premier clic.',
    },
    {
      name: 'outline-destructive',
      description: 'Action dangereuse douce — confirmation suppression, annulation',
      whenToUse: 'Action destructrice à faible engagement ou réversible (annuler une réservation, retirer un participant, ouvrir un dialog de suppression). Préférer outline-destructive à destructive quand l\'action ouvre simplement un flow de confirmation, ou quand elle est listée parmi d\'autres actions sans devoir dominer visuellement.',
    },
    {
      name: 'outline-info',
      description: 'Action sur bannière info — bordure/texte bleus',
      whenToUse: 'Action secondaire posée DANS un Banner variant="info" (fond blue-50). Bordure/texte bleus, survol blue-100 (et non blue-50, pour rester visible sur le fond de la bannière). Ne pas utiliser hors d\'une surface bleue — préférer outline neutre ailleurs.',
    },
    {
      name: 'outline-warning',
      description: 'Action sur bannière warning — bordure/texte ambre',
      whenToUse: 'Action secondaire posée DANS un Banner variant="warning" (fond amber-50). Survol amber-100. Pendant ambre du outline-destructive (rouge).',
    },
    {
      name: 'outline-success',
      description: 'Action sur bannière success — bordure/texte verts',
      whenToUse: 'Action secondaire posée DANS un Banner variant="success" (fond green-50). Survol green-100.',
    },
    {
      name: 'ghost',
      description: 'Action discrète — boutons icônes, menus',
      whenToUse: 'Action accessoire qui ne doit pas attirer l\'attention (boutons icône-seule dans un tableau ou un en-tête, fermeture d\'un panneau, élément de menu). Combiner avec size="icon" dès qu\'il n\'y a pas de label texte.',
    },
    {
      name: 'secondary',
      description: 'Alternative au outline pour variété visuelle',
      whenToUse: 'Alternative remplie au outline quand tu as besoin de hiérarchiser deux actions secondaires entre elles, ou de différencier visuellement des groupes de boutons. À utiliser avec parcimonie — outline reste le défaut pour les actions secondaires.',
    },
    {
      name: 'link',
      description: 'Navigation inline, style lien hypertexte',
      whenToUse: 'Action textuelle embarquée dans une liste, une carte ou un tableau (Modifier, Supprimer, Voir détails dans une ligne d\'utilisateur), ou navigation inline qui doit ressembler à un lien. Privilégier link à ghost quand l\'action est rendue à côté de texte de contenu et doit s\'y intégrer typographiquement.',
    },
  ],
  sizes: [
    { name: 'default', description: 'Taille par défaut', cssHint: 'h-9 px-4 py-2' },
    { name: 'sm', description: 'Compact (tier h-8) — contrôle utilitaire (toolbar de data-table, pagination) ou action secondaire/répétée ; police inchangée (text-sm)', cssHint: 'h-8 px-3' },
    { name: 'lg', description: 'Grand, pour CTAs proéminents', cssHint: 'h-10 px-8' },
    { name: 'icon', description: 'Carré, pour boutons icône-seule', cssHint: 'h-9 w-9' },
    { name: 'icon-sm', description: 'Carré compact 32px — bouton icône-seule dans une data-table (ligne, pagination)', cssHint: 'h-8 w-8' },
  ],
  guidelines: [
    {
      rule: 'La taille encode le RÔLE : `default` (h-9) pour une action primaire ET les boutons qui l\'accompagnent dans une barre d\'actions/footer (Annuler, Réinitialiser, boutons de DialogFooter/SheetFooter) — ils partagent la MÊME hauteur ; `sm` (h-8) pour un contrôle utilitaire (toolbar de data-table, pagination) ou une action secondaire répétée/inline (« Ajouter un item », action par carte) ; `icon`/`icon-sm` pour les boutons icône-seule',
      correct: '<Button>Créer l\'événement</Button> {/* action primaire : h-9 */}\n<Button variant="outline" size="sm">Filtrer</Button> {/* contrôle de toolbar de table : h-8 */}',
      wrong: '<Button size="sm">Créer l\'événement</Button> {/* action primaire en compact : rompt la hiérarchie */}',
    },
    {
      rule: 'Toujours utiliser le composant Button, jamais de <button> HTML brut',
      correct: '<Button variant="outline" onClick={onCancel}>Annuler</Button>',
      wrong: '<button className="border px-4 py-2 rounded" onClick={onCancel}>Annuler</button>',
    },
    {
      rule: 'Utiliser size="icon" pour les boutons sans texte ; dans une data-table, utiliser size="icon-sm" (carré 32px) pour rester à fleur de la rangée compacte',
      correct: '<Button variant="ghost" size="icon"><Pencil /></Button>\n<Button variant="ghost" size="icon-sm"><Pencil /></Button> {/* action de ligne de table */}',
      wrong: '<Button variant="ghost" className="h-9 w-9 p-0"><Pencil /></Button>',
    },
    {
      rule: 'Utiliser les icônes Lucide avec le composant, pas de caractères spéciaux',
      correct: '<Button><Plus /> Nouvel Événement</Button>',
      wrong: '<Button>+ Nouvel Événement</Button>',
    },
    {
      rule: 'Utiliser outline-destructive pour les actions destructives douces, pas des overrides manuels',
      correct: '<Button variant="outline-destructive">Supprimer</Button>',
      wrong: '<Button variant="outline" className="text-red-600 border-red-300">Supprimer</Button>',
    },
    {
      rule: 'Dans tout groupe de ≥2 boutons (footers `Dialog`/`Sheet`/`Card`/`AlertDialog`, barres d\'actions de page/section/formulaire), le CTA principal se place à DROITE (dernière position en lecture LTR) ; les actions secondaires (Annuler, Réinitialiser, bascule Publier/Dépublier) à sa gauche. La barre est `flex flex-wrap justify-end gap-2` — elle empile sans déborder sur mobile, où les primaires s\'étirent (`max-sm:[&>button]:flex-1`). Règle de référence : section « Conventions transverses » (R1–R4) du Design System.',
      correct: '<div className="flex flex-wrap gap-2 justify-end"><Button variant="outline">Dépublier</Button><Button>Enregistrer</Button></div>',
      wrong: '<div className="flex gap-2"><Button>Enregistrer</Button><Button variant="outline">Dépublier</Button></div>',
    },
    {
      rule: 'Une action dont la condition de validité est connue au rendu porte `disabled` ET affiche son motif, rattaché par `aria-describedby` — jamais un bouton resté actif qui refuse au clic. Règle de référence : section « Conventions transverses » (R10–R12) du Design System.',
      correct: '<p id="save-reason" className="text-xs text-muted-foreground">Renseignez un nom pour enregistrer.</p>\n<Button disabled={reason !== null} aria-describedby={reason ? "save-reason" : undefined}>Enregistrer</Button>',
      wrong: '<Button onClick={() => { if (!name.trim()) { setError(\'Le nom est requis\'); return } save() }}>Enregistrer</Button>',
    },
    {
      rule: 'L\'anneau de focus-visible est le SEUL repère pour un bouton icône-seule (`size="icon"`/`"icon-sm"`) : jeton `--ring` en PLEINE opacité (`focus-visible:ring-ring`, sans `/50`) — WCAG 1.4.11 (non-text contrast), seuil 3:1. Calcul (luminance relative, (L1+0,05)/(L2+0,05)) : 4,63:1 sur #fafafa (zinc-50) et 4,83:1 sur blanc (`--background`). Ne jamais réintroduire `ring-ring/50` ni surcharger `--ring` localement dans un composant consommateur — l\'ancienne valeur (240 4.8% 70%, opacité 50%) ne montait qu\'à 1,42:1 / 1,44:1.',
      correct: '<Button variant="ghost" size="icon"><Pencil /></Button> {/* hérite focus-visible:ring-ring plein de la base cva */}',
      wrong: '<Button variant="ghost" size="icon" className="focus-visible:ring-ring/50"><Pencil /></Button> {/* réintroduit l\'anneau à 50% d\'opacité, sous le seuil 3:1 */}',
    },
  ],
  antiPatterns: [
    {
      title: 'size="sm" sur une action primaire',
      description: 'Une action primaire (submit, CTA principal, boutons de DialogFooter/SheetFooter) reste en taille `default` (h-9), où qu\'elle soit — y compris au-dessus d\'une table ou dans une bannière d\'actions. `size="sm"` est réservé aux contrôles utilitaires (toolbars de data-table, pagination) et aux actions secondaires répétées/inline (« Ajouter un item », action par carte), JAMAIS au bouton Annuler/Réinitialiser apparié à un primaire.',
    },
    {
      title: 'Ajouter min-h-[44px] sur un bouton',
      description: 'La cible tactile 44px a été évacuée (admin desktop-first). La hauteur de référence d\'une action est h-9 (`default`) ; ne pas forcer `min-h-[44px]`, qui désaligne le bouton de ses voisins et fige une hauteur hors échelle.',
    },
    {
      title: 'size="icon" (36px) pour une action de ligne de data-table',
      description: 'Dans une data-table, un bouton icône-seule doit rester à fleur de la rangée compacte h-8. Utiliser `size="icon-sm"` (carré 32px), pas `size="icon"` (36px) ni un override `className="h-8 w-8"` — sauf bascule conditionnelle, cf. l\'entrée suivante.',
    },
    {
      title: 'Override de boîte hors échelle quand la bascule est conditionnelle',
      description: 'Un `size` est une prop React : aucune requête de conteneur ni aucun point de rupture ne peut le commuter. Quand un bouton doit changer de forme selon la largeur de son conteneur (icône-seule en étroit, icône + libellé en large), l\'override par `className` est donc le seul geste possible — et il est ADMIS à une condition : reproduire exactement une boîte de l\'échelle, jamais en inventer une. `size="sm" className="w-8 px-0 @[…]:w-auto @[…]:px-3"` redonne au pixel la boîte de `icon-sm` (32 × 32), parce que `sm` porte déjà `h-8` et que `tailwind-merge` élimine son `px-3` au lieu de l\'empiler ; `className="h-10 w-10"` invente une boîte et désaligne la rangée. Même famille que les métriques conditionnées par conteneur déjà en place sur les listes de créneaux (`min-h-11 @xl/agenda:min-h-9`).',
    },
    {
      title: 'Hauteurs mixtes dans une paire d\'actions (footer / barre d\'actions)',
      description: 'Dans une barre d\'actions ou un footer, tous les boutons appariés (Annuler + Valider ; Réinitialiser + Sauvegarder + Publier) partagent la même hauteur `default` (h-9). Mettre l\'action secondaire en `size="sm"` à côté d\'un primaire `default` produit deux hauteurs différentes côte à côte (régression EventPublishBanner). `sm` ne s\'applique qu\'aux toolbars de data-table et aux utilitaires répétés/inline.',
    },
    {
      title: 'Valider au clic une condition calculable au rendu',
      description: 'Un bouton qui reste actif sur un formulaire invalide, puis affiche un motif au clic, promet une action qu\'il refusera — et ne dit rien à qui ne clique pas. Toute condition de validité connue au rendu se traduit par `disabled` + motif affiché et rattaché (`aria-describedby`) : cf. « Conventions transverses », R10–R12. La validation au clic reste légitime pour ce qui n\'est connu qu\'APRÈS l\'appel (refus serveur, conflit, quota).',
    },
  ],
  examples: [
    { label: 'Import', code: 'import { Button } from "@/components/ui/button"' },
    { label: 'Variante simple', code: '<Button variant="default">Confirmer</Button>' },
    { label: 'Avec icône', code: '<Button><Plus /> Nouvel Événement</Button>' },
    { label: 'Bouton icône-seule', code: '<Button variant="ghost" size="icon"><Pencil /></Button>' },
  ],
}
