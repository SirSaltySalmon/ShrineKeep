import { beforeEach, describe, expect, it, vi } from "vitest"
import { deletePhotoRowsAndUnreferencedStorage } from "./photo-storage"

function makeSupabase(opts: {
  remainingRefs: Array<{ id: string; storage_path: string }>
}) {
  const remove = vi.fn().mockResolvedValue({ error: null })
  const photosDeleteIn = vi.fn().mockResolvedValue({ error: null })
  const photosDelete = vi.fn().mockReturnValue({ in: photosDeleteIn })

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "photos") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: opts.remainingRefs, error: null }),
          }),
        }),
        delete: photosDelete,
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    supabase: {
      from,
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    } as any,
    remove,
    photosDelete,
    photosDeleteIn,
  }
}

describe("deletePhotoRowsAndUnreferencedStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("is a no-op for an empty photo list", async () => {
    const { supabase, remove, photosDelete } = makeSupabase({ remainingRefs: [] })
    const result = await deletePhotoRowsAndUnreferencedStorage(supabase, "user-1", [])
    expect(result).toEqual({ deletedCount: 0, deletedFromStorage: 0 })
    expect(remove).not.toHaveBeenCalled()
    expect(photosDelete).not.toHaveBeenCalled()
  })

  it("removes storage when no other photo row references the path", async () => {
    const { supabase, remove, photosDeleteIn } = makeSupabase({
      remainingRefs: [{ id: "photo-1", storage_path: "user-1/items/a.jpg" }],
    })

    const result = await deletePhotoRowsAndUnreferencedStorage(supabase, "user-1", [
      { id: "photo-1", storage_path: "user-1/items/a.jpg" },
    ])

    expect(remove).toHaveBeenCalledWith(["user-1/items/a.jpg"])
    expect(photosDeleteIn).toHaveBeenCalledWith("id", ["photo-1"])
    expect(result.deletedFromStorage).toBe(1)
    expect(result.deletedCount).toBe(1)
  })

  it("keeps the blob when another item still references the storage_path", async () => {
    const { supabase, remove, photosDeleteIn } = makeSupabase({
      remainingRefs: [
        { id: "photo-1", storage_path: "user-1/items/a.jpg" },
        { id: "photo-other", storage_path: "user-1/items/a.jpg" },
      ],
    })

    const result = await deletePhotoRowsAndUnreferencedStorage(supabase, "user-1", [
      { id: "photo-1", storage_path: "user-1/items/a.jpg" },
    ])

    expect(remove).not.toHaveBeenCalled()
    expect(photosDeleteIn).toHaveBeenCalledWith("id", ["photo-1"])
    expect(result.deletedFromStorage).toBe(0)
    expect(result.deletedCount).toBe(1)
  })
})
