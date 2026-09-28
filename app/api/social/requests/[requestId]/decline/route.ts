import { NextRequest } from "next/server"
import { handleSocialMutation } from "@/lib/social/server/http"

export function POST(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  return handleSocialMutation(request, "decline", context.params.then(params => params.requestId))
}
