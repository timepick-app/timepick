import { useState, useEffect, useCallback, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react-dom'
import type { Slot } from '@/types/slot'
import { formatSlotRange } from '@/lib/utils'
import { getSlotStatusDescriptor } from '@/lib/slotStatus'

// ============================================================================
// Constants
// ============================================================================

/** Délai avant apparition du tooltip (AC3) */
const TOOLTIP_DELAY_MS = 300

/** Marge de collision par rapport aux bords d'écran, en px (shift middleware) */
const VIEWPORT_MARGIN = 16

// ============================================================================
// Types
// ============================================================================

/** Données pour le tooltip d'un créneau */
interface SlotTooltipData {
  mode: 'slot'
  slot: Slot
  isBooked?: boolean
}

export type CalendarTooltipData = SlotTooltipData

/** Props pour le composant CalendarTooltip */
export interface CalendarTooltipProps {
  /** Données à afficher dans le tooltip */
  data: CalendarTooltipData | null
  /** Élément cible pour le positionnement */
  targetElement: HTMLElement | null
  /** Visibilité du tooltip */
  visible: boolean
  /** Callback pour fermer le tooltip */
  onClose?: () => void
  /** ID unique pour aria-describedby (accessibilité) */
  id?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Génère le contenu du tooltip pour un créneau
 */
function formatSlotContent(data: SlotTooltipData): { title: string; description: string } {
  const { slot } = data

  // Plage du créneau via le formateur canonique : mono-jour « 09h00 → 11h00 »,
  // multi-jours « du … au … ». Séparateur flèche (convention DS des plages horaires).
  const title = formatSlotRange(slot.startTime, slot.endTime)

  // Le statut est rendu en texte nu dans le composant (descriptor.bannerLabel
  // + ton discret via getSlotStatusTone) ; la description ne porte que le texte
  // libre du créneau, s'il existe.
  return { title, description: slot.description ?? '' }
}

// ============================================================================
// Component
// ============================================================================

/**
 * CalendarTooltip - Tooltip portal pour le calendrier public
 *
 * Story 19.6: Tooltips au survol des créneaux
 *
 * Fonctionnalités:
 * - AC3: Délai de 300ms avant apparition
 * - AC4: Disparition quand la souris quitte
 * - AC5: Positionnement intelligent (évite les bords)
 * - AC6: Accessible au clavier (ESC pour fermer)
 * - Support touch via long-press (géré par le parent)
 *
 * @param props - Les props du composant
 * @returns Le tooltip rendu via Portal
 */
export function CalendarTooltip({
  data,
  targetElement,
  visible,
  onClose,
  id = 'calendar-tooltip',
}: CalendarTooltipProps): JSX.Element | null {
  const [delayElapsed, setDelayElapsed] = useState(false)
  const [floatingEl, setFloatingEl] = useState<HTMLElement | null>(null)
  const { floatingStyles, placement } = useFloating({
    placement: 'top',
    strategy: 'fixed',
    middleware: [offset(8), flip(), shift({ padding: VIEWPORT_MARGIN })],
    whileElementsMounted: autoUpdate,
    elements: { reference: targetElement, floating: floatingEl },
  })

  // AC3 : apparition différée de 300ms. Le setState est posé dans le callback du
  // timer (asynchrone), jamais dans le corps de l'effet, pour éviter un rendu en
  // cascade (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!visible || !targetElement) return
    const timer = setTimeout(() => setDelayElapsed(true), TOOLTIP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [visible, targetElement])

  // Ré-arme le délai à la fermeture (visible -> false) pour réimposer les 300ms à
  // la prochaine ouverture. Reset porté par le cleanup (jamais le corps de l'effet)
  // et clé sur `visible` seul : un changement de cible alors que le tooltip reste
  // visible ne doit pas le faire clignoter ni relancer le délai.
  useEffect(() => {
    if (!visible) return
    return () => setDelayElapsed(false)
  }, [visible])

  // Affichage effectif : délai écoulé ET visible sur une cible. Dérivé au rendu,
  // donc la disparition est immédiate quand `visible` repasse à false.
  const isShown = delayElapsed && visible && targetElement !== null

  // AC6: Gérer ESC pour fermer
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isShown) {
        onClose?.()
      }
    },
    [isShown, onClose]
  )

  useEffect(() => {
    if (isShown) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isShown, handleKeyDown])

  // Ne rien rendre tant que le tooltip n'est pas affiché ou sans données
  if (!isShown || !data) return null

  const { title, description } = formatSlotContent(data)

  // Statut : badge compact coloré (palette sémantique de slotStatus, icône +
  // libellé riche). Audience grand public → le signal couleur est conservé,
  // contrairement au popover admin (texte nu terse).
  const descriptor = getSlotStatusDescriptor(data.slot, { hasBooked: data.isBooked })
  const StatusIcon = descriptor.Icon

  const slideClass = placement.startsWith('top') ? 'slide-in-from-top-[10px]' : 'slide-in-from-bottom-[10px]'

  // Positionnement (transform Floating UI) sur la div externe ; animation (transform du
  // keyframe slide-in) sur la div interne — ne pas fusionner les deux (conflit de transform).
  return createPortal(
    <div
      ref={setFloatingEl}
      className="z-50 pointer-events-none"
      style={floatingStyles}
    >
      <div
        role="tooltip"
        id={id}
        className={`animate-in fade-in-0 ${slideClass} duration-150 bg-popover text-popover-foreground border rounded-lg px-3 py-2 text-sm shadow-lg max-w-xs`}
      >
        {/* ① Identité du créneau (description) ; fallback : horaire en titre */}
        <div className="text-sm font-semibold leading-snug break-words">
          {description || title}
        </div>
        {/* ② Plage horaire (secondaire) — masquée si elle sert déjà de titre */}
        {description && (
          <div className="mt-0.5 text-sm text-muted-foreground">{title}</div>
        )}
        {/* ③ Statut — badge compact coloré (icône + libellé riche) */}
        <div className="mt-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${descriptor.classes.surface}`}
          >
            <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${descriptor.classes.icon}`} aria-hidden="true" />
            {descriptor.bannerLabel}
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}

