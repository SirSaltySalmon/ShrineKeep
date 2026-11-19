import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { loadBoxSparklines } from "@/lib/services/boxes/load-box-sparklines"
import { parseSparklineRequest, type BoxSparklinesResponse } from "@/lib/stats/box-sparkline"

/**
 * Value and acquisition sparklines for many of the caller's boxes at once, so a
 * grid of box cards costs one request instead of one per card.
 *
 * Body: `{ boxIds: string[] }` (1 to 100 box ids).
 * Returns `{ sparklines: { [boxId]: BoxSparklineSeries } }`. Each series is the
 * box's all-time stats (items in nested boxes included), sampled to at most 24
 * points. Ids that are not the caller's boxes are left out.
 *
 * POST because the id list is the request body; it changes nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    const parsed = parseSparklineRequest(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const sparklines = await loadBoxSparklines(supabase, user.id, parsed.boxIds)
    const payload: BoxSparklinesResponse = { sparklines }
    return NextResponse.json(payload)
  } catch (error: unknown) {
    console.error("Error loading box sparklines:", error)
    return NextResponse.json({ error: "Failed to load box sparklines" }, { status: 500 })
  }
}
