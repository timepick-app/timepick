import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Typography } from '@/components/ui/typography'
import { SlotAgendaList } from '@/components/slots/SlotAgendaList'
import { MemberSlotAction } from '@/components/public/MemberSlotAction'
import { MemberSlotExtra } from '@/components/public/MemberSlotExtra'
import { POC_SLOTS, isBooked } from './list-directions/pocData'
import type { PlacesFormat, ViewMode } from './list-directions/pocShared'
import { DirectionB } from './list-directions/DirectionB'
import { DirectionC } from './list-directions/DirectionC'
import { DirectionD } from './list-directions/DirectionD'

/**
 * Galerie des 4 directions de refonte de la vue « Liste » des créneaux (Direction A-E2).
 *
 * Direction A = le VRAI composant de production `SlotAgendaList` (E2 fixe) —
 * rendu tel quel ; responsive par container query, il bascule entre le layout
 * gouttière (cadre large) et le layout marqueur (cadre 390px).
 * Directions B/C/D = composants POC (toggle E1/E2/E3), conservés comme
 * référence comparative. Chaque direction est rendue en cadre mobile + desktop.
 */

const PLACES_OPTIONS: Array<{ value: PlacesFormat; label: string }> = [
  { value: 'E1', label: 'E1 · « N places restantes »' },
  { value: 'E2', label: 'E2 · fusion dans le badge' },
  { value: 'E3', label: 'E3 · jauge Progress' },
]

function Frame({ mode, children }: { mode: ViewMode; children: ReactNode }) {
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-xl border border-border bg-background shadow-sm',
        mode === 'mobile' ? 'w-[390px]' : 'w-full max-w-[920px] flex-1',
      )}
    >
      <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        {mode === 'mobile' ? '📱 Mobile · 390px' : '🖥️ Desktop'}
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function DirectionSection({
  id,
  title,
  blurb,
  note,
  render,
}: {
  id: string
  title: string
  blurb: string
  note?: string
  render: (mode: ViewMode) => ReactNode
}) {
  return (
    <section className="space-y-3" data-direction={id}>
      <div className="space-y-1">
        <Typography variant="h2" as="h2">{title}</Typography>
        <Typography variant="body-sm" color="muted">{blurb}</Typography>
        {note && (
          <Typography variant="body-sm" color="muted" weight="medium">
            {note}
          </Typography>
        )}
      </div>
      <div className="flex flex-col items-start gap-4">
        <Frame mode="mobile">{render('mobile')}</Frame>
        <Frame mode="desktop">{render('desktop')}</Frame>
      </div>
    </section>
  )
}

export function ListDirectionsView() {
  const [placesFormat, setPlacesFormat] = useState<PlacesFormat>('E2')

  return (
    <>
      <header className="space-y-3">
        <Typography variant="h1" as="h1">Vue Liste — directions explorées</Typography>
        <Typography variant="body" color="muted" className="max-w-3xl">
          Galerie des quatre directions de refonte de la vue « Liste » des créneaux. Décision
          retenue : <strong className="text-foreground">A · E2</strong> (gouttière de date + places
          fusionnées dans le badge) — c'est le composant de production{' '}
          <code className="rounded bg-muted px-1 text-xs">SlotAgendaList</code>, rendu ici tel quel.
          Les directions B, C et D restent exposées comme référence comparative ; un sélecteur
          E1/E2/E3 permet de les comparer sur le format des places.
        </Typography>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Typography variant="body-sm" weight="medium">
            Format des places (B/C/D) :
          </Typography>
          {PLACES_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={placesFormat === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPlacesFormat(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </header>

      <DirectionSection
        id="A"
        title="A — Gouttière de date (retenue · production)"
        blurb="La date vit une seule fois : gouttière gauche en conteneur large, marqueur léger en conteneur étroit. Responsive par container query — le même composant bascule selon la largeur du cadre."
        note="Direction A = composant de production SlotAgendaList, places E2 fixes."
        render={() => (
          <SlotAgendaList
            slots={POC_SLOTS}
            getHasBooked={(s) => isBooked(s.id)}
            renderExtra={(slot) => <MemberSlotExtra slot={slot} />}
            renderAction={(slot) => <MemberSlotAction slot={slot} hasBooked={isBooked(slot.id)} />}
          />
        )}
      />

      <DirectionSection
        id="B"
        title="B — Liste plate auto-portante"
        blurb="Aucun en-tête : chaque rangée porte sa propre date compacte. Le plancher le plus simple."
        render={(mode) => (
          <DirectionB slots={POC_SLOTS} mode={mode} placesFormat={placesFormat} />
        )}
      />

      <DirectionSection
        id="C"
        title="C — Table / data-grid responsive"
        blurb="Colonnes alignées (Date · Horaire · Statut · Places · Action) sur desktop ; repli en fiches sur mobile."
        render={(mode) => (
          <DirectionC slots={POC_SLOTS} mode={mode} placesFormat={placesFormat} />
        )}
      />

      <DirectionSection
        id="D"
        title="D — Timeline verticale"
        blurb="Rail vertical avec un nœud par créneau. Documentée pour comparaison — moins dense."
        render={(mode) => (
          <DirectionD slots={POC_SLOTS} mode={mode} placesFormat={placesFormat} />
        )}
      />
    </>
  )
}
