import type { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  buildBoxSparkline,
  BOX_SPARKLINE_MAX_POINTS,
  type BoxSparklineSeries,
} from "@/lib/stats/box-sparkline"
import { loadBoxStatsSeries } from "./load-box-stats"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface LoadBoxSparklinesOptions {
  /** Defaults to today (UTC), as in the stats route. */
  today?: string
  maxPoints?: number
}

/**
 * Sparkline series for many boxes: each box's all-time stats from
 * `loadBoxStatsSeries` (the loader behind `GET /api/boxes/[boxId]/stats`),
 * sampled down, so a card's sparkline and that box's stats dialog agree.
 *
 * Ids that are not the user's boxes are left out of the result.
 */
export async function loadBoxSparklines(
  supabase: Supabase,
  userId: string,
  boxIds: readonly string[],
  options: LoadBoxSparklinesOptions = {}
): Promise<Record<string, BoxSparklineSeries>> {
  const maxPoints = options.maxPoints ?? BOX_SPARKLINE_MAX_POINTS
  const series = await loadBoxStatsSeries(supabase, userId, boxIds, { today: options.today })

  const sparklines: Record<string, BoxSparklineSeries> = {}
  series.forEach((stats, boxId) => {
    sparklines[boxId] = buildBoxSparkline(stats, maxPoints)
  })
  return sparklines
}
