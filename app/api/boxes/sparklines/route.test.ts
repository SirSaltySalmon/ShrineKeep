import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockLoadBoxSparklines } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockLoadBoxSparklines: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/services/boxes/load-box-sparklines", () => ({
  loadBoxSparklines: mockLoadBoxSparklines,
}))

const BOX_A = "0b9f6a52-6c1e-4b7e-9a51-3f2f1c0d4e5a"
const BOX_B = "7d3c2b1a-0f9e-4d8c-8b7a-6e5d4c3b2a19"

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/boxes/sparklines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function signIn(userId: string | null) {
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
  }
  mockCreateSupabaseServerClient.mockResolvedValue(client)
  return client
}

describe("POST /api/boxes/sparklines", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 401 when unauthenticated", async () => {
    signIn(null)
    const response = await POST(makeRequest({ boxIds: [BOX_A] }) as any)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(mockLoadBoxSparklines).not.toHaveBeenCalled()
  })

  it("returns 400 when boxIds is missing or empty", async () => {
    signIn("u1")
    for (const body of [{}, { boxIds: [] }, { boxIds: BOX_A }, null]) {
      const response = await POST(makeRequest(body) as any)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "boxIds array is required" })
    }
    expect(mockLoadBoxSparklines).not.toHaveBeenCalled()
  })

  it("returns 400 for a malformed id", async () => {
    signIn("u1")
    for (const bad of ["root", "not-a-uuid", `${BOX_A},${BOX_B}`, 12, null]) {
      const response = await POST(makeRequest({ boxIds: [BOX_A, bad] }) as any)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "boxIds must be box ids" })
    }
    expect(mockLoadBoxSparklines).not.toHaveBeenCalled()
  })

  it("returns 400 when more than 100 ids are sent", async () => {
    signIn("u1")
    const boxIds = Array.from(
      { length: 101 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    )
    const response = await POST(makeRequest({ boxIds }) as any)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "At most 100 boxIds per request" })
    expect(mockLoadBoxSparklines).not.toHaveBeenCalled()
  })

  it("returns 400 for a body that is not JSON", async () => {
    signIn("u1")
    const response = await POST(makeRequest("{boxIds:") as any)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" })
  })

  it("returns the series for the signed-in user's boxes", async () => {
    const client = signIn("u1")
    const series = {
      dates: ["2026-01-01", "2026-02-01", "2026-07-01"],
      value: [0, 10, 14],
      acquisition: [6, 6, 6],
      currentValue: 14,
      totalAcquisition: 6,
    }
    mockLoadBoxSparklines.mockResolvedValue({ [BOX_A]: series })

    const response = await POST(makeRequest({ boxIds: [BOX_A, BOX_B, BOX_A.toUpperCase()] }) as any)
    expect(response.status).toBe(200)
    // BOX_B is not the user's: the loader left it out, and so does the response.
    await expect(response.json()).resolves.toEqual({ sparklines: { [BOX_A]: series } })
    // Scoped to the session user, never to an id from the body; ids arrive de-duplicated.
    expect(mockLoadBoxSparklines).toHaveBeenCalledTimes(1)
    expect(mockLoadBoxSparklines).toHaveBeenCalledWith(client, "u1", [BOX_A, BOX_B])
  })

  it("returns 500 without leaking the cause when loading fails", async () => {
    signIn("u1")
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    mockLoadBoxSparklines.mockRejectedValue(new Error('relation "value_history" does not exist'))

    const response = await POST(makeRequest({ boxIds: [BOX_A] }) as any)
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "Failed to load box sparklines" })
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })
})
