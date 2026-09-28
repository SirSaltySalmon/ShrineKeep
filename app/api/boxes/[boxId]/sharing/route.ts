import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { resolvePublishedViewer } from "@/lib/sharing/server/viewer"
import { createSharingMutationCore, parseSharingUpdate } from "@/lib/sharing/server/mutation-core"
import type { OperationResult } from "@/lib/sharing/contracts"

type Context = { params: Promise<{ boxId: string }> }
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization" }
function respond(result: OperationResult<unknown>) {
  return result.ok ? NextResponse.json(result.data, { headers }) : NextResponse.json({ error: result.error }, { status: result.error.status, headers })
}
async function handle(request: NextRequest, context: Context, write: boolean) {
  if (process.env.SOCIAL_SHARING_EDITS_ENABLED !== "true") return respond({ ok: false, error: { code: "not_found", status: 404 } })
  try {
    if (write) {
      const origin = request.headers.get("origin")
      if (origin !== null && origin !== request.nextUrl.origin) return respond({ ok: false, error: { code: "mutation_forbidden", status: 403 } })
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return respond({ ok: false, error: { code: "invalid_input", status: 400 } })
    }
    const cookieStore = await cookies()
    const supabase = await createSupabaseServerClient()
    const viewer = await resolvePublishedViewer(supabase.auth, request.headers.get("authorization"),
      cookieStore.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name)))
    if (!viewer.ok) return respond(viewer)
    if (viewer.data.kind !== "authenticated") return respond({ ok: false, error: { code: "authentication_required", status: 401 } })
    const { boxId } = await context.params
    let input
    if (write) {
      const reader = request.body?.getReader()
      if (!reader) return respond({ ok: false, error: { code: "invalid_input", status: 400 } })
      const chunks: Uint8Array[] = []
      let bytes = 0
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > 4096) { await reader.cancel(); return respond({ ok: false, error: { code: "invalid_input", status: 400 } }) }
        chunks.push(chunk.value)
      }
      try { input = parseSharingUpdate(boxId, JSON.parse(Buffer.concat(chunks).toString("utf8"))) } catch { input = null }
      if (!input) return respond({ ok: false, error: { code: "invalid_input", status: 400 } })
    }
    const service = createSupabaseServiceClient()
    const core = createSharingMutationCore((name,args) => service.rpc(name,args))
    return respond(input ? await core.update(viewer.data.userId,input) : await core.preview(viewer.data.userId,boxId))
  } catch { return respond({ ok: false, error: { code: "temporarily_unavailable", status: 503 } }) }
}
export function GET(request: NextRequest, context: Context) { return handle(request, context, false) }
export function PUT(request: NextRequest, context: Context) { return handle(request, context, true) }
