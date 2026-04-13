import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const {
  mockCreateSupabaseServerClient,
  mockFlattenBoxCopyTreesForAtomicPaste,
  mockBuildDemoBoxCopyPayloads,
  mockEnsureDemoTagIds,
  mockSetDashboardDemoPromptDismissed,
  mockGetEffectiveCap,
  mockGetSubscriptionStatus,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockFlattenBoxCopyTreesForAtomicPaste: vi.fn(),
  mockBuildDemoBoxCopyPayloads: vi.fn(),
  mockEnsureDemoTagIds: vi.fn(),
  mockSetDashboardDemoPromptDismissed: vi.fn(),
  mockGetEffectiveCap: vi.fn(),
  mockGetSubscriptionStatus: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))
vi.mock("@/lib/api/copy-expand", () => ({
  flattenBoxCopyTreesForAtomicPaste: mockFlattenBoxCopyTreesForAtomicPaste,
}))
vi.mock("@/lib/demo/build-demo-paste-trees", () => ({
  buildDemoBoxCopyPayloads: mockBuildDemoBoxCopyPayloads,
}))
vi.mock("@/lib/demo/ensure-demo-tags", () => ({
  ensureDemoTagIds: mockEnsureDemoTagIds,
}))
vi.mock("@/lib/demo/set-demo-prompt-dismissed", () => ({
  setDashboardDemoPromptDismissed: mockSetDashboardDemoPromptDismissed,
}))
vi.mock("@/lib/subscription", () => ({
  getEffectiveCap: mockGetEffectiveCap,
  getSubscriptionStatus: mockGetSubscriptionStatus,
}))

describe("POST /api/demo/seed", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await POST(new Request("http://localhost/api/demo/seed") as any)
    expect(response.status).toBe(401)
  })

  it("maps item_limit_reached rpc response to 403", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "item_limit_reached:1:1" },
    })
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      rpc,
    })
    mockEnsureDemoTagIds.mockResolvedValue({})
    mockBuildDemoBoxCopyPayloads.mockReturnValue([])
    mockFlattenBoxCopyTreesForAtomicPaste.mockReturnValue({ nodes: [], items: [], wishlistItems: [] })
    mockGetSubscriptionStatus.mockResolvedValue({ isPro: false })
    mockGetEffectiveCap.mockResolvedValue(1)

    const response = await POST(new Request("http://localhost/api/demo/seed") as any)
    expect(response.status).toBe(403)
  })
})
