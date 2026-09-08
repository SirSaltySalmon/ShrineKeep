import type { NextRequest } from "next/server"
import { publicReadResponse } from "@/lib/sharing/server/http"

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string; itemId: string }> }) {
  const { userId, itemId } = await context.params
  return publicReadResponse(request, (core, viewer) => core.wishlistItem(userId, viewer, itemId, {
    photosCursor: request.nextUrl.searchParams.get("photosCursor") ?? undefined,
  }))
}
