import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { resolvePublishedViewer } from "@/lib/sharing/server/viewer"
import type { OperationResult } from "@/lib/sharing/contracts"
import { createMediaAuthorizeCore, parseMediaKind } from "./authorize-core"

const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization" }

function json(result: OperationResult<unknown>) {
  return result.ok
    ? NextResponse.json(result.data, { headers })
    : NextResponse.json({ error: result.error }, { status: result.error.status, headers })
}

/** Same public-read gate. Signing uses the service client; callers never supply a bucket or path. */
export async function publicMediaResponse(request: NextRequest, kindValue: string, referenceId: string): Promise<NextResponse> {
  if (process.env.SOCIAL_PUBLIC_READS_ENABLED !== "true") {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404, headers })
  }
  const kind = parseMediaKind(kindValue)
  if (!kind) return json({ ok: false, error: { code: "invalid_input", status: 400 } })
  try {
    const cookieStore = await cookies()
    const hasAuthCookie = cookieStore.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
    const supabase = await createSupabaseServerClient()
    const viewer = await resolvePublishedViewer(supabase.auth, request.headers.get("authorization"), hasAuthCookie)
    if (!viewer.ok) return json(viewer)
    const service = createSupabaseServiceClient()
    const authorize = createMediaAuthorizeCore(
      (name, args) => service.rpc(name, args),
      async (bucket, objectPath, lifetimeSeconds) => {
        const signed = await service.storage.from(bucket).createSignedUrl(objectPath, lifetimeSeconds)
        return signed.error || !signed.data?.signedUrl ? null : { url: signed.data.signedUrl }
      },
    )
    return json(await authorize(kind, referenceId, viewer.data))
  } catch {
    return json({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
  }
}

/** Owner Dashboard delivery. Not gated by public-read rollout; never uses a guest viewer. */
export async function ownerMediaResponse(request: NextRequest, kindValue: string, referenceId: string): Promise<NextResponse> {
  const kind = parseMediaKind(kindValue)
  if (!kind) return json({ ok: false, error: { code: "invalid_input", status: 400 } })
  try {
    const cookieStore = await cookies()
    const hasAuthCookie = cookieStore.getAll().some(cookie => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
    const supabase = await createSupabaseServerClient()
    const viewer = await resolvePublishedViewer(supabase.auth, request.headers.get("authorization"), hasAuthCookie)
    if (!viewer.ok) return json(viewer)
    if (viewer.data.kind !== "authenticated") return json({ ok: false, error: { code: "authentication_required", status: 401 } })
    const service = createSupabaseServiceClient()
    if (kind === "photo") {
      await service.rpc("media_register_legacy_photo_for_owner", {
        p_actor_id: viewer.data.userId,
        p_photo_id: referenceId,
      })
    } else if (referenceId.toLowerCase() === viewer.data.userId.toLowerCase()) {
      await service.rpc("media_register_legacy_avatar", { p_owner_id: viewer.data.userId })
    }
    const authorize = createMediaAuthorizeCore(
      (name, args) => service.rpc(name, args),
      async (bucket, objectPath, lifetimeSeconds) => {
        const signed = await service.storage.from(bucket).createSignedUrl(objectPath, lifetimeSeconds)
        return signed.error || !signed.data?.signedUrl ? null : { url: signed.data.signedUrl }
      },
      "media_authorize_owner_reference",
    )
    return json(await authorize(kind, referenceId, viewer.data))
  } catch {
    return json({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
  }
}
