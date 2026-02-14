/** Maximum length for display names (signup name, settings display name). */
export const NAME_MAX_LENGTH = 64

/** Minimum length for passwords. */
export const PASSWORD_MIN_LENGTH = 6

/** Maximum length for passwords. */
export const PASSWORD_MAX_LENGTH = 64

export const NAME_MAX_MESSAGE = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`
export const PASSWORD_LENGTH_MESSAGE = `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`

export function isNameValid(value: string): boolean {
  return value.length <= NAME_MAX_LENGTH
}

export function isPasswordLengthValid(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH
}
