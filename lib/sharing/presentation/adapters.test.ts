import { describe, expect, it } from "vitest"
import type { Box, Item } from "@/lib/types"
import type { PublicBox, PublicBoxStats, PublicCollectionItem, PublicWishlistItem } from "../contracts"
import {
  presentOwnerBox,
  presentOwnerItem,
  presentPublicBox,
  presentPublicBoxStats,
  presentPublicCollectionItem,
  presentPublicItemDetail,
  presentPublicWishlistItem,
  publicBoxPropKeys,
  publicItemPropKeys,
} from "./adapters"

const ownerItem: Item = {
  id: "a1000000-0000-4000-8000-000000000001",
  box_id: "a2000000-0000-4000-8000-000000000001",
  user_id: "a0000000-0000-4000-8000-000000000001",
  name: "Figure",
  description: "Owner note",
  thumbnail_url: "/api/media/photo/x",
  current_value: 12,
  acquisition_date: "2024-01-01",
  acquisition_price: 10,
  is_wishlist: false,
  expected_price: undefined,
  position: 0,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  tags: [{ id: "t1", user_id: "a0000000-0000-4000-8000-000000000001", name: "Secret", color: "blue", created_at: "2024-01-01T00:00:00Z" }],
}

const ownerBox: Box = {
  id: "a2000000-0000-4000-8000-000000000001",
  user_id: "a0000000-0000-4000-8000-000000000001",
  name: "Shelf",
  description: "Mine",
  position: 0,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  total_value: 12,
  total_acquisition_cost: 10,
  item_count: 1,
}

const publicItem: PublicCollectionItem = {
  id: ownerItem.id,
  name: "Figure",
  description: "Visible",
  thumbnail: { referenceId: "p1", url: "https://signed.test/p1", expiresAt: "2026-09-08T00:01:00Z" },
  currentValue: 12,
  acquisitionPrice: 10,
  acquisitionDate: "2024-01-01",
}

const publicWish: PublicWishlistItem = {
  id: ownerItem.id,
  name: "Wish",
  description: null,
  thumbnail: null,
  expectedPrice: 5,
  visibleTarget: { id: ownerBox.id, name: "Shelf" },
}

const publicBox: PublicBox = {
  id: ownerBox.id,
  name: "Shelf",
  description: "Visible",
  displayParentId: null,
  hasVisibleChildren: false,
}

describe("presentation adapters", () => {
  it("keeps owner tags and totals on the owner path", () => {
    expect(presentOwnerItem(ownerItem).tags).toEqual([{ id: "t1", name: "Secret", color: "blue" }])
    expect(presentOwnerBox(ownerBox).totalValue).toBe(12)
  })

  it("public item props omit owner-only fields and tags", () => {
    const presented = presentPublicCollectionItem(publicItem)
    expect(presented.tags).toEqual([])
    expect(publicItemPropKeys(presented)).toEqual([])
    expect(JSON.stringify(presented)).not.toMatch(/user_id|box_id|storage_path|Secret/)
    expect(presented.thumbnailUrl).toBe("https://signed.test/p1")
  })

  it("public wishlist cards carry expected price and visible target name only", () => {
    const presented = presentPublicWishlistItem(publicWish)
    expect(presented.expectedPrice).toBe(5)
    expect(presented.visibleTargetName).toBe("Shelf")
    expect(presented.currentValue).toBeNull()
    expect(presented.tags).toEqual([])
  })

  it("public boxes omit financial totals unless the public DTO had them", () => {
    const presented = presentPublicBox(publicBox)
    expect(presented.totalValue).toBeUndefined()
    expect(presented.totalAcquisitionCost).toBeUndefined()
    expect(publicBoxPropKeys(presented)).toEqual([])
  })

  it("public detail paginates photos without tags", () => {
    const detail = presentPublicItemDetail({
      item: publicItem,
      photos: { entries: [{ referenceId: "p1", url: "https://signed.test/p1", expiresAt: null }], nextCursor: null, hasMore: false },
    }, presentPublicCollectionItem)
    expect(detail.item.tags).toEqual([])
    expect(detail.photos).toEqual([{ url: "https://signed.test/p1", alt: "Figure" }])
  })

  it("maps public stats onto the shared chart props", () => {
    const stats: PublicBoxStats = {
      currentValue: 12,
      totalAcquisition: 10,
      valueHistory: [{ date: "2024-01-01", value: 12 }],
      acquisitionHistory: [{ date: "2024-01-01", cumulativeAcquisition: 10 }],
      bucket: "day",
    }
    expect(presentPublicBoxStats(stats)).toEqual({
      currentValue: 12,
      totalAcquisition: 10,
      profit: 2,
      valueChartData: [{ date: "2024-01-01", value: 12 }],
      acquisitionChartData: [{ date: "2024-01-01", cumulativeAcquisition: 10 }],
    })
  })
})
