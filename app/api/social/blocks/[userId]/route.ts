import { NextRequest } from "next/server"
import { handleSocialMutation } from "@/lib/social/server/http"

export function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  return handleSocialMutation(request, "unblock", context.params.then(params => params.userId))
}
