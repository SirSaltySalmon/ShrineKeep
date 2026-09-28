import { beforeEach, describe, expect, it, vi } from "vitest"
import { BoxMutationError, deleteBoxes } from "./delete-box"

const { mockRpc, mockRemoveUnreferenced } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockRemoveUnreferenced: vi.fn(),
}))

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ rpc: mockRpc }),
}))

vi.mock("./photo-storage", () => ({
  removeUnreferencedUnregisteredStorage: mockRemoveUnreferenced,
}))

describe("deleteBoxes", () => {
  const userClient = { from: vi.fn() } as never

  beforeEach(() => {
    vi.clearAllMocks()
    mockRemoveUnreferenced.mockResolvedValue(1)
  })

  it("returns without calling the database for an empty selection", async () => {
    await expect(deleteBoxes(userClient, "user-1", [], "delete-all")).resolves.toEqual({ deletedCount: 0 })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it("deletes through one RPC and cleans unregistered photos after delete-all", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        data: {
          deletedCount: 1,
          revision: "4",
          photos: [{ id: "photo-1", storage_path: "user-1/items/a.jpg", asset_id: null }],
        },
      },
      error: null,
    })

    await expect(deleteBoxes(userClient, "user-1", ["box-1", "box-1"], "delete-all")).resolves.toEqual({
      deletedCount: 1,
    })
    expect(mockRpc).toHaveBeenCalledWith("sharing_delete_boxes", {
      p_actor_id: "user-1",
      p_box_ids: ["box-1"],
      p_mode: "delete-all",
    })
    expect(mockRemoveUnreferenced).toHaveBeenCalledWith(userClient, "user-1", [
      { id: "photo-1", storage_path: "user-1/items/a.jpg", asset_id: null },
    ])
  })

  it("does not touch storage when moving contents up", async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, data: { deletedCount: 2, revision: "5", photos: [] } },
      error: null,
    })

    await expect(deleteBoxes(userClient, "user-1", ["box-1", "box-2"], "move-up")).resolves.toEqual({
      deletedCount: 2,
    })
    expect(mockRemoveUnreferenced).not.toHaveBeenCalled()
  })

  it("maps a missing box to a 404 mutation error", async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, error: { code: "not_found", status: 404 } },
      error: null,
    })

    await expect(deleteBoxes(userClient, "user-1", ["box-1"], "delete-all")).rejects.toMatchObject({
      name: "BoxMutationError",
      code: "not_found",
      status: 404,
    })
    expect(mockRemoveUnreferenced).not.toHaveBeenCalled()
  })
})

describe("BoxMutationError", () => {
  it("preserves code and status", () => {
    const error = new BoxMutationError("privacy_conflict", 409)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe("privacy_conflict")
    expect(error.status).toBe(409)
  })
})
