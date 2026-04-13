import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const {
  mockCreateSupabaseServerClient,
  mockGetStripePriceId,
  mockStripeCustomersCreate,
  mockStripeCheckoutCreate,
  mockCaptureRouteException,
  mockCaptureRouteMessage,
  mockStartRouteSpan,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockGetStripePriceId: vi.fn(),
  mockStripeCustomersCreate: vi.fn(),
  mockStripeCheckoutCreate: vi.fn(),
  mockCaptureRouteException: vi.fn(),
  mockCaptureRouteMessage: vi.fn(),
  mockStartRouteSpan: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/stripe/server", () => ({
  getStripePriceId: mockGetStripePriceId,
  stripe: {
    customers: { create: mockStripeCustomersCreate },
    checkout: { sessions: { create: mockStripeCheckoutCreate } },
  },
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  captureRouteException: mockCaptureRouteException,
  captureRouteMessage: mockCaptureRouteMessage,
  startRouteSpan: mockStartRouteSpan,
}))

describe("POST /api/stripe/checkout", () => {
  const originalEnv = process.env.NEXT_PUBLIC_APP_URL

  beforeEach(() => {
    vi.clearAllMocks()
    mockStartRouteSpan.mockImplementation(async (_a, _b, _c, callback) => callback())
    mockGetStripePriceId.mockReturnValue("price_123")
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await POST()
    expect(response.status).toBe(401)
  })

  it("returns 400 when subscription is already active", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { status: "active", stripe_customer_id: "cus_1" } }),
          }),
        }),
      }),
    })
    const response = await POST()
    expect(response.status).toBe(400)
  })

  it("creates checkout session and returns url", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    })
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_new" })
    mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.test/session" })

    const response = await POST()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      url: "https://checkout.stripe.test/session",
    })
  })

  it("returns 500 when app url is missing", async () => {
    process.env.NEXT_PUBLIC_APP_URL = ""
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1", email: "u@x.com" } } }) },
    })

    const response = await POST()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "Missing NEXT_PUBLIC_APP_URL" })
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalEnv
  })
})
