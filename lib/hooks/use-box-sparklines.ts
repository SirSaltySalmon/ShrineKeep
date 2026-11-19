"use client"

import { useMemo } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import {
  BOX_SPARKLINE_MAX_BOXES,
  isBoxSparklineId,
  type BoxSparklineSeries,
  type BoxSparklinesResponse,
} from "@/lib/stats/box-sparkline"

/** First element of every sparkline query key, for `invalidateQueries({ queryKey: [BOX_SPARKLINES_QUERY_KEY] })`. */
export const BOX_SPARKLINES_QUERY_KEY = "box-sparklines"

export type BoxSparklineMap = Record<string, BoxSparklineSeries>

export interface UseBoxSparklinesOptions {
  /** When false, skip fetching (e.g. while the grid shows skeleton cards). */
  enabled?: boolean
  /** Change to refetch, like `useBoxStats` (the dashboard's `statsRefreshKey`). */
  refreshKey?: number
}

export interface UseBoxSparklinesResult {
  /** Box id to series. A box is missing until its series has loaded (or if the request failed). */
  sparklines: BoxSparklineMap
  /** True during the first load, before any series is available. */
  loading: boolean
  /** True while refetching with earlier series still on screen. */
  isRefreshing: boolean
  isError: boolean
}

const NO_SPARKLINES: BoxSparklineMap = {}

/**
 * The ids worth asking for, as a stable string: real box ids only (skeleton
 * fixtures and other placeholders are dropped), lower-cased, de-duplicated and
 * sorted, so reordering cards does not refetch.
 */
export function sparklineIdsKey(boxIds: readonly string[]): string {
  const unique = new Set<string>()
  for (const id of boxIds) {
    if (isBoxSparklineId(id)) unique.add(id.toLowerCase())
  }
  return Array.from(unique).sort().join(",")
}

/** One round trip per `BOX_SPARKLINE_MAX_BOXES` ids: a single request for any ordinary grid. */
export async function fetchBoxSparklines(
  boxIds: readonly string[],
  signal?: AbortSignal
): Promise<BoxSparklineMap> {
  if (boxIds.length === 0) return {}
  const batches: string[][] = []
  for (let i = 0; i < boxIds.length; i += BOX_SPARKLINE_MAX_BOXES) {
    batches.push(boxIds.slice(i, i + BOX_SPARKLINE_MAX_BOXES))
  }
  const pages = await Promise.all(
    batches.map(async (batch) => {
      const res = await fetch("/api/boxes/sparklines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxIds: batch }),
        signal,
      })
      if (!res.ok) throw new Error("Failed to load box sparklines")
      const data = (await res.json()) as Partial<BoxSparklinesResponse>
      return data.sparklines ?? {}
    })
  )
  return Object.assign({}, ...pages) as BoxSparklineMap
}

/**
 * Sparkline series for the box cards on screen, fetched together.
 *
 * Call it once where the list of boxes is known (the grid), not in each card.
 * Look a card's series up with `sparklines[box.id]`.
 */
export function useBoxSparklines(
  boxIds: readonly string[],
  options: UseBoxSparklinesOptions = {}
): UseBoxSparklinesResult {
  const { enabled = true, refreshKey = 0 } = options
  const idsKey = sparklineIdsKey(boxIds)
  const ids = useMemo(() => (idsKey ? idsKey.split(",") : []), [idsKey])
  const queryEnabled = enabled && ids.length > 0

  const query = useQuery({
    queryKey: [BOX_SPARKLINES_QUERY_KEY, idsKey, refreshKey],
    enabled: queryEnabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    // The read behind this is heavy and a card without its line is still a card: one retry, not three.
    retry: 1,
    // Keep the lines on screen while a changed id list or refresh key refetches.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => fetchBoxSparklines(ids, signal),
  })

  return {
    sparklines: query.data ?? NO_SPARKLINES,
    loading: queryEnabled ? query.isLoading : false,
    isRefreshing: queryEnabled ? query.isFetching && !query.isLoading : false,
    isError: queryEnabled ? query.isError : false,
  }
}
