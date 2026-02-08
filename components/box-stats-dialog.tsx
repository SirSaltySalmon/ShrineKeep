"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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

const VALUE_COLOR = "#22c55e"   // green
const ACQUISITION_COLOR = "#ef4444" // red

interface ValuePoint {
  date: string
  value: number
}

interface AcquisitionPoint {
  date: string
  cumulativeAcquisition: number
}

interface BoxStatsDialogProps {
  boxId: string
  boxName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function BoxStatsDialog({
  boxId,
  boxName,
  open,
  onOpenChange,
}: BoxStatsDialogProps) {
  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([])
  const [acquisitionHistory, setAcquisitionHistory] = useState<AcquisitionPoint[]>([])
  const [currentValue, setCurrentValue] = useState(0)
  const [totalAcquisition, setTotalAcquisition] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !boxId) return
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
  }, [open, boxId])

  const profit = currentValue - totalAcquisition
  const valueChartData = valueHistory.map((p) => ({
    date: format(new Date(p.date), "MMM dd"),
    value: p.value,
  }))
  const acquisitionChartData = acquisitionHistory.map((p) => ({
    date: format(new Date(p.date), "MMM dd"),
    cumulativeAcquisition: p.cumulativeAcquisition,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{boxId === "root" ? "Root" : "Box"}: {boxName}</DialogTitle>
          <DialogDescription>
            Total value and cumulative acquisition cost over time (includes all items in this scope and sub-boxes).
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 text-center">
                <div className="text-sm font-medium text-muted-foreground mb-1">Current value</div>
                <div className="text-2xl font-bold" style={{ color: VALUE_COLOR }}>
                  {formatCurrency(currentValue)}
                </div>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <div className="text-sm font-medium text-muted-foreground mb-1">Acquisition cost</div>
                <div className="text-2xl font-bold" style={{ color: ACQUISITION_COLOR }}>
                  {formatCurrency(totalAcquisition)}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-muted bg-muted/30 p-3 text-center">
              <div className="text-xs font-medium text-muted-foreground mb-0.5">Profit</div>
              <div className="text-lg font-semibold text-foreground">
                {formatCurrency(profit)}
              </div>
            </div>
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
      </DialogContent>
    </Dialog>
  )
}
