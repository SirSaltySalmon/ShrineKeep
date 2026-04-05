import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function getModerationSecret(): string | null {
  const s = process.env.MODERATION_SECRET?.trim()
  return s && s.length > 0 ? s : null
}

/** Constant-time compare for `?key=` on the moderation page (server-only). */
export function isValidModerationPageKey(candidate: string | undefined | null): boolean {
  const expected = getModerationSecret()
  if (!expected || candidate == null) {
    return false
  }
  if (candidate.length !== expected.length) {
    return false
  }
  try {
    return timingSafeEqual(Buffer.from(candidate, "utf8"), Buffer.from(expected, "utf8"))
  } catch {
    return false
  }
}

export function authorizeModeration(request: NextRequest): boolean {
  const expected = getModerationSecret()
  if (!expected) {
    return false
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    if (token.length !== expected.length) {
      return false
    }
    try {
      return timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"))
    } catch {
      return false
    }
  }

  const headerSecret = request.headers.get("x-moderation-secret")
  if (headerSecret != null) {
    if (headerSecret.length !== expected.length) {
      return false
    }
    try {
      return timingSafeEqual(
        Buffer.from(headerSecret, "utf8"),
        Buffer.from(expected, "utf8")
      )
    } catch {
      return false
    }
  }

  return false
}

/**
 * Optional CORS for browser GUIs that call production from localhost.
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-moderation-secret",
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
