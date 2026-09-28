import type { NextRequest } from "next/server"
import { publicReadResponse } from "@/lib/sharing/server/http"

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params
  return publicReadResponse(request, (core, viewer) => core.boxes(userId, viewer, {
    parentId: request.nextUrl.searchParams.get("parentId") ?? undefined,
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  }))
}
