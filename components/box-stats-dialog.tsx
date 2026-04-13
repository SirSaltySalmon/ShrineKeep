"use client"

import { useState } from "react"
import { Skeleton } from "boneyard-js/react"
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
import type { BoneyardBoxStatsFixture } from "@/components/boneyard-stats-fixtures"

interface BoxStatsDialogProps {
  boxId: string
  boxName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  graphOverlay?: boolean
  captureSkeleton?: boolean
  previewData?: BoneyardBoxStatsFixture
}

export default function BoxStatsDialog({
  boxId,
  boxName,
  open,
  onOpenChange,
  graphOverlay = true,
  captureSkeleton = false,
  previewData,
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
    enabled: open && previewData == null,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  })

  const scopeLabel = boxId === "root" ? "Root" : "Box"
  const currentValueDisplay = previewData?.currentValue ?? currentValue
  const totalAcquisitionDisplay = previewData?.totalAcquisition ?? totalAcquisition
  const profitDisplay = currentValueDisplay - totalAcquisitionDisplay
  const valueChartDataDisplay = previewData?.valueChartData ?? valueChartData
  const acquisitionChartDataDisplay = previewData?.acquisitionChartData ?? acquisitionChartData
  const isRefreshingDisplay = previewData ? false : isRefreshing
  const dialogBody = (
    <div className="space-y-6 py-4">
      <BoxStatsSummary
        currentValue={currentValueDisplay}
        totalAcquisition={totalAcquisitionDisplay}
        profit={profitDisplay}
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
      {isRefreshingDisplay && (
        <p
          className="flex items-center gap-2 text-fluid-xs text-muted-foreground min-h-[1.25rem]"
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden />
          Updating…
        </p>
      )}
      <BoxStatsCharts
        valueChartData={valueChartDataDisplay}
        acquisitionChartData={acquisitionChartDataDisplay}
        graphOverlay={graphOverlay}
        tooltipInModal
        fromDate={fromDate || undefined}
        toDate={toDate || undefined}
      />
    </div>
  )

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
        <Skeleton
          name="box-stats-dialog"
          loading={loading || captureSkeleton}
          animate="shimmer"
          color="hsl(var(--muted))"
          darkColor="hsl(var(--muted))"
          fixture={dialogBody}
        >
          {dialogBody}
        </Skeleton>
      </DialogContent>
    </Dialog>
  )
}
