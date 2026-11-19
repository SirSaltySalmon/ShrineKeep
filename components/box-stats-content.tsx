"use client"

import { formatCurrency } from "@/lib/utils"
import type { ValueChartPoint, AcquisitionChartPoint } from "@/lib/hooks/use-box-stats"
import { ValueAcquisitionCharts } from "./value-acquisition-charts"
import { FadeOnChange } from "./fade-on-change"

/** A money figure that fades in when it changes: another box, a refresh, an edit. */
function Figure({ amount }: { amount: number }) {
  const text = formatCurrency(amount)
  return <FadeOnChange signal={text}>{text}</FadeOnChange>
}

const VALUE_COLOR = "hsl(var(--value-color))"
const ACQUISITION_COLOR = "hsl(var(--acquisition-color))"

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
  if (variant === "cards") {
    return (
      <>
        <div className="grid grid-cols-2 gap-4 min-w-0 overflow-x-auto overflow-y-hidden">
          <div className="rounded-lg sk-outline p-4 text-center layout-shrink-visible">
            <div className="text-[clamp(0.65rem,2vw,0.875rem)] font-medium text-muted-foreground mb-1">Current value</div>
            <div className="text-nowrap text-[clamp(0.75rem,4vw,1.5rem)] font-bold leading-tight layout-shrink-visible" style={{ color: VALUE_COLOR }}>
              <Figure amount={currentValue} />
            </div>
          </div>
          <div className="rounded-lg sk-outline p-4 text-center layout-shrink-visible">
            <div className="text-[clamp(0.65rem,2vw,0.875rem)] font-medium text-muted-foreground mb-1">Acquisition cost</div>
            <div className="text-nowrap text-[clamp(0.75rem,4vw,1.5rem)] font-bold leading-tight layout-shrink-visible" style={{ color: ACQUISITION_COLOR }}>
              <Figure amount={totalAcquisition} />
            </div>
          </div>
        </div>
        <div className="rounded-lg sk-outline-muted bg-light-muted p-3 text-center layout-shrink-visible">
          <div className="text-[clamp(0.6rem,1.5vw,0.75rem)] font-medium text-muted-foreground mb-0.5">Profit</div>
          <div className="text-nowrap text-[clamp(0.7rem,3vw,1.125rem)] font-semibold text-foreground leading-tight layout-shrink-visible">
            <Figure amount={profit} />
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="flex items-center gap-10 min-w-0 overflow-x-auto overflow-y-hidden">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground leading-none">Value</span>
        <span className="text-base font-bold leading-tight" style={{ color: VALUE_COLOR }}>
          <Figure amount={currentValue} />
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground leading-none">Cost</span>
        <span className="text-base font-bold leading-tight" style={{ color: ACQUISITION_COLOR }}>
          <Figure amount={totalAcquisition} />
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground leading-none">Profit</span>
        <span className="text-base font-bold text-foreground leading-tight">
          <Figure amount={profit} />
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
