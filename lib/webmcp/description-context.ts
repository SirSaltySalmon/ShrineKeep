const DESCRIPTION_PREVIEW_LENGTH = 300

/** Extract links before shortening notes so evidence URLs are never cut off. */
export function descriptionContext(description: string | null, includeFull = false) {
  const urls = new Set<string>()
  for (const match of Array.from((description ?? "").matchAll(/https?:\/\/[^\s<>"`]+/gi))) {
    let candidate = match[0].replace(/[.,;:!?]+$/, "")
    // Strip Markdown/prose closing delimiters, preserving balanced URL parentheses.
    while (/[)\]}]$/.test(candidate)) {
      const closing = candidate.at(-1)!
      const opening = closing === ")" ? "(" : closing === "]" ? "[" : "{"
      if (candidate.split(closing).length <= candidate.split(opening).length) break
      candidate = candidate.slice(0, -1)
    }
    try {
      const url = new URL(candidate)
      if (url.protocol === "http:" || url.protocol === "https:") urls.add(url.toString())
    } catch {
      // User notes can contain incomplete links; only expose valid URLs.
    }
  }
  return {
    description: includeFull ? description : description?.slice(0, DESCRIPTION_PREVIEW_LENGTH) ?? null,
    description_truncated: !includeFull && (description?.length ?? 0) > DESCRIPTION_PREVIEW_LENGTH,
    description_urls: Array.from(urls),
  }
}

export function creationDescription(value: unknown, attachPriceEvidence: boolean): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "string" || value.length > 10_000) {
    throw new Error("Description must be a string of at most 10,000 characters")
  }
  const description = value.trim() || null
  if (description && !attachPriceEvidence) {
    throw new Error("Creation descriptions require explicit attach_price_evidence approval")
  }
  return description
}
