import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("wishlist owner sharing", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./wishlist-client.tsx", import.meta.url)),
    "utf8",
  )

  it("does not edit root audience on the wishlist page", () => {
    expect(src).not.toContain("<ContainerAudienceFields")
    expect(src).toContain("<WishlistSharingPanel")
  })

  it("previews the guest projection on a separate cache key", () => {
    expect(src).toContain("GuestWishlistPreview")
    expect(src).toContain("Preview public wishlist")
    expect(src).toContain("Exit preview")
    const preview = readFileSync(
      fileURLToPath(new URL("../../components/wishlist/guest-preview.tsx", import.meta.url)),
      "utf8",
    )
    expect(preview).toContain("sharingKeys.preview")
    expect(preview).toContain("fetchPreviewWishlist")
    expect(preview).toContain("publishedCapabilities(false)")
    expect(preview).not.toMatch(/ItemDialog|onMarkAcquired|canEdit/)
    expect(preview).toContain("visibleCount")
    expect(preview).toContain("PUBLIC_EMPTY_COPY")
  })
})
