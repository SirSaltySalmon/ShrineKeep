import { ownerThumbnailSource } from "@/lib/media/presentation"
import type { Box, Item } from "@/lib/types"
import type {
  PublicBox,
  PublicBoxStats,
  PublicCollectionItem,
  PublicItemDetail,
  PublicWishlistItem,
} from "../contracts"
import type {
  PresentedBox,
  PresentedBoxStats,
  PresentedItem,
  PresentedItemDetail,
} from "./models"

export function presentOwnerBox(box: Box): PresentedBox {
  return {
    id: box.id,
    name: box.name,
    description: box.description ?? null,
    totalValue: box.total_value,
    totalAcquisitionCost: box.total_acquisition_cost,
    itemCount: box.item_count,
  }
}

export function presentPublicBox(box: PublicBox): PresentedBox {
  return {
    id: box.id,
    name: box.name,
    description: box.description,
  }
}

export function presentOwnerItem(item: Item): PresentedItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? null,
    thumbnailUrl: ownerThumbnailSource(item) ?? item.thumbnail_url ?? null,
    currentValue: item.current_value ?? null,
    acquisitionPrice: item.acquisition_price ?? null,
    acquisitionDate: item.acquisition_date ?? null,
    expectedPrice: item.expected_price ?? null,
    visibleTargetName: null,
    tags: (item.tags ?? []).map(tag => ({ id: tag.id, name: tag.name, color: tag.color })),
  }
}

export function presentPublicCollectionItem(item: PublicCollectionItem): PresentedItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    thumbnailUrl: item.thumbnail?.url ?? null,
    currentValue: item.currentValue,
    acquisitionPrice: item.acquisitionPrice,
    acquisitionDate: item.acquisitionDate,
    expectedPrice: null,
    visibleTargetName: null,
    tags: [],
  }
}

export function presentPublicWishlistItem(item: PublicWishlistItem): PresentedItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    thumbnailUrl: item.thumbnail?.url ?? null,
    currentValue: null,
    acquisitionPrice: null,
    acquisitionDate: null,
    expectedPrice: item.expectedPrice,
    visibleTargetName: item.visibleTarget?.name ?? null,
    tags: [],
  }
}

export function presentPublicItemDetail<T extends PublicCollectionItem | PublicWishlistItem>(
  detail: PublicItemDetail<T>,
  presentItem: (item: T) => PresentedItem,
): PresentedItemDetail {
  const item = presentItem(detail.item)
  return {
    item,
    photos: detail.photos.entries.map(photo => ({ url: photo.url, alt: item.name })),
  }
}

export function presentPublicBoxStats(stats: PublicBoxStats): PresentedBoxStats {
  return {
    currentValue: stats.currentValue,
    totalAcquisition: stats.totalAcquisition,
    profit: stats.currentValue - stats.totalAcquisition,
    valueChartData: stats.valueHistory.map(point => ({ date: point.date, value: point.value })),
    acquisitionChartData: stats.acquisitionHistory.map(point => ({
      date: point.date,
      cumulativeAcquisition: point.cumulativeAcquisition,
    })),
  }
}

const OWNER_ONLY_ITEM_KEYS = ["user_id", "box_id", "photos", "storage_path", "is_wishlist", "position"] as const
const OWNER_ONLY_BOX_KEYS = ["user_id", "is_public", "parent_box_id", "position"] as const

export function publicItemPropKeys(item: PresentedItem): string[] {
  return Object.keys(item).filter(key => (OWNER_ONLY_ITEM_KEYS as readonly string[]).includes(key))
}

export function publicBoxPropKeys(box: PresentedBox): string[] {
  return Object.keys(box).filter(key => (OWNER_ONLY_BOX_KEYS as readonly string[]).includes(key))
}
