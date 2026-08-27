import { beforeEach, describe, expect, it, vi } from "vitest"
import { applyItemPatch, ItemNotFoundError } from "./patch-item"

function makeSupabase(opts: {
  item?: { id: string } | null
  photosToDelete?: Array<{ id: string; storage_path: string | null }>
  remainingRefs?: Array<{ id: string; storage_path: string }>
  remainingPhotos?: Array<{ id: string; url: string; is_thumbnail: boolean }>
  currentTags?: Array<{ tag_id: string }>
  validTags?: Array<{ id: string }>
  latestValue?: number | null
}) {
  const remove = vi.fn().mockResolvedValue({ error: null })
  const calls = {
    photosDelete: [] as unknown[],
    photosUpdate: [] as unknown[],
    photosInsert: [] as unknown[],
    itemsUpdate: [] as unknown[],
    itemTagsDelete: [] as unknown[],
    itemTagsInsert: [] as unknown[],
    tagsQueried: false,
    valueHistoryInsert: [] as unknown[],
    valueHistorySelect: 0,
  }

  const from = vi.fn().mockImplementation((table: string) => {
    const state: {
      op: "select" | "update" | "insert" | "delete"
      select?: string
      payload?: unknown
      inCol?: string
      inVal?: unknown
    } = { op: "select" }

    const resolve = () => {
      if (table === "items") {
        if (state.op === "select") return { data: opts.item ?? null, error: null }
        calls.itemsUpdate.push(state.payload)
        return { error: null }
      }
      if (table === "photos") {
        if (state.op === "delete") {
          calls.photosDelete.push(state.inVal)
          return { error: null }
        }
        if (state.op === "update") {
          calls.photosUpdate.push(state.payload)
          return { error: null }
        }
        if (state.op === "insert") {
          calls.photosInsert.push(state.payload)
          return { error: null }
        }
        if (state.select?.includes("items!inner")) {
          return { data: opts.remainingRefs ?? [], error: null }
        }
        if (state.inCol === "id") {
          return { data: opts.photosToDelete ?? [], error: null }
        }
        return { data: opts.remainingPhotos ?? [], error: null }
      }
      if (table === "item_tags") {
        if (state.op === "select") return { data: opts.currentTags ?? [], error: null }
        if (state.op === "delete") {
          calls.itemTagsDelete.push(state.inVal)
          return { error: null }
        }
        calls.itemTagsInsert.push(state.payload)
        return { error: null }
      }
      if (table === "tags") {
        calls.tagsQueried = true
        return { data: opts.validTags ?? [], error: null }
      }
      if (table === "value_history") {
        if (state.op === "insert") {
          calls.valueHistoryInsert.push(state.payload)
          return { error: null }
        }
        calls.valueHistorySelect += 1
        const value = opts.latestValue
        return {
          data: value == null ? [] : [{ value }],
          error: null,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }

    const builder: Record<string, any> = {
      select: vi.fn((cols?: string) => {
        state.op = "select"
        state.select = cols
        return builder
      }),
      update: vi.fn((payload: unknown) => {
        state.op = "update"
        state.payload = payload
        return builder
      }),
      insert: vi.fn((payload: unknown) => {
        state.op = "insert"
        state.payload = payload
        return builder
      }),
      delete: vi.fn(() => {
        state.op = "delete"
        return builder
      }),
      eq: vi.fn(() => builder),
      in: vi.fn((col: string, val: unknown) => {
        state.inCol = col
        state.inVal = val
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve(resolve())),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
    }
    return builder
  })

  return {
    supabase: {
      from,
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    } as any,
    remove,
    calls,
  }
}

describe("applyItemPatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws ItemNotFoundError when the item is missing", async () => {
    const { supabase } = makeSupabase({ item: null })
    await expect(
      applyItemPatch({
        supabase,
        userId: "user-1",
        patch: { id: "missing", name: "Lens" },
      })
    ).rejects.toBeInstanceOf(ItemNotFoundError)
  })

  it("does not touch photos when photos are omitted", async () => {
    const { supabase, remove, calls } = makeSupabase({ item: { id: "item-1" } })
    await applyItemPatch({
      supabase,
      userId: "user-1",
      patch: { id: "item-1", name: "Lens" },
    })
    expect(calls.photosDelete).toEqual([])
    expect(calls.photosUpdate).toEqual([])
    expect(calls.photosInsert).toEqual([])
    expect(remove).not.toHaveBeenCalled()
    expect(calls.itemsUpdate).toContainEqual({ name: "Lens" })
  })

  it("updates photo flags without removing storage", async () => {
    const { supabase, remove, calls } = makeSupabase({
      item: { id: "item-1" },
      remainingPhotos: [
        { id: "photo-a", url: "https://a", is_thumbnail: false },
        { id: "photo-b", url: "https://b", is_thumbnail: true },
      ],
    })

    await applyItemPatch({
      supabase,
      userId: "user-1",
      patch: {
        id: "item-1",
        photos: {
          update: [
            { id: "photo-a", is_thumbnail: false },
            { id: "photo-b", is_thumbnail: true },
          ],
        },
      },
    })

    expect(remove).not.toHaveBeenCalled()
    expect(calls.photosDelete).toEqual([])
    expect(calls.photosUpdate).toEqual(
      expect.arrayContaining([{ is_thumbnail: false }, { is_thumbnail: true }])
    )
  })

  it("deletes unreferenced storage when the last photo row is removed", async () => {
    const { supabase, remove, calls } = makeSupabase({
      item: { id: "item-1" },
      photosToDelete: [{ id: "photo-1", storage_path: "user-1/items/a.jpg" }],
      remainingRefs: [{ id: "photo-1", storage_path: "user-1/items/a.jpg" }],
      remainingPhotos: [],
    })

    await applyItemPatch({
      supabase,
      userId: "user-1",
      patch: { id: "item-1", photos: { delete: ["photo-1"] } },
    })

    expect(remove).toHaveBeenCalledWith(["user-1/items/a.jpg"])
    expect(calls.photosDelete).toEqual([["photo-1"]])
  })

  it("keeps the blob when another item still references the storage_path", async () => {
    const { supabase, remove, calls } = makeSupabase({
      item: { id: "item-1" },
      photosToDelete: [{ id: "photo-1", storage_path: "user-1/items/a.jpg" }],
      remainingRefs: [
        { id: "photo-1", storage_path: "user-1/items/a.jpg" },
        { id: "photo-other", storage_path: "user-1/items/a.jpg" },
      ],
      remainingPhotos: [],
    })

    await applyItemPatch({
      supabase,
      userId: "user-1",
      patch: { id: "item-1", photos: { delete: ["photo-1"] } },
    })

    expect(remove).not.toHaveBeenCalled()
    expect(calls.photosDelete).toEqual([["photo-1"]])
  })

  it("set-diffs tags without rewriting unchanged links", async () => {
    const { supabase, calls } = makeSupabase({
      item: { id: "item-1" },
      currentTags: [{ tag_id: "tag-1" }, { tag_id: "tag-2" }],
      validTags: [{ id: "tag-3" }],
    })

    await applyItemPatch({
      supabase,
      userId: "user-1",
      patch: { id: "item-1", tag_ids: ["tag-1", "tag-3"] },
    })

    expect(calls.itemTagsDelete).toEqual([["tag-2"]])
    expect(calls.itemTagsInsert).toEqual([[{ item_id: "item-1", tag_id: "tag-3" }]])
    expect(calls.tagsQueried).toBe(true)
  })

  it("skips tag validation when tag_ids are omitted", async () => {
    const { supabase, calls } = makeSupabase({ item: { id: "item-1" } })
    await applyItemPatch({
      supabase,
      userId: "user-1",
      patch: { id: "item-1", description: "Updated" },
    })
    expect(calls.tagsQueried).toBe(false)
    expect(calls.itemTagsDelete).toEqual([])
    expect(calls.valueHistorySelect).toBe(0)
  })
})
