import type { VariantProps } from "class-variance-authority"
import { Typography, typographyVariants } from "@/components/ui/typography"
import { typographyMeta } from "@/components/ui/typography.meta"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

type TypographyVariant = NonNullable<VariantProps<typeof typographyVariants>["variant"]>
type TypographyColor = NonNullable<VariantProps<typeof typographyVariants>["color"]>

export function FoundationsView() {
  return (
    <>
      <header className="space-y-2">
        <Typography variant="h1">Fondations</Typography>
        <Typography variant="body" color="muted">
          Typographie fluide : échelle, couleurs, usage et formules clamp().
        </Typography>
      </header>

      {/* Typography Scale - Headings */}
      <Card>
        <CardHeader>
          <CardTitle>Échelle typographique - Titres</CardTitle>
          <CardDescription>
            Tailles fluides avec clamp() basées sur les breakpoints Tailwind (sm: 640px → 2xl: 1536px)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {typographyMeta.variants
            .filter((v) => v.name.startsWith("h"))
            .map((item) => (
              <div key={item.name} className="space-y-1">
                <div className="flex items-baseline gap-4 flex-wrap">
                  <Typography variant={item.name as TypographyVariant}>
                    Titre {item.name.toUpperCase()}
                  </Typography>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <code className="bg-muted px-2 py-0.5 rounded text-xs">{item.cssHint}</code>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Typography Scale - Body */}
      <Card>
        <CardHeader>
          <CardTitle>Échelle typographique - Corps de texte</CardTitle>
          <CardDescription>
            Texte courant avec variations de taille pour différents contextes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {typographyMeta.variants
            .filter((v) => !v.name.startsWith("h"))
            .map((item) => (
              <div key={item.name} className="space-y-1">
                <Typography variant={item.name as TypographyVariant}>
                  Exemple de texte avec la taille {item.name}
                </Typography>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <code className="bg-muted px-2 py-0.5 rounded text-xs">{item.cssHint}</code>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Color Variants */}
      <Card>
        <CardHeader>
          <CardTitle>Couleurs de texte</CardTitle>
          <CardDescription>
            Variantes de couleur disponibles pour le composant Typography
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {typographyMeta.extraAxes
            ?.find((a) => a.name === "color")
            ?.items.map((item) => (
              <div key={item.name} className="space-y-1">
                <Typography variant="body-lg" color={item.name as TypographyColor}>
                  Texte avec la couleur "{item.name}"
                </Typography>
                <Typography variant="body-xs" color="muted">
                  {item.description}
                </Typography>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Usage Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Utilisation du composant Typography</CardTitle>
          <CardDescription>
            Exemples de code pour utiliser le composant dans vos pages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Typography variant="h6">Import</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`import { Typography } from "@/components/ui/typography"`}
            </pre>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Usage basique</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`<Typography variant="h1">Titre principal</Typography>
<Typography variant="body" color="muted">Texte secondaire</Typography>`}
            </pre>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Override de l'élément HTML</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`<Typography variant="h1" as="h2">
  Style h1 mais rendu comme h2
</Typography>`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Common Mistakes - WARNING Section */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <span>⚠️</span>
            Erreurs courantes à éviter
          </CardTitle>
          <CardDescription>
            Ces erreurs ont causé des régressions dans le passé. Lisez attentivement pour éviter de les reproduire.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {typographyMeta.antiPatterns.map((mistake, index) => (
            <div key={index} className="space-y-2 p-4 rounded-lg bg-background border">
              <Typography variant="h6" className="font-semibold text-foreground">
                {mistake.title}
              </Typography>
              <Typography variant="body-sm" color="muted">
                {mistake.description}
              </Typography>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Formula Explanation Card */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📐</span>
            Formule clamp() détaillée
          </CardTitle>
          <CardDescription>
            Comment calculer les valeurs clamp() correctes pour la typographie fluide
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Typography variant="h6">Plage de viewport</Typography>
            <Typography variant="body-sm" color="muted">
              640px (sm) à 1536px (2xl) → Différence: 896px
            </Typography>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Formules</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`// Pour passer de MIN_PX à MAX_PX:
vw-multiplier = (MAX_PX - MIN_PX) * 100 / 896
base_px       = MIN_PX - (vw-multiplier * 640 / 100)
base_rem      = base_px / 16

// Résultat:
clamp(min_rem, base_rem + vw-multiplier, max_rem)`}
            </pre>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Exemple: h1 (30px → 48px)</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`vw = (48 - 30) * 100 / 896 = 2.0089
base_px = 30 - (2.0089 * 640 / 100) = 17.143
base_rem = 17.143 / 16 = 1.0714

// clamp(1.875rem, 1.0714rem + 2.0089vw, 3rem)

Vérification:
  À 640px:  17.14px + 12.86px = 30px ✓
  À 1536px: 17.14px + 30.86px = 48px ✓`}
            </pre>
          </div>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <Typography variant="body-sm" className="font-medium">
              ⚠️ Avertissement: Le multiplicateur vw doit être entre 0.1 et 3 pour notre plage.
              Des valeurs comme 0.1256vw sont 16x trop petites et indiquent une erreur de calcul!
            </Typography>
          </div>
        </CardContent>
      </Card>

      {/* Responsive Note */}
      <Card className="bg-accent/50 border-accent">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <span className="text-2xl">📐</span>
            <div className="space-y-1">
              <Typography variant="h6" className="font-semibold">
                Test responsive
              </Typography>
              <Typography variant="body-sm" color="muted">
                Redimensionnez votre navigateur pour observer la mise à l'échelle fluide de la typographie.
                Les valeurs clamp() assurent une transition progressive entre les tailles minimum et maximum.
              </Typography>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
