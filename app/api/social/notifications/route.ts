import { NextRequest } from "next/server"
import { handleSocialRead } from "@/lib/social/server/http"

export function GET(request: NextRequest) {
  return handleSocialRead(request, "notifications")
}
