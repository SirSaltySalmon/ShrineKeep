import { NextRequest } from "next/server"
import { handleSocialMarkRead } from "@/lib/social/server/http"

export function PATCH(request: NextRequest) {
  return handleSocialMarkRead(request)
}
