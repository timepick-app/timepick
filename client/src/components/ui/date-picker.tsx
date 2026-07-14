import * as React from "react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import type { Matcher } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface DatePickerProps {
  /** Date sélectionnée (`null` = aucune). */
  value: Date | null
  onChange: (date: Date | null) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  /** Bornes de sélection (jours hors plage désactivés dans la grille). */
  minDate?: Date
  maxDate?: Date
  /** `label` (chevrons, défaut) ou `dropdown` (sélecteurs mois/année). */
  captionLayout?: "label" | "dropdown"
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "data-testid"?: string
}

function buildDisabledMatcher(minDate?: Date, maxDate?: Date): Matcher | undefined {
  if (minDate && maxDate) return { before: minDate, after: maxDate }
  if (minDate) return { before: minDate }
  if (maxDate) return { after: maxDate }
  return undefined
}

/**
 * DatePicker — sélecteur de date DS (modèle shadcn-admin) : `Button` outline +
 * `Popover` + `Calendar`. Contrôlé via `value: Date | null` + `onChange`.
 * Remplace les `<input type="date">` natifs.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Choisir une date",
  disabled,
  id,
  className,
  minDate,
  maxDate,
  captionLayout = "label",
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
  "data-testid": dataTestid,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const dropdownBounds =
    captionLayout === "dropdown"
      ? {
          startMonth: new Date(new Date().getFullYear() - 5, 0),
          endMonth: new Date(new Date().getFullYear() + 5, 11),
        }
      : {}

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          id={id}
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          data-testid={dataTestid}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 opacity-70" />
          {value ? format(value, "d MMMM yyyy", { locale: fr }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(date) => {
            onChange(date ?? null)
            setOpen(false)
          }}
          defaultMonth={value ?? undefined}
          disabled={buildDisabledMatcher(minDate, maxDate)}
          captionLayout={captionLayout}
          autoFocus
          {...dropdownBounds}
        />
      </PopoverContent>
    </Popover>
  )
}
