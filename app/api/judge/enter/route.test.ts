import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const {
  mockCreateSupabaseServerClient,
  mockClassifyAuthUser,
  mockMintSandboxSession,
  mockDeleteOneExpired,
  mockEnqueueThenDelete,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockClassifyAuthUser: vi.fn(),
  mockMintSandboxSession: vi.fn(),
  mockDeleteOneExpired: vi.fn(),
  mockEnqueueThenDelete: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/judge/sandbox", () => ({
  classifyAuthUser: mockClassifyAuthUser,
  deleteOneExpiredSandboxAuthUser: mockDeleteOneExpired,
  enqueueThenDeleteAuthUser: mockEnqueueThenDelete,
}))

vi.mock("@/lib/judge/mint", () => ({
  mintSandboxSession: mockMintSandboxSession,
}))

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/judge/enter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  )
}

describe("POST /api/judge/enter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
  })

  it("returns 400 without captcha", async () => {
    const response = await post({})
    expect(response.status).toBe(400)
    expect(mockMintSandboxSession).not.toHaveBeenCalled()
  })

  it("refuses a real signed-in user", async () => {
    mockClassifyAuthUser.mockResolvedValue("user")
    const response = await post({ captchaToken: "tok" })
    expect(response.status).toBe(409)
    expect(mockMintSandboxSession).not.toHaveBeenCalled()
  })

  it("resumes a live sandbox without minting", async () => {
    mockClassifyAuthUser.mockResolvedValue("sandbox")
    const response = await post({ captchaToken: "tok" })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, resumed: true })
    expect(mockMintSandboxSession).not.toHaveBeenCalled()
  })

  it("mints for anonymous visitors and lazy-sweeps one expired user", async () => {
    mockClassifyAuthUser.mockResolvedValue("missing")
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    mockMintSandboxSession.mockResolvedValue(new Response(JSON.stringify({ ok: true, resumed: false }), { status: 200 }))
    mockDeleteOneExpired.mockResolvedValue("old")
    const response = await post({ captchaToken: "tok" })
    expect(response.status).toBe(200)
    expect(mockMintSandboxSession).toHaveBeenCalled()
    expect(mockDeleteOneExpired).toHaveBeenCalled()
  })
})
