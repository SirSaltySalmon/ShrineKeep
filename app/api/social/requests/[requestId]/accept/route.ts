import { NextRequest } from "next/server"
import { handleSocialMutation } from "@/lib/social/server/http"

export function POST(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  return handleSocialMutation(request, "accept", context.params.then(params => params.requestId))
}
