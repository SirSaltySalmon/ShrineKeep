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
    const response = await PUT(makePutRequest({ wishlist_link_enabled: true }) as any)
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

  describe("theme outline (stored inside color_scheme, no column of its own)", () => {
    function mockStoredSettings(settings: Record<string, unknown>) {
      const selectChain = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: settings, error: null }),
      }
      mockCreateSupabaseServerClient.mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
        from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) }),
      })
    }

    it.each(["soft", "hard"])("PUT saves outline %s inside color_scheme", async (outline) => {
      const chain = mockMutableSettings()
      const theme = { background: "0 0% 100%", radius: "0.25rem", outline }
      const response = await PUT(makePutRequest({ theme }) as any)
      expect(response.status).toBe(200)
      expect(chain.upsert).toHaveBeenCalledWith(
        { user_id: "u1", color_scheme: theme, border_radius: "0.25rem" },
        { onConflict: "user_id" }
      )
    })

    it("PUT drops an outline that is not soft or hard", async () => {
      const chain = mockMutableSettings()
      const response = await PUT(
        makePutRequest({ theme: { background: "0 0% 100%", radius: "0.5rem", outline: "neon" } }) as any
      )
      expect(response.status).toBe(200)
      expect(chain.upsert).toHaveBeenCalledWith(
        { user_id: "u1", color_scheme: { background: "0 0% 100%", radius: "0.5rem" }, border_radius: "0.5rem" },
        { onConflict: "user_id" }
      )
    })

    it("GET returns a saved hard outline", async () => {
      mockStoredSettings({ user_id: "u1", color_scheme: { background: "0 0% 100%", outline: "hard" }, border_radius: null })
      const body = await (await GET(new Request("http://localhost/api/settings") as any)).json()
      expect(body.color_scheme.outline).toBe("hard")
    })

    it("GET reads a theme saved before the field existed as soft", async () => {
      mockStoredSettings({ user_id: "u1", color_scheme: { background: "0 0% 100%" }, border_radius: "0.5rem" })
      const body = await (await GET(new Request("http://localhost/api/settings") as any)).json()
      expect(body.color_scheme).toEqual({ background: "0 0% 100%", radius: "0.5rem", outline: "soft" })
    })

    it("GET drops what an unvalidated save left in the stored theme", async () => {
      mockStoredSettings({
        user_id: "u1",
        color_scheme: { background: "0 0% 100%", primary: "red", junk: { a: 1 }, radius: "0" },
        border_radius: "12px",
      })
      const body = await (await GET(new Request("http://localhost/api/settings") as any)).json()
      expect(body.color_scheme).toEqual({ background: "0 0% 100%", radius: "0", outline: "soft" })
    })
  })

  describe("PUT theme validation", () => {
    function savedRow(chain: ReturnType<typeof mockMutableSettings>) {
      expect(chain.upsert).toHaveBeenCalledTimes(1)
      return chain.upsert.mock.calls[0][0]
    }

    it.each([{ theme: null }, { color_scheme: null }, { theme: null, color_scheme: null }])(
      "%j clears the saved theme",
      async (body) => {
        const chain = mockMutableSettings()
        expect((await PUT(makePutRequest(body) as any)).status).toBe(200)
        expect(savedRow(chain)).toStrictEqual({ user_id: "u1", color_scheme: null, border_radius: null })
      }
    )

    it("leaves the saved theme alone when the request has no theme", async () => {
      const chain = mockMutableSettings()
      expect((await PUT(makePutRequest({ graph_overlay: true }) as any)).status).toBe(200)
      expect(savedRow(chain)).toStrictEqual({ user_id: "u1", graph_overlay: true })
    })

    it.each([[["0 0% 0%"]], ["bad"], [7], [true]])("rejects a theme that is %j", async (theme) => {
      const chain = mockMutableSettings()
      expect((await PUT(makePutRequest({ theme }) as any)).status).toBe(400)
      expect((await PUT(makePutRequest({ color_scheme: theme }) as any)).status).toBe(400)
      expect(chain.upsert).not.toHaveBeenCalled()
    })

    it("stores known colors, an allowed radius and a valid outline, and nothing else", async () => {
      const chain = mockMutableSettings()
      const theme = {
        background: "0 0% 100%",
        foreground: 5,
        primary: { h: 0 },
        card: "red",
        border: `0 0% ${"0".repeat(5000)}%`,
        radius: "12px",
        outline: "hard",
        graphOverlay: true,
        constructor: "0 0% 0%",
        note: "x".repeat(10000),
      }
      expect((await PUT(makePutRequest({ theme }) as any)).status).toBe(200)
      expect(savedRow(chain)).toEqual({ user_id: "u1", color_scheme: { background: "0 0% 100%", outline: "hard" } })
    })

    it("stores border_radius only when it is a radius the editor offers", async () => {
      const allowed = mockMutableSettings()
      await PUT(makePutRequest({ border_radius: "0.75rem" }) as any)
      expect(savedRow(allowed)).toEqual({ user_id: "u1", border_radius: "0.75rem" })

      const other = mockMutableSettings()
      await PUT(makePutRequest({ border_radius: "12px" }) as any)
      expect(savedRow(other)).toStrictEqual({ user_id: "u1", border_radius: null })
    })
  })

  describe("PUT display name", () => {
    function mockNameUpdate(error: unknown) {
      const chain = mockMutableSettings()
      const eq = vi.fn().mockResolvedValue({ error })
      const update = vi.fn().mockReturnValue({ eq })
      Object.assign(chain, { update })
      return update
    }

    it("saves the name to public.users", async () => {
      const update = mockNameUpdate(null)
      expect((await PUT(makePutRequest({ name: " Mina " }) as any)).status).toBe(200)
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: "Mina" }))
    })

    it("does not report success when the name fails to save", async () => {
      mockNameUpdate({ message: "permission denied for table users" })
      expect((await PUT(makePutRequest({ name: "Mina" }) as any)).status).toBe(500)
    })
  })
})
