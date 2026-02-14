/**
 * Shared types and helpers for auth-related API responses (resend verification, forgot password).
 * Keeps response shapes and rate-limit detection consistent across auth routes.
 */

export type AuthEmailResponse =
  | { ok: true }
  | { ok: false; code: "rate_limited"; message: string }
  | { ok: false; code: "failed"; message: string }
  | { ok: false; code: "missing_email"; message: string }

export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("email rate limit") ||
    lower.includes("per hour") ||
    lower.includes("per minute") ||
    lower.includes("60 second") ||
    lower.includes("too many")
  )
}
