import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DELETE } from "./route"

const { mockRequireMutableUser, mockCreateSupabaseServiceClient } = vi.hoisted(() => ({
  mockRequireMutableUser: vi.fn(),
  mockCreateSupabaseServiceClient: vi.fn(),
}))

vi.mock("@/lib/judge/require-mutable-user", () => ({
  requireMutableUser: mockRequireMutableUser,
}))
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mockCreateSupabaseServiceClient,
}))

/** A client whose `from(table).update(values).eq(...)` answers `{ error }`. */
function updateClient(error: unknown) {
  const update = vi.fn((_values: Record<string, unknown>) => ({
    eq: vi.fn().mockResolvedValue({ error }),
  }))
  return { client: { from: vi.fn(() => ({ update })) }, update }
}

describe("DELETE /api/users/me/avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockCreateSupabaseServiceClient.mockReturnValue(updateClient(null).client)
  })
  afterEach(() => vi.restoreAllMocks())

  it("clears the avatar url", async () => {
    const users = updateClient(null)
    mockRequireMutableUser.mockResolvedValue({ ok: true, supabase: users.client, user: { id: "user-1" } })

    const response = await DELETE()

    expect(response.status).toBe(200)
    expect(users.update).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: null }))
  })

  it("fails the request when the avatar url could not be cleared", async () => {
    const dbError = { code: "42501", message: "permission denied for table users" }
    const users = updateClient(dbError)
    mockRequireMutableUser.mockResolvedValue({ ok: true, supabase: users.client, user: { id: "user-1" } })

    const response = await DELETE()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "Failed to remove avatar" })
    expect(console.error).toHaveBeenCalledWith("Error clearing avatar url:", dbError)
  })
})
