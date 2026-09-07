import { NextRequest } from "next/server"
import { handleSocialMutation, handleSocialRead } from "@/lib/social/server/http"

export function GET(request: NextRequest) {
  return handleSocialRead(request, "blocks")
}

export function POST(request: NextRequest) {
  return handleSocialMutation(request, "block")
}
