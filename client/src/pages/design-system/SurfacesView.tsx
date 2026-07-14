import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { cardMeta } from "@/components/ui/card.meta"
import { Typography } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { dialogMeta } from "@/components/ui/dialog.meta"
import { popoverMeta } from "@/components/ui/popover.meta"
import { sheetMeta } from "@/components/ui/sheet.meta"
import { tooltipMeta } from "@/components/ui/tooltip.meta"
import { ComponentDoc } from "./_shared"
import { PopoverDemo, SheetDemo, TooltipDemo } from "./_demos"
import { AlertTriangle, Trash2 } from "lucide-react"

export function SurfacesView() {
  const [dialogDemoOpen, setDialogDemoOpen] = useState(false)

  return (
    <>
      <header className="space-y-2">
        <Typography variant="h1">Surfaces &amp; overlays</Typography>
        <Typography variant="body" color="muted">Cartes, modales, popovers et panneaux coulissants.</Typography>
      </header>

        {/* Card — Démo (méta) */}
        <Card>
          <CardHeader>
            <CardTitle>Card — Exemple</CardTitle>
            <CardDescription>
              Composition standard : Card &gt; CardHeader (CardTitle + CardDescription) &gt; CardContent &gt; CardFooter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Card className="bg-background">
              <CardHeader>
                <CardTitle>Statistiques de remplissage</CardTitle>
                <CardDescription>Aperçu de l'événement « Réunion AG 2026 »</CardDescription>
              </CardHeader>
              <CardContent>
                <Typography variant="body-sm" color="muted">
                  72 % des créneaux réservés (18 / 25). Taux de participation conforme aux objectifs.
                </Typography>
              </CardContent>
              <CardFooter className="justify-end gap-2">
                <Button variant="outline" size="sm">Détails</Button>
                <Button size="sm">Exporter</Button>
              </CardFooter>
            </Card>
          </CardContent>
        </Card>

        {/* Card — Doc cards */}
        <ComponentDoc
          meta={cardMeta}
          guidelinesDescription="Règles de composition pour structurer un bloc de contenu"
          antiPatternsDescription="Pièges à éviter sur la composition des Card"
          examplesDescription="Patterns d'utilisation du composant Card"
        />

        {/* ========== DIALOG CATALOGUE ========== */}

        {/* Dialog — Exemple */}
        <Card>
          <CardHeader>
            <CardTitle>Dialog — Exemple</CardTitle>
            <CardDescription>
              Modale Radix UI avec focus trap, fermeture ESC et scroll lock. Composition obligatoire : <code className="bg-muted px-1 rounded text-xs">Dialog &gt; DialogContent &gt; DialogHeader (DialogTitle + DialogDescription) &gt; DialogFooter</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Dialog open={dialogDemoOpen} onOpenChange={setDialogDemoOpen}>
              <DialogTrigger asChild>
                <Button variant="outline-destructive">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Supprimer l'événement (démo)
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    Supprimer l'événement
                  </DialogTitle>
                  <DialogDescription>
                    Êtes-vous sûr de vouloir supprimer l'événement <strong>Réunion AG 2026</strong> ?
                    Cette action est irréversible et supprimera également les créneaux et réservations associés.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col-reverse sm:flex-row gap-3">
                  <Button variant="outline" onClick={() => setDialogDemoOpen(false)}>
                    Fermer
                  </Button>
                  <Button variant="outline-destructive" onClick={() => setDialogDemoOpen(false)}>
                    Supprimer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Typography variant="body-xs" color="muted">
              Cliquer sur le bouton ouvre la modale. Échap, clic sur l'overlay ou bouton X la ferme.
            </Typography>
          </CardContent>
        </Card>

        {/* Dialog — Doc cards */}
        <ComponentDoc
          meta={dialogMeta}
          guidelinesDescription="Règles d'utilisation pour les modales (a11y, composition, contrôle d'état)"
          antiPatternsDescription="Pièges à éviter sur les modales (a11y, UX, contrôle d'état)"
          examplesDescription="Patterns d'utilisation du composant Dialog"
        />

        {/* Popover — Exemple */}
        <Card>
          <CardHeader>
            <CardTitle>Popover — Exemple</CardTitle>
            <CardDescription>
              Surface flottante non-modale ancrée à un déclencheur (Radix). Brique des menus contextuels, combobox et sélecteurs. Cliquez pour ouvrir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PopoverDemo />
          </CardContent>
        </Card>

        <ComponentDoc
          meta={popoverMeta}
          guidelinesDescription="Règles d'utilisation pour les surfaces flottantes (asChild, état hors PopoverContent)"
          antiPatternsDescription="Pièges à éviter sur les popovers (état perdu à la fermeture, détournement en dialog)"
          examplesDescription="Patterns d'utilisation du composant Popover"
        />

        {/* Sheet — Exemple */}
        <Card>
          <CardHeader>
            <CardTitle>Sheet — Exemple</CardTitle>
            <CardDescription>
              Panneau coulissant modal ancré à un bord (Radix Dialog). Navigation mobile, drawers, formulaires secondaires. Cliquez pour ouvrir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SheetDemo />
          </CardContent>
        </Card>

        <ComponentDoc
          meta={sheetMeta}
          guidelinesDescription="Règles d'utilisation pour les panneaux coulissants (SheetTitle a11y, side responsive)"
          antiPatternsDescription="Pièges à éviter sur les sheets (titre manquant, micro-contenu)"
          examplesDescription="Patterns d'utilisation du composant Sheet"
        />

        {/* ========== TOOLTIP CATALOGUE ========== */}

        {/* Tooltip — Exemple */}
        <Card>
          <CardHeader>
            <CardTitle>Tooltip — Exemple</CardTitle>
            <CardDescription>
              Info-bulle légère ancrée à un déclencheur (Radix). Deux usages : info contextuelle (icône Info à côté d'un label) et overflow sur texte tronqué. Survolez les éléments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TooltipDemo />
          </CardContent>
        </Card>

        <ComponentDoc
          meta={tooltipMeta}
          guidelinesDescription="Règles d'utilisation pour les infobulles (déclencheur button, provider placement, max-w-xs)"
          antiPatternsDescription="Pièges à éviter (icône nue comme trigger, provider redondant)"
          examplesDescription="Patterns d'utilisation du composant Tooltip"
        />
    </>
  )
}
