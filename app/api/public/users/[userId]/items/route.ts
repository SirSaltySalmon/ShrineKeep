import type { NextRequest } from "next/server"
import { publicReadResponse } from "@/lib/sharing/server/http"

/** Loose owned items at the collection root. Boxed items use `/boxes/[boxId]/items`. */
export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params
  return publicReadResponse(request, (core, viewer) => core.collectionItems(userId, viewer, {
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
  }))
}
