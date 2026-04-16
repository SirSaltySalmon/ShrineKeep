"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export interface DateRangeFilterProps {
  fromDate: string
  toDate: string
  /** Called when the user clicks "Update range" with the current draft values. */
  onApplyRange: (from: string, to: string) => void
  onReset?: () => void
  className?: string
}

/** Two date inputs (From / To) for graph date range; apply with "Update range". */
export function DateRangeFilter({
  fromDate,
  toDate,
  onApplyRange,
  onReset,
  className,
}: DateRangeFilterProps) {
  const [draftFrom, setDraftFrom] = useState(fromDate)
  const [draftTo, setDraftTo] = useState(toDate)

  useEffect(() => {
    setDraftFrom(fromDate)
    setDraftTo(toDate)
  }, [fromDate, toDate])

  const matchesCommitted = draftFrom === fromDate && draftTo === toDate

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5 layout-shrink-visible w-[140px] shrink-0">
          <Label htmlFor="date-range-from" className="text-fluid-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="date-range-from"
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="graph-date-input h-9 bg-background text-foreground border-border w-[140px] min-w-[140px] shrink-0"
          />
        </div>
        <div className="space-y-1.5 layout-shrink-visible w-[140px] shrink-0">
          <Label htmlFor="date-range-to" className="text-fluid-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="date-range-to"
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="graph-date-input h-9 bg-background text-foreground border-border w-[140px] min-w-[140px] shrink-0"
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          disabled={matchesCommitted}
          onClick={() => onApplyRange(draftFrom, draftTo)}
        >
          Update range
        </Button>
        {onReset && (
          <Button type="button" size="sm" onClick={onReset} className="shrink-0">
            Reset range
          </Button>
        )}
      </div>
    </div>
  )
}
