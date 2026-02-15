"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useBoxStats } from "@/lib/hooks/use-box-stats"
import { BoxStatsSummary, BoxStatsCharts } from "@/components/box-stats-content"
import { DateRangeFilter } from "@/components/date-range-filter"

interface BoxStatsPanelProps {
  boxId: string
  boxName: string
  refreshKey?: number
  graphOverlay?: boolean
}

export default function BoxStatsPanel({ boxId, boxName, refreshKey = 0, graphOverlay = true }: BoxStatsPanelProps) {
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
  } = useBoxStats(boxId, {
    enabled: true,
    refreshKey,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  })

  if (loading) {
    return (
      <div className="rounded-lg border bg-light-muted p-4 mb-6 layout-shrink-visible">
        <div className="text-fluid-sm text-muted-foreground">Loading stats...</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card mb-6 overflow-visible min-w-0">
      <div className="p-4 layout-shrink-visible">
        <div className="flex flex-wrap items-center justify-between gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6 min-w-0 overflow-auto">
            <BoxStatsSummary
              currentValue={currentValue}
              totalAcquisition={totalAcquisition}
              profit={profit}
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
            onFromDateChange={setFromDate}
            onToDateChange={setToDate}
            onReset={() => {
              setFromDate("")
              setToDate("")
            }}
          />
          <BoxStatsCharts
            valueChartData={valueChartData}
            acquisitionChartData={acquisitionChartData}
            graphOverlay={graphOverlay}
            fromDate={fromDate || undefined}
            toDate={toDate || undefined}
          />
        </div>
      )}
    </div>
  )
}
