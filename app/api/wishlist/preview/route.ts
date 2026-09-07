import type { NextRequest } from "next/server"
import { publicReadResponse } from "@/lib/sharing/server/http"

export async function GET(request: NextRequest) {
  return publicReadResponse(request, (core, viewer) => {
    if (viewer.kind !== "authenticated") return Promise.resolve({ ok: false, error: { code: "authentication_required", status: 401 } })
    return core.previewWishlist(viewer.userId, { cursor: request.nextUrl.searchParams.get("cursor") ?? undefined })
  }, true)
}
