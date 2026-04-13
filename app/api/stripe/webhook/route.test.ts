import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const {
  mockConstructEvent,
  mockRetrieveSubscription,
  mockCreateSupabaseServiceClient,
  mockStartRouteSpan,
  mockGetStripeWebhookSecret,
  mockCaptureRouteException,
  mockCaptureRouteMessage,
} = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockRetrieveSubscription: vi.fn(),
  mockCreateSupabaseServiceClient: vi.fn(),
  mockStartRouteSpan: vi.fn(),
  mockGetStripeWebhookSecret: vi.fn(),
  mockCaptureRouteException: vi.fn(),
  mockCaptureRouteMessage: vi.fn(),
}))

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: mockCreateSupabaseServiceClient,
}))

vi.mock("@/lib/stripe/server", () => ({
  getStripeWebhookSecret: mockGetStripeWebhookSecret,
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    subscriptions: {
      retrieve: mockRetrieveSubscription,
    },
  },
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  startRouteSpan: mockStartRouteSpan,
  captureRouteException: mockCaptureRouteException,
  captureRouteMessage: mockCaptureRouteMessage,
}))

function makeRequest(signature?: string): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : undefined,
    body: JSON.stringify({ ok: true }),
  })
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStartRouteSpan.mockImplementation(async (_name, _op, _attrs, callback) => callback())
    mockGetStripeWebhookSecret.mockReturnValue("whsec_test")
  })

  it("returns 400 when stripe-signature header is missing", async () => {
    const response = await POST(makeRequest() as any)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Missing stripe-signature header",
    })
  })

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad signature")
    })

    const response = await POST(makeRequest("sig_test") as any)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "bad signature" })
    expect(mockCaptureRouteException).toHaveBeenCalled()
  })

  it("handles checkout.session.completed and upserts subscription row", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          mode: "subscription",
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    })
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_123",
      status: "active",
      metadata: { supabase_user_id: "user_1" },
      customer: "cus_123",
      items: { data: [{ current_period_end: 1_700_000_000 }] },
    })

    const upsertMock = vi.fn().mockResolvedValue({ error: null })
    mockCreateSupabaseServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        upsert: upsertMock,
      }),
    })

    const response = await POST(makeRequest("sig_test") as any)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ received: true })
    expect(upsertMock).toHaveBeenCalled()
  })

  it("returns 500 when subscription update write fails", async () => {
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_456",
          status: "past_due",
          customer: "cus_456",
          items: { data: [{ current_period_end: 1_700_000_001 }] },
        },
      },
    })

    const selectMock = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "db update failed" },
    })
    const eqMock = vi.fn().mockReturnValue({ select: selectMock })
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock })
    mockCreateSupabaseServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: updateMock,
      }),
    })

    const response = await POST(makeRequest("sig_test") as any)
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "DB update failed" })
  })
})
