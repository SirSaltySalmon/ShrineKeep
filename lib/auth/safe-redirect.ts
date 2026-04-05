/**
 * Returns a same-site path for post-login redirect. Rejects open-redirect patterns.
 */
export function safePostLoginPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard"
  }
  if (next.length > 2048) {
    return "/dashboard"
  }
  if (next.includes("://")) {
    return "/dashboard"
  }
  return next
}
