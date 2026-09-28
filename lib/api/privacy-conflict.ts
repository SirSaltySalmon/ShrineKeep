export const PRIVACY_CONFLICT_CODE = "privacy_conflict"
export const PRIVACY_CONFLICT_MESSAGE =
  "This move would make the wishlist item visible to more people. Keep its current target or choose a box with the same or more restricted visibility."

export function isPrivacyConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const code = "code" in error ? error.code : undefined
  const message = "message" in error ? error.message : undefined
  return code === "P0001" && message === PRIVACY_CONFLICT_CODE
}
