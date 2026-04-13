import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockSetDashboardDemoPromptDismissed } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockSetDashboardDemoPromptDismissed: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/demo/set-demo-prompt-dismissed", () => ({
  setDashboardDemoPromptDismissed: mockSetDashboardDemoPromptDismissed,
}))

describe("POST /api/demo/prompt/dismiss", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await POST()
    expect(response.status).toBe(401)
  })

  it("returns success on valid user", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
    mockSetDashboardDemoPromptDismissed.mockResolvedValue(undefined)
    const response = await POST()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
  })
})
