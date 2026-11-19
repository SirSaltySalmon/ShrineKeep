import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  FREE_TIER_CAP,
  PAST_DUE_GRACE_DAYS,
  addPastDueGraceDays,
  formatProMonthlyUsd,
  getEffectiveCap,
  getItemCount,
  getPastDueGraceEndsAt,
  isProUser,
  proUpgradeCtaLabel,
} from "./subscription"

describe("subscription helpers", () => {
  it("formats pro monthly price consistently", () => {
    expect(formatProMonthlyUsd()).toBe("$4.99")
    expect(proUpgradeCtaLabel()).toContain("$4.99/month")
  })

  it("calculates grace date from current period end", () => {
    const periodEnd = new Date("2026-01-10T00:00:00.000Z")
    const graceEnd = addPastDueGraceDays(periodEnd)

    expect(graceEnd.toISOString()).toBe("2026-01-17T00:00:00.000Z")
    expect(PAST_DUE_GRACE_DAYS).toBe(7)
  })

  it("returns null for non past_due statuses", () => {
    const periodEnd = new Date("2026-01-10T00:00:00.000Z")

    expect(getPastDueGraceEndsAt("active", periodEnd)).toBeNull()
    expect(getPastDueGraceEndsAt(null, periodEnd)).toBeNull()
    expect(getPastDueGraceEndsAt("past_due", null)).toBeNull()
  })
})

/** A client whose single-row read (`maybeSingle` / `single`) answers `result`. */
function rowClient(result: { data: unknown; error: unknown } | Error) {
  const read = vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  })
  const eq = vi.fn(() => ({ maybeSingle: read, single: read }))
  const select = vi.fn((_columns: string) => ({ eq }))
  const from = vi.fn((_table: string) => ({ select }))
  return { supabase: { from } as any, from, select, eq }
}

describe("isProUser", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const subscription = (status: string, current_period_end: string | null = null) =>
    rowClient({ data: { status, current_period_end }, error: null })

  it("reads the caller's own subscription row", async () => {
    const { supabase, from, eq } = subscription("active")
    await isProUser(supabase, "user-1")
    expect(from).toHaveBeenCalledWith("subscriptions")
    expect(eq).toHaveBeenCalledWith("user_id", "user-1")
  })

  it("is true for an active subscription", async () => {
    expect(await isProUser(subscription("active").supabase, "user-1")).toBe(true)
  })

  it("is false without a subscription row or once canceled", async () => {
    expect(await isProUser(rowClient({ data: null, error: null }).supabase, "user-1")).toBe(false)
    expect(await isProUser(subscription("canceled", "2099-01-01T00:00:00.000Z").supabase, "user-1")).toBe(false)
  })

  it("keeps past_due users Pro until the grace period ends", async () => {
    const periodEnd = "2026-01-10T00:00:00.000Z"
    vi.useFakeTimers()

    vi.setSystemTime(new Date("2026-01-16T23:59:59.000Z"))
    expect(await isProUser(subscription("past_due", periodEnd).supabase, "user-1")).toBe(true)

    vi.setSystemTime(new Date("2026-01-17T00:00:01.000Z"))
    expect(await isProUser(subscription("past_due", periodEnd).supabase, "user-1")).toBe(false)
  })

  it("is false for past_due without a known period end", async () => {
    expect(await isProUser(subscription("past_due").supabase, "user-1")).toBe(false)
  })

  it("fails closed when the subscription cannot be read", async () => {
    const queryError = rowClient({ data: null, error: { message: "permission denied" } })
    expect(await isProUser(queryError.supabase, "user-1")).toBe(false)
    expect(await isProUser(rowClient(new Error("network down")).supabase, "user-1")).toBe(false)
  })
})

describe("getEffectiveCap", () => {
  const user = (grandfathered_item_count: number | null) =>
    rowClient({ data: { grandfathered_item_count }, error: null })

  it("is unlimited for Pro without reading the user row", async () => {
    const { supabase, from } = user(null)
    expect(await getEffectiveCap(supabase, "user-1", true)).toBe(Infinity)
    expect(from).not.toHaveBeenCalled()
  })

  it("is FREE_TIER_CAP for a free user with no grandfathered count", async () => {
    const { supabase, from, eq } = user(null)
    expect(await getEffectiveCap(supabase, "user-1", false)).toBe(FREE_TIER_CAP)
    expect(from).toHaveBeenCalledWith("users")
    expect(eq).toHaveBeenCalledWith("id", "user-1")
  })

  it("raises the cap to a grandfathered count above FREE_TIER_CAP", async () => {
    expect(await getEffectiveCap(user(FREE_TIER_CAP + 1).supabase, "user-1", false)).toBe(FREE_TIER_CAP + 1)
  })

  it("never lowers the cap below FREE_TIER_CAP", async () => {
    expect(await getEffectiveCap(user(FREE_TIER_CAP).supabase, "user-1", false)).toBe(FREE_TIER_CAP)
    expect(await getEffectiveCap(user(3).supabase, "user-1", false)).toBe(FREE_TIER_CAP)
  })

  it("falls back to FREE_TIER_CAP when the user row is missing", async () => {
    const missing = rowClient({ data: null, error: { message: "no rows" } })
    expect(await getEffectiveCap(missing.supabase, "user-1", false)).toBe(FREE_TIER_CAP)
  })
})

describe("getItemCount", () => {
  function countClient(result: { count: number | null; error: unknown }) {
    const filters: Array<[string, unknown]> = []
    const query = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value])
        return query
      }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }
    const select = vi.fn((_columns: string, _options: unknown) => query)
    const from = vi.fn((_table: string) => ({ select }))
    return { supabase: { from } as any, from, select, filters }
  }

  it("counts only the user's collection items, without fetching rows", async () => {
    const { supabase, from, select, filters } = countClient({ count: 42, error: null })

    expect(await getItemCount(supabase, "user-1")).toBe(42)
    expect(from).toHaveBeenCalledWith("items")
    expect(select).toHaveBeenCalledWith("*", { count: "exact", head: true })
    expect(filters).toEqual([
      ["user_id", "user-1"],
      ["is_wishlist", false],
    ])
  })

  it("treats a missing count as zero", async () => {
    expect(await getItemCount(countClient({ count: null, error: null }).supabase, "user-1")).toBe(0)
  })

  it("throws when the count cannot be read", async () => {
    const error = { message: "permission denied" }
    await expect(getItemCount(countClient({ count: null, error }).supabase, "user-1")).rejects.toBe(error)
  })
})

describe("free-tier numbers written out in SQL", () => {
  // sharing_private.enforce_item_cap cannot import these constants, so the migration
  // repeats them. Checks the newest migration that defines the function.
  const migrationsDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url))
  const definition = /CREATE (?:OR REPLACE )?FUNCTION sharing_private\.enforce_item_cap\(\)[\s\S]*?\$\$;/i
  const source = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .map((name) => ({ name, body: definition.exec(readFileSync(migrationsDir + name, "utf8"))?.[0] }))
    .find((migration) => migration.body)

  const numbers = (pattern: RegExp) =>
    Array.from(source?.body?.matchAll(pattern) ?? [], (match) => Number(match[1]))

  it("finds the enforce_item_cap definition", () => {
    expect(source, "no migration defines sharing_private.enforce_item_cap()").toBeDefined()
  })

  it("uses FREE_TIER_CAP as the database item cap", () => {
    const caps = [
      ...numbers(/grandfathered_item_count, 0\), (\d+)\)/g),
      ...numbers(/coalesce\(v_cap, (\d+)\)/g),
    ]
    expect(
      caps,
      `enforce_item_cap in ${source?.name} and FREE_TIER_CAP in lib/subscription.ts must change together`
    ).toEqual([FREE_TIER_CAP, FREE_TIER_CAP])
  })

  it("uses PAST_DUE_GRACE_DAYS as the database grace period", () => {
    expect(
      numbers(/interval '(\d+) days'/g),
      `enforce_item_cap in ${source?.name} and PAST_DUE_GRACE_DAYS in lib/subscription.ts must change together`
    ).toEqual([PAST_DUE_GRACE_DAYS])
  })
})
