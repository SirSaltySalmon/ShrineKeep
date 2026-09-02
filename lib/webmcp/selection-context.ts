import type { Box, Item } from "@/lib/types"
import { descriptionContext } from "./description-context"

const DEFAULT_SELECTION_LIMIT = 25
const MAX_SELECTION_LIMIT = 50

interface SelectionPageInput {
  include_full_description?: unknown
  offset?: unknown
  limit?: unknown
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

function pageBounds(input: SelectionPageInput) {
  return {
    offset: boundedInteger(input.offset, 0, 0, 1_000_000),
    limit: boundedInteger(input.limit, DEFAULT_SELECTION_LIMIT, 1, MAX_SELECTION_LIMIT),
  }
}

function pageResult<T>(records: readonly T[], input: SelectionPageInput) {
  const { offset, limit } = pageBounds(input)
  const page = records.slice(offset, offset + limit)
  return {
    selectedCount: records.length,
    returnedCount: page.length,
    nextOffset: offset + limit < records.length ? offset + limit : null,
    page,
  }
}

export function selectedBoxContext(boxes: readonly Box[], input: SelectionPageInput) {
  const result = pageResult(boxes, input)
  return {
    selectedCount: result.selectedCount,
    returnedCount: result.returnedCount,
    nextOffset: result.nextOffset,
    boxes: result.page.map((box) => ({
      id: box.id,
      name: box.name,
      parentBoxId: box.parent_box_id ?? null,
      updatedAt: box.updated_at,
    })),
  }
}

export function selectedItemContext(items: readonly Item[], input: SelectionPageInput) {
  const result = pageResult(items, input)
  return {
    selectedCount: result.selectedCount,
    returnedCount: result.returnedCount,
    nextOffset: result.nextOffset,
    items: result.page.map((item) =>
      item.is_wishlist
        ? {
            id: item.id,
            name: item.name,
            ...descriptionContext(item.description ?? null, input.include_full_description === true),
            tags: (item.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name })),
            status: "wishlist" as const,
            boxId: item.wishlist_target_box_id ?? null,
            currentValue: item.current_value ?? null,
            expectedPrice: item.expected_price ?? null,
            updatedAt: item.updated_at,
          }
        : {
            id: item.id,
            name: item.name,
            ...descriptionContext(item.description ?? null, input.include_full_description === true),
            tags: (item.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name })),
            status: "owned" as const,
            boxId: item.box_id ?? null,
            currentValue: item.current_value ?? null,
            acquisitionPrice: item.acquisition_price ?? null,
            updatedAt: item.updated_at,
          }
    ),
  }
}
