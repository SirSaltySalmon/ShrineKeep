"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { format } from "date-fns"
import { formatCurrency } from "@/lib/utils"
import type { ValueChartPoint, AcquisitionChartPoint } from "@/lib/hooks/use-box-stats"
import { mergeStatsSeries } from "@/lib/stats/box-stats-series"
import { localDayEndMs, localDayStartMs } from "@/lib/stats/local-day"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

/** Short format for Y-axis so labels fit (e.g. $900, $1.2k, $2.5M). */
function formatAxisCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${Math.round(value)}`
}

/** Format timestamp (ms) for tooltip label; guards against invalid time. */
function formatTooltipDateLabel(value: unknown): string {
  const ms = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(ms)) return ""
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ""
  return format(d, "MMM d, yyyy")
}

/** Tooltip label formatter: show date from the hovered point (payload has dateMs). */
function tooltipLabelFormatter(
  _value: unknown,
  payload: Array<{ payload?: { dateMs?: number } }> | undefined
): string {
  const ms = payload?.[0]?.payload?.dateMs
  return formatTooltipDateLabel(ms)
}

const chartConfig: ChartConfig = {
  value: {
    label: "Value",
    color: "hsl(var(--graph-value-color))",
  },
  cumulativeAcquisition: {
    label: "Cost",
    color: "hsl(var(--graph-acquisition-color))",
  },
}

type ChartPointWithMs<T> = T & { dateMs: number }

function getSharedTimeDomain(
  valueData: ValueChartPoint[],
  acquisitionData: AcquisitionChartPoint[]
): [number, number] | undefined {
  const dates = [
    ...valueData.map((p) => p.date),
    ...acquisitionData.map((p) => p.date),
  ].filter(Boolean)
  if (dates.length === 0) return undefined
  const ms = dates.map(localDayStartMs)
  return [Math.min(...ms), Math.max(...ms)]
}

/** Start of the first day to the end of the last, in ms, for YYYY-MM-DD strings. */
function dateRangeToDomain(fromDate: string, toDate: string): [number, number] {
  return [localDayStartMs(fromDate), localDayEndMs(toDate)]
}

type MergedChartPoint = { date: string; dateMs: number; value: number; cumulativeAcquisition: number }

/**
 * Both series on one shared set of dates, zero-filled before each series starts and carried
 * forward after its last figure (`mergeStatsSeries`). Every chart here draws this, overlay
 * or separate, so a line never starts or stops partway across the axis.
 */
function getMergedChartData(
  valueData: ValueChartPoint[],
  acquisitionData: AcquisitionChartPoint[]
): MergedChartPoint[] {
  return mergeStatsSeries(valueData, acquisitionData).map((point) => ({
    ...point,
    dateMs: localDayStartMs(point.date),
  }))
}

const tooltipWrapperStyle = { maxWidth: "90vw", minWidth: 120, overflowX: "auto" as const }
const tooltipContentStyle = { minWidth: 0 }

interface CurrencyLineChartProps<T extends { date: string }> {
  data: T[]
  dataKey: keyof T & string
  title: string
  emptyMessage: string
  lineName: string
  tooltipProps?: { wrapperStyle: object; contentStyle: object }
  xDomain?: [number, number]
  height?: number
}

function CurrencyLineChart<T extends { date: string }>({
  data,
  dataKey,
  title,
  emptyMessage,
  lineName,
  tooltipProps,
  xDomain,
  height = 220,
}: CurrencyLineChartProps<T>) {
  if (data.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
      </div>
    )
  }
  const dataWithMs: ChartPointWithMs<T>[] = data.map((d) => ({
    ...d,
    dateMs: localDayStartMs(d.date),
  }))
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
        <LineChart data={dataWithMs}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="dateMs"
            type="number"
            domain={xDomain}
            tickFormatter={(ms) => format(new Date(ms), "MMM d")}
          />
          <YAxis width={40} tickFormatter={formatAxisCurrency} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => formatCurrency(Number(value))}
                labelFormatter={tooltipLabelFormatter}
              />
            }
            {...(tooltipProps ?? {})}
          />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={`var(--color-${dataKey})`}
            strokeWidth={2}
            name={lineName}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

export interface ValueAcquisitionChartsProps {
  valueChartData: ValueChartPoint[]
  acquisitionChartData: AcquisitionChartPoint[]
  /** When true, draw value and acquisition on one chart; when false, two separate charts. */
  graphOverlay?: boolean
  /** Use true in dialog for tooltip overflow. */
  tooltipInModal?: boolean
  /** Chart height in pixels. */
  height?: number
  /** When both set, x-axis shows this full range (YYYY-MM-DD) even if there are no points on some dates. */
  fromDate?: string
  toDate?: string
}

export function ValueAcquisitionCharts({
  valueChartData,
  acquisitionChartData,
  graphOverlay = true,
  tooltipInModal = false,
  height = 220,
  fromDate,
  toDate,
}: ValueAcquisitionChartsProps) {
  const tooltipProps = tooltipInModal
    ? { wrapperStyle: tooltipWrapperStyle, contentStyle: tooltipContentStyle }
    : undefined

  const dataDomain = getSharedTimeDomain(valueChartData, acquisitionChartData)
  const xDomain =
    fromDate && toDate ? dateRangeToDomain(fromDate, toDate) : dataDomain

  const hasValue = valueChartData.length > 0
  const hasAcquisition = acquisitionChartData.length > 0
  const hasAny = hasValue || hasAcquisition

  const mergedData = hasAny ? getMergedChartData(valueChartData, acquisitionChartData) : []

  if (graphOverlay && hasAny) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Value & acquisition over time</h3>
        <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
          <LineChart data={mergedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="dateMs"
              type="number"
              domain={xDomain}
              tickFormatter={(ms) => format(new Date(ms), "MMM d")}
            />
            <YAxis width={40} tickFormatter={formatAxisCurrency} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatCurrency(Number(value))}
                  labelFormatter={tooltipLabelFormatter}
                />
              }
              {...tooltipProps}
            />
            <ChartLegend content={<ChartLegendContent />} />
            {hasValue && (
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-value)"
                strokeWidth={2}
                name="Value"
              />
            )}
            {hasAcquisition && (
              <Line
                type="monotone"
                dataKey="cumulativeAcquisition"
                stroke="var(--color-cumulativeAcquisition)"
                strokeWidth={2}
                name="Cost"
              />
            )}
          </LineChart>
        </ChartContainer>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/*
        Separate charts draw the same merged, zero-filled series as the overlay chart, one line
        each. A series with no figures of its own still shows its empty message, not a flat 0.
      */}
      <CurrencyLineChart
        data={hasValue ? mergedData : []}
        dataKey="value"
        title="Total value over time"
        emptyMessage="No value history. Update item values to see the graph."
        lineName="Total value"
        tooltipProps={tooltipProps}
        xDomain={xDomain}
        height={height}
      />
      <CurrencyLineChart
        data={hasAcquisition ? mergedData : []}
        dataKey="cumulativeAcquisition"
        title="Cumulative acquisition cost"
        emptyMessage="No acquisition data. Add acquisition date and price to items to see the graph."
        lineName="Acquisition cost"
        tooltipProps={tooltipProps}
        xDomain={xDomain}
        height={height}
      />
    </div>
  )
}
