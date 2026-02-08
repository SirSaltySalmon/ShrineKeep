"use client"

import { useState, useEffect } from "react"
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
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp } from "lucide-react"

const VALUE_COLOR = "#22c55e"
const ACQUISITION_COLOR = "#ef4444"

interface ValuePoint {
  date: string
  value: number
}

interface AcquisitionPoint {
  date: string
  cumulativeAcquisition: number
}

interface BoxStatsPanelProps {
  boxId: string
  boxName: string
  refreshKey?: number
}

export default function BoxStatsPanel({ boxId, boxName, refreshKey = 0 }: BoxStatsPanelProps) {
  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([])
  const [acquisitionHistory, setAcquisitionHistory] = useState<AcquisitionPoint[]>([])
  const [currentValue, setCurrentValue] = useState(0)
  const [totalAcquisition, setTotalAcquisition] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!boxId) return
    setLoading(true)
    fetch(`/api/boxes/${boxId}/stats`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load")
        return res.json()
      })
      .then((data) => {
        setValueHistory(data.valueHistory ?? [])
        setAcquisitionHistory(data.acquisitionHistory ?? [])
        setCurrentValue(data.currentValue ?? 0)
        setTotalAcquisition(data.totalAcquisition ?? 0)
      })
      .catch(() => {
        setValueHistory([])
        setAcquisitionHistory([])
        setCurrentValue(0)
        setTotalAcquisition(0)
      })
      .finally(() => setLoading(false))
  }, [boxId, refreshKey])

  const profit = currentValue - totalAcquisition
  const valueChartData = valueHistory.map((p) => ({
    date: format(new Date(p.date), "MMM dd"),
    value: p.value,
  }))
  const acquisitionChartData = acquisitionHistory.map((p) => ({
    date: format(new Date(p.date), "MMM dd"),
    cumulativeAcquisition: p.cumulativeAcquisition,
  }))

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 mb-6">
        <div className="text-sm text-muted-foreground">Loading stats...</div>
      </div>
    )
  }

  const scopeLabel = boxId === "root" ? "Root" : "Box"

  return (
    <div className="rounded-lg border bg-card mb-6 overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                {scopeLabel}: {boxName}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground">Value</span>
                <span className="text-xl font-bold" style={{ color: VALUE_COLOR }}>
                  {formatCurrency(currentValue)}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground">Acquisition</span>
                <span className="text-xl font-bold" style={{ color: ACQUISITION_COLOR }}>
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
        <div className="border-t bg-muted/20 px-4 py-4 space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-2">Total value over time</h3>
            {valueChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No value history. Update item values to see the graph.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={valueChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={VALUE_COLOR}
                    strokeWidth={2}
                    name="Total value"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Cumulative acquisition cost</h3>
            {acquisitionChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No acquisition data. Add acquisition date and price to items to see the graph.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={acquisitionChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cumulativeAcquisition"
                    stroke={ACQUISITION_COLOR}
                    strokeWidth={2}
                    name="Cumulative acquisition"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
