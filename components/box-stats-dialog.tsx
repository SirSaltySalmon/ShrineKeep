"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useBoxStats } from "@/lib/hooks/use-box-stats"
import { BoxStatsSummary, BoxStatsCharts } from "@/components/box-stats-content"
import { DateRangeFilter } from "@/components/date-range-filter"

interface BoxStatsDialogProps {
  boxId: string
  boxName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  graphOverlay?: boolean
}

export default function BoxStatsDialog({
  boxId,
  boxName,
  open,
  onOpenChange,
  graphOverlay = true,
}: BoxStatsDialogProps) {
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const {
    currentValue,
    totalAcquisition,
    profit,
    valueChartData,
    acquisitionChartData,
    loading,
    isRefreshing,
  } = useBoxStats(boxId, {
    enabled: open,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  })

  const scopeLabel = boxId === "root" ? "Root" : "Box"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle title={`${scopeLabel}: ${boxName}`}>
            {scopeLabel}: {boxName}
          </DialogTitle>
          <DialogDescription>
            Total value and cumulative acquisition cost over time (includes all items in this scope and sub-boxes).
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-fluid-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6 py-4">
            <BoxStatsSummary
              currentValue={currentValue}
              totalAcquisition={totalAcquisition}
              profit={profit}
              variant="cards"
            />
            <DateRangeFilter
              fromDate={fromDate}
              toDate={toDate}
              onApplyRange={(from, to) => {
                setFromDate(from)
                setToDate(to)
              }}
              onReset={() => {
                setFromDate("")
                setToDate("")
              }}
            />
            {isRefreshing && (
              <p
                className="flex items-center gap-2 text-fluid-xs text-muted-foreground min-h-[1.25rem]"
                aria-live="polite"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
                Updating…
              </p>
            )}
            <BoxStatsCharts
              valueChartData={valueChartData}
              acquisitionChartData={acquisitionChartData}
              graphOverlay={graphOverlay}
              tooltipInModal
              fromDate={fromDate || undefined}
              toDate={toDate || undefined}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
