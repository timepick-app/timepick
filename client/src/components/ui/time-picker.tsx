import * as React from "react"
import { Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface TimePickerProps {
  /** Heure au format `HH:mm`. */
  value: string
  onChange: (value: string) => void
  id?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
  className?: string
  size?: "default" | "sm"
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "data-testid"?: string
}

const pad = (n: number): string => n.toString().padStart(2, "0")

/** Clampe `value` dans `[0, max]` et formate sur 2 chiffres. */
function getValidNumber(value: string, max: number): string {
  let n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) n = 0
  if (n > max) n = max
  if (n < 0) n = 0
  return pad(n)
}

const HOURS: readonly number[] = Array.from({ length: 24 }, (_, i) => i)
const MINUTES: readonly number[] = Array.from({ length: 60 }, (_, i) => i)

const sizeClasses: Record<NonNullable<TimePickerProps["size"]>, string> = {
  default: "h-9",
  sm: "h-8",
}

/**
 * TimePicker — sélecteur d'heure DS : `Button` outline + `Popover` contenant
 * deux COLONNES défilantes (heures 00-23 / minutes 00-59). Les colonnes
 * réutilisent la grammaire visuelle du `Calendar` (retrait `p-3`, en-têtes gris
 * sans filet, pastilles `buttonVariants` ghost) pour une unité DS avec le
 * DatePicker. Contrôlé via `value` (`HH:mm`) + `onChange(value)`. Les colonnes
 * sont exposées via `TimeColumns`, intégrées par `DateTimePicker` à côté du
 * calendrier.
 */
export function TimePicker({
  value,
  onChange,
  id,
  disabled,
  required,
  placeholder = "Choisir une heure",
  className,
  size = "default",
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
  "data-testid": dataTestid,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  // Dans un Dialog (scroll-lock react-remove-scroll), porter le popover DANS le
  // dialog pour que les colonnes restent défilables (molette + tactile).
  const [container, setContainer] = React.useState<HTMLElement | null>(null)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null)
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          aria-required={required}
          data-testid={dataTestid}
          className={cn(
            "w-full justify-between gap-2 font-normal",
            !value && "text-muted-foreground",
            sizeClasses[size],
            className
          )}
        >
          {value || placeholder}
          <Clock className="size-4 shrink-0 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" container={container}>
        <TimeColumns value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}

export interface TimeColumnsProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Colonnes défilantes heures/minutes (sans popover), alignées sur la grammaire
 * du `Calendar`. Réutilisable inline, notamment par `DateTimePicker` à côté du
 * calendrier.
 */
export function TimeColumns({ value, onChange, disabled, className }: TimeColumnsProps) {
  const [rawHour, rawMinute] = (value || "00:00").split(":")
  const hour = getValidNumber(rawHour ?? "00", 23)
  const minute = getValidNumber(rawMinute ?? "00", 59)

  return (
    <div className={cn("flex gap-1 p-3", className)}>
      <TimeColumn
        label="Heures"
        options={HOURS}
        selected={Number.parseInt(hour, 10)}
        onSelect={(h) => onChange(`${pad(h)}:${minute}`)}
        disabled={disabled}
      />
      <TimeColumn
        label="Minutes"
        options={MINUTES}
        selected={Number.parseInt(minute, 10)}
        onSelect={(m) => onChange(`${hour}:${pad(m)}`)}
        disabled={disabled}
      />
    </div>
  )
}

interface TimeColumnProps {
  label: string
  options: readonly number[]
  selected: number
  onSelect: (value: number) => void
  disabled?: boolean
}

function TimeColumn({ label, options, selected, onSelect, disabled }: TimeColumnProps) {
  const selectedRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" })
  }, [selected])

  return (
    <div className="flex flex-col gap-2">
      <div className="select-none text-center text-[0.8rem] font-normal text-muted-foreground">
        {label}
      </div>
      <div
        role="listbox"
        aria-label={label}
        className="flex h-[244px] touch-pan-y flex-col items-center gap-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
      >
        {options.map((option) => {
          const isSelected = option === selected
          return (
            <button
              key={option}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={disabled}
              onClick={() => onSelect(option)}
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "h-8 w-10 shrink-0 p-0 font-normal",
                isSelected &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              )}
            >
              {pad(option)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
