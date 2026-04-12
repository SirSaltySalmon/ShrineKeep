import type { Box, Item } from "@/lib/types"

const MOCK_USER_ID = "00000000-0000-4000-8000-000000000001"
const now = "2026-01-01T00:00:00.000Z"

export const MOCK_BOXES: Box[] = [
  {
    id: "mock-box-1",
    user_id: MOCK_USER_ID,
    parent_box_id: undefined,
    name: "Display shelf",
    description: "",
    is_public: false,
    position: 0,
    created_at: now,
    updated_at: now,
    item_count: 3,
    total_value: 450,
  },
  {
    id: "mock-box-2",
    user_id: MOCK_USER_ID,
    parent_box_id: undefined,
    name: "Storage",
    description: "",
    is_public: false,
    position: 1,
    created_at: now,
    updated_at: now,
    item_count: 1,
    total_value: 120,
  },
]

function mockItem(partial: Partial<Item> & Pick<Item, "id" | "name">): Item {
  return {
    box_id: "mock-box-1",
    wishlist_target_box_id: null,
    user_id: MOCK_USER_ID,
    description: "Placeholder description for layout capture.",
    thumbnail_url: undefined,
    current_value: 49,
    acquisition_date: undefined,
    acquisition_price: undefined,
    is_wishlist: false,
    expected_price: undefined,
    position: 0,
    created_at: now,
    updated_at: now,
    photos: [],
    tags: [],
    ...partial,
  }
}

/** Collection items for dashboard fixture */
export const MOCK_DASHBOARD_ITEMS: Item[] = [
  mockItem({ id: "mock-item-1", name: "Vintage figure", position: 0, current_value: 120 }),
  mockItem({ id: "mock-item-2", name: "Art book", position: 1, current_value: 35 }),
  mockItem({ id: "mock-item-3", name: "Limited print", position: 2, current_value: 80 }),
]

/** Wishlist rows for wishlist fixture */
export const MOCK_WISHLIST_ITEMS: Item[] = [
  mockItem({
    id: "mock-wl-1",
    name: "Grail piece",
    position: 0,
    is_wishlist: true,
    box_id: null,
    expected_price: 299,
  }),
  mockItem({
    id: "mock-wl-2",
    name: "Wishlist item",
    position: 1,
    is_wishlist: true,
    box_id: null,
    expected_price: 45,
  }),
]
