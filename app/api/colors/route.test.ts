import { describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

describe("GET /api/colors", () => {
  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await GET(new Request("http://localhost/api/colors") as any)
    expect(response.status).toBe(401)
  })

  it("returns 500 when settings query fails", async () => {
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error("db error") }),
    }
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) }),
    })
    const response = await GET(new Request("http://localhost/api/colors") as any)
    expect(response.status).toBe(500)
  })

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

  it("returns a saved hard outline with the theme", async () => {
    mockStoredSettings({ color_scheme: { background: "0 0% 0%", outline: "hard" }, border_radius: null })
    const body = await (await GET(new Request("http://localhost/api/colors") as any)).json()
    expect(body.theme.outline).toBe("hard")
    expect(body.theme.background).toBe("0 0% 0%")
  })

  it.each([{ background: "0 0% 0%" }, { background: "0 0% 0%", outline: "neon" }])(
    "reads a theme with no valid outline as soft: %j",
    async (colorScheme) => {
      mockStoredSettings({ color_scheme: colorScheme, border_radius: "0.5rem" })
      const body = await (await GET(new Request("http://localhost/api/colors") as any)).json()
      expect(body.theme.outline).toBe("soft")
    }
  )
})
