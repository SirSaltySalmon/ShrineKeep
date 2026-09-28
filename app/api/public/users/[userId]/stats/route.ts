import type { NextRequest } from "next/server"
import { publicReadResponse } from "@/lib/sharing/server/http"

export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params
  return publicReadResponse(request, (core, viewer) => core.stats(userId, viewer, {
    boxId: request.nextUrl.searchParams.get("boxId") ?? undefined,
    fromDate: request.nextUrl.searchParams.get("fromDate") ?? undefined,
    toDate: request.nextUrl.searchParams.get("toDate") ?? undefined,
  }))
}
