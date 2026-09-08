"use client"

import { BoxStatsSummary, BoxStatsCharts } from "./box-stats-content"
import type { PresentedBoxStats } from "@/lib/sharing/presentation/models"

interface BoxStatsPresentationProps {
  stats: PresentedBoxStats
  variant: "cards" | "inline"
  graphOverlay?: boolean
  tooltipInModal?: boolean
  fromDate?: string
  toDate?: string
}

/** Hook-free stats body. Owner panels fetch, then pass the same presented stats. */
export function BoxStatsPresentation({
  stats,
  variant,
  graphOverlay = true,
  tooltipInModal = false,
  fromDate,
  toDate,
}: BoxStatsPresentationProps) {
  return (
    <div className="space-y-4 min-w-0">
      <BoxStatsSummary
        currentValue={stats.currentValue}
        totalAcquisition={stats.totalAcquisition}
        profit={stats.profit}
        variant={variant}
      />
      <BoxStatsCharts
        valueChartData={stats.valueChartData}
        acquisitionChartData={stats.acquisitionChartData}
        graphOverlay={graphOverlay}
        tooltipInModal={tooltipInModal}
        fromDate={fromDate}
        toDate={toDate}
      />
    </div>
  )
}
