import { describe, expect, it } from "vitest"
import { emptyRootCollectionPage, PublicReadError } from "./public-reads"

describe("emptyRootCollectionPage", () => {
  it("maps a root items not_found to an empty page", () => {
    const empty = emptyRootCollectionPage(new PublicReadError({ code: "not_found", status: 404 }))
    expect(empty).toEqual({ entries: [], nextCursor: null, hasMore: false })
  })

  it("does not swallow boxed-item 404s or other errors", () => {
    const boxed = emptyRootCollectionPage(new PublicReadError({ code: "not_found", status: 404 }), "61000000-0000-4000-8000-000000000002")
    expect(boxed).toBeNull()
    expect(emptyRootCollectionPage(new PublicReadError({ code: "temporarily_unavailable", status: 503 }))).toBeNull()
    expect(emptyRootCollectionPage(new Error("boom"))).toBeNull()
  })
})
