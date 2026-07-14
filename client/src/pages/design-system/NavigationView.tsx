import { useState } from "react"
import type { VariantProps } from "class-variance-authority"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Typography } from "@/components/ui/typography"
import { Button, buttonVariants } from "@/components/ui/button"
import { buttonMeta } from "@/components/ui/button.meta"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { toggleGroupMeta } from "@/components/ui/toggle-group.meta"
import { toggleVariants } from "@/components/ui/toggle"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { tabsMeta } from "@/components/ui/tabs.meta"
import { sidebarMeta } from "@/components/ui/sidebar.meta"
import { FilterPills } from "@/components/ui/filter-pills"
import { ComponentDoc } from "./_shared"
import { ResponsiveToggleGroupDemo, ResponsiveTabsDemo } from "./_demos"
import { Settings, Plus, Download, Trash2, Pencil, Send, Calendar, Clock, List, User, Bell, Shield } from "lucide-react"

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>
type ToggleVariant = NonNullable<VariantProps<typeof toggleVariants>["variant"]>
type ToggleSize = NonNullable<VariantProps<typeof toggleVariants>["size"]>

export function NavigationView() {
  const [toggleDemo, setToggleDemo] = useState("calendar")
  const [tabDemo, setTabDemo] = useState("profile")
  const [filterDemo, setFilterDemo] = useState("all")

  return (
    <>
      <header className="space-y-2">
        <Typography variant="h1">Navigation & actions</Typography>
        <Typography variant="body" color="muted">Boutons, bascules, onglets et filtres.</Typography>
      </header>

      {/* Button Variants */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons — Variantes</CardTitle>
          <CardDescription>
            7 variantes disponibles pour couvrir tous les types d'actions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {buttonMeta.variants.map((v) => (
              <Button key={v.name} variant={v.name as ButtonVariant}>{v.name}</Button>
            ))}
          </div>
          <div className="space-y-2 mt-4">
            {buttonMeta.variants.map((v) => (
              <div key={v.name} className="flex items-center gap-3">
                <Button variant={v.name as ButtonVariant} className="min-w-28 justify-center" size="sm">{v.name}</Button>
                <Typography variant="body-sm" color="muted">{v.description}</Typography>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Button Sizes */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons — Tailles</CardTitle>
          <CardDescription>
            5 tailles standardisees pour differents contextes d'utilisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-6">
            {buttonMeta.sizes.map((s) => (
              <div key={s.name} className="flex flex-col items-center gap-2">
                {s.name === "icon" || s.name === "icon-sm" ? (
                  <Button size={s.name as ButtonSize} variant="ghost"><Settings /></Button>
                ) : (
                  <Button size={s.name as ButtonSize}>Bouton</Button>
                )}
                <code className="text-xs text-muted-foreground">{s.cssHint}</code>
                <Typography variant="body-xs" color="muted">{s.description}</Typography>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Button with Icons */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons — Avec icones</CardTitle>
          <CardDescription>
            La classe <code className="bg-muted px-1 rounded">gap-2</code> est integree au composant pour l'espacement icone/texte
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <Button><Plus /> Nouvel Evenement</Button>
              <Typography variant="body-xs" color="muted">default + icone</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="outline"><Download /> Exporter</Button>
              <Typography variant="body-xs" color="muted">outline + icone</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="destructive"><Trash2 /> Supprimer</Button>
              <Typography variant="body-xs" color="muted">destructive + icone</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="outline-destructive"><Trash2 /> Confirmer</Button>
              <Typography variant="body-xs" color="muted">outline-destructive + icone</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="ghost" size="icon"><Pencil /></Button>
              <Typography variant="body-xs" color="muted">ghost + icon</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button size="sm"><Send /> Envoyer</Button>
              <Typography variant="body-xs" color="muted">sm + icone</Typography>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Button States */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons — Etats</CardTitle>
          <CardDescription>
            Etats interactifs du composant Button
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <Button>Actif</Button>
              <Typography variant="body-xs" color="muted">Normal</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button disabled>Desactive</Button>
              <Typography variant="body-xs" color="muted">disabled</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="outline">Actif</Button>
              <Typography variant="body-xs" color="muted">Normal</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="outline" disabled>Desactive</Button>
              <Typography variant="body-xs" color="muted">disabled</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="destructive">Actif</Button>
              <Typography variant="body-xs" color="muted">Normal</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="destructive" disabled>Desactive</Button>
              <Typography variant="body-xs" color="muted">disabled</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="outline-destructive">Actif</Button>
              <Typography variant="body-xs" color="muted">Normal</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button variant="outline-destructive" disabled>Desactive</Button>
              <Typography variant="body-xs" color="muted">disabled</Typography>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Button — Doc cards (guidelines) */}
      <ComponentDoc
        meta={buttonMeta}
        label="Buttons"
        guidelinesDescription="Regles d'utilisation pour maintenir la coherence dans le projet"
      />

      {/* Button Code Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Buttons — Exemples de code</CardTitle>
          <CardDescription>
            Patterns d'utilisation du composant Button
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Typography variant="h6">Import</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`import { Button } from "@/components/ui/button"`}
            </pre>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Variantes</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`<Button>Action principale</Button>
<Button variant="outline">Fermer</Button>
<Button variant="destructive">Supprimer</Button>
<Button variant="outline-destructive">Confirmer la suppression</Button>
<Button variant="ghost" size="icon"><Pencil /></Button>`}
            </pre>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Avec icone</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`import { Plus } from "lucide-react"

<Button>
  <Plus /> Nouvel Evenement
</Button>`}
            </pre>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Comme lien (asChild)</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`import { Link } from "react-router-dom"

<Button asChild>
  <Link to="/admin/events/new">
    <Plus /> Nouvel Evenement
  </Link>
</Button>`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* ToggleGroup — Static Examples */}
      <Card>
        <CardHeader>
          <CardTitle>ToggleGroup — Exemples statiques</CardTitle>
          <CardDescription>
            Groupe de boutons mutuellement exclusifs base sur Radix Toggle Group.
            Navigation clavier integree (fleches, Enter, Space).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <ToggleGroup
                type="single"
                value={toggleDemo}
                onValueChange={(v) => { if (v) setToggleDemo(v) }}
                className="rounded-md border border-gray-200 p-1"
                aria-label="Mode d'affichage (demo)"
              >
                <ToggleGroupItem value="calendar" aria-label="Vue calendrier" className="gap-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>Mois</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="week" aria-label="Vue semaine" className="gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>Semaine</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="Vue liste" className="gap-1.5">
                  <List className="h-4 w-4" />
                  <span>Liste</span>
                </ToggleGroupItem>
              </ToggleGroup>
              <Typography variant="body-xs" color="muted">avec bordure conteneur + icones</Typography>
            </div>
            <div className="flex flex-col items-center gap-2">
              <ToggleGroup type="single" value={toggleDemo} onValueChange={(v) => { if (v) setToggleDemo(v) }}>
                <ToggleGroupItem value="calendar">Mois</ToggleGroupItem>
                <ToggleGroupItem value="week">Semaine</ToggleGroupItem>
                <ToggleGroupItem value="list">Liste</ToggleGroupItem>
              </ToggleGroup>
              <Typography variant="body-xs" color="muted">variant="default" (texte seul)</Typography>
            </div>
          </div>
          <Typography variant="body-sm" color="muted">
            Valeur selectionnee : <code className="bg-muted px-1 rounded text-xs">{toggleDemo}</code>
          </Typography>
        </CardContent>
      </Card>

      {/* ToggleGroup — Responsive Pattern (Level 1: icon + stacked micro-text) */}
      <Card>
        <CardHeader>
          <CardTitle>ToggleGroup — Pattern responsive (Niveau 1)
          </CardTitle>
          <CardDescription>
            Bascule automatique entre icone + texte inline et icone + micro-texte empile
            quand le conteneur est trop etroit. Utilise useCompactMode avec inline-flex.
            Tirez le bord droit pour tester.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResponsiveToggleGroupDemo />
          <div className="space-y-2">
            <Typography variant="h6">Principe</Typography>
            <Typography variant="body-sm" color="muted">
              Le ToggleGroup est <code className="bg-muted px-1 rounded text-xs">inline-flex</code> :
              il declare sa largeur naturelle (contenu). Le hook <code className="bg-muted px-1 rounded text-xs">useCompactMode</code> mesure
              cette largeur au premier rendu, puis la compare a l'espace disponible dans le parent.
              Quand le parent retrecit en dessous de la largeur naturelle → bascule en mode compact.
            </Typography>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Contraintes</Typography>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Le conteneur parent doit avoir son width determine par le layout externe (pas par ses enfants)</li>
              <li>L'element mesure doit etre <code className="bg-muted px-1 rounded text-xs">inline-flex</code> avec <code className="bg-muted px-1 rounded text-xs">flex-nowrap</code> et items en <code className="bg-muted px-1 rounded text-xs">shrink-0</code></li>
              <li>Appeler <code className="bg-muted px-1 rounded text-xs">recalibrate()</code> si le contenu change dynamiquement</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* TabsList — Responsive Pattern (Level 2: tabs → Select dropdown) */}
      <Card>
        <CardHeader>
          <CardTitle>TabsList — Pattern responsive (Niveau 2)
          </CardTitle>
          <CardDescription>
            Bascule automatique entre grille d'onglets et Select dropdown
            quand le conteneur est trop etroit. Tirez le bord droit pour tester.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResponsiveTabsDemo />
          <div className="space-y-2">
            <Typography variant="h6">Principe</Typography>
            <Typography variant="body-sm" color="muted">
              Le TabsList est <code className="bg-muted px-1 rounded text-xs">inline-flex</code> :
              quand sa largeur naturelle dépasse le parent, le hook bascule en mode compact
              (Select dropdown). Les tabs restent dans le DOM (masqués) pour préserver la mesure.
            </Typography>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Subtilité : masquer la TabsList, pas les panneaux</Typography>
            <Typography variant="body-sm" color="muted">
              Appliquer <code className="bg-muted px-1 rounded text-xs">hidden</code> uniquement sur le wrapper de la <code className="bg-muted px-1 rounded text-xs">TabsList</code>,
              jamais sur le <code className="bg-muted px-1 rounded text-xs">&lt;Tabs&gt;</code> racine. Sinon les <code className="bg-muted px-1 rounded text-xs">TabsContent</code> disparaissent
              et la sélection effectuée via le <code className="bg-muted px-1 rounded text-xs">Select</code> ne rend plus rien (cf. fix <code className="bg-muted px-1 rounded text-xs">23865513</code>).
            </Typography>
          </div>
        </CardContent>
      </Card>

      {/* ToggleGroup — Variantes & Tailles (depuis le meta) */}
      <Card>
        <CardHeader>
          <CardTitle>ToggleGroup — Variantes & Tailles</CardTitle>
          <CardDescription>
            {toggleGroupMeta.variants.length} variantes et {toggleGroupMeta.sizes.length} tailles disponibles, extraites du meta partagé.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Typography variant="h6">Variantes</Typography>
            <div className="space-y-2">
              {toggleGroupMeta.variants.map((v) => (
                <div key={v.name} className="flex items-start gap-3">
                  <ToggleGroup
                    type="single"
                    value="a"
                    variant={v.name as ToggleVariant}
                    className="rounded-md border border-gray-200 p-1 shrink-0"
                    aria-label={`Variante ${v.name}`}
                  >
                    <ToggleGroupItem value="a" aria-label="A">A</ToggleGroupItem>
                    <ToggleGroupItem value="b" aria-label="B">B</ToggleGroupItem>
                  </ToggleGroup>
                  <div className="flex-1">
                    <code className="text-xs font-mono">{v.name}</code>
                    <Typography variant="body-sm" color="muted">{v.description}</Typography>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Typography variant="h6">Tailles</Typography>
            <div className="flex flex-wrap items-end gap-6">
              {toggleGroupMeta.sizes.map((s) => (
                <div key={s.name} className="flex flex-col items-center gap-2">
                  <ToggleGroup
                    type="single"
                    value="a"
                    size={s.name as ToggleSize}
                    aria-label={`Taille ${s.name}`}
                  >
                    <ToggleGroupItem value="a" aria-label="A">A</ToggleGroupItem>
                    <ToggleGroupItem value="b" aria-label="B">B</ToggleGroupItem>
                  </ToggleGroup>
                  <code className="text-xs text-muted-foreground">{s.cssHint}</code>
                  <Typography variant="body-xs" color="muted">{s.description}</Typography>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ToggleGroup — Doc cards */}
      <ComponentDoc
        meta={toggleGroupMeta}
        guidelinesDescription="Regles d'utilisation pour les groupes de boutons mutuellement exclusifs"
        antiPatternsDescription="Pièges courants à éviter, notamment liés au pattern responsive Niveau 1"
        examplesDescription="Patterns d'utilisation du composant ToggleGroup"
      />

      {/* Tabs — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>Tabs — Exemple</CardTitle>
          <CardDescription>
            Composant Tabs interactif basé sur Radix UI. Cliquez sur les onglets pour naviguer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tabDemo} onValueChange={setTabDemo}>
            <TabsList>
              <TabsTrigger value="profile">
                <User className="h-4 w-4 mr-2" aria-hidden="true" />Profil
              </TabsTrigger>
              <TabsTrigger value="notifications">
                <Bell className="h-4 w-4 mr-2" aria-hidden="true" />Notifications
              </TabsTrigger>
              <TabsTrigger value="security">
                <Shield className="h-4 w-4 mr-2" aria-hidden="true" />Sécurité
              </TabsTrigger>
            </TabsList>
            <TabsContent value="profile" className="mt-6">
              <Typography variant="body-sm" color="muted">
                Contenu de l'onglet Profil. Gérez vos informations personnelles ici.
              </Typography>
            </TabsContent>
            <TabsContent value="notifications" className="mt-6">
              <Typography variant="body-sm" color="muted">
                Contenu de l'onglet Notifications. Configurez vos préférences de notification.
              </Typography>
            </TabsContent>
            <TabsContent value="security" className="mt-6">
              <Typography variant="body-sm" color="muted">
                Contenu de l'onglet Sécurité. Gérez vos paramètres de sécurité et mots de passe.
              </Typography>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Tabs — Doc cards */}
      <ComponentDoc
        meta={tabsMeta}
        guidelinesDescription="Règles d'utilisation pour la navigation par onglets"
        antiPatternsDescription="Pièges courants à éviter, notamment pour le pattern responsive Niveau 2"
        examplesDescription="Patterns d'utilisation du composant Tabs"
      />

      {/* FilterPills — Example */}
      <Card>
        <CardHeader>
          <CardTitle>FilterPills — Exemple</CardTitle>
          <CardDescription>
            Filtres a selection unique en forme de pilules. Supporte les compteurs et l'etat desactive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-2">
              <Typography variant="body-xs" color="muted">Basique</Typography>
              <FilterPills
                options={[
                  { value: "all", label: "Tous", count: 12 },
                  { value: "today", label: "Aujourd'hui" },
                  { value: "week", label: "Cette semaine" },
                  { value: "month", label: "Ce mois" },
                ]}
                value={filterDemo}
                onChange={setFilterDemo}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Typography variant="body-xs" color="muted">Avec compteurs et desactive</Typography>
              <FilterPills
                options={[
                  { value: "all", label: "Tous", count: 8 },
                  { value: "pending", label: "En attente", count: 3 },
                  { value: "sent", label: "Envoye", count: 5 },
                  { value: "failed", label: "Echoue", count: 0, disabled: true },
                ]}
                value={filterDemo === "today" || filterDemo === "week" || filterDemo === "month" ? "all" : filterDemo}
                onChange={setFilterDemo}
              />
            </div>
          </div>
          <Typography variant="body-sm" color="muted">
            Valeur selectionnee : <code className="bg-muted px-1 rounded text-xs">{filterDemo}</code>
          </Typography>
        </CardContent>
      </Card>

      {/* FilterPills — Usage Guidelines */}
      <Card className="border-green-500/50 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>&#x2705;</span>
            FilterPills — Bonnes pratiques
          </CardTitle>
          <CardDescription>
            Regles d'utilisation pour les filtres en pilules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 p-4 rounded-lg bg-background border">
            <Typography variant="h6" className="font-semibold text-foreground">
              Utiliser FilterPills pour les filtres a selection unique
            </Typography>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
              <div className="space-y-1">
                <span className="text-xs font-medium text-green-600 dark:text-green-400">&#x2713; Correct:</span>
                <code className="block bg-green-50 dark:bg-green-950 p-2 rounded text-xs overflow-x-auto">
                  {'<FilterPills options={[...]} value={filter} onChange={setFilter} />'}
                </code>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-red-600 dark:text-red-400">&#x2717; Incorrect:</span>
                <code className="block bg-red-50 dark:bg-red-950 p-2 rounded text-xs overflow-x-auto">
                  {'<button className="rounded-full px-3 py-1 ...">Label</button>'}
                </code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FilterPills — Code Examples */}
      <Card>
        <CardHeader>
          <CardTitle>FilterPills — Exemples de code</CardTitle>
          <CardDescription>
            Patterns d'utilisation du composant FilterPills
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Typography variant="h6">Import</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`import { FilterPills } from "@/components/ui/filter-pills"`}
            </pre>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Basique avec compteur</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`<FilterPills
  options={[
    { value: "all", label: "Tous", count: 12 },
    { value: "today", label: "Aujourd'hui" },
    { value: "week", label: "Cette semaine" },
  ]}
  value={filter}
  onChange={setFilter}
/>`}
            </pre>
          </div>
          <div className="space-y-2">
            <Typography variant="h6">Avec etat desactive</Typography>
            <pre className="bg-muted p-4 rounded-md text-sm overflow-x-auto">
{`<FilterPills
  options={[
    { value: "all", label: "Tous", count: 8 },
    { value: "failed", label: "Echoue", count: 0, disabled: true },
  ]}
  value={filter}
  onChange={setFilter}
/>`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Sidebar — pattern app-shell (layout) */}
      <ComponentDoc
        meta={sidebarMeta}
        label="Sidebar"
        guidelinesDescription="Règles pour le layout applicatif à barre latérale (shell AdminLayout + SidebarContent)"
        antiPatternsDescription="Pièges à éviter sur le shell à sidebar (grille, débordement horizontal, a11y du Sheet)"
        examplesDescription="Squelette du shell applicatif et structure du contenu de la barre latérale"
      />
    </>
  )
}
