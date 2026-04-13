import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const {
  mockCreateSupabaseServerClient,
  mockPortalCreate,
  mockCaptureRouteException,
  mockCaptureRouteMessage,
  mockStartRouteSpan,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockPortalCreate: vi.fn(),
  mockCaptureRouteException: vi.fn(),
  mockCaptureRouteMessage: vi.fn(),
  mockStartRouteSpan: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/stripe/server", () => ({
  stripe: {
    billingPortal: {
      sessions: {
        create: mockPortalCreate,
      },
    },
  },
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  captureRouteException: mockCaptureRouteException,
  captureRouteMessage: mockCaptureRouteMessage,
  startRouteSpan: mockStartRouteSpan,
}))

describe("POST /api/stripe/portal", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    vi.clearAllMocks()
    mockStartRouteSpan.mockImplementation(async (_a, _b, _c, callback) => callback())
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await POST()
    expect(response.status).toBe(401)
  })

  it("returns 404 when no stripe customer exists", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    })

    const response = await POST()
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "No subscription found" })
  })

  it("returns portal url on success", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { stripe_customer_id: "cus_1" },
            }),
          }),
        }),
      }),
    })
    mockPortalCreate.mockResolvedValue({ url: "https://billing.stripe.test/session" })

    const response = await POST()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      url: "https://billing.stripe.test/session",
    })
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalEnv
  })
})
