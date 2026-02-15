"use client"

import { formatCurrency } from "@/lib/utils"
import type { ValueChartPoint, AcquisitionChartPoint } from "@/lib/hooks/use-box-stats"
import { ValueAcquisitionCharts } from "./value-acquisition-charts"

// Get colors from CSS variables with fallbacks (used by summary cards and other components)
function getValueColor(): string {
  if (typeof window === "undefined") return "#22c55e"
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue("--value-color").trim()
  return value ? `hsl(${value})` : "#22c55e"
}

function getAcquisitionColor(): string {
  if (typeof window === "undefined") return "#ef4444"
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue("--acquisition-color").trim()
  return value ? `hsl(${value})` : "#ef4444"
}

export { getValueColor, getAcquisitionColor }
export { getGraphValueColor, getGraphAcquisitionColor } from "./value-acquisition-charts"

interface BoxStatsSummaryProps {
  currentValue: number
  totalAcquisition: number
  profit: number
  variant: "cards" | "inline"
}

export function BoxStatsSummary({
  currentValue,
  totalAcquisition,
  profit,
  variant,
}: BoxStatsSummaryProps) {
  const valueColor = getValueColor()
  const acquisitionColor = getAcquisitionColor()

  if (variant === "cards") {
    return (
      <>
        <div className="grid grid-cols-2 gap-4 min-w-0">
          <div className="rounded-lg border p-4 text-center layout-shrink-visible">
            <div className="text-[clamp(0.65rem,2vw,0.875rem)] font-medium text-muted-foreground mb-1">Current value</div>
            <div className="text-[clamp(0.75rem,4vw,1.5rem)] font-bold leading-tight layout-shrink-visible" style={{ color: valueColor }}>
              {formatCurrency(currentValue)}
            </div>
          </div>
          <div className="rounded-lg border p-4 text-center layout-shrink-visible">
            <div className="text-[clamp(0.65rem,2vw,0.875rem)] font-medium text-muted-foreground mb-1">Acquisition cost</div>
            <div className="text-[clamp(0.75rem,4vw,1.5rem)] font-bold leading-tight layout-shrink-visible" style={{ color: acquisitionColor }}>
              {formatCurrency(totalAcquisition)}
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-muted bg-light-muted p-3 text-center layout-shrink-visible">
          <div className="text-[clamp(0.6rem,1.5vw,0.75rem)] font-medium text-muted-foreground mb-0.5">Profit</div>
          <div className="text-[clamp(0.7rem,3vw,1.125rem)] font-semibold text-foreground leading-tight layout-shrink-visible">
            {formatCurrency(profit)}
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">Value</span>
        <span className="text-base font-bold" style={{ color: valueColor }}>
          {formatCurrency(currentValue)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">Acquisition</span>
        <span className="text-base font-bold" style={{ color: acquisitionColor }}>
          {formatCurrency(totalAcquisition)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">Profit</span>
        <span className="text-base font-bold text-foreground">
          {formatCurrency(profit)}
        </span>
      </div>
    </div>
  )
}

interface BoxStatsChartsProps {
  valueChartData: ValueChartPoint[]
  acquisitionChartData: AcquisitionChartPoint[]
  /** When true, draw value and acquisition on one chart; when false, two separate charts. */
  graphOverlay?: boolean
  /** Use true in dialog for tooltip overflow. */
  tooltipInModal?: boolean
  /** When both set, x-axis shows this full range even if there are no points on some dates. */
  fromDate?: string
  toDate?: string
}

export function BoxStatsCharts({
  valueChartData,
  acquisitionChartData,
  graphOverlay = true,
  tooltipInModal = false,
  fromDate,
  toDate,
}: BoxStatsChartsProps) {
  return (
    <ValueAcquisitionCharts
      valueChartData={valueChartData}
      acquisitionChartData={acquisitionChartData}
      graphOverlay={graphOverlay}
      tooltipInModal={tooltipInModal}
      fromDate={fromDate}
      toDate={toDate}
    />
  )
}
