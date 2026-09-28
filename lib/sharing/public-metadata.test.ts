import { describe, expect, it } from "vitest"
import { publicProfileMetadata } from "./public-metadata"
import type { PublicProfile } from "./contracts"

const owner = "61000000-0000-4000-8000-000000000001"

describe("public profile metadata", () => {
  it("uses only the safe projection for a visible profile", () => {
    const profile: PublicProfile = {
      id: owner,
      nickname: "Ada",
      bio: "Collects figures.",
      avatar: { referenceId: owner, url: "https://signed.test/avatar", expiresAt: "2026-09-09T00:01:00Z" },
      relationship: "none",
      sharedStyle: null,
    }
    const metadata = publicProfileMetadata(profile)
    expect(metadata.title).toBe("Ada · ShrineKeep")
    expect(metadata.description).toBe("Collects figures.")
    expect(JSON.stringify(metadata)).not.toMatch(/signed\.test|email|wishlist_share_token|acquisition_price/)
  })

  it("does not name a denied or missing profile", () => {
    const metadata = publicProfileMetadata(null)
    expect(metadata.title).toBe("ShrineKeep")
    expect(JSON.stringify(metadata)).not.toMatch(/Ada|Collector|@/)
  })
})
