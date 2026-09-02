import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const { mockCreateSupabaseServiceClient, mockDeleteUserStorage } = vi.hoisted(() => ({
  mockCreateSupabaseServiceClient: vi.fn(),
  mockDeleteUserStorage: vi.fn(),
}))

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mockCreateSupabaseServiceClient,
}))

vi.mock("@/lib/moderation/delete-user-storage", () => ({
  deleteUserStorage: mockDeleteUserStorage,
}))

describe("GET /api/judge/sweep", () => {
  const original = process.env.CRON_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "secret"
  })

  it("returns 401 without the bearer secret", async () => {
    const response = await GET(
      new Request("http://localhost/api/judge/sweep", {
        headers: { authorization: "Bearer nope" },
      }) as never
    )
    expect(response.status).toBe(401)
    expect(mockDeleteUserStorage).not.toHaveBeenCalled()
  })

  it("drains one queued user then stops on empty", async () => {
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    mockCreateSupabaseServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi
          .fn()
          .mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValueOnce({ data: { user_id: "gone" }, error: null })
                  .mockResolvedValueOnce({ data: null, error: null }),
              }),
            }),
          }),
        delete: del,
      }),
    })
    mockDeleteUserStorage.mockResolvedValue(undefined)
    const response = await GET(
      new Request("http://localhost/api/judge/sweep", {
        headers: { authorization: "Bearer secret" },
      }) as never
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, purged: 1, failed: 0 })
    expect(mockDeleteUserStorage).toHaveBeenCalledWith(expect.anything(), "gone")
  })

  afterEach(() => {
    process.env.CRON_SECRET = original
  })
})
