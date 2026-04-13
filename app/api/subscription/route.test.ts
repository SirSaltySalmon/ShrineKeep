import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const {
  mockCreateSupabaseServerClient,
  mockStripeRetrieve,
  mockGetSubscriptionStatus,
  mockGetItemCount,
  mockGetEffectiveCap,
  mockStripeSubscriptionHasScheduledCancellation,
  mockStripeSubscriptionCancelAtIso,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockStripeRetrieve: vi.fn(),
  mockGetSubscriptionStatus: vi.fn(),
  mockGetItemCount: vi.fn(),
  mockGetEffectiveCap: vi.fn(),
  mockStripeSubscriptionHasScheduledCancellation: vi.fn(),
  mockStripeSubscriptionCancelAtIso: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/stripe/server", () => ({
  stripe: { subscriptions: { retrieve: mockStripeRetrieve } },
}))

vi.mock("@/lib/subscription", () => ({
  FREE_TIER_CAP: 100,
  PAST_DUE_GRACE_DAYS: 7,
  getSubscriptionStatus: mockGetSubscriptionStatus,
  getItemCount: mockGetItemCount,
  getEffectiveCap: mockGetEffectiveCap,
}))

vi.mock("@/lib/stripe/subscription-state", () => ({
  stripeSubscriptionHasScheduledCancellation: mockStripeSubscriptionHasScheduledCancellation,
  stripeSubscriptionCancelAtIso: mockStripeSubscriptionCancelAtIso,
}))

describe("GET /api/subscription", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await GET()
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns subscription payload on success", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockGetSubscriptionStatus.mockResolvedValue({
      isPro: true,
      status: "active",
      currentPeriodEnd: new Date("2026-01-01T00:00:00.000Z"),
      pastDueGraceEndsAt: null,
      stripeSubscriptionId: "sub_1",
    })
    mockGetItemCount.mockResolvedValue(12)
    mockGetEffectiveCap.mockResolvedValue(Infinity)
    mockStripeRetrieve.mockResolvedValue({})
    mockStripeSubscriptionHasScheduledCancellation.mockReturnValue(false)
    mockStripeSubscriptionCancelAtIso.mockReturnValue(null)

    const response = await GET()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      isPro: true,
      status: "active",
      itemCount: 12,
      cap: null,
      freeTierCap: 100,
      cancelAtPeriodEnd: false,
      cancelAt: null,
    })
  })

  it("returns 500 when subscription lookup fails", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockGetSubscriptionStatus.mockRejectedValue(new Error("lookup failed"))

    const response = await GET()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "lookup failed" })
  })
})
