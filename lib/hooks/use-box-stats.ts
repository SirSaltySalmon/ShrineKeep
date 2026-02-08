"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"

export interface ValuePoint {
  date: string
  value: number
}

export interface AcquisitionPoint {
  date: string
  cumulativeAcquisition: number
}

export interface ValueChartPoint {
  date: string
  value: number
}

export interface AcquisitionChartPoint {
  date: string
  cumulativeAcquisition: number
}

export interface UseBoxStatsOptions {
  /** When false, skip fetching (e.g. when dialog is closed). */
  enabled?: boolean
  /** Change to refetch (e.g. panel refresh). */
  refreshKey?: number
}

export interface UseBoxStatsResult {
  valueHistory: ValuePoint[]
  acquisitionHistory: AcquisitionPoint[]
  valueChartData: ValueChartPoint[]
  acquisitionChartData: AcquisitionChartPoint[]
  currentValue: number
  totalAcquisition: number
  profit: number
  loading: boolean
}

export function useBoxStats(
  boxId: string,
  options: UseBoxStatsOptions = {}
): UseBoxStatsResult {
  const { enabled = true, refreshKey = 0 } = options

  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([])
  const [acquisitionHistory, setAcquisitionHistory] = useState<AcquisitionPoint[]>([])
  const [currentValue, setCurrentValue] = useState(0)
  const [totalAcquisition, setTotalAcquisition] = useState(0)
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled || !boxId) return
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
  }, [enabled, boxId, refreshKey])

  const profit = currentValue - totalAcquisition
  const valueChartData: ValueChartPoint[] = valueHistory.map((p) => ({
    date: format(new Date(p.date), "MMM dd"),
    value: p.value,
  }))
  const acquisitionChartData: AcquisitionChartPoint[] = acquisitionHistory.map((p) => ({
    date: format(new Date(p.date), "MMM dd"),
    cumulativeAcquisition: p.cumulativeAcquisition,
  }))

  return {
    valueHistory,
    acquisitionHistory,
    valueChartData,
    acquisitionChartData,
    currentValue,
    totalAcquisition,
    profit,
    loading,
  }
}
