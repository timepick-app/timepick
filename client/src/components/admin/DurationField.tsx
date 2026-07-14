import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TimeUnit } from '@/lib/duration-utils'

const UNIT_LABELS: Record<TimeUnit, string> = {
  minutes: 'minutes',
  hours: 'heures',
  days: 'jours',
}

interface DurationFieldProps {
  value: string
  unit: TimeUnit
  units: TimeUnit[]
  onChange: (value: string, unit: TimeUnit) => void
  disabled: boolean
  id?: string
}

export const DurationField = ({ value, unit, units, onChange, disabled, id }: DurationFieldProps) => {
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value, unit)}
        disabled={disabled}
        className="w-24"
      />

      <Select
        value={unit}
        onValueChange={(newUnit) => onChange(value, newUnit as TimeUnit)}
        disabled={disabled}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {units.map((u) => (
            <SelectItem key={u} value={u}>
              {UNIT_LABELS[u]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
