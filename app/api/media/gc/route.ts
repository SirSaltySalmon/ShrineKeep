import { NextRequest } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { createMediaGcDependencies } from "@/lib/media/server/gc-deps"
import { mediaGcWorkerResponse } from "@/lib/media/server/gc-worker"

export const runtime = "nodejs"

/**
 * Chosen GC trigger (W2): Vercel cron GET to this route with `Authorization: Bearer CRON_SECRET`.
 * The same worker core as `supabase/functions/media-gc`. Hobby cron is daily; Pro can run every minute.
 * Clone observation uses the same route (see `supabase/operations/schedule-media-gc.sql`).
 */
async function gcResponse(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? process.env.MEDIA_GC_WORKER_SECRET
  const forwarded = new Request(request.url, { method: "POST", headers: request.headers })
  return mediaGcWorkerResponse(forwarded, secret, () => createMediaGcDependencies(createSupabaseServiceClient()))
}

export async function GET(request: NextRequest) {
  return gcResponse(request)
}

export async function POST(request: NextRequest) {
  return gcResponse(request)
}
