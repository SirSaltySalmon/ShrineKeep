import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { loadBoxStatsSeries, ROOT_STATS_SCOPE } from "@/lib/services/boxes/load-box-stats"
import { filterBoxStatsByDateRange } from "@/lib/stats/box-stats-series"

const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Value and acquisition series plus totals for one of the caller's boxes
 * (items in nested boxes included), or for the whole collection when `boxId`
 * is `root`.
 *
 * Optional `fromDate` / `toDate` (YYYY-MM-DD, inclusive) narrow the two series;
 * the totals are always all-time.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ boxId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boxId } = await params
    if (!boxId) {
      return NextResponse.json({ error: "boxId required" }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined
    if ((fromDate && !DAY.test(fromDate)) || (toDate && !DAY.test(toDate))) {
      return NextResponse.json({ error: "fromDate and toDate must be YYYY-MM-DD" }, { status: 400 })
    }

    const isRoot = boxId === ROOT_STATS_SCOPE
    // Postgres hands uuids back in lower case; match that so the lookup lines up.
    const scopeId = isRoot ? ROOT_STATS_SCOPE : boxId.toLowerCase()
    const series = await loadBoxStatsSeries(
      supabase,
      user.id,
      isRoot ? ROOT_STATS_SCOPE : [scopeId]
    )
    const stats = series.get(scopeId)
    if (!stats) {
      return NextResponse.json({ error: "Box not found" }, { status: 404 })
    }

    return NextResponse.json(filterBoxStatsByDateRange(stats, fromDate, toDate))
  } catch (error: unknown) {
    console.error("Error loading box stats:", error)
    return NextResponse.json({ error: "Failed to load box stats" }, { status: 500 })
  }
}
