import { describe, expect, it } from "vitest"
import { selectedBoxContext, selectedItemContext } from "./selection-context"
import type { Box, Item } from "@/lib/types"

const box = (id: string): Box => ({
  id,
  user_id: "user-1",
  parent_box_id: "parent-1",
  name: `Box ${id}`,
  description: "Intentionally omitted from MCP output",
  is_public: false,
  position: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
})

const item = (id: string, wishlist = false): Item => ({
  id,
  box_id: wishlist ? null : "box-1",
  wishlist_target_box_id: wishlist ? "box-1" : null,
  user_id: "user-1",
  name: `Item ${id}`,
  description: "Intentionally omitted from MCP output",
  thumbnail_url: "https://example.com/image.jpg",
  current_value: wishlist ? undefined : 30,
  acquisition_price: wishlist ? undefined : 20,
  expected_price: wishlist ? 25 : undefined,
  is_wishlist: wishlist,
  position: 0,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
  tags: [{ id: "tag-1", user_id: "user-1", name: "Favorite", color: "red", created_at: "2026-09-01T00:00:00.000Z" }],
})

describe("compact selected WebMCP context", () => {
  it("returns compact editable fields for owned and wishlist items", () => {
    expect(selectedItemContext([item("owned"), item("wanted", true)], {})).toEqual({
      selectedCount: 2,
      returnedCount: 2,
      nextOffset: null,
      items: [
        {
          id: "owned",
          name: "Item owned",
          description: "Intentionally omitted from MCP output",
          description_truncated: false,
          description_urls: [],
          tags: [{ id: "tag-1", name: "Favorite" }],
          status: "owned",
          boxId: "box-1",
          currentValue: 30,
          acquisitionPrice: 20,
          updatedAt: "2026-09-02T00:00:00.000Z",
        },
        {
          id: "wanted",
          name: "Item wanted",
          description: "Intentionally omitted from MCP output",
          description_truncated: false,
          description_urls: [],
          tags: [{ id: "tag-1", name: "Favorite" }],
          status: "wishlist",
          boxId: "box-1",
          currentValue: null,
          expectedPrice: 25,
          updatedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    })
  })

  it("paginates selected boxes and omits box descriptions", () => {
    expect(selectedBoxContext([box("1"), box("2"), box("3")], { offset: 1, limit: 1 })).toEqual({
      selectedCount: 3,
      returnedCount: 1,
      nextOffset: 2,
      boxes: [
        {
          id: "2",
          name: "Box 2",
          parentBoxId: "parent-1",
          updatedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    })
  })

  it("caps page size to keep responses bounded", () => {
    const boxes = Array.from({ length: 60 }, (_, index) => box(String(index)))
    const result = selectedBoxContext(boxes, { limit: 500 })

    expect(result.returnedCount).toBe(50)
    expect(result.nextOffset).toBe(50)
  })
})
