import * as React from "react"
import { format, setHours, setMilliseconds, setMinutes, setSeconds } from "date-fns"
import { fr } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import type { Matcher } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { TimeColumns } from "@/components/ui/time-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface DateTimePickerProps {
  /** Date + heure sélectionnée (`null` = aucune). */
  value: Date | null
  onChange: (date: Date | null) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  /** Jours antérieurs désactivés dans la grille. */
  minDate?: Date
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "data-testid"?: string
  /** Format de date compact (mois abrégé) pour les contextes étroits (2 colonnes). */
  compact?: boolean
}

const pad = (n: number): string => String(n).padStart(2, "0")
const toTimeString = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`

function withTime(base: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number)
  return setMilliseconds(setSeconds(setMinutes(setHours(base, hours || 0), minutes || 0), 0), 0)
}

/**
 * DateTimePicker — variante combinée date + heure dans un SEUL popover
 * (`Calendar` + `TimePicker` séparés par une bordure). Modèle shadcn officiel
 * (`date-picker-time` : Calendar + `<input type="time">`). Contrôlé via
 * `value: Date | null` + `onChange`. Remplace les `<input type="datetime-local">`.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder = "Choisir date et heure",
  disabled,
  id,
  className,
  minDate,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
  "data-testid": dataTestid,
  compact = false,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  // Dans un Dialog (scroll-lock react-remove-scroll), porter le popover DANS le
  // dialog pour que les colonnes d'heure restent défilables (molette + tactile).
  const [container, setContainer] = React.useState<HTMLElement | null>(null)
  const timeValue = value ? toTimeString(value) : "00:00"
  const disabledMatcher: Matcher | undefined = minDate ? { before: minDate } : undefined

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      onChange(null)
      return
    }
    onChange(withTime(date, timeValue))
  }

  const handleTimeChange = (time: string) => {
    onChange(withTime(value ?? new Date(), time))
  }

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
          data-testid={dataTestid}
          className={cn(
            "w-full min-w-0 justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">
            {value
              ? format(value, compact ? "d MMM yyyy 'à' HH:mm" : "d MMMM yyyy 'à' HH:mm", { locale: fr })
              : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" container={container}>
        <div className="flex divide-x">
          <Calendar
            mode="single"
            selected={value ?? undefined}
            onSelect={handleDateSelect}
            defaultMonth={value ?? undefined}
            disabled={disabledMatcher}
            autoFocus
          />
          <TimeColumns value={timeValue} onChange={handleTimeChange} disabled={disabled} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
