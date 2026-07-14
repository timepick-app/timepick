import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Toutes les props natives de `<input>` sont acceptées (via `extends
 * InputHTMLAttributes`) et transmises à l'input range caché (`...rest`).
 * `type`, `onChange` et `value` sont exclus car gérés en interne.
 */
export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> {
  /** Valeur courante (contrôlée). */
  value: number
  /** Callback appelé à chaque déplacement — reçoit la valeur numérique. */
  onValueChange: (value: number) => void
  min?: number
  max?: number
}

/**
 * Slider
 *
 * Track `bg-muted` + fill `bg-primary` + thumb rond + `<input type="range">`
 * natif transparent en overlay (pattern shadcn-admin, zéro dépendance externe).
 *
 * @example
 * <Slider
 *   min={10} max={120} step={10}
 *   value={seconds}
 *   onValueChange={setSeconds}
 *   id="polling-interval"
 *   aria-describedby="polling-description"
 * />
 */
const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      min = 0,
      max = 100,
      step = 1,
      value,
      onValueChange,
      disabled,
      id,
      className,
      ...rest
    },
    ref
  ) => {
    const pct = max === min ? 0 : ((value - min) / (max - min)) * 100

    return (
      <div className={cn("relative flex h-5 w-full items-center", className)}>
        {/* Track */}
        <div className="relative h-1.5 w-full rounded-full bg-muted">
          {/* Fill */}
          <div
            className="absolute h-full rounded-full bg-primary transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className="pointer-events-none absolute size-4 -translate-x-1/2 rounded-full border border-primary bg-background shadow-sm"
          style={{ left: `${pct}%` }}
        />

        {/* Input natif transparent — capture toute l'interaction */}
        <input
          ref={ref}
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onValueChange(Number(e.target.value))}
          disabled={disabled}
          className="absolute inset-0 h-5 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...rest}
        />
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
