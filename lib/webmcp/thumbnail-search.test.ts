import { describe, expect, it, vi } from "vitest"
import { addFirstImageThumbnails } from "./thumbnail-search"
import type { ApprovedCreatedItem } from "./types"

function item(name: string): ApprovedCreatedItem {
  return {
    name,
    item_kind: "wishlist",
    current_value: null,
    acquisition_price: null,
    expected_price: null,
  }
}

describe("addFirstImageThumbnails", () => {
  it("uses the existing image-search endpoint and marks the first web result as thumbnail", async () => {
    const fetchImageSearch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          images: ["not a url", "https://images.example.com/aerial.jpg", "https://example.com/other.jpg"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )

    await expect(
      addFirstImageThumbnails([item("Gundam Aerial Rebuild")], fetchImageSearch)
    ).resolves.toEqual([
      {
        ...item("Gundam Aerial Rebuild"),
        photos: [
          {
            url: "https://images.example.com/aerial.jpg",
            is_thumbnail: true,
          },
        ],
      },
    ])
    expect(fetchImageSearch).toHaveBeenCalledWith(
      "/api/images/search?q=Gundam%20Aerial%20Rebuild"
    )
  })

  it("keeps creation best-effort when image search fails", async () => {
    const original = [item("Darilbalde")]
    const fetchImageSearch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))

    await expect(addFirstImageThumbnails(original, fetchImageSearch)).resolves.toEqual(original)
  })
})
