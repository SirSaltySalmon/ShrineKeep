import { describe, expect, it } from "vitest"
import { PUBLIC_EMPTY_COPY } from "./copy"
import { publicStyleProperties, defaultPublicStyleProperties } from "./style"
import { publishedCapabilities, assertPublicCapabilities } from "./capabilities"

describe("public profile presentation helpers", () => {
  it("empty copy does not claim a wishlist or collection is unpublished", () => {
    expect(PUBLIC_EMPTY_COPY.toLowerCase()).not.toMatch(/not public|unpublished|private|secret/)
  })

  it("v1 published capabilities omit copy and owner mutations", () => {
    const capabilities = publishedCapabilities(false)
    expect(capabilities.canCopyToOwnDashboard).toBe(false)
    expect(capabilities.canOpenDetail).toBe(true)
    expect(capabilities.canShowStats).toBe(true)
    expect(() => assertPublicCapabilities(capabilities)).not.toThrow()
  })

  it("shared style is a property bag, not a document mutation", () => {
    const properties = publicStyleProperties({
      colorScheme: { background: "0 0% 100%", foreground: "222 84% 5%" },
      headerFontFamily: "Lora",
      bodyFontFamily: "Inter",
      borderRadius: "0.75rem",
    }) as Record<string, string>
    expect(properties["--background"]).toBeDefined()
    expect(properties["--font-heading"]).toContain("lora")
    expect(properties["--radius"]).toBe("0.75rem")
    expect((defaultPublicStyleProperties() as Record<string, string>)["--background"]).toBeDefined()
  })
})
