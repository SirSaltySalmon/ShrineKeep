/**
 * Moderator allowlist from env (comma-separated emails). Compared case-insensitively.
 */
export function getModeratorEmailsNormalized(): string[] {
  const raw = process.env.MODERATOR_EMAILS?.trim()
  if (!raw) {
    return []
  }
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function moderatorsConfigured(): boolean {
  return getModeratorEmailsNormalized().length > 0
}

export function isAllowedModeratorEmail(email: string | undefined | null): boolean {
  if (!email) {
    return false
  }
  const list = getModeratorEmailsNormalized()
  if (list.length === 0) {
    return false
  }
  return list.includes(email.trim().toLowerCase())
}
