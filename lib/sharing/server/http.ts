import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { createPublicReadCore } from "./read-core"
import { createMediaAuthorizeCore } from "@/lib/media/server/authorize-core"
import { resolvePublishedViewer } from "./viewer"
import type { OperationResult, PublicReadService, PublishedViewer } from "../contracts"

type ReadCore = Pick<PublicReadService, "profile" | "boxes" | "collectionItems" | "collectionItem" | "wishlistItem" | "wishlist" | "previewWishlist" | "tokenWishlist">
type Handler = (core: ReadCore, viewer: PublishedViewer) => Promise<OperationResult<unknown>>
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization" }

/** Keep disabled until canonical media/legacy policy cutover passes the privacy gate. */
export async function publicReadResponse(request: NextRequest, run: Handler, requireOwner = false): Promise<NextResponse> {
  if (process.env.SOCIAL_PUBLIC_READS_ENABLED !== "true") return NextResponse.json({ error: { code: "not_found" } }, { status: 404, headers })
  try {
    const cookieStore = await cookies()
    const hasAuthCookie = cookieStore.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
    const supabase = await createSupabaseServerClient()
    const viewer = await resolvePublishedViewer(supabase.auth, request.headers.get("authorization"), hasAuthCookie)
    if (!viewer.ok) return NextResponse.json({ error: viewer.error }, { status: viewer.error.status, headers })
    if (requireOwner && viewer.data.kind === "guest") return NextResponse.json({ error: { code: "authentication_required" } }, { status: 401, headers })
    const secret = process.env.SHARING_CURSOR_SECRET
    if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Missing cursor configuration")
    const service = createSupabaseServiceClient()
    const rpc = (name: string, args: Record<string, unknown>) => service.rpc(name, args)
    const authorize = createMediaAuthorizeCore(rpc, async (bucket, path, lifetime) => {
      const signed = await service.storage.from(bucket).createSignedUrl(path, lifetime)
      return signed.error || !signed.data?.signedUrl ? null : { url: signed.data.signedUrl }
    })
    const core = createPublicReadCore(rpc, secret, authorize)
    const result = await run(core, viewer.data)
    return result.ok ? NextResponse.json(result.data, { headers }) : NextResponse.json({ error: result.error }, { status: result.error.status, headers })
  } catch {
    return NextResponse.json({ error: { code: "temporarily_unavailable" } }, { status: 503, headers })
  }
}
