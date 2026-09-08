import { describe, expect, it } from "vitest"
import { buildItemFormSnapshot, diffItemPatch, type ItemFormSnapshot } from "./item-patch"

function snapshot(overrides: Partial<ItemFormSnapshot> = {}): ItemFormSnapshot {
  return buildItemFormSnapshot({
    name: "Camera",
    description: "Film",
    current_value: 100,
    acquisition_date: "2024-01-01",
    acquisition_price: 80,
    expected_price: null,
    thumbnail_url: "https://example.com/a.jpg",
    box_id: "box-1",
    wishlist_target_box_id: null,
    is_wishlist: false,
    photos: [
      {
        id: "photo-a",
        url: "https://example.com/a.jpg",
        storage_path: "user-1/items/a.jpg",
        is_thumbnail: true,
      },
      {
        id: "photo-b",
        url: "https://example.com/b.jpg",
        storage_path: "user-1/items/b.jpg",
        is_thumbnail: false,
      },
    ],
    tag_ids: ["tag-1", "tag-2"],
    ...overrides,
  })
}

describe("diffItemPatch", () => {
  it("returns null when nothing changed", () => {
    const base = snapshot()
    expect(diffItemPatch(base, snapshot(), "item-1")).toBeNull()
  })

  it("emits thumbnail-only photo updates without create or delete", () => {
    const base = snapshot()
    const current = snapshot({
      thumbnail_url: "https://example.com/b.jpg",
      photos: [
        { ...base.photos[0]!, is_thumbnail: false },
        { ...base.photos[1]!, is_thumbnail: true },
      ],
    })

    expect(diffItemPatch(base, current, "item-1")).toEqual({
      id: "item-1",
      thumbnail_url: "https://example.com/b.jpg",
      photos: {
        update: [
          { id: "photo-a", is_thumbnail: false },
          { id: "photo-b", is_thumbnail: true },
        ],
      },
    })
  })

  it("omits photos and tags when only name changed", () => {
    const base = snapshot()
    const current = snapshot({ name: "Lens" })

    expect(diffItemPatch(base, current, "item-1")).toEqual({
      id: "item-1",
      name: "Lens",
    })
  })

  it("treats tag reorder as a no-op", () => {
    const base = snapshot()
    const current = snapshot({ tag_ids: ["tag-2", "tag-1"] })
    expect(diffItemPatch(base, current, "item-1")).toBeNull()
  })

  it("sends full desired tag_ids when the set changes", () => {
    const base = snapshot()
    const current = snapshot({ tag_ids: ["tag-1", "tag-3"] })
    expect(diffItemPatch(base, current, "item-1")).toEqual({
      id: "item-1",
      tag_ids: ["tag-1", "tag-3"],
    })
  })

  it("creates photos without an id and deletes missing baseline ids", () => {
    const base = snapshot()
    const current = snapshot({
      thumbnail_url: "https://example.com/c.jpg",
      photos: [
        { ...base.photos[0]!, is_thumbnail: false },
        {
          url: "https://example.com/c.jpg",
          storage_path: "user-1/items/c.jpg",
          is_thumbnail: true,
        },
      ],
    })

    expect(diffItemPatch(base, current, "item-1")).toEqual({
      id: "item-1",
      thumbnail_url: "https://example.com/c.jpg",
      photos: {
        create: [
          {
            url: "https://example.com/c.jpg",
            storage_path: "user-1/items/c.jpg",
            is_thumbnail: true,
          },
        ],
        update: [{ id: "photo-a", is_thumbnail: false }],
        delete: ["photo-b"],
      },
    })
  })

  it("normalizes empty strings to null before comparing", () => {
    const base = buildItemFormSnapshot({
      name: "Camera",
      description: "",
      current_value: null,
      is_wishlist: false,
      photos: [],
      tag_ids: [],
    })
    const current = buildItemFormSnapshot({
      name: "Camera",
      description: null,
      current_value: Number.NaN,
      is_wishlist: false,
      photos: [],
      tag_ids: [],
    })
    expect(diffItemPatch(base, current, "item-1")).toBeNull()
  })
})
