"use client"

import { useState, useEffect, useRef } from "react"

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
  /** Filter series to dates >= fromDate (YYYY-MM-DD). */
  fromDate?: string
  /** Filter series to dates <= toDate (YYYY-MM-DD). */
  toDate?: string
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
  /** True while refetching after the first successful load (e.g. date range change). */
  isRefreshing: boolean
}

export function useBoxStats(
  boxId: string,
  options: UseBoxStatsOptions = {}
): UseBoxStatsResult {
  const { enabled = true, refreshKey = 0, fromDate, toDate } = options

  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([])
  const [acquisitionHistory, setAcquisitionHistory] = useState<AcquisitionPoint[]>([])
  const [currentValue, setCurrentValue] = useState(0)
  const [totalAcquisition, setTotalAcquisition] = useState(0)
  const [loading, setLoading] = useState(enabled)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasCompletedFetchRef = useRef(false)
  const fetchGenRef = useRef(0)

  useEffect(() => {
    hasCompletedFetchRef.current = false
  }, [boxId])

  useEffect(() => {
    if (!enabled || !boxId) {
      setIsRefreshing(false)
      return
    }
    const showBlockingLoading = !hasCompletedFetchRef.current
    const isSubsequentFetch = hasCompletedFetchRef.current
    if (showBlockingLoading) setLoading(true)
    if (isSubsequentFetch) setIsRefreshing(true)
    const gen = ++fetchGenRef.current
    const params = new URLSearchParams()
    if (fromDate) params.set("fromDate", fromDate)
    if (toDate) params.set("toDate", toDate)
    const query = params.toString()
    fetch(`/api/boxes/${boxId}/stats${query ? `?${query}` : ""}`)
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
      .finally(() => {
        if (gen !== fetchGenRef.current) return
        setLoading(false)
        setIsRefreshing(false)
        hasCompletedFetchRef.current = true
      })
  }, [enabled, boxId, refreshKey, fromDate, toDate])

  const profit = currentValue - totalAcquisition
  const valueChartData: ValueChartPoint[] = valueHistory.map((p) => ({
    date: p.date,
    value: p.value,
  }))
  const acquisitionChartData: AcquisitionChartPoint[] = (() => {
    const base = acquisitionHistory.map((p) => ({
      date: p.date,
      cumulativeAcquisition: p.cumulativeAcquisition,
    }))
    const allDates = [
      ...valueHistory.map((p) => p.date),
      ...acquisitionHistory.map((p) => p.date),
    ].filter(Boolean)
    if (allDates.length === 0 || base.length === 0) return base
    const endDate = allDates.reduce((a, b) => (a >= b ? a : b))
    const last = base[base.length - 1]
    if (last && last.date < endDate) {
      return [
        ...base,
        { date: endDate, cumulativeAcquisition: last.cumulativeAcquisition },
      ]
    }
    return base
  })()

  return {
    valueHistory,
    acquisitionHistory,
    valueChartData,
    acquisitionChartData,
    currentValue,
    totalAcquisition,
    profit,
    loading,
    isRefreshing,
  }
}
