import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"

const {
  mockCreateSupabaseServerClient,
  mockExpandBoxRefsToTrees,
  mockFlattenBoxCopyTreesForAtomicPaste,
  mockGetSubscriptionStatus,
  mockGetEffectiveCap,
  mockGetOwnedBoxIdSet,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockExpandBoxRefsToTrees: vi.fn(),
  mockFlattenBoxCopyTreesForAtomicPaste: vi.fn(),
  mockGetSubscriptionStatus: vi.fn(),
  mockGetEffectiveCap: vi.fn(),
  mockGetOwnedBoxIdSet: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/copy-expand", () => ({
  expandBoxRefsToTrees: mockExpandBoxRefsToTrees,
  flattenBoxCopyTreesForAtomicPaste: mockFlattenBoxCopyTreesForAtomicPaste,
}))

vi.mock("@/lib/subscription", () => ({
  getSubscriptionStatus: mockGetSubscriptionStatus,
  getEffectiveCap: mockGetEffectiveCap,
}))

vi.mock("@/lib/api/validate-box-ownership", () => ({
  getOwnedBoxIdSet: mockGetOwnedBoxIdSet,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/boxes/paste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/boxes/paste", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({ trees: [] }) as any)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 400 for non-owned target parent", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())

    const response = await POST(
      makeRequest({ trees: [{ name: "Root", children: [], items: [], wishlist_items: [] }], targetParentBoxId: "box-1" }) as any
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "targetParentBoxId must reference one of your boxes",
    })
  })

  it("returns 403 on item_limit_reached rpc errors", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "item_limit_reached:10:10" },
    })
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc,
    })
    mockGetSubscriptionStatus.mockResolvedValue({ isPro: false })
    mockGetEffectiveCap.mockResolvedValue(10)
    mockFlattenBoxCopyTreesForAtomicPaste.mockReturnValue({
      nodes: [],
      items: [],
      wishlistItems: [],
    })

    const response = await POST(
      makeRequest({ trees: [{ name: "Root", children: [], items: [], wishlist_items: [] }] }) as any
    )
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "item_limit_reached",
      currentCount: 10,
      cap: 10,
    })
  })

  it("returns createdBoxIds on success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { created_box_ids: ["box-a"] },
      error: null,
    })
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc,
    })
    mockGetSubscriptionStatus.mockResolvedValue({ isPro: false })
    mockGetEffectiveCap.mockResolvedValue(100)
    mockFlattenBoxCopyTreesForAtomicPaste.mockReturnValue({
      nodes: [],
      items: [],
      wishlistItems: [],
    })

    const response = await POST(
      makeRequest({ trees: [{ name: "Root", children: [], items: [], wishlist_items: [] }] }) as any
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, createdBoxIds: ["box-a"] })
  })

  it("maps ItemCapExceededError to 403", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockGetSubscriptionStatus.mockResolvedValue({ isPro: false })
    mockGetEffectiveCap.mockResolvedValue(100)
    mockFlattenBoxCopyTreesForAtomicPaste.mockImplementation(() => {
      throw new ItemCapExceededError(100, 100)
    })

    const response = await POST(
      makeRequest({ trees: [{ name: "Root", children: [], items: [], wishlist_items: [] }] }) as any
    )
    expect(response.status).toBe(403)
  })
})
