import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Typography } from "@/components/ui/typography"
import { Badge } from "@/components/ui/badge"
import type { BadgeVariant, BadgeSize } from "@/components/ui/badge"
import { badgeMeta } from "@/components/ui/badge.meta"
import { Skeleton } from "@/components/ui/skeleton"
import { skeletonMeta } from "@/components/ui/skeleton.meta"
import { Progress } from "@/components/ui/progress"
import { progressMeta } from "@/components/ui/progress.meta"
import { ComponentDoc } from "./_shared"
import { Banner, BannerTitle, BannerDescription, type BannerProps } from "@/components/ui/banner"
import { bannerMeta } from "@/components/ui/banner.meta"
import { Info, AlertTriangle, CheckCircle2, AlertCircle, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button, type ButtonProps } from "@/components/ui/button"

const BANNER_VARIANTS: { variant: BannerProps["variant"]; Icon: LucideIcon; title: string; desc: string }[] = [
  { variant: "default", Icon: Info, title: "Information", desc: "Message neutre par défaut." },
  { variant: "info", Icon: Info, title: "Template personnalisé", desc: "Cet événement utilise un template d'invitation personnalisé." },
  { variant: "warning", Icon: AlertTriangle, title: "Service email dégradé", desc: "La réception des liens de connexion peut être perturbée." },
  { variant: "success", Icon: CheckCircle2, title: "Lien renvoyé", desc: "Un nouveau lien vous a été envoyé par email." },
  { variant: "destructive", Icon: AlertCircle, title: "Erreur de connexion", desc: "Vérifiez votre email et réessayez." },
]

const ACTION_BANNERS: { variant: BannerProps["variant"]; btn: ButtonProps["variant"]; Icon: LucideIcon; msg: string; cta: string }[] = [
  { variant: "info", btn: "outline-info", Icon: Info, msg: "Cet événement utilise un template personnalisé.", cta: "Voir" },
  { variant: "warning", btn: "outline-warning", Icon: AlertTriangle, msg: "Service email dégradé.", cta: "Réessayer" },
  { variant: "success", btn: "outline-success", Icon: CheckCircle2, msg: "Un nouveau lien vous a été envoyé.", cta: "Renvoyer" },
  { variant: "destructive", btn: "outline-destructive", Icon: AlertCircle, msg: "Erreur de connexion.", cta: "Réessayer" },
]

export function FeedbackView() {
  return (
    <>
      <header className="space-y-2">
        <Typography variant="h1">Affichage & feedback</Typography>
        <Typography variant="body" color="muted">Badges, squelettes de chargement et barres de progression.</Typography>
      </header>

        {/* Banner — Showcase (DOC DESIGN SYSTEM — démos VOLONTAIRES)
            ⚠️ NE PAS supprimer/fusionner ces sections sous prétexte de redondance
            avec banner.meta : la démonstration VISUELLE exhaustive (toutes variantes
            × les 2 densités + l'état action/dismiss) EST la raison d'être de cette page.
            ponytail:keep showroom — conserver tel quel. */}
        <Card>
          <CardHeader>
            <CardTitle>Banner — Variantes</CardTitle>
            <CardDescription>
              5 variants sémantiques × 2 densités. Remplace les bannières bespoke de l'application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">

            {/* Variants — densité par défaut */}
            <div className="space-y-3">
              <Typography variant="h6">Variants — densité par défaut</Typography>
              <div className="space-y-2">
                {BANNER_VARIANTS.map(({ variant, Icon, title, desc }) => (
                  <Banner key={variant} variant={variant}>
                    <Icon />
                    <BannerTitle>{title}</BannerTitle>
                    <BannerDescription>{desc}</BannerDescription>
                  </Banner>
                ))}
              </div>
            </div>

            {/* Description seule (sans titre) */}
            <div className="space-y-3">
              <Typography variant="h6">Description seule (sans titre)</Typography>
              <Banner variant="warning">
                <AlertTriangle />
                <BannerDescription>Service email dégradé. Une seule ligne, sans titre.</BannerDescription>
              </Banner>
            </div>

            {/* Variants — densité compacte */}
            <div className="space-y-3">
              <Typography variant="h6">Variants — densité compacte</Typography>
              <div className="space-y-2">
                {BANNER_VARIANTS.map(({ variant, Icon, title, desc }) => (
                  <Banner key={variant} variant={variant} density="compact">
                    <Icon />
                    <BannerTitle>{title}</BannerTitle>
                    <BannerDescription>{desc}</BannerDescription>
                  </Banner>
                ))}
              </div>
            </div>

            {/* Action + dismiss */}
            <div className="space-y-3">
              <Typography variant="h6">Action + dismiss</Typography>
              <Banner variant="info" role="status" className="pr-12">
                <Info />
                <BannerTitle>Session bientôt expirée</BannerTitle>
                <BannerDescription className="flex flex-wrap items-center gap-3">
                  <span>Votre session expire dans 5 minutes.</span>
                  <Button size="sm" variant="outline-info" className="h-7">Prolonger</Button>
                </BannerDescription>
                <button type="button" aria-label="Ignorer" className="absolute right-3 top-3 opacity-70 hover:opacity-100">
                  <X className="h-4 w-4" />
                </button>
              </Banner>
            </div>

            {/* Bannière + bouton d'action assorti (variante outline-* par couleur) */}
            <div className="space-y-3">
              <Typography variant="h6">Bannière + bouton assorti (outline-*)</Typography>
              <div className="space-y-2">
                {ACTION_BANNERS.map(({ variant, btn, Icon, msg, cta }) => (
                  <Banner key={variant} variant={variant} role="status">
                    <Icon />
                    <BannerDescription className="flex flex-wrap items-center justify-between gap-3">
                      <span>{msg}</span>
                      <Button size="sm" variant={btn} className="h-7">{cta}</Button>
                    </BannerDescription>
                  </Banner>
                ))}
              </div>
            </div>

          </CardContent>
        </Card>

        <ComponentDoc
          meta={bannerMeta}
          guidelinesDescription="Règles d'utilisation pour maintenir la cohérence"
          antiPatternsDescription="Pièges à éviter sur les bannières"
          examplesDescription="Patterns d'utilisation du composant Banner"
        />

        {/* Badge Variants */}
        <Card>
          <CardHeader>
            <CardTitle>Badges — Variantes</CardTitle>
            <CardDescription>
              7 variantes disponibles pour couvrir tous les cas de statut
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {badgeMeta.variants.map((v) => (
                <Badge key={v.name} variant={v.name as BadgeVariant}>{v.name}</Badge>
              ))}
            </div>
            <div className="space-y-2 mt-4">
              {badgeMeta.variants.map((v) => (
                <div key={v.name} className="flex items-center gap-3">
                  <Badge variant={v.name as BadgeVariant} className="min-w-24 justify-center">{v.name}</Badge>
                  <Typography variant="body-sm" color="muted">{v.description}</Typography>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Badge appearance — soft (nouvelle variante) */}
        <Card>
          <CardHeader>
            <CardTitle>Badges — appearance « soft »</CardTitle>
            <CardDescription>
              Ton clair + bordure, aligné sur la palette du composant Banner. Utilisé par les chips de statut (StatusBanner).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {badgeMeta.variants.map((v) => (
              <div key={v.name} className="flex items-center gap-3">
                <Badge variant={v.name as BadgeVariant} appearance="solid" className="min-w-24 justify-center">{v.name}</Badge>
                <Badge variant={v.name as BadgeVariant} appearance="soft" className="min-w-24 justify-center">{v.name}</Badge>
                <Typography variant="body-xs" color="muted">solid / soft</Typography>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Badge Sizes */}
        <Card>
          <CardHeader>
            <CardTitle>Badges — Tailles</CardTitle>
            <CardDescription>
              2 tailles standardisees pour differents contextes d'utilisation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              {badgeMeta.sizes.map((s) => (
                <div key={s.name} className="flex flex-col items-center gap-2">
                  <Badge size={s.name as BadgeSize} variant="info">{s.name}</Badge>
                  <code className="text-xs text-muted-foreground">{s.cssHint}</code>
                  <Typography variant="body-xs" color="muted">{s.description}</Typography>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Badge Icon Support */}
        <Card>
          <CardHeader>
            <CardTitle>Badges — Support icones</CardTitle>
            <CardDescription>
              La prop <code className="bg-muted px-1 rounded">icon</code> ajoute automatiquement un espacement gap-1.5
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col items-center gap-2">
                <Badge variant="success" icon={
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                }>Disponible</Badge>
                <Typography variant="body-xs" color="muted">Avec icone</Typography>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Badge variant="success">Disponible</Badge>
                <Typography variant="body-xs" color="muted">Sans icone</Typography>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Badge variant="info" icon={
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                }>Information</Badge>
                <Typography variant="body-xs" color="muted">Avec icone</Typography>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Badge variant="warning" icon={
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                }>Attention</Badge>
                <Typography variant="body-xs" color="muted">Avec icone</Typography>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Badge — Doc cards (guidelines) */}
        <ComponentDoc
          meta={badgeMeta}
          label="Badges"
          guidelinesDescription="Regles d'utilisation pour maintenir la coherence dans le projet"
        />

        {/* Badge Code Examples */}
        <Card>
          <CardHeader>
            <CardTitle>Badges — Exemples de code</CardTitle>
            <CardDescription>
              Patterns d'utilisation du composant Badge
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Typography variant="h6">Import</Typography>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`import { Badge } from "@/components/ui/badge"`}
              </pre>
            </div>
            <div className="space-y-2">
              <Typography variant="h6">Variante simple</Typography>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`<Badge variant="success">Disponible</Badge>
<Badge variant="error">Complet</Badge>
<Badge variant="info">Nouveau</Badge>`}
              </pre>
            </div>
            <div className="space-y-2">
              <Typography variant="h6">Avec icone</Typography>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`<Badge variant="success" icon={<CheckIcon />}>
  Disponible
</Badge>`}
              </pre>
            </div>
            <div className="space-y-2">
              <Typography variant="h6">Taille personnalisee</Typography>
              <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`<Badge variant="info" size="md">
  Grande etiquette
</Badge>`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Skeleton — Exemple */}
        <Card>
          <CardHeader>
            <CardTitle>Skeleton — Exemple</CardTitle>
            <CardDescription>
              Placeholder de chargement (<code className="bg-muted px-1 rounded text-xs">animate-pulse</code>) calqué sur la forme du contenu réel pour éviter le layout shift.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm space-y-3 rounded-lg border p-4">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-32 w-full" />
            </div>
          </CardContent>
        </Card>

        <ComponentDoc
          meta={skeletonMeta}
          guidelinesDescription="Règles d'utilisation pour les skeletons (dimensions calquées, structure reproduite)"
          antiPatternsDescription="Pièges à éviter sur les skeletons (spinner, oubli de dimensionnement)"
          examplesDescription="Patterns d'utilisation du composant Skeleton"
        />

        {/* Progress — Exemple */}
        <Card>
          <CardHeader>
            <CardTitle>Progress — Exemple</CardTitle>
            <CardDescription>
              Barre de progression déterminée (Radix), pilotée par <code className="bg-muted px-1 rounded text-xs">value</code> (0–100) : taux de remplissage, avancement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={66} className="h-3" />
            <div className="flex items-center gap-3">
              <Progress value={40} className="h-1.5 w-32" />
              <Typography variant="body-sm" color="muted">40 %</Typography>
            </div>
          </CardContent>
        </Card>

        <ComponentDoc
          meta={progressMeta}
          guidelinesDescription="Règles d'utilisation pour la barre de progression (value normalisée 0–100, libellé)"
          antiPatternsDescription="Pièges à éviter sur Progress (usage indéterminé, jauge maison sans a11y)"
          examplesDescription="Patterns d'utilisation du composant Progress"
        />
    </>
  )
}
