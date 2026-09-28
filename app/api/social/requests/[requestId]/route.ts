import { NextRequest } from "next/server"
import { handleSocialMutation } from "@/lib/social/server/http"

export function DELETE(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  return handleSocialMutation(request, "cancel", context.params.then(params => params.requestId))
}
