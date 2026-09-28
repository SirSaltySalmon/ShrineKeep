import { NextRequest } from "next/server"
import { handleSocialMutation, handleSocialRead } from "@/lib/social/server/http"

export function GET(request: NextRequest) {
  return handleSocialRead(request, "requests")
}

export function POST(request: NextRequest) {
  return handleSocialMutation(request, "send_request")
}
