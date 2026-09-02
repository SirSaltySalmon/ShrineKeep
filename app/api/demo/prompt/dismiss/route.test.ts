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
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { is_sandbox: false, sandbox_expires_at: null },
              error: null,
            }),
          }),
        }),
      }),
    })
    mockSetDashboardDemoPromptDismissed.mockResolvedValue(undefined)
    const response = await POST()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
  })
})
