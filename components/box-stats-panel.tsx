"use client"

import { useState } from "react"
import { Skeleton } from "boneyard-js/react"
import panelBones from "@/app/bones/box-stats-panel.bones.json"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { useBoxStats } from "@/lib/hooks/use-box-stats"
import { BoxStatsSummary, BoxStatsCharts } from "@/components/box-stats-content"
import { DateRangeFilter } from "@/components/date-range-filter"
import type { BoneyardBoxStatsFixture } from "@/components/boneyard-stats-fixtures"

interface BoxStatsPanelProps {
  boxId: string
  boxName: string
  refreshKey?: number
  graphOverlay?: boolean
  captureSkeleton?: boolean
  previewData?: BoneyardBoxStatsFixture
}

export default function BoxStatsPanel({
  boxId,
  boxName,
  refreshKey = 0,
  graphOverlay = true,
  captureSkeleton = false,
  previewData,
}: BoxStatsPanelProps) {
  const [expanded, setExpanded] = useState(false)
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
    enabled: previewData == null,
    refreshKey,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  })

  const currentValueDisplay = previewData?.currentValue ?? currentValue
  const totalAcquisitionDisplay = previewData?.totalAcquisition ?? totalAcquisition
  const profitDisplay = currentValueDisplay - totalAcquisitionDisplay
  const valueChartDataDisplay = previewData?.valueChartData ?? valueChartData
  const acquisitionChartDataDisplay = previewData?.acquisitionChartData ?? acquisitionChartData
  const isRefreshingDisplay = previewData ? false : isRefreshing

  const panelContent = (
    <div className="rounded-lg border bg-card mb-6 overflow-visible min-w-0">
      <div className="p-4 layout-shrink-visible">
        <div className="flex flex-wrap items-center justify-between gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 min-w-0 overflow-auto">
            <BoxStatsSummary
              currentValue={currentValueDisplay}
              totalAcquisition={totalAcquisitionDisplay}
              profit={profitDisplay}
              variant="inline"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Expand
              </>
            )}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-light-muted px-4 py-4 space-y-4">
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
            fromDate={fromDate || undefined}
            toDate={toDate || undefined}
          />
        </div>
      )}
    </div>
  )

  return (
    <Skeleton
      name="box-stats-panel"
      initialBones={panelBones as any}
      loading={loading || captureSkeleton}
      animate="shimmer"
      color="hsl(var(--muted))"
      darkColor="hsl(var(--muted))"
      fixture={panelContent}
    >
      {panelContent}
    </Skeleton>
  )
}
