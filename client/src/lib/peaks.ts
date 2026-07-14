/**
 * Bucketing temporel pur pour le graphique « pics d'inscription » (POC).
 *
 * Principe clé : on traite l'heure locale Europe/Paris comme si c'était de
 * l'UTC (« naïve-locale »). Chaque bucket est donc représenté par un epoch ms
 * construit via `Date.UTC(...)` à partir des composantes Paris, puis formaté en
 * `timeZone: 'UTC'` — ce qui reconstitue exactement le libellé local SANS
 * dépendre d'une librairie de date (le projet s'en passe ; cf. `dashboard.ts`).
 * L'avantage : un axe catégoriel à pas constants (gap-fill uniforme), ce que
 * l'échelle temporelle continue actuelle ne permet pas (graduation incohérente).
 */

export type Granularity = 'tenmin' | 'hour' | 'day' | 'week' | 'month'

export interface PeakBucket {
  /** epoch ms « naïve-local » (heure de Paris traitée comme UTC) : tri / gap-fill. */
  key: number
  /** Libellé d'axe court FR (ex. '14h', 'lun. 12', '12 juin', 'juin'). */
  label: string
  /** Libellé complet non ambigu FR (ex. '12 juin, 14h', 'lundi 12 juin'). */
  fullLabel: string
  /** Compte incrémental du bucket. */
  count: number
  /** Total courant jusqu'à ce bucket inclus. */
  cumulative: number
}

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  tenmin: '10 min',
  hour: 'Heure',
  day: 'Jour',
  week: 'Semaine',
  month: 'Mois',
}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const TENMIN_MS = 600_000

// Seuils d'amplitude pour le choix automatique de granularité (cf. pickAutoGranularity).
const HOUR_SPAN = 2 * DAY_MS // < 2 j → heure
const DAY_SPAN = 120 * DAY_MS // < ~4 mois → jour (garde-fou densité passe en semaine au-delà de ~90 barres)
const WEEK_SPAN = 180 * DAY_MS // < ~6 mois → semaine

// Seuils de FENÊTRE pour granularityForSpan (modèle preset/fenêtre du contrat).
const SPAN_TENMIN = 3 * HOUR_MS // <= 3 h → 10 min
const SPAN_HOUR = 2 * DAY_MS // <= 2 j → heure
const SPAN_DAY = 45 * DAY_MS // <= 45 j → jour (Mois ~31 j → barres jour)
const SPAN_WEEK = 400 * DAY_MS // <= 400 j → semaine ; au-delà → mois

const ORDER: readonly Granularity[] = ['hour', 'day', 'week', 'month']
const MAX_BUCKETS = 90

// --- Formatage Intl (instances réutilisées) ---------------------------------

// Extraction des composantes Paris (en-US pour des chiffres stables ; hourCycle
// 'h23' évite le quirks « 24 h » à minuit de `hour12: false` sur certains ICU).
const parisParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// Libellés : `timeZone: 'UTC'` car la clé EST déjà l'heure locale naïve.
const fmtDayMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' }) // "12 juin"
const fmtDayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }) // "ven. 12"
const fmtDayFull = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }) // "vendredi 12 juin"
const fmtMonthLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long' }) // "juin"
const fmtMonthFull = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }) // "juin 2026"

/** Composantes Paris (1-based month, minute incluse) d'un epoch ms. */
function parisYmdHm(ts: number): { y: number; m: number; d: number; h: number; min: number } {
  let y = 0
  let m = 0
  let d = 0
  let h = 0
  let min = 0
  for (const p of parisParts.formatToParts(new Date(ts))) {
    if (p.type === 'year') y = Number(p.value)
    else if (p.type === 'month') m = Number(p.value)
    else if (p.type === 'day') d = Number(p.value)
    else if (p.type === 'hour') h = Number(p.value)
    else if (p.type === 'minute') min = Number(p.value)
  }
  return { y, m, d, h: h === 24 ? 0 : h, min }
}

/** Clé « lundi de la semaine » (naïve-UTC) pour une date locale (y, m 1-based, d). */
function mondayKey(y: number, m: number, d: number): number {
  const date = new Date(Date.UTC(y, m - 1, d))
  const weekday = date.getUTCDay() // 0 = dimanche … 6 = samedi
  const deltaToMonday = (weekday + 6) % 7 // lundi = 0
  date.setUTCDate(date.getUTCDate() - deltaToMonday)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** Clé naïve-UTC tronquée à la granularité pour un timestamp. */
function bucketKey(ts: number, granularity: Granularity): number {
  const { y, m, d, h, min } = parisYmdHm(ts)
  switch (granularity) {
    case 'tenmin':
      return Date.UTC(y, m - 1, d, h, Math.floor(min / 10) * 10)
    case 'hour':
      return Date.UTC(y, m - 1, d, h)
    case 'day':
      return Date.UTC(y, m - 1, d)
    case 'week':
      return mondayKey(y, m, d)
    case 'month':
      return Date.UTC(y, m - 1, 1)
  }
}

/** Énumère toutes les clés de `minKey` à `maxKey` au pas nominal (gap-fill). */
function enumerateKeys(minKey: number, maxKey: number, granularity: Granularity): number[] {
  const keys: number[] = []
  if (granularity === 'month') {
    const cursor = new Date(minKey)
    let y = cursor.getUTCFullYear()
    let mo = cursor.getUTCMonth() // 0-based
    let key = Date.UTC(y, mo, 1)
    while (key <= maxKey) {
      keys.push(key)
      mo += 1
      if (mo > 11) {
        mo = 0
        y += 1
      }
      key = Date.UTC(y, mo, 1)
    }
    return keys
  }
  const step = granularity === 'tenmin' ? TENMIN_MS : granularity === 'hour' ? HOUR_MS : granularity === 'day' ? DAY_MS : 7 * DAY_MS
  for (let key = minKey; key <= maxKey; key += step) keys.push(key)
  return keys
}

function labelFor(key: number, granularity: Granularity): string {
  switch (granularity) {
    case 'tenmin':
      return tenminLabel(key) // "14h10"
    case 'hour':
      return hourLabel(key) // "14h"
    case 'day':
      return fmtDayLabel.format(new Date(key)) // "ven. 12"
    case 'week':
      return fmtDayMonth.format(new Date(key)) // "12 juin" (lundi)
    case 'month':
      return fmtMonthLabel.format(new Date(key)) // "juin"
  }
}

function fullLabelFor(key: number, granularity: Granularity): string {
  switch (granularity) {
    case 'tenmin':
      return `${fmtDayMonth.format(new Date(key))}, ${tenminLabel(key)}` // "12 juin, 14h10"
    case 'hour':
      return `${fmtDayMonth.format(new Date(key))}, ${hourLabel(key)}` // "12 juin, 14h"
    case 'day':
      return fmtDayFull.format(new Date(key)) // "vendredi 12 juin"
    case 'week':
      return `semaine du ${fmtDayMonth.format(new Date(key))}` // "semaine du 12 juin"
    case 'month':
      return fmtMonthFull.format(new Date(key)) // "juin 2026"
  }
}

/**
 * Choisit la granularité la plus lisible pour l'amplitude des données :
 *  - span < 2 j → heure ; < ~4 mois → jour ; < ~6 mois → semaine ; sinon mois.
 *  - Garde-fou densité : si la granularité produirait > 90 barres, passer d'un
 *    cran plus grossier (heure→jour→semaine→mois) jusqu'à ≤ 90 ou 'month'.
 *  - timestamps vide → 'jour'.
 */
export function pickAutoGranularity(timestamps: number[]): Granularity {
  if (timestamps.length === 0) return 'day'

  let min = Infinity
  let max = -Infinity
  for (const t of timestamps) {
    if (t < min) min = t
    if (t > max) max = t
  }
  const span = max - min

  let base: Granularity
  if (span < HOUR_SPAN) base = 'hour'
  else if (span < DAY_SPAN) base = 'day'
  else if (span < WEEK_SPAN) base = 'week'
  else base = 'month'

  let idx = ORDER.indexOf(base)
  while (idx < ORDER.length - 1 && bucketize(timestamps, ORDER[idx]).length > MAX_BUCKETS) {
    idx += 1
  }
  return ORDER[idx]
}

/**
 * Répartit les timestamps en buckets à pas constants (gap-fill à 0), triés
 * ascendant par `key`, avec `cumulative` en somme courante.
 */
export function bucketize(timestamps: number[], granularity: Granularity): PeakBucket[] {
  const counts = new Map<number, number>()
  for (const ts of timestamps) {
    const key = bucketKey(ts, granularity)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return []

  let minKey = Infinity
  let maxKey = -Infinity
  for (const key of counts.keys()) {
    if (key < minKey) minKey = key
    if (key > maxKey) maxKey = key
  }

  let cumulative = 0
  return enumerateKeys(minKey, maxKey, granularity).map(key => {
    const count = counts.get(key) ?? 0
    cumulative += count
    return {
      key,
      label: labelFor(key, granularity),
      fullLabel: fullLabelFor(key, granularity),
      count,
      cumulative,
    }
  })
}

/**
 * Bucket au `count` maximal (premier en cas d'égalité). `null` si la liste est
 * vide ou si tous les comptes valent 0.
 */
export function findPeak(buckets: PeakBucket[]): PeakBucket | null {
  let peak: PeakBucket | null = null
  for (const bucket of buckets) {
    if (peak === null || bucket.count > peak.count) peak = bucket
  }
  return peak && peak.count > 0 ? peak : null
}

// --- Formatage manuel 10 min (évite la variance ICU sur l'heure fr-FR) --------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** "14h10" pour une clé naïve-local (10 min). */
function tenminLabel(key: number): string {
  const d = new Date(key)
  return `${pad2(d.getUTCHours())}h${pad2(d.getUTCMinutes())}`
}

/** "14h" pour une clé naïve-local (heure pleine). */
function hourLabel(key: number): string {
  return `${pad2(new Date(key).getUTCHours())}h`
}

// --- Modèle fenêtre / preset / granularité (contrat « Lib client ») ----------

export type Preset = 'all' | 'month' | 'week' | 'day' | 'hour'

export const PRESET_LABELS: Record<Preset, string> = {
  all: 'Tout',
  month: 'Mois',
  week: 'Semaine',
  day: 'Jour',
  hour: 'Heure',
}

export interface Extent {
  /** ms naïf-local (heure de Paris traitée comme UTC). */
  from: number
  to: number
}

/** Clé naïve-UTC tronquée à la granularité pour un timestamp naïve-local (ms). */
function floorNaiveKey(naiveMs: number, granularity: Granularity): number {
  const date = new Date(naiveMs)
  const y = date.getUTCFullYear()
  const mo = date.getUTCMonth() // 0-based
  const d = date.getUTCDate()
  const h = date.getUTCHours()
  const min = date.getUTCMinutes()
  switch (granularity) {
    case 'tenmin':
      return Date.UTC(y, mo, d, h, Math.floor(min / 10) * 10)
    case 'hour':
      return Date.UTC(y, mo, d, h)
    case 'day':
      return Date.UTC(y, mo, d)
    case 'week':
      return mondayKey(y, mo + 1, d)
    case 'month':
      return Date.UTC(y, mo, 1)
  }
}

/**
 * Convertit un epoch ms RÉEL en ms « naïf-local » : mêmes composantes Paris que
 * les clés de bucket, mais au pas minute (Date.UTC(y, m-1, d, h, min)).
 */
export function toNaiveLocal(realEpochMs: number): number {
  const { y, m, d, h, min } = parisYmdHm(realEpochMs)
  return Date.UTC(y, m - 1, d, h, min)
}

/**
 * Extent naïf-local couvrant tout l'événement, ARRONDI AUX JOURS ENTIERS :
 * début = minuit du jour d'ouverture (`opensAt` uniquement — `createdAt` est
 * conservé dans le type mais ignoré) ; fin = minuit du lendemain du dernier
 * jour (`endDate`, repli dernier timestamp, repli début + 1 jour). Garantit
 * `to > from`.
 */
export function eventExtent(input: {
  opensAt: string | null
  createdAt: string
  endDate: string | null
  localTimestamps: number[]
}): Extent {
  // Base de début : opensAt prioritaire ; repli createdAt (un événement publié
  // peut avoir opensAt null = « ouvert immédiatement »). Repli ultime : 1re résa, sinon 0.
  const startSrc = input.opensAt && input.opensAt !== '' ? input.opensAt : input.createdAt
  let baseFrom: number
  if (startSrc && startSrc !== '') {
    baseFrom = toNaiveLocal(new Date(startSrc).getTime())
  } else if (input.localTimestamps.length > 0) {
    let min = Infinity
    for (const t of input.localTimestamps) if (t < min) min = t
    baseFrom = min
  } else {
    baseFrom = 0
  }
  // Base de fin : endDate prioritaire, repli max(localTimestamps), sinon début + 1 j.
  let baseTo: number
  if (input.endDate !== null && input.endDate !== '') {
    baseTo = toNaiveLocal(new Date(input.endDate).getTime())
  } else if (input.localTimestamps.length > 0) {
    let max = -Infinity
    for (const t of input.localTimestamps) if (t > max) max = t
    baseTo = max
  } else {
    baseTo = baseFrom + DAY_MS
  }
  // Arrondi jours entiers : minuit du jour de début ; minuit du lendemain du dernier jour.
  const from = floorNaiveKey(baseFrom, 'day')
  let to = floorNaiveKey(baseTo, 'day') + DAY_MS
  if (!(to > from)) to = from + DAY_MS
  return { from, to }
}

/** Granularité adaptée à la largeur d'une fenêtre (span en ms naïf-local). */
export function granularityForSpan(spanMs: number): Granularity {
  if (spanMs <= SPAN_TENMIN) return 'tenmin'
  if (spanMs <= SPAN_HOUR) return 'hour'
  if (spanMs <= SPAN_DAY) return 'day'
  if (spanMs <= SPAN_WEEK) return 'week'
  return 'month'
}

/** Pas (ms) d'un bucket pour une granularité — sert au rembourrage du domaine X. */
export function stepFor(granularity: Granularity): number {
  switch (granularity) {
    case 'tenmin': return TENMIN_MS
    case 'hour': return HOUR_MS
    case 'day': return DAY_MS
    case 'week': return 7 * DAY_MS
    case 'month': return 30 * DAY_MS
  }
}

/**
 * Fenêtre par défaut (au chargement) : encadre TOUTE l'activité (1re → dernière
 * réservation) + marge, clampée dans l'extent. `alignGran` (optionnel) cale les
 * bords sur la grille du panorama → le slide englobe les barres d'aperçu entières.
 */
export function defaultWindow(extent: Extent, localTimestamps: number[], alignGran?: Granularity): Extent {
  if (localTimestamps.length === 0) return { ...extent }
  let min = Infinity
  let max = -Infinity
  for (const t of localTimestamps) {
    if (t < min) min = t
    if (t > max) max = t
  }
  const margin = Math.max((max - min) * 0.15, HOUR_MS / 2)
  let from = min - margin
  let to = max + margin
  // Fenêtre minimale lisible (≥ 1 h) si activité quasi ponctuelle.
  if (to - from < HOUR_MS) {
    const mid = (min + max) / 2
    from = mid - HOUR_MS / 2
    to = mid + HOUR_MS / 2
  }
  // Aligner les bords sur une grille : `alignGran` (granularité du panorama) si
  // fourni — le slide englobe alors ENTIÈREMENT chaque barre d'aperçu active
  // (plus de barre coupée) ; sinon, granularité de la fenêtre.
  const gran = alignGran ?? granularityForSpan(to - from)
  from = floorNaiveKey(from, gran)
  const toFloor = floorNaiveKey(to, gran)
  if (toFloor < to) {
    if (gran === 'month') {
      const d = new Date(toFloor)
      to = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    } else {
      to = toFloor + stepFor(gran)
    }
  } else {
    to = toFloor
  }
  if (from < extent.from) from = extent.from
  if (to > extent.to) to = extent.to
  if (!(to > from)) return { ...extent }
  return { from, to }
}

/**
 * Fenêtre observée pour un preset, CALÉE SUR LE CALENDRIER et positionnée sur
 * la période CONTENANT LE PIC d'inscriptions (bucket le plus dense), puis
 * clamée dans l'extent (⊆). 'all' → extent.
 *
 * Calage calendaire : Heure = hh:00→hh:59 ; Jour = minuit→minuit (24 h) ;
 * Semaine = lundi→dimanche ; Mois = 1ᵉʳ→dernier jour du mois. Si la période
 * calendaire déborde de l'extent, on rogne ce côté à la borne de l'extent.
 */
export function presetWindow(
  preset: Preset,
  extent: Extent,
  localTimestamps: number[],
): Extent {
  if (preset === 'all') return { ...extent }

  // Granularité de recherche du pic-ancre selon le preset.
  const searchGran: Granularity =
    preset === 'hour' ? 'tenmin' : preset === 'day' ? 'hour' : 'day' // week & month → 'day'

  // Ancre = clé de bucket la plus dense (1ʳᵉ en cas d'égalité) parmi les ts dans l'extent.
  const counts = new Map<number, number>()
  for (const t of localTimestamps) {
    if (t < extent.from || t > extent.to) continue
    const k = floorNaiveKey(t, searchGran)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let anchor = extent.to // repli (aucune activité) : borne de fin de l'extent
  if (counts.size > 0) {
    let best = -1
    let bestKey = Infinity
    for (const [k, c] of counts) {
      if (c > best || (c === best && k < bestKey)) {
        best = c
        bestKey = k
      }
    }
    anchor = bestKey
  }

  // Période calendaire CONTENANT l'ancre.
  let from: number
  let to: number
  if (preset === 'hour') {
    from = floorNaiveKey(anchor, 'hour')
    to = from + HOUR_MS
  } else if (preset === 'day') {
    from = floorNaiveKey(anchor, 'day')
    to = from + DAY_MS
  } else if (preset === 'week') {
    from = floorNaiveKey(anchor, 'week')
    to = from + 7 * DAY_MS
  } else {
    // 'month' : 1ᵉʳ du mois contenant l'ancre → début du mois suivant.
    from = floorNaiveKey(anchor, 'month')
    to = floorNaiveKey(from + 32 * DAY_MS, 'month')
  }

  // Clamp ⊆ extent : si la période calendaire déborde, on rogne à la borne.
  from = Math.max(from, extent.from)
  to = Math.min(to, extent.to)
  if (!(to > from)) return { ...extent }
  return { from, to }
}

/**
 * Plus petit preset dont la largeur contient l'amplitude d'activité (max-min
 * des localTimestamps ; 0 si un seul). Liste vide → 'all'.
 */
export function pickAutoPreset(extent: Extent, localTimestamps: number[]): Preset {
  // L'auto-preset ne dépend que de l'amplitude d'activité ; `extent` est gardé
  // pour l'homogénéité de la signature du contrat.
  void extent
  if (localTimestamps.length === 0) return 'all'
  let min = Infinity
  let max = -Infinity
  for (const t of localTimestamps) {
    if (t < min) min = t
    if (t > max) max = t
  }
  const amp = localTimestamps.length >= 2 ? max - min : 0
  if (amp <= HOUR_MS) return 'hour'
  if (amp <= DAY_MS) return 'day'
  if (amp <= 7 * DAY_MS) return 'week'
  if (amp <= 31 * DAY_MS) return 'month'
  return 'all'
}

/**
 * Comme `bucketize` mais borné à une fenêtre [from, to] (ms naïf-local) :
 * premier bucket = borne naturelle <= from, dernier <= to ; gap-fill à 0,
 * cumulative, tri asc. Ne compte que les localTimestamps dans [from, to].
 */
export function bucketizeRange(
  localTimestamps: number[],
  from: number,
  to: number,
  granularity: Granularity,
): PeakBucket[] {
  const counts = new Map<number, number>()
  for (const ts of localTimestamps) {
    if (ts < from || ts > to) continue
    const key = floorNaiveKey(ts, granularity)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const startKey = floorNaiveKey(from, granularity)
  const endKey = floorNaiveKey(to, granularity)
  let cumulative = 0
  return enumerateKeys(startKey, endKey, granularity).map(key => {
    const count = counts.get(key) ?? 0
    cumulative += count
    return {
      key,
      label: labelFor(key, granularity),
      fullLabel: fullLabelFor(key, granularity),
      count,
      cumulative,
    }
  })
}

/**
 * Aire cumulative (vue « Total ») : comme `bucketizeRange` sur [from, to], mais le
 * `cumulative` est GLOBAL — il inclut les réservations ANTÉRIEURES à `from` (offset).
 * L'offset compte tous les `localTimestamps < from` SANS supposer la liste triée
 * (pas de court-circuit) → robuste au repli DST naïf-local. Le cumul étant global,
 * il est indépendant de la plage : repos et glisser rendent la même courbe.
 */
export function cumulativeAreaBuckets(
  localTimestamps: number[],
  from: number,
  to: number,
  granularity: Granularity,
): PeakBucket[] {
  const buckets = bucketizeRange(localTimestamps, from, to, granularity)
  let offset = 0
  for (const t of localTimestamps) if (t < from) offset++
  return offset === 0 ? buckets : buckets.map(b => ({ ...b, cumulative: b.cumulative + offset }))
}

/**
 * ~6 à 12 graduations alignées sur des bornes naturelles de la granularité
 * (heures pleines, minuits, lundis, 1ers du mois) couvrant [from, to].
 * Échantillonne si les bornes naturelles sont trop nombreuses.
 */
export function ticksForWindow(from: number, to: number, granularity: Granularity): number[] {
  const startKey = floorNaiveKey(from, granularity)
  const endKey = floorNaiveKey(to, granularity)
  const all = enumerateKeys(startKey, endKey, granularity).filter(k => k >= from && k <= to)
  if (all.length <= 12) return all
  const stride = Math.ceil(all.length / 12)
  return all.filter((_, i) => i % stride === 0)
}

/** Libellé d'axe court FR pour une position naïve-local (ex. '14h10', '14h', 'lun. 22'). */
export function formatAxisTick(naiveMs: number, granularity: Granularity): string {
  return labelFor(floorNaiveKey(naiveMs, granularity), granularity)
}

/** Libellé complet FR pour une position naïve-local (ex. '12 juin, 14h10'). */
export function formatFull(naiveMs: number, granularity: Granularity): string {
  return fullLabelFor(floorNaiveKey(naiveMs, granularity), granularity)
}

/** Libellé court « jour mois » FR d'une borne d'extent (naïve-local). Ex. « 12 juin ». */
export function formatDayMonth(naiveMs: number): string {
  return fmtDayMonth.format(new Date(naiveMs))
}

/**
 * Durée humaine FR d'un bucket de granularité, pour contextualiser un compte
 * (ex. « 9 réservations en une heure »). tenmin → « 10 min », les autres au
 * singulier naturel (« une heure », « un jour », « une semaine », « un mois »).
 */
export function bucketDurationLabel(granularity: Granularity): string {
  switch (granularity) {
    case 'tenmin': return '10 min'
    case 'hour': return 'une heure'
    case 'day': return 'un jour'
    case 'week': return 'une semaine'
    case 'month': return 'un mois'
  }
}

/**
 * UN libellé humain pour la fenêtre visible (affiché une seule fois sous le
 * brush). La granularité correspond à la largeur de la fenêtre (cf.
 * `granularityForSpan`) : tenmin (~1 h) → « 22 juin, 14h–15h » ; hour (~1 j) →
 * « lundi 22 juin » ; day/week/month (multi-jours) → « 15 – 21 juin ».
 */
export function formatWindowLabel(from: number, to: number, granularity: Granularity): string {
  switch (granularity) {
    case 'tenmin':
      return `${fmtDayMonth.format(new Date(from))}, ${hourLabel(from)}–${hourLabel(to)}`
    case 'hour':
      return fmtDayFull.format(new Date(from))
    case 'day':
    case 'week':
    case 'month':
      return formatDayMonthRange(from, to)
  }
}

/**
 * Plage « jour mois » d'une fenêtre multi-jours [from, to[. Compacte (« 15 – 21
 * juin ») quand les deux bornes partagent mois + année ; sinon « 29 juin –
 * 5 juillet ». Journée unique → « 15 juin ».
 */
function formatDayMonthRange(from: number, to: number): string {
  const start = new Date(from)
  const end = new Date(to - DAY_MS)
  if (start.getTime() === end.getTime()) return fmtDayMonth.format(start)
  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()} – ${end.getUTCDate()} ${fmtMonthLabel.format(end)}`
  }
  return `${fmtDayMonth.format(start)} – ${fmtDayMonth.format(end)}`
}
