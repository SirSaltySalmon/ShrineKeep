import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { deleteUserStorage } from "@/lib/moderation/delete-user-storage"
import { createSupabaseServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

const TIME_BUDGET_MS = 20_000

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  const header = request.headers.get("authorization")
  if (!expected || header !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const service = createSupabaseServiceClient()
  const started = Date.now()
  let purged = 0
  let failed = 0

  for (;;) {
    if (Date.now() - started > TIME_BUDGET_MS) break
    const { data, error } = await service
      .from("sandbox_purge_queue")
      .select("user_id")
      .order("enqueued_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data?.user_id) break
    try {
      await deleteUserStorage(service, data.user_id)
      await service.from("sandbox_purge_queue").delete().eq("user_id", data.user_id)
      purged += 1
    } catch (cause) {
      console.error("judge sweep:", cause)
      failed += 1
      break
    }
  }

  return NextResponse.json({ ok: true, purged, failed })
}
