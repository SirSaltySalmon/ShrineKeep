"use client"

import { useQuery } from "@tanstack/react-query"
import {
  extendAcquisitionToLatestDate,
  type AcquisitionPoint,
  type ValuePoint,
} from "@/lib/stats/box-stats-series"

export type { AcquisitionPoint, ValuePoint }

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
  /** True during a box's first load, before it has any figures to show. */
  loading: boolean
  /** True while refetching with the same box's earlier figures still on screen (date range or refresh key change). */
  isRefreshing: boolean
}

interface BoxStatsResponse {
  valueHistory: ValuePoint[]
  acquisitionHistory: AcquisitionPoint[]
  currentValue: number
  totalAcquisition: number
}

export function useBoxStats(
  boxId: string,
  options: UseBoxStatsOptions = {}
): UseBoxStatsResult {
  const { enabled = true, refreshKey = 0, fromDate, toDate } = options
  const queryEnabled = enabled && Boolean(boxId)
  const query = useQuery({
    queryKey: ["box-stats", boxId, fromDate ?? "", toDate ?? "", refreshKey],
    enabled: queryEnabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    // A new range or refresh key is a new query: keep this box's last figures on screen while
    // it loads. Another box's figures are never carried over.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === boxId ? previousData : undefined,
    queryFn: async (): Promise<BoxStatsResponse> => {
      const params = new URLSearchParams()
      if (fromDate) params.set("fromDate", fromDate)
      if (toDate) params.set("toDate", toDate)
      const queryString = params.toString()
      const res = await fetch(`/api/boxes/${boxId}/stats${queryString ? `?${queryString}` : ""}`)
      if (!res.ok) {
        throw new Error("Failed to load")
      }
      const data = (await res.json()) as Partial<BoxStatsResponse>
      return {
        valueHistory: data.valueHistory ?? [],
        acquisitionHistory: data.acquisitionHistory ?? [],
        currentValue: data.currentValue ?? 0,
        totalAcquisition: data.totalAcquisition ?? 0,
      }
    },
  })

  const valueHistory = query.data?.valueHistory ?? []
  const acquisitionHistory = query.data?.acquisitionHistory ?? []
  const currentValue = query.data?.currentValue ?? 0
  const totalAcquisition = query.data?.totalAcquisition ?? 0

  const profit = currentValue - totalAcquisition
  const valueChartData: ValueChartPoint[] = valueHistory.map((p) => ({
    date: p.date,
    value: p.value,
  }))
  const acquisitionChartData: AcquisitionChartPoint[] = extendAcquisitionToLatestDate(
    valueHistory,
    acquisitionHistory
  )

  return {
    valueHistory,
    acquisitionHistory,
    valueChartData,
    acquisitionChartData,
    currentValue,
    totalAcquisition,
    profit,
    loading: queryEnabled ? query.isLoading : false,
    isRefreshing: queryEnabled ? query.isFetching && !query.isLoading : false,
  }
}
