import { describe, expect, it } from "vitest"
import { creationDescription, descriptionContext } from "./description-context"

describe("description evidence context", () => {
  it("keeps complete URLs crossing and following the preview boundary", () => {
    const first = "https://shop.example.com/products/exact-variant?edition=2026"
    const second = "https://shop.example.com/other"
    const notes = `${"x".repeat(290)} ${first}\n[Other](${second})`
    expect(descriptionContext(notes)).toEqual({
      description: notes.slice(0, 300), description_truncated: true,
      description_urls: [first, second],
    })
    expect(descriptionContext(notes, true)).toEqual({
      description: notes, description_truncated: false, description_urls: [first, second],
    })
  })

  it("deduplicates Markdown, autolinks and plain URLs without breaking balanced parentheses", () => {
    expect(descriptionContext('[Shop](https://example.com/item_(blue)) <https://example.com/item_(blue)> https://example.com/item_(blue). javascript:alert(1) https://').description_urls)
      .toEqual(["https://example.com/item_(blue)"])
  })

  it("preserves null and short user notes", () => {
    expect(descriptionContext(null)).toEqual({ description: null, description_truncated: false, description_urls: [] })
    expect(descriptionContext("Gift from my sister").description).toBe("Gift from my sister")
  })

  it("requires explicit opt-in only for nonempty creation descriptions", () => {
    expect(creationDescription(undefined, false)).toBeNull()
    expect(creationDescription("  ", false)).toBeNull()
    expect(() => creationDescription("evidence", false)).toThrow("explicit")
    expect(creationDescription(" evidence ", true)).toBe("evidence")
    expect(() => creationDescription("x".repeat(10_001), true)).toThrow("10,000")
    expect(creationDescription("x".repeat(10_000), true)).toHaveLength(10_000)
  })
})
