import type { NextRequest } from "next/server"
import { publicReadResponse } from "@/lib/sharing/server/http"

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string; boxId: string }> }) {
  const { userId, boxId } = await context.params
  return publicReadResponse(request, (core, viewer) => core.collectionItems(userId, viewer, {
    boxId, cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  }))
}
