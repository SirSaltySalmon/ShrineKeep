import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const {
  mockCreateSupabaseServerClient,
  mockCreateSupabaseServiceClient,
  mockStripeRetrieve,
  mockStripeCancel,
  mockStripeSubscriptionHasScheduledCancellation,
  mockStartRouteSpan,
  mockCaptureRouteException,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockCreateSupabaseServiceClient: vi.fn(),
  mockStripeRetrieve: vi.fn(),
  mockStripeCancel: vi.fn(),
  mockStripeSubscriptionHasScheduledCancellation: vi.fn(),
  mockStartRouteSpan: vi.fn(),
  mockCaptureRouteException: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mockCreateSupabaseServiceClient,
}))

vi.mock("@/lib/subscription", () => ({
  END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE: "END MY SUBSCRIPTION NOW",
}))

vi.mock("@/lib/stripe/server", () => ({
  stripe: {
    subscriptions: {
      retrieve: mockStripeRetrieve,
      cancel: mockStripeCancel,
    },
  },
}))

vi.mock("@/lib/stripe/subscription-state", () => ({
  stripeSubscriptionHasScheduledCancellation: mockStripeSubscriptionHasScheduledCancellation,
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  startRouteSpan: mockStartRouteSpan,
  captureRouteException: mockCaptureRouteException,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/stripe/subscription/end-now", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/stripe/subscription/end-now", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStartRouteSpan.mockImplementation(async (_a, _b, _c, callback) => callback())
  })

  it("returns 400 when confirmation phrase is wrong", async () => {
    const response = await POST(makeRequest({ confirmation: "WRONG" }) as any)
    expect(response.status).toBe(400)
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({ confirmation: "END MY SUBSCRIPTION NOW" }) as any)
    expect(response.status).toBe(401)
  })

  it("returns 404 when subscription row is missing", async () => {
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

    const response = await POST(makeRequest({ confirmation: "END MY SUBSCRIPTION NOW" }) as any)
    expect(response.status).toBe(404)
  })

  it("returns ok on successful early cancellation", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { stripe_subscription_id: "sub_1" },
            }),
          }),
        }),
      }),
    })
    mockStripeRetrieve.mockResolvedValue({ status: "active" })
    mockStripeSubscriptionHasScheduledCancellation.mockReturnValue(true)
    mockStripeCancel.mockResolvedValue({})
    mockCreateSupabaseServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    })

    const response = await POST(makeRequest({ confirmation: "END MY SUBSCRIPTION NOW" }) as any)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})
