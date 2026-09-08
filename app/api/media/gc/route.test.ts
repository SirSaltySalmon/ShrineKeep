import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "./route"
import { mediaGcWorkerResponse } from "@/lib/media/server/gc-worker"

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: vi.fn(() => ({ rpc: vi.fn(), storage: { from: vi.fn() } })),
}))
vi.mock("@/lib/media/server/gc-worker", () => ({
  mediaGcWorkerResponse: vi.fn(async () => new Response(JSON.stringify({ claimed: 0, deleted: 0, retry: 0, deferred: 0 }), { status: 200 })),
}))
vi.mock("@/lib/media/server/gc-deps", () => ({
  createMediaGcDependencies: vi.fn(() => ({ rpc: vi.fn(), remove: vi.fn() })),
}))

describe("GET/POST /api/media/gc", () => {
  const originalCron = process.env.CRON_SECRET
  const originalWorker = process.env.MEDIA_GC_WORKER_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = "c".repeat(32)
    delete process.env.MEDIA_GC_WORKER_SECRET
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalCron
    process.env.MEDIA_GC_WORKER_SECRET = originalWorker
  })

  it("forwards Vercel GET cron as POST to the shared worker", async () => {
    const request = new Request("http://localhost/api/media/gc", {
      method: "GET",
      headers: { authorization: `Bearer ${"c".repeat(32)}` },
    })
    const response = await GET(request as never)
    expect(response.status).toBe(200)
    expect(mediaGcWorkerResponse).toHaveBeenCalledTimes(1)
    const forwarded = vi.mocked(mediaGcWorkerResponse).mock.calls[0]![0]
    expect(forwarded.method).toBe("POST")
  })

  it("accepts POST from pg_net or the Edge function", async () => {
    const request = new Request("http://localhost/api/media/gc", { method: "POST" })
    await POST(request as never)
    expect(mediaGcWorkerResponse).toHaveBeenCalled()
  })
})
