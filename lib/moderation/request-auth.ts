import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Optional CORS for browser tools calling moderation APIs from another origin.
 * Requires `credentials: "include"` on fetch when using cookies across origins.
 * Set MODERATION_CORS_ORIGINS to a comma-separated list (e.g. http://localhost:3000).
 */
function corsHeadersForRequest(request: NextRequest): Record<string, string> | null {
  const origin = request.headers.get("origin")
  if (!origin) {
    return null
  }

  const raw = process.env.MODERATION_CORS_ORIGINS?.trim()
  if (!raw) {
    return null
  }

  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )

  if (!allowed.has(origin)) {
    return null
  }

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cookie",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  }
}

export function applyModerationCors(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const cors = corsHeadersForRequest(request)
  if (cors) {
    for (const [k, v] of Object.entries(cors)) {
      response.headers.set(k, v)
    }
  }
  return response
}

export function moderationJsonResponse(
  request: NextRequest,
  body: unknown,
  status: number
): NextResponse {
  const res = NextResponse.json(body, { status })
  return applyModerationCors(request, res)
}

export function moderationOptionsResponse(request: NextRequest): NextResponse {
  const res = new NextResponse(null, { status: 204 })
  return applyModerationCors(request, res)
}
