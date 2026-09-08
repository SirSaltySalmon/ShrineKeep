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
})
