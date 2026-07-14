import { useCallback, useEffect, useRef, useState } from 'react'

interface UseCompactModeOptions {
  /** Tolerance in px to avoid flickering at the boundary (default: 2) */
  tolerance?: number
  /**
   * CSS selector for the "content" element to measure.
   * If omitted, measures the container itself (ref element).
   * The target element MUST be inline-flex (or inline-block) so its
   * scrollWidth reflects its true natural content width.
   */
  contentSelector?: string
}

/**
 * Detects when a container's content overflows and returns a `compact` flag.
 *
 * Uses a callback ref so measurement fires the moment the DOM node attaches —
 * this matters when an ancestor delays mounting (e.g. an auth gate). A
 * ResizeObserver then keeps `compact` in sync as the layout changes.
 *
 * The "natural width" is captured the first time the content has a non-zero
 * size — measuring while the element is hidden (display:none ancestor) would
 * lock in `0` and disable the compact-mode bascule forever.
 *
 * Constraints:
 * - The ref element's width must be determined by its PARENT layout,
 *   not by its own children. Otherwise recovery from compact mode may fail.
 * - The `contentSelector` target must be `inline-flex` (or `inline-block`)
 *   so `scrollWidth` reflects the true natural content width.
 * - The ref element MUST carry both `overflow-hidden` (clips the over-wide
 *   measured target before `compact` flips) and `[contain:inline-size]`
 *   (Tailwind arbitrary class for CSS `contain: inline-size`) so its width is
 *   determined by its container and NOT by its content — without it, an ancestor
 *   grid/flex with `min-width: auto` lets the wrapper grow to the natural content
 *   width, the page overflows horizontally, and the compact switch never triggers.
 *   Keep that wrapper around the measured element ONLY — never around content
 *   panels: a full-width focusable control flush to the wrapper edge would have
 *   its focus ring clipped on the left/right (see EventFormPage / Drawbridge #44).
 *
 * @example
 * ```tsx
 * const { ref, compact, recalibrate } = useCompactMode<HTMLDivElement>({
 *   contentSelector: '[data-measure]',
 * })
 *
 * return (
   <div ref={ref} className="overflow-hidden [contain:inline-size]">
 *     <ToggleGroup data-measure className="inline-flex flex-nowrap ...">
 *       <ToggleGroupItem className={compact ? 'flex-col ...' : 'shrink-0 ...'}>
 *         <Icon /><span>{label}</span>
 *       </ToggleGroupItem>
 *     </ToggleGroup>
 *   </div>
 * )
 * ```
 */
export function useCompactMode<T extends HTMLElement = HTMLDivElement>(
  options: UseCompactModeOptions = {},
) {
  const containerRef = useRef<T | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const naturalWidthRef = useRef<number>(0)
  const measured = useRef(false)
  const [compact, setCompact] = useState(false)

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const measureAndCompare = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const { tolerance = 2, contentSelector } = optionsRef.current
    const measureTarget = contentSelector
      ? container.querySelector<HTMLElement>(contentSelector)
      : container
    if (!measureTarget) return

    if (!measured.current) {
      // While hidden (display:none ancestor) scrollWidth is 0; defer until
      // ResizeObserver fires with real dimensions.
      if (measureTarget.scrollWidth === 0) return
      naturalWidthRef.current = measureTarget.scrollWidth
      measured.current = true
    }

    // When a call site hides the wrapper itself (display:none) once compact
    // is on, the wrapper's clientWidth is 0 — fall back to the parent so we
    // can still detect "we now have room again" and unflip compact.
    const available =
      container.clientWidth || container.parentElement?.clientWidth || 0
    if (available === 0) return
    const nextCompact = available < naturalWidthRef.current - tolerance
    setCompact((prev) => (prev === nextCompact ? prev : nextCompact))
  }, [])

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      containerRef.current = node
      if (!node) return

      measureAndCompare()
      const observer = new ResizeObserver(measureAndCompare)
      observer.observe(node)
      // Also observe the parent — when compact mode hides the wrapper, its
      // own resize events stop firing, but the parent keeps responding to
      // viewport changes and tells us when there's room to unflip.
      if (node.parentElement) observer.observe(node.parentElement)
      observerRef.current = observer
    },
    [measureAndCompare],
  )

  useEffect(
    () => () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    },
    [],
  )

  /** Force re-measurement of natural content width. Call after content changes. */
  const recalibrate = useCallback(() => {
    measured.current = false
    measureAndCompare()
  }, [measureAndCompare])

  return { ref, compact, recalibrate }
}
