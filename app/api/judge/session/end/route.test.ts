import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const { mockCreateSupabaseServerClient, mockClassifyAuthUser, mockRedirectWithCookies } = vi.hoisted(
  () => ({
    mockCreateSupabaseServerClient: vi.fn(),
    mockClassifyAuthUser: vi.fn(),
    mockRedirectWithCookies: vi.fn(),
  })
)

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/judge/sandbox", () => ({
  classifyAuthUser: mockClassifyAuthUser,
}))

vi.mock("@/lib/judge/session-response", () => ({
  redirectWithCookies: mockRedirectWithCookies,
}))

describe("GET /api/judge/session/end", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
  })

  it("does not sign out a live session", async () => {
    mockClassifyAuthUser.mockResolvedValue("sandbox")
    const response = await GET(new Request("http://localhost/api/judge/session/end") as never)
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("http://localhost/judge")
    expect(mockRedirectWithCookies).not.toHaveBeenCalled()
  })

  it("signs out only an expired sandbox", async () => {
    const signOut = vi.fn()
    const redirectResponse = new Response(null, { status: 307, headers: { location: "http://localhost/judge?expired=1" } })
    mockClassifyAuthUser.mockResolvedValue("expired")
    mockRedirectWithCookies.mockReturnValue({
      response: redirectResponse,
      supabase: { auth: { signOut } },
    })
    const response = await GET(new Request("http://localhost/api/judge/session/end") as never)
    expect(signOut).toHaveBeenCalled()
    expect(response).toBe(redirectResponse)
  })
})
