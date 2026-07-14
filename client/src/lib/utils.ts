import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'
import { addDays, differenceInCalendarDays, differenceInMinutes, eachDayOfInterval, format, isEqual, isSameDay, isSameMonth, parseISO, startOfDay, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'

/**
 * Custom tailwind-merge with extended class groups
 * ==================================================
 *
 * WHY THIS EXTENSION IS NECESSARY:
 * ---------------------------------
 * Tailwind-merge is a library that intelligently merges Tailwind CSS classes.
 * It knows that text-red-500 and text-blue-500 conflict (both are text colors),
 * so it keeps only the last one when merging: cn('text-red-500 text-blue-500') = 'text-blue-500'
 *
 * However, tailwind-merge does NOT know about our custom font-size classes
 * (text-h1, text-body, etc.). Without this extension:
 *
 *   cn('text-h1 text-foreground') would produce 'text-foreground' (WRONG!)
 *
 * Why? Because tailwind-merge thinks text-h1 is a text-color class (since it
 * starts with 'text-'), and text-foreground is also a text-color class.
 * So it treats them as conflicting and keeps only the last one.
 *
 * This extension tells tailwind-merge that text-h1, text-body, etc. are
 * FONT-SIZE classes, not text-color classes. Now:
 *
 *   cn('text-h1 text-foreground') produces 'text-h1 text-foreground' (CORRECT!)
 *
 * HOW IT WORKS:
 * -------------
 * We extend tailwind-merge's classGroups with a 'font-size' group containing
 * our custom classes. When tailwind-merge sees these classes, it knows they
 * belong to the font-size group and won't conflict with text-color classes.
 *
 * HOW TO ADD NEW FONT-SIZE CLASSES:
 * ---------------------------------
 * When adding a new font size (e.g., 'text-new-size'), add it to the array below:
 *
 *   'font-size': [
 *     'text-h1', 'text-h2', ..., 'text-new-size'  // <-- Add here
 *   ]
 *
 * THE COMPLETE 5-FILE UPDATE CHECKLIST:
 * -------------------------------------
 * When adding a new font size, update ALL 5 files:
 *
 * 1. index.css - Define the CSS variable
 *    --font-size-new: clamp(min, preferred, max);
 *
 * 2. tailwind.config.js - Add the fontSize mapping
 *    'new-size': ['var(--font-size-new)', { lineHeight: '...' }]
 *
 * 3. typography.tsx - Add to typographyVariants, elementMap, defaultWeightMap
 *    variant: { "new-size": "text-new-size" }
 *
 * 4. utils.ts (THIS FILE) - Add to the font-size array below
 *    'text-new-size'
 *
 * 5. DesignSystem.tsx - Update documentation (optional)
 *
 * WARNING: Skipping step 4 (this file) will cause mysterious bugs where
 * your new font-size class gets removed when combined with text-color classes!
 */
const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // Custom font-size classes that use CSS variables from index.css
      // IMPORTANT: Add new font-size classes here to prevent conflicts with text-color classes
      'font-size': [
        'text-h1', 'text-h2', 'text-h3', 'text-h4', 'text-h5', 'text-h6',
        'text-body', 'text-body-lg', 'text-body-sm', 'text-body-xs', 'text-field'
      ]
    }
  }
})

/**
 * Utility function to merge Tailwind CSS classes with clsx
 * Handles conditional classes and removes conflicts
 */
export const cn = (...inputs: ClassValue[]) => {
  return customTwMerge(clsx(inputs))
}

/**
 * Formate une plage horaire au format français compact (ex: "22h00 → 23h00 | 0/3")
 * Utilise le séparateur 'h' à la française au lieu des deux-points
 *
 * @param startTime - Date de début ISO 8601
 * @param endTime - Date de fin ISO 8601
 * @param currentBookings - Nombre de réservations actuelles (optionnel)
 * @param capacity - Capacité totale (optionnel)
 * @returns Chaîne formatée (ex: "22h00 → 23h00 | 0/3" ou "22h00 → 23h00" sans capacité)
 */
export function formatTimeRangeFrench(
  startTime: string,
  endTime: string,
  currentBookings?: number,
  capacity?: number
): string {
  const start = new Date(startTime)
  const end = new Date(endTime)

  const timeRange = `${format(start, 'HH\'h\'mm', { locale: fr })} → ${format(end, 'HH\'h\'mm', { locale: fr })}`

  if (currentBookings !== undefined && capacity !== undefined) {
    return `${timeRange} | ${currentBookings}/${capacity}`
  }

  return timeRange
}

/**
 * Vérifie si un créneau est dans le passé
 * Un créneau est considéré comme passé quand l'heure actuelle est après l'heure de DÉBUT du créneau
 * Ex: Un créneau de 22h00-23h00 est passé à 22h01
 *
 * @param slot - Le créneau à vérifier
 * @returns true si le créneau est dans le passé, false sinon
 */
export function isSlotPast(slot: { startTime: string }): boolean {
  const slotStart = new Date(slot.startTime)
  const now = new Date()
  return slotStart < now
}

/**
 * Formate une durée en heures et minutes au format français
 * Affiche toujours les heures, même pour les durées inférieures à 1 heure
 *
 * @param startTime - Date de début ISO 8601
 * @param endTime - Date de fin ISO 8601
 * @returns Durée formatée (ex: "2h00", "1h30", "0h15")
 *
 * Exemples:
 * - 2h00 → 2 heures
 * - 1h30 → 1 heure 30 minutes
 * - 0h15 → 15 minutes (toujours affiché en format heures)
 */
function formatDurationFrench(startTime: string, endTime: string): string {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const totalMinutes = differenceInMinutes(end, start)

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  // Toujours afficher les heures, avec minutes sur 2 chiffres
  return `${hours}h${minutes.toString().padStart(2, '0')}`
}

/**
 * Interface pour le résultat du calcul de période
 */
export interface PeriodRange {
  startDate: Date
  endDate: Date
  formatted: string
}

/**
 * Calcule la plage de dates à partir d'un tableau de créneaux
 * Retourne null si le tableau est vide
 *
 * Formate la période selon les cas:
 * - Même jour: "15 mars 2026"
 * - Même mois: "Du 15 mars au 31 mars 2026"
 * - Mois différents: "Du 25 mars au 5 avril 2026"
 *
 * @param slots - Tableau de créneaux avec startTime ET endTime ; la date de fin dérive de max(endTime) (reflète les créneaux multi-jours, AR10/FR13)
 * @returns PeriodRange ou null si pas de créneaux
 */
export function calculatePeriodRange(slots: { startTime: string; endTime: string }[]): PeriodRange | null {
  if (slots.length === 0) return null

  // Trouver les dates min/max depuis les créneaux
  const startDate = new Date(Math.min(...slots.map(s => new Date(s.startTime).getTime())))
  const endDate = new Date(Math.max(...slots.map(s => new Date(s.endTime).getTime())))

  // Formatage selon la relation entre les dates
  let formatted: string
  const dayFormat = 'd MMMM yyyy'
  const monthFormat = 'd MMMM'

  if (isSameDay(startDate, endDate)) {
    // Même jour: "15 mars 2026"
    formatted = format(startDate, dayFormat, { locale: fr })
  } else if (isSameMonth(startDate, endDate)) {
    // Même mois: "Du 15 mars au 31 mars 2026"
    formatted = `Du ${format(startDate, monthFormat, { locale: fr })} au ${format(endDate, dayFormat, { locale: fr })}`
  } else {
    // Mois différents: "Du 25 mars au 5 avril 2026"
    formatted = `Du ${format(startDate, monthFormat, { locale: fr })} au ${format(endDate, dayFormat, { locale: fr })}`
  }

  return { startDate, endDate, formatted }
}

/**
 * Formate une plage de dates en format compact (ex: "08/03 – 21/03/26")
 * - Même jour: "02/04/26"
 * - Même année: "08/03 – 21/03/26"
 * - Années différentes: "28/12/25 – 03/01/26"
 * - Pas de dates: "—"
 */
export function formatPeriodCompact(periodStart: string | null, periodEnd: string | null): string {
  if (!periodStart || !periodEnd) return '—'

  const start = new Date(periodStart)
  const end = new Date(periodEnd)

  const fmt = (d: Date) => format(d, 'dd/MM', { locale: fr })
  const fmtY = (d: Date) => format(d, 'dd/MM/yy', { locale: fr })

  if (isSameDay(start, end)) {
    return fmtY(start)
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `${fmt(start)} – ${fmtY(end)}`
  }
  return `${fmtY(start)} – ${fmtY(end)}`
}

/**
 * Indique si un créneau s'étend sur plusieurs jours calendaires.
 *
 * Compare les jours calendaires **LOCAUX** via `isSameDay(parseISO(...))`
 * (NFR1, DST-safe). Ne JAMAIS comparer des timestamps UTC bruts
 * (`.toISOString().slice(0,10)`) : un span 23h→01h peut traverser minuit UTC
 * sans être multi-jours en local, et inversement à l'heure d'été.
 *
 * @param startISO - Date/heure de début (ISO 8601)
 * @param endISO - Date/heure de fin (ISO 8601)
 * @returns true si début et fin ne tombent pas le même jour calendaire local
 */
export function isMultiDaySlot(startISO: string, endISO: string): boolean {
  return !isSameDay(parseISO(startISO), parseISO(endISO))
}

/**
 * Formateur canonique de plage de créneau (source unique, réutilisée par le
 * formulaire, le tooltip, la fenêtre d'inscription et les e-mails).
 *
 * - Même jour → format compact « 09h00 → 11h00 » (cohérent avec
 *   `formatTimeRangeFrench`, locale fr).
 * - Multi-jours → format long « du <jour d MMM HHhmm> au <jour d MMM HHhmm> ».
 *
 * @param startISO - Date/heure de début (ISO 8601)
 * @param endISO - Date/heure de fin (ISO 8601)
 */
export function formatSlotRange(startISO: string, endISO: string): string {
  const start = parseISO(startISO)
  const end = parseISO(endISO)

  if (isSameDay(start, end)) {
    return `${format(start, 'HH\'h\'mm', { locale: fr })} → ${format(end, 'HH\'h\'mm', { locale: fr })}`
  }

  const longFormat = 'eee d MMM HH\'h\'mm'
  return `du ${format(start, longFormat, { locale: fr })} au ${format(end, longFormat, { locale: fr })}`
}

/**
 * Variante COMPACTE de `formatSlotRange`, dédiée à la **barre de calendrier**
 * multi-jours où la largeur de cellule est contrainte : la forme longue
 * « du <jour de semaine> d MMM HHhmm au … » déborde systématiquement et finit
 * en ellipsis. On retire le jour de semaine et le « du … au … » au profit d'une
 * flèche : « 13 juin 14h00 → 15 juin 14h00 ». La forme longue (jours de semaine
 * inclus) reste portée par le tooltip / les cartes / les dialogues, qui ne sont
 * pas contraints en largeur — d'où un formateur dédié plutôt qu'une mutation du
 * canonique `formatSlotRange`.
 *
 * - Même jour → identique à `formatSlotRange` (« 09h00 → 11h00 »).
 * - Multi-jours → « d MMM HHhmm → d MMM HHhmm » (sans jour de semaine).
 *
 * @param startISO - Date/heure de début (ISO 8601)
 * @param endISO - Date/heure de fin (ISO 8601)
 */
export function formatSlotRangeCompact(startISO: string, endISO: string): string {
  const start = parseISO(startISO)
  const end = parseISO(endISO)

  if (isSameDay(start, end)) {
    return `${format(start, 'HH\'h\'mm', { locale: fr })} → ${format(end, 'HH\'h\'mm', { locale: fr })}`
  }

  const compactFormat = 'd MMM HH\'h\'mm'
  return `${format(start, compactFormat, { locale: fr })} → ${format(end, compactFormat, { locale: fr })}`
}

/**
 * Fin **exclusive** (date locale `yyyy-MM-dd`) à passer à FullCalendar pour un
 * événement « toute la journée » couvrant `[startISO, endISO]`.
 *
 * FullCalendar rend un event all-day jusqu'à la **veille** de sa fin (fin
 * exclusive au jour) en IGNORANT l'heure : un créneau finissant le 18 à 17h
 * serait tronqué au 17 (dernier jour manquant — viole AC1, Story 1.2). On cale
 * donc la fin sur le **minuit LOCAL** suivant le dernier jour réellement occupé,
 * pour que la barre couvre le bon nombre de jours calendaires.
 *
 * - fin à une heure ≠ minuit local → dernier jour occupé = jour de fin
 *   → fin exclusive = jour de fin + 1
 * - fin à minuit local pile → dernier jour occupé = veille
 *   → fin exclusive = jour de fin (inchangé)
 *
 * Comparaison en TZ **locale** (DST-safe, `startOfDay`/`addDays` date-fns),
 * cohérente avec `isMultiDaySlot`. Le format date-only est interprété par
 * FullCalendar comme une date locale exclusive (cf. docs FC v6 « end »).
 *
 * @param endISO - Date/heure de fin du créneau (ISO 8601)
 */
export function getAllDayExclusiveEnd(endISO: string): string {
  const end = parseISO(endISO)
  const endMidnight = startOfDay(end)
  const exclusive = isEqual(end, endMidnight) ? endMidnight : addDays(endMidnight, 1)
  return format(exclusive, 'yyyy-MM-dd')
}

/**
 * Range chaque créneau dans le bucket `yyyy-MM-dd` de CHAQUE jour calendaire
 * LOCAL qu'il OCCUPE réellement. Un créneau multi-jours apparaît donc sur chacun
 * de ses jours, y compris ceux du milieu (FR8/FR10) ; un mono-jour reste dans
 * **exactement un** bucket (FR12). DST-safe : énumération en jours calendaires
 * locaux (`startOfDay`/`eachDayOfInterval` date-fns), cohérente avec
 * `isMultiDaySlot` (NFR1).
 *
 * Borne de fin = **dernier jour réellement occupé**, calculée exactement comme
 * `getAllDayExclusiveEnd` (Story 1.2) pour que le drawer couvre les MÊMES jours
 * que la barre : si `endTime` tombe pile à **minuit local**, le créneau n'occupe
 * pas ce jour (0 s) → dernier jour = la veille ; sinon → le jour de `endTime`.
 * (Sans cet alignement, un créneau de nuit finissant à 00:00 serait listé au
 * drawer d'un jour dépourvu de barre.) Borne clampée à `startOfDay(startTime)`
 * (créneau plein-jour / durée nulle).
 *
 * Le même objet `slot` est partagé (par référence) entre les buckets ; l'ordre
 * intra-jour suit l'ordre d'entrée de `slots` (ajout en fin de tableau).
 *
 * @param slots - Créneaux à regrouper (ISO 8601 sur `startTime`/`endTime`)
 */
export function buildSlotsByDate<T extends { startTime: string; endTime: string }>(
  slots: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const slot of slots) {
    const start = startOfDay(parseISO(slot.startTime))
    const end = parseISO(slot.endTime)
    const endMidnight = startOfDay(end)
    // Dernier jour OCCUPÉ, aligné sur getAllDayExclusiveEnd (Story 1.2) : à
    // minuit local pile, endTime n'occupe pas ce jour → veille. Clampé à `start`.
    let lastDay = isEqual(end, endMidnight) ? subDays(endMidnight, 1) : endMidnight
    if (lastDay.getTime() < start.getTime()) lastDay = start
    const days = eachDayOfInterval({ start, end: lastDay })
    for (const day of days) {
      const dateKey = format(day, 'yyyy-MM-dd')
      const bucket = grouped.get(dateKey)
      if (bucket) {
        bucket.push(slot)
      } else {
        grouped.set(dateKey, [slot])
      }
    }
  }
  return grouped
}

/**
 * Libellé de durée multi-jours-aware.
 *
 * - Même jour → durée horaire compacte (réutilise `formatDurationFrench`,
 *   ex. « 2h30 »).
 * - Multi-jours → nombre de jours calendaires **inclusifs** « N jours »
 *   (ex. 15→17 mars = « 3 jours »), via `differenceInCalendarDays` en TZ locale.
 *
 * @param startISO - Date/heure de début (ISO 8601)
 * @param endISO - Date/heure de fin (ISO 8601)
 */
export function formatSlotDuration(startISO: string, endISO: string): string {
  if (!isMultiDaySlot(startISO, endISO)) {
    return formatDurationFrench(startISO, endISO)
  }
  const days = differenceInCalendarDays(parseISO(endISO), parseISO(startISO)) + 1
  return `${days} jours`
}
