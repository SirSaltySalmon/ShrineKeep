"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export interface DateRangeFilterProps {
  fromDate: string
  toDate: string
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  onReset?: () => void
  /** Optional class for the wrapper. */
  className?: string
}

/** Two date inputs (From / To) for graph date range. Uses theme Background and Foreground. */
export function DateRangeFilter({
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onReset,
  className,
}: DateRangeFilterProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="date-range-from" className="text-fluid-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="date-range-from"
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            className="h-9 bg-background text-foreground border-border min-w-[140px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date-range-to" className="text-fluid-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="date-range-to"
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            className="h-9 bg-background text-foreground border-border min-w-[140px]"
          />
        </div>
        {onReset && (
          <Button type="button" variant="ghost" size="sm" onClick={onReset} className="shrink-0">
            Reset range
          </Button>
        )}
      </div>
    </div>
  )
}
