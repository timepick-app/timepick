import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import type { BookingTimestamps } from '@/types/analytics'
import {
  type Extent, type Granularity, type Preset, type PeakBucket,
  PRESET_LABELS, toNaiveLocal, eventExtent, granularityForSpan, defaultWindow, stepFor,
  presetWindow, bucketizeRange, cumulativeAreaBuckets, ticksForWindow,
  formatAxisTick, formatFull, findPeak, formatWindowLabel, formatDayMonth, bucketDurationLabel,
} from '@/lib/peaks'
import { Skeleton } from '@/components/ui/skeleton'
import { Typography } from '@/components/ui/typography'
import { FilterPills, type FilterPillOption } from '@/components/ui/filter-pills'

type View = 'incremental' | 'cumulative'

// Ordre d'affichage des presets : du plus large (Tout) au plus fin (Heure).
const PRESET_ORDER: Preset[] = ['all', 'month', 'week', 'day', 'hour']

const PRESET_FILTER_OPTIONS: FilterPillOption<Preset | 'auto'>[] = [
  { value: 'auto', label: 'Auto' },
  ...PRESET_ORDER.map(p => ({ value: p, label: PRESET_LABELS[p] })),
]
const VIEW_OPTIONS: FilterPillOption<View>[] = [
  { value: 'incremental', label: 'Par période' },
  { value: 'cumulative', label: 'Total' },
]

const DAY = 86_400_000
// Fenêtre minimale lors d'un redimensionnement par les molettes du navigateur.
const MIN_SPAN = 10 * 60_000 // 10 min (granularité la plus fine)

/** Granularité grossière pour l'aperçu plein-extent (~80-300 buckets visés). */
function overviewGranularityFor(extent: Extent): Granularity {
  const span = extent.to - extent.from
  if (span <= 2 * DAY) return 'hour'      // ≤ 2 j → ~48 buckets max
  if (span <= 90 * DAY) return 'day'       // ≤ ~3 mois → un barre/jour
  if (span <= 548 * DAY) return 'week'     // ≤ ~1,5 an → une/semaine
  return 'month'
}

export interface BookingsPeaksChartProps {
  data: BookingTimestamps | undefined
  isLoading?: boolean
  /** Sélecteur d'événement optionnel, rendu en haut à droite (page réelle). */
  eventSelector?: ReactNode
}

/** Tooltip compact aligné DS : date (contexte) puis valeur (info clé). */
function PeaksTooltipContent({
  active, payload, label, granularity, cumul,
}: {
  active?: boolean
  payload?: { value?: number | string }[]
  label?: number | string
  granularity: Granularity
  cumul?: boolean
}) {
  if (!active || !payload || payload.length === 0) return null
  const v = Number(payload[0]?.value ?? 0)
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-popover-foreground shadow-md">
      <div className="text-[11px] leading-tight text-muted-foreground">{formatFull(Number(label), granularity)}</div>
      <div className="text-xs font-semibold leading-tight">
        {v}&nbsp;réservation{v > 1 ? 's' : ''}{cumul ? ' (cumul)' : ''}
      </div>
    </div>
  )
}

/**
 * Graphique POC « pics d'inscription » — modèle type CoinMarketCap :
 *  - Zone principale à barres/aire REGROUPÉES à la granularité adaptée à la
 *    fenêtre visible (les barres s'affinent au zoom).
 *  - BANDEAU NAVIGATEUR (bas) = navigateur custom positionné par le TEMPS
 *    (molettes/sélection en fraction d'extent) couvrant TOUT l'extent de
 *    l'événement (publication → dernier créneau), avec repères de dates aux bornes.
 *  - PRESETS réglant la LARGEUR de fenêtre (Tout/Mois/Semaine/Jour/Heure).
 *  - DEUX déplacements : (a) glisser la fenêtre/molettes dans le bandeau ; (b)
 *    glisser directement dans le graphe (clic maintenu → décale la fenêtre).
 *  - AUTO au chargement : plus petit preset contenant l'amplitude d'activité.
 *  - Graduation adaptative alignée sur bornes naturelles (Europe/Paris).
 * Hiérarchie : le nom de l'événement est le titre dominant ; « Réservations
 * dans le temps » est un surtitre discret. Toutes les barres sont --primary
 * plein (le pic ressort par sa hauteur).
 */
export function BookingsPeaksChart({ data, isLoading, eventSelector }: BookingsPeaksChartProps) {
  const [view, setView] = useState<View>('incremental')
  const [win, setWin] = useState<Extent>({ from: 0, to: 1 })
  const [activePreset, setActivePreset] = useState<Preset | 'auto' | null>('auto')
  const [dragging, setDragging] = useState(false)

  // Refs pour le drag-to-pan dans la zone principale.
  const plotRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; from: number; span: number; gran: Granularity } | null>(null)
  const dragBufferRef = useRef<{ buckets: PeakBucket[]; from: number; to: number; gran: Granularity } | null>(null)
  // Ref pour mesurer la largeur du bandeau navigateur (conversion px → temps).
  const navRef = useRef<HTMLDivElement>(null)
  // Drag du bandeau (molettes/pan) via Pointer Events + capture — pas de listeners window.
  const navDragRef = useRef<{ mode: 'from' | 'to' | 'pan'; startX: number; from: number; to: number; span: number } | null>(null)
  // Cadrage Auto : ancré sur l'IDENTITÉ de l'événement (nom + dates, stables au poll),
  // pas « une seule fois par montage » — robuste au keepPreviousData (cf. effet AUTO).
  const framedKeyRef = useRef<string | null>(null)

  // Conversion unique des timestamps réels -> ms « naïf-local » (parts Paris).
  const localTs = useMemo(
    () => (data?.timestamps ?? []).map(toNaiveLocal),
    [data],
  )

  // Extent plein événement (ouvertures des inscriptions → dernier créneau).
  const extent = useMemo<Extent>(
    () => data
      ? eventExtent({
        opensAt: data.opensAt,
        createdAt: data.createdAt,
        endDate: data.endDate,
        localTimestamps: localTs,
      })
      : { from: 0, to: 1 },
    [data, localTs],
  )

  // Granularité du panorama (bandeau) — calculée tôt : sert au cadrage Auto
  // (aligne la fenêtre sur la grille du panorama) ET à l'aperçu plein-extent.
  const overviewGran = overviewGranularityFor(extent)

  // AUTO : (re)cadre quand l'ÉVÉNEMENT change (identité = nom + dates). Un simple refresh
  // de données (poll, nouvelles réservations) garde la même identité → la vue/preset
  // choisis par l'utilisateur sont PRÉSERVÉS. On ne cadre JAMAIS sur des données
  // transitoires d'un autre événement (keepPreviousData lors d'un changement de sélection).
  useEffect(() => {
    if (!data || localTs.length === 0) return
    const eventKey = `${data.name}|${data.opensAt}|${data.createdAt}|${data.endDate}`
    if (framedKeyRef.current === eventKey) return
    framedKeyRef.current = eventKey
    setActivePreset('auto')
    setWin(defaultWindow(extent, localTs, overviewGran))
  }, [data, extent, localTs, overviewGran])

  // Filet de sécurité : réinitialiser tout glisser résiduel au démontage.
  useEffect(() => () => {
    navDragRef.current = null
    dragState.current = null
    dragBufferRef.current = null
  }, [])

  // Granularité adaptée à la fenêtre visible (les barres s'affinent au zoom).
  const granularity = granularityForSpan(win.to - win.from)
  const mainBuckets = useMemo(
    () => bucketizeRange(localTs, win.from, win.to, granularity),
    [localTs, win, granularity],
  )

  const overview = useMemo(
    () => bucketizeRange(localTs, extent.from, extent.to, overviewGran),
    [localTs, extent, overviewGran],
  )
  const overviewMax = overview.reduce((m, b) => (b.count > m ? b.count : m), 0)

  // Aire cumulative (vue Total) : cumul GLOBAL via helper pur testé, sur une plage
  // ÉTENDUE au-delà de la fenêtre → l'aire déborde le domaine rembourré et remplit
  // bord à bord ; repos et glisser coïncident (cf. #11). Vide hors vue cumulative.
  const areaBuckets = useMemo(
    () => {
      if (view !== 'cumulative') return [] as PeakBucket[]
      const step = stepFor(granularity)
      return cumulativeAreaBuckets(localTs, win.from - 2 * step, win.to + 2 * step, granularity)
    },
    [view, win, granularity, localTs],
  )

  // --- Early returns APRÈS tous les hooks (Rules of Hooks) -----------------
  if (isLoading) {
    return (
      <div className="peaks-chart space-y-3">
        {eventSelector && <div className="flex sm:justify-end"><div className="w-full sm:w-64">{eventSelector}</div></div>}
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }
  if (!data || localTs.length === 0) {
    return (
      <div className="peaks-chart space-y-3">
        {eventSelector && <div className="flex sm:justify-end"><div className="w-full sm:w-64">{eventSelector}</div></div>}
        <div className="flex h-72 items-center justify-center">
          <Typography variant="body-sm" color="muted">Aucune inscription pour cet événement</Typography>
        </div>
      </div>
    )
  }

  const peak = findPeak(mainBuckets)

  // Pendant un glisser, on affiche un TAMPON stable (pré-bucketisé large) et on ne
  // bouge que la fenêtre (domaine X) → le bloc défile sans se reconstruire.
  const displayBuckets = dragging && dragBufferRef.current ? dragBufferRef.current.buckets : mainBuckets

  // Position fractionnaire de la fenêtre dans l'extent (libellés de bornes du brush).
  const extentSpan = Math.max(1, extent.to - extent.from)
  const fStart = Math.min(1, Math.max(0, (win.from - extent.from) / extentSpan))
  const fEnd = Math.min(1, Math.max(0, (win.to - extent.from) / extentSpan))

  // Tracé d'aire cumulative pour le panorama (vue Total) — x = fraction d'extent,
  // y = part du cumul (normalisé au total des réservations). Vide si aucune activité.
  const navMaxCum = overview.length ? overview[overview.length - 1].cumulative : 0
  const navCumulativePath = (() => {
    if (!navMaxCum) return ''
    const pts = overview.map(b => {
      const x = ((b.key - extent.from) / extentSpan) * 100
      const y = 100 - (b.cumulative / navMaxCum) * 100
      return `${x.toFixed(2)} ${y.toFixed(2)}`
    })
    const lastY = (100 - (overview[overview.length - 1].cumulative / navMaxCum) * 100).toFixed(2)
    return `M ${pts.join(' L ')} L 100 ${lastY} L 100 100 L 0 100 Z`
  })()

  // --- Presets : règlent la largeur de fenêtre -----------------------------
  const applyPreset = (preset: Preset) => {
    setActivePreset(preset)
    setWin(presetWindow(preset, extent, localTs))
  }

  // --- Navigateur custom : molettes/sélection positionnées par le TEMPS -----
  // Convertit un déplacement horizontal (px dans le bandeau) en delta temps.
  const navDeltaMs = (dx: number) =>
    (dx / Math.max(1, navRef.current?.clientWidth ?? 1)) * extentSpan

  // Drag du bandeau via Pointer Events + setPointerCapture : l'élément capture le
  // pointeur, donc move/up/cancel arrivent même HORS fenêtre → plus de mouseup perdu,
  // plus de listeners window orphelins, pas de mutation globale de document.body.
  const onNavPointerDown = (mode: 'from' | 'to' | 'pan') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    navDragRef.current = { mode, startX: e.clientX, from: win.from, to: win.to, span: win.to - win.from }
    setActivePreset(null) // fenêtre personnalisée → ni Auto ni preset
  }
  const onNavPointerMove = (e: React.PointerEvent) => {
    const d = navDragRef.current
    if (!d) return
    const dt = navDeltaMs(e.clientX - d.startX)
    if (d.mode === 'from') {
      setWin({ from: Math.min(Math.max(d.from + dt, extent.from), d.to - MIN_SPAN), to: d.to })
    } else if (d.mode === 'to') {
      setWin({ from: d.from, to: Math.max(Math.min(d.to + dt, extent.to), d.from + MIN_SPAN) })
    } else {
      const from = Math.min(Math.max(d.from + dt, extent.from), extent.to - d.span)
      setWin({ from, to: from + d.span })
    }
  }
  const endNavDrag = () => { navDragRef.current = null }

  // --- Drag-to-pan zone principale via Pointer Events + capture (tampon stable) -----
  const buildPlotBuffer = (from: number, span: number, gran: Granularity) => {
    const bufFrom = from - 2 * span
    const bufTo = from + 3 * span
    dragBufferRef.current = { buckets: bucketizeRange(localTs, bufFrom, bufTo, gran), from: bufFrom, to: bufTo, gran }
  }
  const onPlotPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const span = win.to - win.from
    const gran = granularityForSpan(span)
    buildPlotBuffer(win.from, span, gran)
    dragState.current = { startX: e.clientX, from: win.from, span, gran }
    setDragging(true)
    setActivePreset(null) // glisser → vue personnalisée (ni Auto ni preset)
  }
  const onPlotPointerMove = (e: React.PointerEvent) => {
    const ds = dragState.current
    if (!ds) return
    const plotW = Math.max(1, (plotRef.current?.clientWidth ?? 600) - 40)
    const dt = ((e.clientX - ds.startX) / plotW) * ds.span
    let newFrom = ds.from - dt
    const maxFrom = extent.to - ds.span
    if (newFrom < extent.from) newFrom = extent.from
    else if (newFrom > maxFrom) newFrom = maxFrom
    // Recalcul du tampon UNIQUEMENT près de son bord (rare → glisse fluide).
    const buf = dragBufferRef.current
    if (buf && (newFrom < buf.from + 0.5 * ds.span || newFrom + ds.span > buf.to - 0.5 * ds.span)) buildPlotBuffer(newFrom, ds.span, ds.gran)
    setWin({ from: newFrom, to: newFrom + ds.span })
  }
  const endPlotDrag = () => {
    dragState.current = null
    dragBufferRef.current = null
    setDragging(false)
  }

  // --- En-tête (hiérarchie) ------------------------------------------------
  const header = (
    <div className="space-y-1">
      <Typography variant="body-xs" color="muted">Réservations dans le temps</Typography>
      <Typography variant="h4" as="p" weight="semibold">{data.name}</Typography>
      {view === 'cumulative' ? (
        <Typography variant="body-sm" color="muted">
          {data.totalCapacity > 0
            ? `${data.timestamps.length} réservation${data.timestamps.length > 1 ? 's' : ''} sur ${data.totalCapacity} place${data.totalCapacity > 1 ? 's' : ''}`
            : `${data.timestamps.length} réservation${data.timestamps.length > 1 ? 's' : ''}`}
        </Typography>
      ) : peak && peak.count > 0 ? (
        <Typography variant="body-sm" color="muted">
          Pic&nbsp;: {peak.count}&nbsp;réservations en {bucketDurationLabel(granularity)}&nbsp;·&nbsp;{peak.fullLabel}
        </Typography>
      ) : null}
    </div>
  )

  const xAxis = (
    <XAxis
      dataKey="key" type="number" scale="time" allowDataOverflow
      domain={[win.from - stepFor(granularity) / 2, win.to + stepFor(granularity) / 2]}
      ticks={ticksForWindow(win.from, win.to, granularity)}
      tickFormatter={(t: number) => formatAxisTick(t, granularity)}
      fontSize={12} tickLine={false} axisLine={false}
    />
  )
  const yAxis = (
    <YAxis
      allowDecimals={false} width={24} fontSize={12} tickLine={false} axisLine={false}
      domain={view === 'cumulative' && data.totalCapacity > 0 ? [0, data.totalCapacity] : undefined}
      allowDataOverflow={view === 'cumulative' && data.totalCapacity > 0}
      tick={(p: { y?: number | string; payload?: { value?: number | string } }) => (
        <text x={3} y={p.y} dy={4} fontSize={11} textAnchor="start" fill="hsl(var(--muted-foreground))">{p.payload?.value}</text>
      )}
    />
  )

  return (
    <div className="peaks-chart space-y-3">
      {/* Ligne 1 : identité (gauche) + sélecteur d'événement (droite). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {header}
        {eventSelector && <div className="order-first w-full sm:order-none sm:w-64">{eventSelector}</div>}
      </div>

      {/* Ligne 2 : presets d'échelle (gauche) + mode de lecture (droite). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterPills
          options={PRESET_FILTER_OPTIONS}
          value={activePreset as Preset | 'auto'}
          onChange={(v) => {
            if (v === 'auto') { setActivePreset('auto'); setWin(defaultWindow(extent, localTs, overviewGran)) }
            else applyPreset(v)
          }}
        />
        <FilterPills options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v)} />
      </div>

      {/* Zone principale : re-bucketing à la granularité de la fenêtre visible. */}
      <div
        ref={plotRef}
        className={`peaks-main-plot h-72 w-full touch-none${dragging ? ' is-dragging' : ''}`}
        style={{ userSelect: dragging ? 'none' : undefined }}
        onPointerDown={onPlotPointerDown}
        onPointerMove={onPlotPointerMove}
        onPointerUp={endPlotDrag}
        onPointerCancel={endPlotDrag}
        data-testid="peaks-main-plot"
      >
        <ResponsiveContainer width="100%" height="100%">
          {view === 'incremental' ? (
            <BarChart
              key={`bar:${granularity}`}
              data={displayBuckets} margin={{ top: 8, right: 0, bottom: 8, left: 0 }}
            >
              <defs>
                <pattern id="peaksHatch" patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
                  <rect width={6} height={6} fill="hsl(var(--background))" />
                  <line x1={0} y1={0} x2={0} y2={6} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} />
                </pattern>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              {xAxis}
              {yAxis}
              {!dragging && (
                <Tooltip cursor={false} content={<PeaksTooltipContent granularity={granularity} />} />
              )}
              <Bar
                dataKey="count" fill="url(#peaksHatch)" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5}
                maxBarSize={48} radius={[2, 2, 0, 0]} isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <AreaChart
              key={`area:${granularity}`}
              data={areaBuckets} margin={{ top: 8, right: 0, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              {xAxis}
              {yAxis}
              {!dragging && (
                <Tooltip cursor={false} content={<PeaksTooltipContent granularity={granularity} cumul />} />
              )}
              <Area
                type="monotone" dataKey="cumulative"
                stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15}
                strokeWidth={2} isAnimationActive={false}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Bandeau navigateur custom : panorama plein-extent + sélection time-based. */}
      <div className="space-y-1" data-testid="peaks-overview">
        <div ref={navRef} className="relative h-12 w-full select-none">
          {/* Couche clippée : panorama plein-extent + masques hors-fenêtre. */}
          <div className="absolute inset-0 overflow-hidden rounded-sm border border-dashed border-muted-foreground/50 bg-muted/30">
            {view === 'cumulative' ? (
              navCumulativePath ? (
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  <path
                    d={navCumulativePath}
                    fill="hsl(var(--muted-foreground))" fillOpacity={0.4}
                    stroke="hsl(var(--muted-foreground))" strokeWidth={1} vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null
            ) : (
              overview.map(b => {
                const leftPct = ((b.key - extent.from) / extentSpan) * 100
                return (
                  <div
                    key={b.key}
                    className="absolute bottom-0 bg-muted-foreground/70"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.min((stepFor(overviewGran) / extentSpan) * 100, 100 - leftPct)}%`,
                      height: `${overviewMax ? (b.count / overviewMax) * 100 : 0}%`,
                    }}
                  />
                )
              })
            )}
            <div className="absolute inset-y-0 left-0 bg-background/55" style={{ width: `${fStart * 100}%` }} />
            <div className="absolute inset-y-0 right-0 bg-background/55" style={{ left: `${fEnd * 100}%` }} />
          </div>
          {/* Sélection : corps draggable (pan), fond gris transparent (sans contour). */}
          <div
            className="absolute inset-y-0 cursor-grab touch-none bg-foreground/5 active:cursor-grabbing"
            style={{ left: `${fStart * 100}%`, width: `${(fEnd - fStart) * 100}%` }}
            onPointerDown={onNavPointerDown('pan')}
            onPointerMove={onNavPointerMove}
            onPointerUp={endNavDrag}
            onPointerCancel={endNavDrag}
          />
          {/* Limites de la fenêtre : traits pleine hauteur CENTRÉS sur fStart/fEnd
              (mêmes centres que les molettes → traits qui passent par leur milieu, #16). */}
          <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${fStart * 100}%` }} />
          <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${fEnd * 100}%` }} />
          {/* Molettes : petit grip (lignes horizontales) centré sur la limite, non clippé (#3). */}
          <div
            className="absolute top-1/2 flex h-7 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-sm bg-foreground"
            style={{ left: `${fStart * 100}%` }}
            onPointerDown={onNavPointerDown('from')}
            onPointerMove={onNavPointerMove}
            onPointerUp={endNavDrag}
            onPointerCancel={endNavDrag}
          >
            <span className="flex flex-col gap-[3px]">
              <span className="h-px w-1.5 bg-background/80" />
              <span className="h-px w-1.5 bg-background/80" />
              <span className="h-px w-1.5 bg-background/80" />
            </span>
          </div>
          <div
            className="absolute top-1/2 flex h-7 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-sm bg-foreground"
            style={{ left: `${fEnd * 100}%` }}
            onPointerDown={onNavPointerDown('to')}
            onPointerMove={onNavPointerMove}
            onPointerUp={endNavDrag}
            onPointerCancel={endNavDrag}
          >
            <span className="flex flex-col gap-[3px]">
              <span className="h-px w-1.5 bg-background/80" />
              <span className="h-px w-1.5 bg-background/80" />
              <span className="h-px w-1.5 bg-background/80" />
            </span>
          </div>
        </div>
        {/* Repères des bornes d'extent + libellé de la fenêtre visible (centré). */}
        <div className="relative flex justify-between text-[10px] leading-none text-muted-foreground">
          <span>{formatDayMonth(extent.from)}</span>
          <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-medium text-foreground">
            {formatWindowLabel(win.from, win.to, granularity)}
          </span>
          <span>{formatDayMonth(extent.to - DAY)}</span>
        </div>
      </div>
    </div>
  )
}
