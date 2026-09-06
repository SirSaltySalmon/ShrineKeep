import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET, PUT } from "./route"

const { mockCreateSupabaseServerClient, mockGenerateShareToken } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockGenerateShareToken: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/settings", () => ({
  generateShareToken: mockGenerateShareToken,
}))

function makePutRequest(body: unknown): Request {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/settings", () => {
  function mockMutableSettings(saveError: unknown = null) {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { is_sandbox: false }, error: null }),
      single: vi.fn().mockResolvedValue({ data: { wishlist_share_token: null }, error: null }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { user_id: "u1" }, error: saveError }),
        }),
      }),
    }
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue(chain),
    })
    return chain
  }

  it.each([true, false])("saves widget visibility %s only for the authenticated user", async (visible) => {
    const chain = mockMutableSettings()
    const response = await PUT(makePutRequest({ ai_widget_visible: visible, user_id: "someone-else" }) as any)
    expect(response.status).toBe(200)
    expect(chain.upsert).toHaveBeenCalledWith({ user_id: "u1", ai_widget_visible: visible }, { onConflict: "user_id" })
  })

  it("restarts the tutorial and restores visibility atomically", async () => {
    const chain = mockMutableSettings()
    const response = await PUT(makePutRequest({ restart_ai_tutorial: true, ai_widget_visible: false }) as any)
    expect(response.status).toBe(200)
    expect(chain.upsert).toHaveBeenCalledWith({
      user_id: "u1", ai_widget_visible: true, dashboard_demo_prompt_dismissed: false,
      ai_tutorial_reset_at: expect.any(String),
    }, { onConflict: "user_id" })
    expect(Number.isNaN(Date.parse(chain.upsert.mock.calls[0][0].ai_tutorial_reset_at))).toBe(false)
  })

  it.each([{ ai_widget_visible: "false" }, { restart_ai_tutorial: 1 }, { ai_widget_visible: null }])("rejects malformed AI preferences %j", async (body) => {
    const chain = mockMutableSettings()
    expect((await PUT(makePutRequest(body) as any)).status).toBe(400)
    expect(chain.upsert).not.toHaveBeenCalled()
  })

  it("does not report success when a preference save fails", async () => {
    mockMutableSettings({ message: "Database unavailable" })
    expect((await PUT(makePutRequest({ ai_widget_visible: false }) as any)).status).toBe(500)
  })

  it("requires authentication to change AI preferences", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    expect((await PUT(makePutRequest({ restart_ai_tutorial: true }) as any)).status).toBe(401)
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("GET returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await GET(new Request("http://localhost/api/settings") as any)
    expect(response.status).toBe(401)
  })

  it("GET returns default shape when settings missing", async () => {
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) }),
    })

    const response = await GET(new Request("http://localhost/api/settings") as any)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user_id).toBe("u1")
  })

  it("PUT returns 403 when a sandbox user publishes a wishlist", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { is_sandbox: true, sandbox_expires_at: "2099-01-01T00:00:00.000Z" },
              error: null,
            }),
            single: vi.fn().mockResolvedValue({ data: { wishlist_share_token: null }, error: null }),
          }),
        }),
      }),
    })
    const response = await PUT(makePutRequest({ wishlist_is_public: true }) as any)
    expect(response.status).toBe(403)
  })

  it("PUT returns 400 for invalid theme format", async () => {
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
    const response = await PUT(makePutRequest({ theme: "bad" }) as any)
    expect(response.status).toBe(400)
  })
})
