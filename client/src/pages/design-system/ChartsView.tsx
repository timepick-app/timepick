import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Typography } from "@/components/ui/typography"
import { BookingsPeaksChart } from "@/components/admin/dashboard/BookingsPeaksChart"
import type { BookingTimestamps } from "@/types/analytics"
import { bookingsPeaksChartMeta } from "@/components/ui/bookings-peaks-chart.meta"
import { ComponentDoc } from "./_shared"

// Jeu de démo autonome (indépendant des fixtures de test) : événement « Atelier
// découverte » avec un pic net le 22 juin (heure de Paris ~14h) sur ~20 places.
const DEMO_DATA: BookingTimestamps = {
  name: "Atelier découverte (démo)",
  opensAt: "2026-06-10T00:00:00.000Z",
  createdAt: "2026-06-10T00:00:00.000Z",
  endDate: "2026-06-30T00:00:00.000Z",
  totalCapacity: 20,
  timestamps: [
    Date.UTC(2026, 5, 19, 8, 0), Date.UTC(2026, 5, 20, 10, 0),
    Date.UTC(2026, 5, 22, 12, 0), Date.UTC(2026, 5, 22, 12, 10),
    Date.UTC(2026, 5, 22, 12, 20), Date.UTC(2026, 5, 22, 12, 30),
    Date.UTC(2026, 5, 22, 12, 40), Date.UTC(2026, 5, 22, 12, 50),
    Date.UTC(2026, 5, 22, 13, 0), Date.UTC(2026, 5, 22, 13, 10),
    Date.UTC(2026, 5, 23, 9, 0), Date.UTC(2026, 5, 25, 15, 0),
  ],
}

export function ChartsView() {
  return (
    <>
      <header className="space-y-2">
        <Typography variant="h1">Graphes &amp; dataviz</Typography>
        <Typography variant="body" color="muted">
          BookingsPeaksChart : pics d'inscription d'un événement à échelle variable (mois → 10 min), avec bandeau navigateur (zoom/déplacement par le temps), presets calendaires et vue Par période / Total.
        </Typography>
      </header>

      {/* BookingsPeaksChart — Démo */}
      <Card>
        <CardHeader>
          <CardTitle>BookingsPeaksChart — Exemple</CardTitle>
          <CardDescription>
            Données fictives (pic le 22 juin). Glissez les molettes du bandeau pour zoomer, le corps pour déplacer la fenêtre ; changez de preset (Auto/Tout/Mois/Semaine/Jour/Heure) ou de vue (Par période/Total).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingsPeaksChart data={DEMO_DATA} />
        </CardContent>
      </Card>

      {/* BookingsPeaksChart — Doc cards */}
      <ComponentDoc
        meta={bookingsPeaksChartMeta}
        guidelinesDescription="Conventions pour une source de données correcte, un cadrage Auto fiable et un sélecteur d'événement robuste."
        antiPatternsDescription="Pièges à éviter avec ce graphe d'analyse."
        examplesDescription="Extraits d'intégration côté tableau de bord."
      />
    </>
  )
}
