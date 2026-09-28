import type { NextRequest } from "next/server"
import { publicReadResponse } from "@/lib/sharing/server/http"

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  return publicReadResponse(request, (core, viewer) => core.tokenWishlist(token, viewer, {
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  }))
}
