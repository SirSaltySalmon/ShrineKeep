import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockRequireMutableUser, mockCompleteOwnedUpload } = vi.hoisted(() => ({
  mockRequireMutableUser: vi.fn(),
  mockCompleteOwnedUpload: vi.fn(),
}))

vi.mock("@/lib/judge/require-mutable-user", () => ({
  requireMutableUser: mockRequireMutableUser,
}))
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ rpc: vi.fn(), storage: { from: vi.fn() } }),
}))
vi.mock("@/lib/media/server/upload-core", () => ({
  completeOwnedUpload: mockCompleteOwnedUpload,
  discardOwnedUpload: vi.fn(),
  prepareOwnedUpload: vi.fn(),
}))

const ASSET_ID = "11111111-1111-4111-8111-111111111111"

function completeAvatarRequest(): Request {
  return new Request("http://localhost/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase: "complete", kind: "avatar", assetId: ASSET_ID }),
  })
}

/** Signs the user in with a client whose users update answers `{ error }`. */
function signInWithUsersUpdate(error: unknown) {
  const update = vi.fn((_values: Record<string, unknown>) => ({
    eq: vi.fn().mockResolvedValue({ error }),
  }))
  mockRequireMutableUser.mockResolvedValue({
    ok: true,
    supabase: { from: vi.fn(() => ({ update })) },
    user: { id: "user-1" },
  })
  return update
}

describe("POST /api/media/upload (complete avatar)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/")
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockCompleteOwnedUpload.mockResolvedValue({
      ok: true,
      data: { assetId: ASSET_ID, objectPath: "user-1/avatar.png", state: "ready" },
    })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("saves the public avatar url and returns it", async () => {
    const update = signInWithUsersUpdate(null)
    const publicUrl = "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.png"

    const response = await POST(completeAvatarRequest() as any)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ assetId: ASSET_ID, publicUrl })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: publicUrl }))
  })

  it("fails the request when the avatar url could not be saved", async () => {
    const dbError = { code: "42501", message: "permission denied for table users" }
    signInWithUsersUpdate(dbError)

    const response = await POST(completeAvatarRequest() as any)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: { code: "temporarily_unavailable" } })
    expect(console.error).toHaveBeenCalledWith("Error saving avatar url:", dbError)
  })
})
