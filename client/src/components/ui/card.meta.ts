import type { ComponentMeta } from './_meta/types'

export const cardMeta: ComponentMeta = {
  name: 'Card',
  importPath: '@/components/ui/card',
  summary:
    'Conteneur structurant basé sur une famille de wrappers `forwardRef` minimalistes (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`). Aucune variante cva : le style est fixé par les classes `cn()` internes (bordure, fond `bg-card`, ombre légère, padding `p-6`). Idéal pour regrouper visuellement un bloc de contenu cohérent (statistiques, panneau de configuration admin, étape d\'un wizard, panneau de paramètres).',
  variants: [],
  sizes: [],
  guidelines: [
    {
      rule: 'Utiliser la composition `Card > CardHeader > CardTitle (+ CardDescription) > CardContent` plutôt qu\'un `<div>` stylé à la main',
      correct:
        '<Card><CardHeader><CardTitle>Statistiques de remplissage</CardTitle></CardHeader><CardContent>...</CardContent></Card>',
      wrong:
        '<div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6"><h3 className="text-2xl font-semibold">Statistiques</h3>...</div>',
    },
    {
      rule: 'Toujours placer le titre dans `CardTitle` à l\'intérieur d\'un `CardHeader`, pas un `<hN>` brut. Rendu en `<h3>` par défaut ; passer `as="h2"` (jusqu\'à `h6`) quand la carte est une section de premier niveau sous le `<h1>` de page, pour préserver la hiérarchie des titres (éviter le saut h1→h3).',
      correct:
        '<CardHeader><CardTitle as="h2">Liens de connexion</CardTitle></CardHeader>',
      wrong: '<CardHeader><h3 className="text-2xl font-semibold">Liens de connexion</h3></CardHeader>',
    },
    {
      rule: 'Utiliser `CardDescription` pour le sous-titre explicatif sous `CardTitle` (rendu en `<p text-muted-foreground>`), au lieu de répéter manuellement les classes',
      correct:
        '<CardHeader><CardTitle>SMTP</CardTitle><CardDescription>Configuration du serveur d\'envoi</CardDescription></CardHeader>',
      wrong:
        '<CardHeader><CardTitle>SMTP</CardTitle><p className="text-sm text-muted-foreground">Configuration du serveur d\'envoi</p></CardHeader>',
    },
    {
      rule: 'Utiliser `CardFooter` pour les actions (Boutons Annuler/Enregistrer, etc.) plutôt que mélanger contenu et actions dans `CardContent`',
      correct:
        '<CardContent>...formulaire...</CardContent><CardFooter className="justify-end gap-2"><Button variant="outline">Annuler</Button><Button>Enregistrer</Button></CardFooter>',
      wrong:
        '<CardContent>...formulaire...<div className="flex justify-end gap-2 mt-6"><Button variant="outline">Annuler</Button><Button>Enregistrer</Button></div></CardContent>',
    },
  ],
  antiPatterns: [
    {
      title: 'Reproduire un Card avec un `<div>` stylé manuellement',
      description:
        'Recopier les classes `rounded-lg border bg-card text-card-foreground shadow-sm` dans un `<div>` brut perd la sémantique (composition `Header`/`Title`/`Content`/`Footer`), désynchronise le rendu si le design system évolue, et complique l\'audit. Toujours composer via les sous-composants exportés par `@/components/ui/card`.',
    },
    {
      title: 'Imbriquer des Card sans hiérarchie visuelle distincte',
      description:
        'Un `Card` à l\'intérieur d\'un `CardContent` produit deux bordures et deux ombres concentriques, ce qui alourdit la lecture et brouille la hiérarchie. Préférer une section interne neutre (un simple `<div className="space-y-2 rounded-md bg-muted p-4">`) ou refondre la structure en deux Card sœurs.',
    },
    {
      title: 'Sauter `CardHeader` et écrire le titre directement dans `CardContent`',
      description:
        'Mettre le titre dans `CardContent` casse l\'espacement vertical (`space-y-1.5` du header, `pt-0` du content) et affaiblit l\'arborescence DOM utilisée par les lecteurs d\'écran. Si le titre est volontairement absent, rendre simplement `CardContent` avec un padding ajusté (`<CardContent className="pt-6">`).',
    },
  ],
  examples: [
    {
      label: 'Import',
      code: 'import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"',
    },
    {
      label: 'Usage standard (admin panel)',
      code: `<Card>
  <CardHeader>
    <CardTitle>Liens de connexion (Magic Links)</CardTitle>
    <CardDescription>
      Durée de validité des liens envoyés par email.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-6">
    {/* Champs de configuration */}
  </CardContent>
</Card>`,
    },
    {
      label: 'Avec CardFooter pour actions',
      code: `<Card>
  <CardHeader>
    <CardTitle>Configuration SMTP</CardTitle>
    <CardDescription>Paramètres du serveur d'envoi d'emails</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Formulaire SMTP */}
  </CardContent>
  <CardFooter className="justify-end gap-2">
    <Button variant="outline">Annuler</Button>
    <Button>Enregistrer</Button>
  </CardFooter>
</Card>`,
    },
    {
      label: 'Card de statistiques avec icône dans le header',
      code: `<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <BarChart3 className="h-5 w-5" aria-hidden="true" />
      Statistiques de remplissage
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-6">
    {/* Taux de remplissage, créneaux remplis/vacants */}
  </CardContent>
</Card>`,
    },
    {
      label: 'Card sans header (contenu seul)',
      code: `<Card className="bg-accent/50 border-accent">
  <CardContent className="pt-6">
    {/* Note d'information, pas besoin de titre */}
  </CardContent>
</Card>`,
    },
  ],
}
