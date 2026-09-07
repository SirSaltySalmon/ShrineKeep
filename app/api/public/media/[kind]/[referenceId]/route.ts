import type { NextRequest } from "next/server"
import { publicMediaResponse } from "@/lib/media/server/http"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ kind: string; referenceId: string }> },
) {
  const { kind, referenceId } = await context.params
  return publicMediaResponse(request, kind, referenceId)
}
