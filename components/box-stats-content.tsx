"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { formatCurrency } from "@/lib/utils"
import type { ValueChartPoint, AcquisitionChartPoint } from "@/lib/hooks/use-box-stats"

// Get colors from CSS variables with fallbacks
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

function getGraphValueColor(): string {
  if (typeof window === "undefined") return "#22c55e"
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue("--graph-value-color").trim()
  return value ? `hsl(${value})` : "#22c55e"
}

function getGraphAcquisitionColor(): string {
  if (typeof window === "undefined") return "#ef4444"
  const root = document.documentElement
  const value = getComputedStyle(root).getPropertyValue("--graph-acquisition-color").trim()
  return value ? `hsl(${value})` : "#ef4444"
}

// Export functions (these are now functions, not constants, to read CSS variables dynamically)
export { getValueColor, getAcquisitionColor, getGraphValueColor, getGraphAcquisitionColor }

/** Short format for Y-axis so labels fit (e.g. $900, $1.2k). */
function formatAxisCurrency(value: number): string {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${Math.round(value)}`
}

const tooltipWrapperStyle = { maxWidth: "90vw", minWidth: 120, overflowX: "auto" as const }
const tooltipContentStyle = { minWidth: 0 }

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
          <div className="rounded-lg border p-4 text-center min-w-0 overflow-hidden">
            <div className="text-[clamp(0.65rem,2vw,0.875rem)] font-medium text-muted-foreground mb-1">Current value</div>
            <div className="text-[clamp(0.75rem,4vw,1.5rem)] font-bold leading-tight min-w-0 overflow-hidden" style={{ color: valueColor }}>
              {formatCurrency(currentValue)}
            </div>
          </div>
          <div className="rounded-lg border p-4 text-center min-w-0 overflow-hidden">
            <div className="text-[clamp(0.65rem,2vw,0.875rem)] font-medium text-muted-foreground mb-1">Acquisition cost</div>
            <div className="text-[clamp(0.75rem,4vw,1.5rem)] font-bold leading-tight min-w-0 overflow-hidden" style={{ color: acquisitionColor }}>
              {formatCurrency(totalAcquisition)}
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-muted bg-muted/30 p-3 text-center min-w-0 overflow-hidden">
          <div className="text-[clamp(0.6rem,1.5vw,0.75rem)] font-medium text-muted-foreground mb-0.5">Profit</div>
          <div className="text-[clamp(0.7rem,3vw,1.125rem)] font-semibold text-foreground leading-tight min-w-0 overflow-hidden">
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
        <span className="text-xl font-bold" style={{ color: valueColor }}>
          {formatCurrency(currentValue)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">Acquisition</span>
        <span className="text-xl font-bold" style={{ color: acquisitionColor }}>
          {formatCurrency(totalAcquisition)}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs text-muted-foreground">Profit</span>
        <span className="text-base font-semibold text-foreground">
          {formatCurrency(profit)}
        </span>
      </div>
    </div>
  )
}

/** Shared line chart for currency-over-time (value or acquisition). */
interface CurrencyLineChartProps<T extends { date: string }> {
  data: T[]
  dataKey: keyof T & string
  title: string
  emptyMessage: string
  lineName: string
  color: string
  tooltipProps?: { wrapperStyle: object; contentStyle: object }
}

function CurrencyLineChart<T extends { date: string }>({
  data,
  dataKey,
  title,
  emptyMessage,
  lineName,
  color,
  tooltipProps,
}: CurrencyLineChartProps<T>) {
  if (data.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
      </div>
    )
  }
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis
            width={40}
            tickFormatter={formatAxisCurrency}
            tick={{ fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            {...(tooltipProps ?? {})}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            name={lineName}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

interface BoxStatsChartsProps {
  valueChartData: ValueChartPoint[]
  acquisitionChartData: AcquisitionChartPoint[]
  /** Use true in dialog for tooltip overflow. */
  tooltipInModal?: boolean
}

export function BoxStatsCharts({
  valueChartData,
  acquisitionChartData,
  tooltipInModal = false,
}: BoxStatsChartsProps) {
  const tooltipProps = tooltipInModal
    ? { wrapperStyle: tooltipWrapperStyle, contentStyle: tooltipContentStyle }
    : undefined

  const graphValueColor = getGraphValueColor()
  const graphAcquisitionColor = getGraphAcquisitionColor()

  return (
    <div className="space-y-6">
      <CurrencyLineChart
        data={valueChartData}
        dataKey="value"
        title="Total value over time"
        emptyMessage="No value history. Update item values to see the graph."
        lineName="Total value"
        color={graphValueColor}
        tooltipProps={tooltipProps}
      />
      <CurrencyLineChart
        data={acquisitionChartData}
        dataKey="cumulativeAcquisition"
        title="Cumulative acquisition cost"
        emptyMessage="No acquisition data. Add acquisition date and price to items to see the graph."
        lineName="Acquisition cost"
        color={graphAcquisitionColor}
        tooltipProps={tooltipProps}
      />
    </div>
  )
}
