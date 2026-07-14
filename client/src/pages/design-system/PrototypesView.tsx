import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Typography } from "@/components/ui/typography"
import { DeferredComboboxDemo } from "./_demos"

export function PrototypesView() {
  return (
    <>
      <header className="space-y-2">
        <Typography variant="h1">Prototypes différés</Typography>
        <Typography variant="body" color="muted">
          Prototype zéro-dépendance en attente d'une primitive <code className="bg-muted px-1 rounded text-xs">ui/</code>. Le Slider est désormais une vraie primitive — voir <strong>Formulaires</strong>.
        </Typography>
      </header>

      {/* Prototypes différés — intro */}
      <Card className="border-amber-500/50 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🚧</span>
            Prototypes différés
          </CardTitle>
          <CardDescription>
            Pattern visuel <strong>pas encore livré comme primitive <code className="bg-muted px-1 rounded text-xs">ui/</code></strong> (aucune dépendance ajoutée). Référence prête à l'emploi le jour où une feature le réclame. Spec exacte et verdict documentés séparément. Origine visuelle : shadcn-admin. Le Slider a migré dans <strong>Formulaires</strong>.
          </CardDescription>
        </CardHeader>
      </Card>


      {/* Combobox (différé) — Exemple */}
      <Card>
        <CardHeader>
          <CardTitle>Combobox (différé) — Exemple</CardTitle>
          <CardDescription>
            Prototype trigger <code className="bg-muted px-1 rounded text-xs">role="combobox"</code> + Popover (recherche + liste filtrée, largeur calée sur le trigger). 1 consommateur latent (<code className="bg-muted px-1 rounded text-xs">UserMultiSelect</code> suffit) → différé (pas de <code className="bg-muted px-1 rounded text-xs">cmdk</code>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm"><DeferredComboboxDemo /></div>
        </CardContent>
      </Card>
    </>
  )
}
