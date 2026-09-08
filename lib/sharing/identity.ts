import { NAME_MAX_LENGTH } from "@/lib/validation"
import { SHARING_LIMITS } from "./contracts"

/** PostgreSQL char_length parity: count Unicode code points, not UTF-16 units. */
export function isPublicNicknameValid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && Array.from(value.trim()).length <= NAME_MAX_LENGTH)
}

/** Plain text can contain markup characters; render as text, never HTML/Markdown. */
export function isPublicBioValid(value: unknown): value is string {
  return typeof value === "string" && Array.from(value).length <= SHARING_LIMITS.bioCharacters
}

/** Public and in-app label: stored display name, or Collector-<uuid suffix> when empty. */
export function publicNickname(userId: string, storedDisplayName: string | null | undefined): string {
  return storedDisplayName?.trim() || `Collector-${userId.slice(-8).toLowerCase()}`
}
